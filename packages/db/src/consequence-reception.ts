import { createHash, randomUUID } from 'node:crypto';
import type { ConsequenceReception, ConsequenceReceptionTransition, Prisma } from '@prisma/client';
import {
  assertValidConsequenceReceptionRecord,
  assertValidConsequenceReceptionTransition,
  correctiveScopeMatches,
  projectConsequenceReceptionState,
  type ConsequenceReceptionKind,
  type ConsequenceReceptionRecord,
  type ConsequenceReceptionScope,
  type ConsequenceReceptionStatus,
  type CorrectiveActionRequest,
} from '@onbae/actor-core';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type IssueConsequenceReceptionInput = {
  actorId: string;
  sourceConsequenceId?: string | null;
  sourceAttributionId?: string | null;
  sourceClaimId?: string | null;
  sourceRemedyId?: string | null;
  sourceEvidenceArtifactId: string;
  kind: ConsequenceReceptionKind;
  scope: ConsequenceReceptionScope;
  termsDigest: string;
  restorationCriteriaDigest?: string | null;
  effectiveAt: Date;
  reviewAt?: Date | null;
  expiresAt?: Date | null;
  issuedByType: string;
  issuedByRef: string;
  authorityEvidenceArtifactId: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export type TransitionConsequenceReceptionInput = {
  receptionId: string;
  actorId: string;
  toStatus: Exclude<ConsequenceReceptionStatus, 'active'>;
  evidenceArtifactId: string;
  decidedByType: string;
  decidedByRef: string;
  occurredAt: Date;
  reason?: string | null;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export class ConsequenceReceptionConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConsequenceReceptionConflictError';
  }
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function text(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
  }
  return normalized;
}

function digest(value: string, field: string): string {
  const normalized = text(value, field).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw Object.assign(new Error(`${field} must be sha256:<64 lowercase hex>.`), {
      statusCode: 400,
    });
  }
  return normalized;
}

function idempotencyKey(value: string): string {
  const normalized = text(value, 'idempotencyKey');
  if (normalized.length < 8 || normalized.length > 500) {
    throw Object.assign(new Error('idempotencyKey must contain 8 to 500 characters.'), {
      statusCode: 400,
    });
  }
  return normalized;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function normalizeScope(scope: ConsequenceReceptionScope): ConsequenceReceptionScope {
  const normalize = (values: readonly string[]) =>
    [...new Set(values.map((value) => text(value, 'scope value')))].sort();
  return {
    global: scope.global,
    actions: normalize(scope.actions),
    resources: normalize(scope.resources),
    capabilities: normalize(scope.capabilities),
    environmentRefs: normalize(scope.environmentRefs),
  };
}

function kindToDb(kind: ConsequenceReceptionKind): string {
  return kind.toUpperCase();
}

function kindFromDb(kind: string): ConsequenceReceptionKind {
  const normalized = kind.toLowerCase();
  if (
    normalized === 'restriction' ||
    normalized === 'remediation' ||
    normalized === 'probation' ||
    normalized === 'suspension' ||
    normalized === 'disclosure'
  ) {
    return normalized;
  }
  throw new ConsequenceReceptionConflictError(`Unknown consequence reception kind ${kind}.`);
}

function statusFromDb(status: string): ConsequenceReceptionStatus {
  const normalized = status.toLowerCase();
  if (
    normalized === 'active' ||
    normalized === 'satisfied' ||
    normalized === 'lifted' ||
    normalized === 'superseded'
  ) {
    return normalized;
  }
  throw new ConsequenceReceptionConflictError(`Unknown consequence reception status ${status}.`);
}

function statusToDb(status: Exclude<ConsequenceReceptionStatus, 'active'>): string {
  return status.toUpperCase();
}

function scopeFromJson(value: Prisma.JsonValue): ConsequenceReceptionScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConsequenceReceptionConflictError('Stored consequence reception scope is invalid.');
  }
  const object = value as Record<string, unknown>;
  const readList = (field: string): string[] => {
    const current = object[field];
    if (!Array.isArray(current) || current.some((item) => typeof item !== 'string')) {
      throw new ConsequenceReceptionConflictError(`Stored scope.${field} is invalid.`);
    }
    return current as string[];
  };
  if (typeof object.global !== 'boolean') {
    throw new ConsequenceReceptionConflictError('Stored scope.global is invalid.');
  }
  return {
    global: object.global,
    actions: readList('actions'),
    resources: readList('resources'),
    capabilities: readList('capabilities'),
    environmentRefs: readList('environmentRefs'),
  };
}

function toCoreRecord(row: ConsequenceReception): ConsequenceReceptionRecord {
  return {
    version: 'noeone.consequence-reception.v1',
    id: row.id,
    actorId: row.actorId,
    ...(row.sourceConsequenceId ? { sourceConsequenceId: row.sourceConsequenceId } : {}),
    ...(row.sourceAttributionId ? { sourceAttributionId: row.sourceAttributionId } : {}),
    ...(row.sourceClaimId ? { sourceClaimId: row.sourceClaimId } : {}),
    ...(row.sourceRemedyId ? { sourceRemedyId: row.sourceRemedyId } : {}),
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    kind: kindFromDb(row.kind),
    status: statusFromDb(row.status),
    scope: scopeFromJson(row.scope),
    termsDigest: row.termsDigest,
    ...(row.restorationCriteriaDigest
      ? { restorationCriteriaDigest: row.restorationCriteriaDigest }
      : {}),
    effectiveAt: row.effectiveAt.toISOString(),
    ...(row.reviewAt ? { reviewAt: row.reviewAt.toISOString() } : {}),
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    issuedByType: row.issuedByType,
    issuedByRef: row.issuedByRef,
    authorityEvidenceArtifactId: row.authorityEvidenceArtifactId,
    migrationPolicy: 'carry-with-actor',
    forkPolicy: 'do-not-inherit',
    capturedAt: row.capturedAt.toISOString(),
    basisDigest: row.basisDigest,
  };
}

function toCoreTransition(row: ConsequenceReceptionTransition) {
  const toStatus = statusFromDb(row.toStatus);
  if (toStatus === 'active') {
    throw new ConsequenceReceptionConflictError('Stored terminal transition points to active state.');
  }
  return {
    version: 'noeone.consequence-reception-transition.v1' as const,
    id: row.id,
    receptionId: row.receptionId,
    actorId: row.actorId,
    fromStatus: statusFromDb(row.fromStatus),
    toStatus,
    evidenceArtifactId: row.evidenceArtifactId,
    decidedByType: row.decidedByType,
    decidedByRef: row.decidedByRef,
    occurredAt: row.occurredAt.toISOString(),
    ...(row.reason ? { reason: row.reason } : {}),
    basisDigest: row.basisDigest,
  };
}

async function assertEvidenceExists(
  tx: Prisma.TransactionClient,
  evidenceArtifactId: string,
  field: string,
): Promise<void> {
  const found = await tx.evidenceArtifact.findUnique({
    where: { id: evidenceArtifactId },
    select: { id: true },
  });
  if (!found) {
    throw Object.assign(new Error(`${field} ${evidenceArtifactId} was not found.`), {
      statusCode: 404,
    });
  }
}

async function assertSourceConsistency(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: Pick<
    IssueConsequenceReceptionInput,
    'sourceConsequenceId' | 'sourceAttributionId' | 'sourceClaimId' | 'sourceRemedyId'
  >,
): Promise<void> {
  const consequenceId = input.sourceConsequenceId ?? null;
  const attributionId = input.sourceAttributionId ?? null;
  const claimId = input.sourceClaimId ?? null;
  const remedyId = input.sourceRemedyId ?? null;

  if (!consequenceId && !attributionId && !claimId && !remedyId) {
    throw Object.assign(
      new Error('At least one consequence, attribution, claim, or remedy source is required.'),
      { statusCode: 400 },
    );
  }

  if (attributionId) {
    const attribution = await tx.consequenceAttribution.findUnique({
      where: { id: attributionId },
      select: { actorId: true, consequenceId: true },
    });
    if (!attribution) {
      throw Object.assign(new Error('Source consequence attribution not found.'), { statusCode: 404 });
    }
    if (attribution.actorId !== actorId) {
      throw new ConsequenceReceptionConflictError('Source attribution belongs to a different actor.');
    }
    if (consequenceId && attribution.consequenceId !== consequenceId) {
      throw new ConsequenceReceptionConflictError('Source attribution and consequence disagree.');
    }
  }

  if (consequenceId) {
    const consequence = await tx.consequenceObservation.findUnique({
      where: { id: consequenceId },
      select: { id: true },
    });
    if (!consequence) {
      throw Object.assign(new Error('Source consequence observation not found.'), { statusCode: 404 });
    }
    if (!attributionId && !claimId && !remedyId) {
      const supported = await tx.consequenceAttribution.findFirst({
        where: { consequenceId, actorId, disposition: 'SUPPORTED' },
        select: { id: true },
      });
      if (!supported) {
        throw new ConsequenceReceptionConflictError(
          'Bare consequence source requires a supported attribution to this actor.',
        );
      }
    }
  }

  if (claimId) {
    const claim = await tx.claim.findUnique({ where: { id: claimId }, select: { id: true } });
    if (!claim) throw Object.assign(new Error('Source claim not found.'), { statusCode: 404 });
    const actorLink = await tx.claimActorLink.findFirst({
      where: { claimId, actorId },
      select: { id: true },
    });
    if (!actorLink) {
      throw new ConsequenceReceptionConflictError('Source claim is not linked to this actor.');
    }
  }

  if (remedyId) {
    const remedy = await tx.remedyOrder.findUnique({
      where: { id: remedyId },
      select: { claimId: true },
    });
    if (!remedy) throw Object.assign(new Error('Source remedy not found.'), { statusCode: 404 });
    if (claimId && remedy.claimId !== claimId) {
      throw new ConsequenceReceptionConflictError('Source remedy and claim disagree.');
    }
    const actorLink = await tx.claimActorLink.findFirst({
      where: { claimId: remedy.claimId, actorId },
      select: { id: true },
    });
    if (!actorLink) {
      throw new ConsequenceReceptionConflictError('Source remedy claim is not linked to this actor.');
    }
  }
}

function issueBasis(input: IssueConsequenceReceptionInput, scope: ConsequenceReceptionScope) {
  return {
    version: 'noeone.consequence-reception.issue.v1',
    actorId: input.actorId,
    sourceConsequenceId: input.sourceConsequenceId ?? null,
    sourceAttributionId: input.sourceAttributionId ?? null,
    sourceClaimId: input.sourceClaimId ?? null,
    sourceRemedyId: input.sourceRemedyId ?? null,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
    kind: input.kind,
    scope,
    termsDigest: input.termsDigest,
    restorationCriteriaDigest: input.restorationCriteriaDigest ?? null,
    effectiveAt: input.effectiveAt.toISOString(),
    reviewAt: input.reviewAt?.toISOString() ?? null,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    issuedByType: input.issuedByType,
    issuedByRef: input.issuedByRef,
    authorityEvidenceArtifactId: input.authorityEvidenceArtifactId,
    migrationPolicy: 'carry-with-actor',
    forkPolicy: 'do-not-inherit',
    metadata: input.metadata ?? {},
  };
}

export async function issueConsequenceReception(
  input: IssueConsequenceReceptionInput,
  registry: RegistryContext,
): Promise<{ reception: ConsequenceReception; replayed: boolean }> {
  const actorId = text(input.actorId, 'actorId');
  const sourceEvidenceArtifactId = text(
    input.sourceEvidenceArtifactId,
    'sourceEvidenceArtifactId',
  );
  const authorityEvidenceArtifactId = text(
    input.authorityEvidenceArtifactId,
    'authorityEvidenceArtifactId',
  );
  const issuedByType = text(input.issuedByType, 'issuedByType');
  const issuedByRef = text(input.issuedByRef, 'issuedByRef');
  const termsDigest = digest(input.termsDigest, 'termsDigest');
  const restorationCriteriaDigest = input.restorationCriteriaDigest
    ? digest(input.restorationCriteriaDigest, 'restorationCriteriaDigest')
    : null;
  const key = idempotencyKey(input.idempotencyKey);
  const scope = normalizeScope(input.scope);

  const normalized: IssueConsequenceReceptionInput = {
    ...input,
    actorId,
    sourceEvidenceArtifactId,
    authorityEvidenceArtifactId,
    issuedByType,
    issuedByRef,
    termsDigest,
    restorationCriteriaDigest,
    idempotencyKey: key,
    scope,
  };
  const basisDigest = sha256(issueBasis(normalized, scope));

  return db.$transaction(async (tx) => {
    const replay = await tx.consequenceReception.findUnique({ where: { idempotencyKey: key } });
    if (replay) {
      if (replay.actorId !== actorId || replay.basisDigest !== basisDigest) {
        throw new ConsequenceReceptionConflictError(
          'Consequence reception idempotency key was reused with different input.',
        );
      }
      return { reception: replay, replayed: true };
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${actorId} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    await Promise.all([
      assertEvidenceExists(tx, sourceEvidenceArtifactId, 'Source evidence artifact'),
      assertEvidenceExists(tx, authorityEvidenceArtifactId, 'Authority evidence artifact'),
    ]);
    await assertSourceConsistency(tx, actorId, normalized);

    const capturedAt = new Date();
    const recordForValidation: ConsequenceReceptionRecord = {
      version: 'noeone.consequence-reception.v1',
      id: 'pending',
      actorId,
      ...(normalized.sourceConsequenceId
        ? { sourceConsequenceId: normalized.sourceConsequenceId }
        : {}),
      ...(normalized.sourceAttributionId
        ? { sourceAttributionId: normalized.sourceAttributionId }
        : {}),
      ...(normalized.sourceClaimId ? { sourceClaimId: normalized.sourceClaimId } : {}),
      ...(normalized.sourceRemedyId ? { sourceRemedyId: normalized.sourceRemedyId } : {}),
      sourceEvidenceArtifactId,
      kind: normalized.kind,
      status: 'active',
      scope,
      termsDigest,
      ...(restorationCriteriaDigest ? { restorationCriteriaDigest } : {}),
      effectiveAt: normalized.effectiveAt.toISOString(),
      ...(normalized.reviewAt ? { reviewAt: normalized.reviewAt.toISOString() } : {}),
      ...(normalized.expiresAt ? { expiresAt: normalized.expiresAt.toISOString() } : {}),
      issuedByType,
      issuedByRef,
      authorityEvidenceArtifactId,
      migrationPolicy: 'carry-with-actor',
      forkPolicy: 'do-not-inherit',
      capturedAt: capturedAt.toISOString(),
      basisDigest,
    };
    assertValidConsequenceReceptionRecord(recordForValidation);

    const reception = await tx.consequenceReception.create({
      data: {
        id: `crx_${randomUUID()}`,
        actorId,
        sourceConsequenceId: normalized.sourceConsequenceId ?? null,
        sourceAttributionId: normalized.sourceAttributionId ?? null,
        sourceClaimId: normalized.sourceClaimId ?? null,
        sourceRemedyId: normalized.sourceRemedyId ?? null,
        sourceEvidenceArtifactId,
        kind: kindToDb(normalized.kind),
        status: 'ACTIVE',
        scope: scope as unknown as Prisma.InputJsonValue,
        termsDigest,
        restorationCriteriaDigest,
        effectiveAt: normalized.effectiveAt,
        reviewAt: normalized.reviewAt ?? null,
        expiresAt: normalized.expiresAt ?? null,
        issuedByType,
        issuedByRef,
        authorityEvidenceArtifactId,
        migrationPolicy: 'CARRY_WITH_ACTOR',
        forkPolicy: 'DO_NOT_INHERIT',
        capturedAt,
        basisDigest,
        idempotencyKey: key,
        metadata: normalized.metadata ?? {},
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId,
        type: 'actor.consequence.reception.issued',
        sourceKey: `consequence-reception:issued:${reception.id}`,
        occurredAt: capturedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          receptionId: reception.id,
          kind: reception.kind.toLowerCase(),
          status: reception.status.toLowerCase(),
          sourceConsequenceId: reception.sourceConsequenceId,
          sourceAttributionId: reception.sourceAttributionId,
          sourceClaimId: reception.sourceClaimId,
          sourceRemedyId: reception.sourceRemedyId,
          sourceEvidenceArtifactId: reception.sourceEvidenceArtifactId,
          authorityEvidenceArtifactId: reception.authorityEvidenceArtifactId,
          scope,
          termsDigest: reception.termsDigest,
          restorationCriteriaDigest: reception.restorationCriteriaDigest,
          effectiveAt: reception.effectiveAt.toISOString(),
          reviewAt: reception.reviewAt?.toISOString() ?? null,
          expiresAt: reception.expiresAt?.toISOString() ?? null,
          issuedByType: reception.issuedByType,
          issuedByRef: reception.issuedByRef,
          migrationPolicy: 'carry-with-actor',
          forkPolicy: 'do-not-inherit',
          basisDigest: reception.basisDigest,
        },
      },
      registry.signingSecret,
    );

    return { reception, replayed: false };
  });
}

function transitionBasis(input: TransitionConsequenceReceptionInput) {
  return {
    version: 'noeone.consequence-reception-transition.v1',
    receptionId: input.receptionId,
    actorId: input.actorId,
    fromStatus: 'active',
    toStatus: input.toStatus,
    evidenceArtifactId: input.evidenceArtifactId,
    decidedByType: input.decidedByType,
    decidedByRef: input.decidedByRef,
    occurredAt: input.occurredAt.toISOString(),
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  };
}

export async function transitionConsequenceReception(
  input: TransitionConsequenceReceptionInput,
  registry: RegistryContext,
): Promise<{
  transition: ConsequenceReceptionTransition;
  reception: ConsequenceReception;
  replayed: boolean;
}> {
  const receptionId = text(input.receptionId, 'receptionId');
  const actorId = text(input.actorId, 'actorId');
  const evidenceArtifactId = text(input.evidenceArtifactId, 'evidenceArtifactId');
  const decidedByType = text(input.decidedByType, 'decidedByType');
  const decidedByRef = text(input.decidedByRef, 'decidedByRef');
  const key = idempotencyKey(input.idempotencyKey);
  const normalized: TransitionConsequenceReceptionInput = {
    ...input,
    receptionId,
    actorId,
    evidenceArtifactId,
    decidedByType,
    decidedByRef,
    idempotencyKey: key,
  };
  const basisDigest = sha256(transitionBasis(normalized));

  return db.$transaction(async (tx) => {
    const replay = await tx.consequenceReceptionTransition.findUnique({
      where: { idempotencyKey: key },
    });
    if (replay) {
      if (
        replay.actorId !== actorId ||
        replay.receptionId !== receptionId ||
        replay.basisDigest !== basisDigest
      ) {
        throw new ConsequenceReceptionConflictError(
          'Consequence reception transition idempotency key was reused with different input.',
        );
      }
      const reception = await tx.consequenceReception.findUniqueOrThrow({
        where: { id: receptionId },
      });
      return { transition: replay, reception, replayed: true };
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${actorId} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const reception = await tx.consequenceReception.findUnique({ where: { id: receptionId } });
    if (!reception) {
      throw Object.assign(new Error('Consequence reception not found.'), { statusCode: 404 });
    }
    if (reception.actorId !== actorId) {
      throw new ConsequenceReceptionConflictError('Consequence reception belongs to a different actor.');
    }
    if (reception.status !== 'ACTIVE') {
      throw new ConsequenceReceptionConflictError('Consequence reception is already terminal.');
    }
    await assertEvidenceExists(tx, evidenceArtifactId, 'Transition evidence artifact');

    const coreRecord = { ...toCoreRecord(reception), status: 'active' as const };
    const coreTransition = {
      version: 'noeone.consequence-reception-transition.v1' as const,
      id: 'pending',
      receptionId,
      actorId,
      fromStatus: 'active' as const,
      toStatus: normalized.toStatus,
      evidenceArtifactId,
      decidedByType,
      decidedByRef,
      occurredAt: normalized.occurredAt.toISOString(),
      ...(normalized.reason ? { reason: normalized.reason } : {}),
      basisDigest,
    };
    assertValidConsequenceReceptionTransition(coreTransition, coreRecord);

    const transition = await tx.consequenceReceptionTransition.create({
      data: {
        id: `crxt_${randomUUID()}`,
        receptionId,
        actorId,
        fromStatus: 'ACTIVE',
        toStatus: statusToDb(normalized.toStatus),
        evidenceArtifactId,
        decidedByType,
        decidedByRef,
        reason: normalized.reason ?? null,
        occurredAt: normalized.occurredAt,
        basisDigest,
        idempotencyKey: key,
        metadata: normalized.metadata ?? {},
      },
    });

    const updatedReception = await tx.consequenceReception.findUniqueOrThrow({
      where: { id: receptionId },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId,
        type: 'actor.consequence.reception.transitioned',
        sourceKey: `consequence-reception:transition:${transition.id}`,
        occurredAt: transition.occurredAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          receptionId,
          transitionId: transition.id,
          fromStatus: transition.fromStatus.toLowerCase(),
          toStatus: transition.toStatus.toLowerCase(),
          evidenceArtifactId: transition.evidenceArtifactId,
          decidedByType: transition.decidedByType,
          decidedByRef: transition.decidedByRef,
          reason: transition.reason,
          basisDigest: transition.basisDigest,
        },
      },
      registry.signingSecret,
    );

    return { transition, reception: updatedReception, replayed: false };
  });
}

export async function activeConsequenceReceptionsAt(
  actorId: string,
  at: Date,
  request?: CorrectiveActionRequest,
): Promise<ConsequenceReception[]> {
  const rows = await db.consequenceReception.findMany({
    where: {
      actorId,
      status: 'ACTIVE',
      effectiveAt: { lte: at },
      OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
    },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });
  if (!request) return rows;
  return rows.filter((row) => correctiveScopeMatches(toCoreRecord(row), request));
}

export async function activeAuthorityConstraintsAt(
  actorId: string,
  at: Date,
  request: Pick<CorrectiveActionRequest, 'action' | 'resource'>,
): Promise<ConsequenceReception[]> {
  const active = await activeConsequenceReceptionsAt(actorId, at, request);
  return active.filter((row) => row.kind === 'SUSPENSION' || row.kind === 'RESTRICTION');
}

export async function verifyConsequenceReceptionState(actorId: string): Promise<{
  valid: boolean;
  actorId: string;
  receptionCount: number;
  activeCount: number;
  issues: string[];
}> {
  const actor = await db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const receptions = await db.consequenceReception.findMany({
    where: { actorId },
    orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
  });
  const transitions = await db.consequenceReceptionTransition.findMany({
    where: { actorId },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
  const transitionByReception = new Map(transitions.map((transition) => [transition.receptionId, transition]));
  const issues: string[] = [];
  let activeCount = 0;
  const now = new Date();

  for (const reception of receptions) {
    try {
      const issued = { ...toCoreRecord(reception), status: 'active' as const };
      assertValidConsequenceReceptionRecord(issued);
      const transition = transitionByReception.get(reception.id);
      // Integrity verification must not depend on the verifier's wall clock.
      // A terminal row is validated at the transition's own historical point;
      // live active-state queries remain caller-time based above.
      const verificationAt = transition?.occurredAt ?? now;
      const projected = projectConsequenceReceptionState(
        issued,
        transition ? [toCoreTransition(transition)] : [],
        verificationAt.toISOString(),
      );
      if (projected.status !== statusFromDb(reception.status)) {
        issues.push(`reception ${reception.id}: stored status does not match transition history`);
      }
      if (projected.active) activeCount += 1;
    } catch (error) {
      issues.push(
        `reception ${reception.id}: ${error instanceof Error ? error.message : 'invalid record'}`,
      );
    }

    const issuedEvent = await db.actorEvent.findUnique({
      where: { sourceKey: `consequence-reception:issued:${reception.id}` },
      select: { actorId: true, type: true },
    });
    if (
      !issuedEvent ||
      issuedEvent.actorId !== actorId ||
      issuedEvent.type !== 'actor.consequence.reception.issued'
    ) {
      issues.push(`reception ${reception.id}: canonical issuance event missing or mismatched`);
    }

    const transition = transitionByReception.get(reception.id);
    if (transition) {
      const transitionEvent = await db.actorEvent.findUnique({
        where: { sourceKey: `consequence-reception:transition:${transition.id}` },
        select: { actorId: true, type: true },
      });
      if (
        !transitionEvent ||
        transitionEvent.actorId !== actorId ||
        transitionEvent.type !== 'actor.consequence.reception.transitioned'
      ) {
        issues.push(`reception ${reception.id}: canonical transition event missing or mismatched`);
      }
    }
  }

  const orphanTransition = transitions.find(
    (transition) => !receptions.some((reception) => reception.id === transition.receptionId),
  );
  if (orphanTransition) {
    issues.push(`transition ${orphanTransition.id}: reception is missing`);
  }

  return {
    valid: issues.length === 0,
    actorId,
    receptionCount: receptions.length,
    activeCount,
    issues,
  };
}
