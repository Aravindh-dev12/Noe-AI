import { createHash, randomUUID } from 'node:crypto';
import type {
  AuthorityExercise,
  ConsequenceAttribution,
  ConsequenceObservation,
  Prisma,
} from '@prisma/client';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { actorControlStateAt, controlQuarantineReason } from './control-operational.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';
import {
  authorityGrantStatusAt,
  evaluateTemporalAuthorityChainRecords,
  type TemporalAuthorityGrant,
} from './temporal-authority.js';

export type RecordAuthorityExerciseInput = {
  actorId: string;
  executionId?: string | null;
  grantId: string;
  evidenceArtifactId: string;
  action: string;
  resource: string;
  amountMinor?: string | null;
  currency?: string | null;
  exercisedAt: Date;
  evaluatorVersion?: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export type RecordConsequenceObservationInput = {
  kind: string;
  sourceEvidenceArtifactId: string;
  sourceAuthorityExerciseId?: string | null;
  commitmentId?: string | null;
  occurredAt: Date;
  valueMinor?: string | null;
  currency?: string | null;
  externalFramework?: string | null;
  externalReference?: string | null;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export type RecordConsequenceAttributionInput = {
  consequenceId: string;
  actorId: string;
  assessmentType: string;
  disposition: 'SUPPORTED' | 'NOT_SUPPORTED' | 'INDETERMINATE' | 'DISPUTED';
  method: string;
  methodVersion: string;
  evaluator: string;
  scoreBps?: number | null;
  sourceEvidenceArtifactId?: string | null;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export class AccountabilityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'AccountabilityConflictError';
  }
}

function sha256Canonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function normalizedMoney(
  amountMinor?: string | null,
  currency?: string | null,
): { amountMinor: string | null; currency: string | null } {
  const amount = amountMinor ?? null;
  const normalizedCurrency = currency?.toUpperCase() ?? null;
  if ((amount === null) !== (normalizedCurrency === null)) {
    throw new AccountabilityConflictError('Amount and currency must be supplied together.');
  }
  if (amount !== null && !/^(0|[1-9][0-9]*)$/.test(amount)) {
    throw new AccountabilityConflictError('Amount must be a non-negative integer string.');
  }
  return { amountMinor: amount, currency: normalizedCurrency };
}

async function loadTemporalAuthorityChain(
  tx: Prisma.TransactionClient,
  grantId: string,
): Promise<TemporalAuthorityGrant[]> {
  const reversed: TemporalAuthorityGrant[] = [];
  const seen = new Set<string>();
  let cursor: string | null = grantId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new AccountabilityConflictError('Authority grant ancestry contains a cycle.');
    }
    if (seen.size >= 32) {
      throw new AccountabilityConflictError('Authority grant ancestry exceeds maximum depth.');
    }
    seen.add(cursor);

    const grant: TemporalAuthorityGrant | null = await tx.authorityGrant.findUnique({
      where: { id: cursor },
      include: { transitions: true },
    });
    if (!grant) {
      throw Object.assign(new Error('Authority grant not found.'), { statusCode: 404 });
    }
    reversed.push(grant);
    cursor = grant.parentGrantId;
  }

  return reversed.reverse();
}

function authorityChainSnapshot(chain: TemporalAuthorityGrant[], at: Date) {
  return chain.map((grant) => ({
    id: grant.id,
    subjectActorId: grant.subjectActorId,
    parentGrantId: grant.parentGrantId,
    grantorType: grant.grantorType,
    grantorRef: grant.grantorRef,
    actions: [...grant.actions].sort(),
    resources: [...grant.resources].sort(),
    canRedelegate: grant.canRedelegate,
    remainingDelegationDepth: grant.remainingDelegationDepth,
    maxAmountMinor: grant.maxAmountMinor,
    currency: grant.currency,
    notBefore: grant.notBefore.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
    stateAtExercise: authorityGrantStatusAt(grant, at),
    transitions: [...grant.transitions]
      .filter((transition) => transition.occurredAt.getTime() <= at.getTime())
      .sort(
        (a, b) =>
          a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id),
      )
      .map((transition) => ({
        id: transition.id,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        occurredAt: transition.occurredAt.toISOString(),
      })),
  }));
}

function requestSnapshot(input: {
  action: string;
  resource: string;
  amountMinor: string | null;
  currency: string | null;
  exercisedAt: Date;
}) {
  return {
    action: input.action,
    resource: input.resource,
    amountMinor: input.amountMinor,
    currency: input.currency,
    exercisedAt: input.exercisedAt.toISOString(),
  };
}

async function assertEvidenceBoundToActor(
  tx: Prisma.TransactionClient,
  actorId: string,
  evidenceArtifactId: string,
): Promise<void> {
  const binding = await tx.actorEvidenceBinding.findFirst({
    where: { actorId, evidenceArtifactId },
    select: { id: true },
  });
  if (!binding) {
    throw new AccountabilityConflictError(
      `Evidence artifact ${evidenceArtifactId} is not bound to actor ${actorId}.`,
    );
  }
}

async function assertExecutionAtTime(
  tx: Prisma.TransactionClient,
  actorId: string,
  executionId: string,
  at: Date,
): Promise<void> {
  const execution = await tx.actorExecution.findUnique({
    where: { id: executionId },
    select: { actorId: true, startedAt: true, endedAt: true },
  });
  if (!execution || execution.actorId !== actorId) {
    throw new AccountabilityConflictError(
      `Execution ${executionId} does not belong to actor ${actorId}.`,
    );
  }
  if (execution.startedAt.getTime() > at.getTime()) {
    throw new AccountabilityConflictError('Execution had not started at exercise time.');
  }
  if (execution.endedAt && execution.endedAt.getTime() <= at.getTime()) {
    throw new AccountabilityConflictError('Execution had already ended at exercise time.');
  }
}

function sameAuthorityExercise(
  existing: AuthorityExercise,
  expected: {
    actorId: string;
    executionId: string | null;
    grantId: string;
    evidenceArtifactId: string;
    action: string;
    resource: string;
    amountMinor: string | null;
    currency: string | null;
    exercisedAt: Date;
    coverageStatus: 'COVERED' | 'NOT_COVERED';
    chainDigest: string;
    requestDigest: string;
    evaluatorVersion: string;
    reasons: string[];
    metadata: Prisma.InputJsonObject;
  },
): boolean {
  return (
    existing.actorId === expected.actorId &&
    existing.executionId === expected.executionId &&
    existing.grantId === expected.grantId &&
    existing.evidenceArtifactId === expected.evidenceArtifactId &&
    existing.action === expected.action &&
    existing.resource === expected.resource &&
    existing.amountMinor === expected.amountMinor &&
    existing.currency === expected.currency &&
    existing.exercisedAt.getTime() === expected.exercisedAt.getTime() &&
    existing.coverageStatus === expected.coverageStatus &&
    existing.chainDigest === expected.chainDigest &&
    existing.requestDigest === expected.requestDigest &&
    existing.evaluatorVersion === expected.evaluatorVersion &&
    canonicalJson(existing.reasons) === canonicalJson(expected.reasons) &&
    canonicalJson(existing.metadata) === canonicalJson(expected.metadata)
  );
}

function authorityCoverageWithControl(
  allowedByGrant: boolean,
  grantReasons: string[],
  quarantineReason: string | null,
): { coverageStatus: 'COVERED' | 'NOT_COVERED'; reasons: string[] } {
  const reasons = quarantineReason ? [...grantReasons, quarantineReason] : grantReasons;
  return {
    coverageStatus: allowedByGrant && !quarantineReason ? 'COVERED' : 'NOT_COVERED',
    reasons,
  };
}

export async function recordAuthorityExercise(
  input: RecordAuthorityExerciseInput,
  registry: RegistryContext,
): Promise<{ exercise: AuthorityExercise; replayed: boolean }> {
  const money = normalizedMoney(input.amountMinor, input.currency);
  const evaluatorVersion = input.evaluatorVersion ?? 'noeone.temporal-authority.v1';
  const metadata = input.metadata ?? {};

  return db.$transaction(async (tx) => {
    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    await assertEvidenceBoundToActor(tx, input.actorId, input.evidenceArtifactId);
    if (input.executionId) {
      await assertExecutionAtTime(tx, input.actorId, input.executionId, input.exercisedAt);
    }

    const chain = await loadTemporalAuthorityChain(tx, input.grantId);
    const leaf = chain.at(-1);
    if (!leaf || leaf.subjectActorId !== input.actorId) {
      throw new AccountabilityConflictError('Leaf authority grant does not belong to actor.');
    }

    const evaluation = evaluateTemporalAuthorityChainRecords(chain, {
      action: input.action,
      resource: input.resource,
      ...(money.amountMinor !== null ? { amountMinor: money.amountMinor } : {}),
      ...(money.currency !== null ? { currency: money.currency } : {}),
      at: input.exercisedAt,
    });
    const control = await actorControlStateAt(tx, input.actorId, input.exercisedAt);
    const coverage = authorityCoverageWithControl(
      evaluation.allowed,
      evaluation.reasons,
      controlQuarantineReason(control),
    );
    const chainDigest = sha256Canonical(authorityChainSnapshot(chain, input.exercisedAt));
    const requestDigest = sha256Canonical(
      requestSnapshot({
        action: input.action,
        resource: input.resource,
        amountMinor: money.amountMinor,
        currency: money.currency,
        exercisedAt: input.exercisedAt,
      }),
    );

    const expected = {
      actorId: input.actorId,
      executionId: input.executionId ?? null,
      grantId: input.grantId,
      evidenceArtifactId: input.evidenceArtifactId,
      action: input.action,
      resource: input.resource,
      amountMinor: money.amountMinor,
      currency: money.currency,
      exercisedAt: input.exercisedAt,
      coverageStatus: coverage.coverageStatus,
      chainDigest,
      requestDigest,
      evaluatorVersion,
      reasons: coverage.reasons,
      metadata,
    } as const;

    const existing = await tx.authorityExercise.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (!sameAuthorityExercise(existing, expected)) {
        throw new AccountabilityConflictError(
          `Authority exercise idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      return { exercise: existing, replayed: true };
    }

    const exercise = await tx.authorityExercise.create({
      data: {
        id: `aex_${randomUUID()}`,
        actorId: input.actorId,
        executionId: input.executionId ?? null,
        grantId: input.grantId,
        evidenceArtifactId: input.evidenceArtifactId,
        action: input.action,
        resource: input.resource,
        amountMinor: money.amountMinor,
        currency: money.currency,
        exercisedAt: input.exercisedAt,
        coverageStatus: coverage.coverageStatus,
        chainDigest,
        requestDigest,
        evaluatorVersion,
        reasons: coverage.reasons,
        idempotencyKey: input.idempotencyKey,
        metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: input.actorId,
        ...(input.executionId ? { executionId: input.executionId } : {}),
        type: 'actor.authority.exercise.recorded',
        sourceKey: `authority:exercise:${exercise.id}`,
        occurredAt: input.exercisedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          exerciseId: exercise.id,
          grantId: exercise.grantId,
          evidenceArtifactId: exercise.evidenceArtifactId,
          coverageStatus: exercise.coverageStatus.toLowerCase(),
          exercisedAt: exercise.exercisedAt.toISOString(),
          requestDigest: exercise.requestDigest,
          chainDigest: exercise.chainDigest,
          evaluatorVersion: exercise.evaluatorVersion,
        },
      },
      registry.signingSecret,
    );

    return { exercise, replayed: false };
  });
}

function sameConsequenceObservation(
  existing: ConsequenceObservation,
  input: RecordConsequenceObservationInput,
  money: { amountMinor: string | null; currency: string | null },
): boolean {
  return (
    existing.kind === input.kind &&
    existing.sourceEvidenceArtifactId === input.sourceEvidenceArtifactId &&
    existing.sourceAuthorityExerciseId === (input.sourceAuthorityExerciseId ?? null) &&
    existing.commitmentId === (input.commitmentId ?? null) &&
    existing.occurredAt.getTime() === input.occurredAt.getTime() &&
    existing.valueMinor === money.amountMinor &&
    existing.currency === money.currency &&
    existing.externalFramework === (input.externalFramework ?? null) &&
    existing.externalReference === (input.externalReference ?? null) &&
    canonicalJson(existing.metadata) === canonicalJson(input.metadata ?? {})
  );
}

export async function recordConsequenceObservation(
  input: RecordConsequenceObservationInput,
): Promise<{ observation: ConsequenceObservation; replayed: boolean }> {
  const money = normalizedMoney(input.valueMinor, input.currency);
  return db.$transaction(async (tx) => {
    const existing = await tx.consequenceObservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (!sameConsequenceObservation(existing, input, money)) {
        throw new AccountabilityConflictError(
          `Consequence observation idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      return { observation: existing, replayed: true };
    }

    const evidence = await tx.evidenceArtifact.findUnique({
      where: { id: input.sourceEvidenceArtifactId },
      select: { id: true },
    });
    if (!evidence) {
      throw Object.assign(new Error('Source evidence artifact not found.'), { statusCode: 404 });
    }

    if (input.sourceAuthorityExerciseId) {
      const exercise = await tx.authorityExercise.findUnique({
        where: { id: input.sourceAuthorityExerciseId },
        select: { id: true },
      });
      if (!exercise) {
        throw Object.assign(new Error('Source authority exercise not found.'), { statusCode: 404 });
      }
    }

    if (input.commitmentId) {
      const commitment = await tx.commitment.findUnique({
        where: { id: input.commitmentId },
        select: { id: true },
      });
      if (!commitment) {
        throw Object.assign(new Error('Commitment not found.'), { statusCode: 404 });
      }
    }

    const observation = await tx.consequenceObservation.create({
      data: {
        id: `con_${randomUUID()}`,
        kind: input.kind,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
        sourceAuthorityExerciseId: input.sourceAuthorityExerciseId ?? null,
        commitmentId: input.commitmentId ?? null,
        occurredAt: input.occurredAt,
        valueMinor: money.amountMinor,
        currency: money.currency,
        externalFramework: input.externalFramework ?? null,
        externalReference: input.externalReference ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
    });
    return { observation, replayed: false };
  });
}

function attributionBasis(input: RecordConsequenceAttributionInput) {
  return {
    consequenceId: input.consequenceId,
    actorId: input.actorId,
    assessmentType: input.assessmentType,
    disposition: input.disposition,
    method: input.method,
    methodVersion: input.methodVersion,
    evaluator: input.evaluator,
    scoreBps: input.scoreBps ?? null,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    metadata: input.metadata ?? {},
  };
}

function sameConsequenceAttribution(
  existing: ConsequenceAttribution,
  input: RecordConsequenceAttributionInput,
  basisDigest: string,
): boolean {
  return (
    existing.consequenceId === input.consequenceId &&
    existing.actorId === input.actorId &&
    existing.assessmentType === input.assessmentType &&
    existing.disposition === input.disposition &&
    existing.method === input.method &&
    existing.methodVersion === input.methodVersion &&
    existing.evaluator === input.evaluator &&
    existing.scoreBps === (input.scoreBps ?? null) &&
    existing.sourceEvidenceArtifactId === (input.sourceEvidenceArtifactId ?? null) &&
    existing.basisDigest === basisDigest &&
    canonicalJson(existing.metadata) === canonicalJson(input.metadata ?? {})
  );
}

export async function recordConsequenceAttribution(
  input: RecordConsequenceAttributionInput,
  registry: RegistryContext,
): Promise<{ attribution: ConsequenceAttribution; replayed: boolean }> {
  if (input.scoreBps !== undefined && input.scoreBps !== null) {
    if (!Number.isInteger(input.scoreBps) || input.scoreBps < 0 || input.scoreBps > 10_000) {
      throw new AccountabilityConflictError('scoreBps must be an integer from 0 to 10000.');
    }
  }
  const basisDigest = sha256Canonical(attributionBasis(input));

  return db.$transaction(async (tx) => {
    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const existing = await tx.consequenceAttribution.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (!sameConsequenceAttribution(existing, input, basisDigest)) {
        throw new AccountabilityConflictError(
          `Consequence attribution idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      return { attribution: existing, replayed: true };
    }

    const consequence = await tx.consequenceObservation.findUnique({
      where: { id: input.consequenceId },
      select: { id: true, kind: true, occurredAt: true },
    });
    if (!consequence) {
      throw Object.assign(new Error('Consequence observation not found.'), { statusCode: 404 });
    }

    if (input.sourceEvidenceArtifactId) {
      const evidence = await tx.evidenceArtifact.findUnique({
        where: { id: input.sourceEvidenceArtifactId },
        select: { id: true },
      });
      if (!evidence) {
        throw Object.assign(new Error('Attribution evidence artifact not found.'), { statusCode: 404 });
      }
    }

    const attribution = await tx.consequenceAttribution.create({
      data: {
        id: `cat_${randomUUID()}`,
        consequenceId: input.consequenceId,
        actorId: input.actorId,
        assessmentType: input.assessmentType,
        disposition: input.disposition,
        method: input.method,
        methodVersion: input.methodVersion,
        evaluator: input.evaluator,
        scoreBps: input.scoreBps ?? null,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
        basisDigest,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: input.actorId,
        type: 'actor.consequence.attribution.recorded',
        sourceKey: `consequence:attribution:${attribution.id}`,
        occurredAt: consequence.occurredAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          consequenceId: consequence.id,
          consequenceKind: consequence.kind,
          attributionId: attribution.id,
          assessmentType: attribution.assessmentType,
          disposition: attribution.disposition.toLowerCase(),
          method: attribution.method,
          methodVersion: attribution.methodVersion,
          scoreBps: attribution.scoreBps,
          basisDigest: attribution.basisDigest,
        },
      },
      registry.signingSecret,
    );

    return { attribution, replayed: false };
  });
}

export async function verifyAuthorityExercise(exerciseId: string): Promise<{
  valid: boolean;
  exerciseId: string;
  issues: string[];
}> {
  return db.$transaction(async (tx) => {
    const exercise = await tx.authorityExercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) {
      throw Object.assign(new Error('Authority exercise not found.'), { statusCode: 404 });
    }

    const issues: string[] = [];
    const binding = await tx.actorEvidenceBinding.findFirst({
      where: { actorId: exercise.actorId, evidenceArtifactId: exercise.evidenceArtifactId },
      select: { id: true },
    });
    if (!binding) issues.push('source evidence is no longer bound to actor');

    if (exercise.executionId) {
      try {
        await assertExecutionAtTime(tx, exercise.actorId, exercise.executionId, exercise.exercisedAt);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : 'execution binding is invalid');
      }
    }

    const chain = await loadTemporalAuthorityChain(tx, exercise.grantId);
    const leaf = chain.at(-1);
    if (!leaf || leaf.subjectActorId !== exercise.actorId) {
      issues.push('leaf grant does not belong to actor');
    }

    const evaluation = evaluateTemporalAuthorityChainRecords(chain, {
      action: exercise.action,
      resource: exercise.resource,
      ...(exercise.amountMinor !== null ? { amountMinor: exercise.amountMinor } : {}),
      ...(exercise.currency !== null ? { currency: exercise.currency } : {}),
      at: exercise.exercisedAt,
    });
    const control = await actorControlStateAt(tx, exercise.actorId, exercise.exercisedAt);
    const coverage = authorityCoverageWithControl(
      evaluation.allowed,
      evaluation.reasons,
      controlQuarantineReason(control),
    );
    if (exercise.coverageStatus !== coverage.coverageStatus) {
      issues.push('coverage status does not recompute');
    }
    if (canonicalJson(exercise.reasons) !== canonicalJson(coverage.reasons)) {
      issues.push('coverage reasons do not recompute');
    }

    const expectedChainDigest = sha256Canonical(authorityChainSnapshot(chain, exercise.exercisedAt));
    if (exercise.chainDigest !== expectedChainDigest) issues.push('authority chain digest mismatch');

    const expectedRequestDigest = sha256Canonical(
      requestSnapshot({
        action: exercise.action,
        resource: exercise.resource,
        amountMinor: exercise.amountMinor,
        currency: exercise.currency,
        exercisedAt: exercise.exercisedAt,
      }),
    );
    if (exercise.requestDigest !== expectedRequestDigest) issues.push('request digest mismatch');

    const event = await tx.actorEvent.findUnique({
      where: { sourceKey: `authority:exercise:${exercise.id}` },
      select: { actorId: true, type: true },
    });
    if (!event || event.actorId !== exercise.actorId || event.type !== 'actor.authority.exercise.recorded') {
      issues.push('canonical authority-exercise event missing or mismatched');
    }

    return { valid: issues.length === 0, exerciseId: exercise.id, issues };
  });
}

export async function verifyConsequenceState(actorId: string): Promise<{
  valid: boolean;
  actorId: string;
  attributionCount: number;
  issues: string[];
}> {
  const actor = await db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const attributions = await db.consequenceAttribution.findMany({
    where: { actorId },
    include: { consequence: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const issues: string[] = [];

  for (const attribution of attributions) {
    const expectedBasis = sha256Canonical({
      consequenceId: attribution.consequenceId,
      actorId: attribution.actorId,
      assessmentType: attribution.assessmentType,
      disposition: attribution.disposition,
      method: attribution.method,
      methodVersion: attribution.methodVersion,
      evaluator: attribution.evaluator,
      scoreBps: attribution.scoreBps,
      sourceEvidenceArtifactId: attribution.sourceEvidenceArtifactId,
      metadata: attribution.metadata,
    });
    if (attribution.basisDigest !== expectedBasis) {
      issues.push(`attribution ${attribution.id}: basis digest mismatch`);
    }
    if (attribution.scoreBps !== null && (attribution.scoreBps < 0 || attribution.scoreBps > 10_000)) {
      issues.push(`attribution ${attribution.id}: score out of bounds`);
    }
    const event = await db.actorEvent.findUnique({
      where: { sourceKey: `consequence:attribution:${attribution.id}` },
      select: { actorId: true, type: true },
    });
    if (!event || event.actorId !== actorId || event.type !== 'actor.consequence.attribution.recorded') {
      issues.push(`attribution ${attribution.id}: canonical event missing or mismatched`);
    }
  }

  return { valid: issues.length === 0, actorId, attributionCount: attributions.length, issues };
}
