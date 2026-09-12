import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export type ExternalStateClass =
  | 'RELATIONSHIP'
  | 'INSTITUTIONAL_STATUS'
  | 'DEONTIC'
  | 'AUDIENCE';

export type ExternalStateContinuationDisposition =
  | 'CONTINUED'
  | 'CONDITIONAL'
  | 'REISSUED'
  | 'REJECTED'
  | 'TERMINATED'
  | 'DISPUTED';

export type ExternalStateContinuationDecisionInput = {
  actorId: string;
  continuityTransitionId?: string | null;
  ancestryId?: string | null;
  stateClass: ExternalStateClass;
  sourceStateType: string;
  sourceStateRef: string;
  sourceStateDigest: string;
  externalPrincipalType: string;
  externalPrincipalRef: string;
  context: string;
  disposition: ExternalStateContinuationDisposition;
  successorStateRef?: string | null;
  policyFramework?: string | null;
  policyVersion: string;
  sourceEvidenceArtifactId?: string | null;
  decidedAt?: Date;
  validUntil?: Date | null;
  conditions?: string[];
  reasons?: string[];
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type ExternalStateContinuationDecisionRow = {
  id: string;
  actorId: string;
  sourceActorId: string;
  continuityTransitionId: string | null;
  ancestryId: string | null;
  stateClass: ExternalStateClass;
  sourceStateType: string;
  sourceStateRef: string;
  sourceStateDigest: string;
  externalPrincipalType: string;
  externalPrincipalRef: string;
  context: string;
  disposition: ExternalStateContinuationDisposition;
  successorStateRef: string | null;
  policyFramework: string | null;
  policyVersion: string;
  sourceEvidenceArtifactId: string | null;
  decidedAt: Date;
  validUntil: Date | null;
  conditions: string[];
  reasons: string[];
  targetDigest: string;
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type TransitionTarget = {
  id: string;
  actorId: string;
  kind: string;
  status: string;
  predecessorLineageId: string;
  predecessorExecutionId: string;
  proposedProvider: string;
  proposedModel: string;
  proposedRuntime: string | null;
  proposedConfigHash: string;
  resultingExecutionId: string | null;
  resultingLineageId: string | null;
  proposedByType: string;
  proposedById: string | null;
  policyVersion: string;
  proposedAt: Date;
  decidedAt: Date | null;
};

type AncestryTarget = {
  id: string;
  childActorId: string;
  parentActorId: string;
  sourceLineageId: string;
  sourceEventSequence: number | null;
  sourceEventHash: string | null;
  reason: string | null;
  createdAt: Date;
};

type Target =
  | {
      kind: 'transition';
      id: string;
      actorId: string;
      sourceActorId: string;
      digest: string;
      snapshot: JsonObject;
    }
  | {
      kind: 'ancestry';
      id: string;
      actorId: string;
      sourceActorId: string;
      digest: string;
      snapshot: JsonObject;
    };

export class ExternalStateContinuationValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ExternalStateContinuationValidationError';
  }
}

export class ExternalStateContinuationConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ExternalStateContinuationConflictError';
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function json(value: unknown): Prisma.Sql {
  return Prisma.sql`CAST(${JSON.stringify(value)} AS jsonb)`;
}

function textArray(values: string[]): Prisma.Sql {
  return values.length === 0
    ? Prisma.sql`ARRAY[]::TEXT[]`
    : Prisma.sql`ARRAY[${Prisma.join(values)}]::TEXT[]`;
}

function required(value: string, field: string, max = 500): string {
  const result = value.trim();
  if (!result) throw new ExternalStateContinuationValidationError(`${field} is required.`);
  if (result.length > max) {
    throw new ExternalStateContinuationValidationError(`${field} is too long.`);
  }
  return result;
}

function optional(value: string | null | undefined, max = 1_000): string | null {
  const result = value?.trim() ?? '';
  if (!result) return null;
  if (result.length > max) {
    throw new ExternalStateContinuationValidationError('Optional text is too long.');
  }
  return result;
}

function labels(values: string[] | undefined, field: string): string[] {
  const result = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if (result.length > 64 || result.some((value) => value.length > 1_000)) {
    throw new ExternalStateContinuationValidationError(`${field} exceeds supported bounds.`);
  }
  return result;
}

function requireDigest(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    throw new ExternalStateContinuationValidationError(`${field} must be a sha256 digest.`);
  }
  return normalized;
}

async function requireEvidence(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const evidence = await db.evidenceArtifact.findUnique({ where: { id }, select: { id: true } });
  if (!evidence) throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
}

async function loadTransition(id: string): Promise<TransitionTarget> {
  const rows = await db.$queryRaw<TransitionTarget[]>(Prisma.sql`
    SELECT "id", "actorId", "kind"::text AS "kind", "status"::text AS "status",
      "predecessorLineageId", "predecessorExecutionId", "proposedProvider", "proposedModel",
      "proposedRuntime", "proposedConfigHash", "resultingExecutionId", "resultingLineageId",
      "proposedByType", "proposedById", "policyVersion", "proposedAt", "decidedAt"
    FROM "ContinuityTransition" WHERE "id" = ${id} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Continuity transition not found.'), { statusCode: 404 });
  return rows[0];
}

async function loadAncestry(id: string): Promise<AncestryTarget> {
  const rows = await db.$queryRaw<AncestryTarget[]>(Prisma.sql`
    SELECT "id", "childActorId", "parentActorId", "sourceLineageId", "sourceEventSequence",
      "sourceEventHash", "reason", "createdAt"
    FROM "ActorAncestry" WHERE "id" = ${id} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Actor ancestry not found.'), { statusCode: 404 });
  return rows[0];
}

function transitionSnapshot(row: TransitionTarget): JsonObject {
  return {
    version: 'noeone.external-state-target.transition.v1',
    id: row.id,
    actorId: row.actorId,
    kind: row.kind,
    predecessorLineageId: row.predecessorLineageId,
    predecessorExecutionId: row.predecessorExecutionId,
    proposedProvider: row.proposedProvider,
    proposedModel: row.proposedModel,
    proposedRuntime: row.proposedRuntime,
    proposedConfigHash: row.proposedConfigHash,
    resultingExecutionId: row.resultingExecutionId,
    resultingLineageId: row.resultingLineageId,
    proposedByType: row.proposedByType,
    proposedById: row.proposedById,
    policyVersion: row.policyVersion,
    proposedAt: row.proposedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

function ancestrySnapshot(row: AncestryTarget): JsonObject {
  return {
    version: 'noeone.external-state-target.ancestry.v1',
    id: row.id,
    childActorId: row.childActorId,
    parentActorId: row.parentActorId,
    sourceLineageId: row.sourceLineageId,
    sourceEventSequence: row.sourceEventSequence,
    sourceEventHash: row.sourceEventHash,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveTarget(input: {
  actorId: string;
  continuityTransitionId?: string | null;
  ancestryId?: string | null;
}): Promise<Target> {
  const transitionId = input.continuityTransitionId ?? null;
  const ancestryId = input.ancestryId ?? null;
  if ((transitionId ? 1 : 0) + (ancestryId ? 1 : 0) !== 1) {
    throw new ExternalStateContinuationValidationError(
      'Exactly one of continuityTransitionId or ancestryId is required.',
    );
  }

  if (transitionId) {
    const transition = await loadTransition(transitionId);
    if (transition.actorId !== input.actorId) {
      throw new ExternalStateContinuationConflictError('Continuity transition does not belong to actor.');
    }
    if (transition.status !== 'ACCEPTED') {
      throw new ExternalStateContinuationConflictError(
        'Only accepted continuity transitions can reconcile external state.',
      );
    }
    if (!transition.resultingExecutionId || !transition.resultingLineageId) {
      throw new ExternalStateContinuationConflictError(
        'Accepted transition is missing resulting continuity state.',
      );
    }
    const snapshot = transitionSnapshot(transition);
    return {
      kind: 'transition',
      id: transition.id,
      actorId: transition.actorId,
      sourceActorId: transition.actorId,
      digest: sha256(snapshot),
      snapshot,
    };
  }

  const ancestry = await loadAncestry(ancestryId!);
  if (ancestry.childActorId !== input.actorId) {
    throw new ExternalStateContinuationConflictError('Ancestry child does not match actor.');
  }
  const snapshot = ancestrySnapshot(ancestry);
  return {
    kind: 'ancestry',
    id: ancestry.id,
    actorId: ancestry.childActorId,
    sourceActorId: ancestry.parentActorId,
    digest: sha256(snapshot),
    snapshot,
  };
}

function decisionBasis(row: {
  actorId: string;
  sourceActorId: string;
  targetKind: 'transition' | 'ancestry';
  targetId: string;
  targetDigest: string;
  stateClass: ExternalStateClass;
  sourceStateType: string;
  sourceStateRef: string;
  sourceStateDigest: string;
  externalPrincipalType: string;
  externalPrincipalRef: string;
  context: string;
  disposition: ExternalStateContinuationDisposition;
  successorStateRef: string | null;
  policyFramework: string | null;
  policyVersion: string;
  sourceEvidenceArtifactId: string | null;
  decidedAt: Date;
  validUntil: Date | null;
  conditions: string[];
  reasons: string[];
}) {
  return {
    version: 'noeone.external-state-continuation.v1',
    actorId: row.actorId,
    sourceActorId: row.sourceActorId,
    target: { kind: row.targetKind, id: row.targetId, digest: row.targetDigest },
    stateClass: row.stateClass,
    sourceState: {
      type: row.sourceStateType,
      ref: row.sourceStateRef,
      digest: row.sourceStateDigest,
    },
    externalPrincipal: {
      type: row.externalPrincipalType,
      ref: row.externalPrincipalRef,
    },
    context: row.context,
    disposition: row.disposition,
    successorStateRef: row.successorStateRef,
    policyFramework: row.policyFramework,
    policyVersion: row.policyVersion,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    decidedAt: row.decidedAt.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    conditions: row.conditions,
    reasons: row.reasons,
  };
}

async function decisionByKey(key: string) {
  const rows = await db.$queryRaw<ExternalStateContinuationDecisionRow[]>(Prisma.sql`
    SELECT * FROM "ExternalStateContinuationDecision"
    WHERE "idempotencyKey" = ${key}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function recordExternalStateContinuationDecision(
  input: ExternalStateContinuationDecisionInput,
) {
  const target = await resolveTarget(input);
  await requireEvidence(input.sourceEvidenceArtifactId);

  const existing = await decisionByKey(input.idempotencyKey);
  const decidedAt = input.decidedAt ?? existing?.decidedAt ?? new Date();
  const validUntil = input.validUntil === undefined ? (existing?.validUntil ?? null) : input.validUntil;
  if (validUntil && validUntil <= decidedAt) {
    throw new ExternalStateContinuationValidationError('validUntil must be later than decidedAt.');
  }

  const successorStateRef = optional(input.successorStateRef, 500);
  if (input.disposition === 'REISSUED' && !successorStateRef) {
    throw new ExternalStateContinuationValidationError(
      'successorStateRef is required when disposition is REISSUED.',
    );
  }

  const normalized = {
    actorId: target.actorId,
    sourceActorId: target.sourceActorId,
    targetKind: target.kind,
    targetId: target.id,
    targetDigest: target.digest,
    stateClass: input.stateClass,
    sourceStateType: required(input.sourceStateType, 'sourceStateType', 120).toLowerCase(),
    sourceStateRef: required(input.sourceStateRef, 'sourceStateRef'),
    sourceStateDigest: requireDigest(input.sourceStateDigest, 'sourceStateDigest'),
    externalPrincipalType: required(
      input.externalPrincipalType,
      'externalPrincipalType',
      120,
    ).toLowerCase(),
    externalPrincipalRef: required(input.externalPrincipalRef, 'externalPrincipalRef'),
    context: required(input.context, 'context', 240).toLowerCase(),
    disposition: input.disposition,
    successorStateRef,
    policyFramework: optional(input.policyFramework, 240)?.toLowerCase() ?? null,
    policyVersion: required(input.policyVersion, 'policyVersion', 120),
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    decidedAt,
    validUntil,
    conditions: labels(input.conditions, 'conditions'),
    reasons: labels(input.reasons, 'reasons'),
  };

  const basisDigest = sha256(decisionBasis(normalized));
  if (existing) {
    if (existing.basisDigest !== basisDigest) {
      throw new ExternalStateContinuationConflictError(
        'External-state continuation idempotency key was reused.',
      );
    }
    return { replayed: true, decision: existing };
  }

  const id = `esc_${randomUUID()}`;
  const conditionsSql = textArray(normalized.conditions);
  const reasonsSql = textArray(normalized.reasons);
  const metadata = {
    ...(input.metadata ?? {}),
    _noeoneTarget: target.snapshot,
  };

  const rows = await db.$queryRaw<ExternalStateContinuationDecisionRow[]>(Prisma.sql`
    INSERT INTO "ExternalStateContinuationDecision" (
      "id", "actorId", "sourceActorId", "continuityTransitionId", "ancestryId",
      "stateClass", "sourceStateType", "sourceStateRef", "sourceStateDigest",
      "externalPrincipalType", "externalPrincipalRef", "context", "disposition",
      "successorStateRef", "policyFramework", "policyVersion", "sourceEvidenceArtifactId",
      "decidedAt", "validUntil", "conditions", "reasons", "targetDigest", "basisDigest",
      "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${normalized.actorId}, ${normalized.sourceActorId},
      ${target.kind === 'transition' ? target.id : null},
      ${target.kind === 'ancestry' ? target.id : null},
      ${normalized.stateClass}, ${normalized.sourceStateType}, ${normalized.sourceStateRef},
      ${normalized.sourceStateDigest}, ${normalized.externalPrincipalType},
      ${normalized.externalPrincipalRef}, ${normalized.context}, ${normalized.disposition},
      ${normalized.successorStateRef}, ${normalized.policyFramework}, ${normalized.policyVersion},
      ${normalized.sourceEvidenceArtifactId}, ${normalized.decidedAt}, ${normalized.validUntil},
      ${conditionsSql}, ${reasonsSql}, ${normalized.targetDigest}, ${basisDigest},
      ${input.idempotencyKey}, ${json(metadata)}
    ) ON CONFLICT DO NOTHING RETURNING *
  `);
  if (rows[0]) return { replayed: false, decision: rows[0] };

  const raced = await decisionByKey(input.idempotencyKey);
  if (raced?.basisDigest === basisDigest) return { replayed: true, decision: raced };

  const equivalent = await db.$queryRaw<ExternalStateContinuationDecisionRow[]>(Prisma.sql`
    SELECT * FROM "ExternalStateContinuationDecision"
    WHERE "basisDigest" = ${basisDigest}
    LIMIT 1
  `);
  if (equivalent[0]) return { replayed: true, decision: equivalent[0] };

  throw new ExternalStateContinuationConflictError(
    'External-state continuation decision insert conflicted.',
  );
}

export async function getExternalStateContinuationSummary(actorId: string, at = new Date()) {
  const rows = await db.$queryRaw<ExternalStateContinuationDecisionRow[]>(Prisma.sql`
    SELECT DISTINCT ON (
      "externalPrincipalType", "externalPrincipalRef", "stateClass", "sourceStateType",
      "sourceStateRef", COALESCE("continuityTransitionId", ''), COALESCE("ancestryId", ''), "context"
    ) *
    FROM "ExternalStateContinuationDecision"
    WHERE "actorId" = ${actorId}
      AND "decidedAt" <= ${at}
      AND ("validUntil" IS NULL OR "validUntil" > ${at})
    ORDER BY
      "externalPrincipalType", "externalPrincipalRef", "stateClass", "sourceStateType",
      "sourceStateRef", COALESCE("continuityTransitionId", ''), COALESCE("ancestryId", ''),
      "context", "decidedAt" DESC, "createdAt" DESC
  `);

  const dispositions: Partial<Record<ExternalStateContinuationDisposition, number>> = {};
  const stateClasses: Partial<Record<ExternalStateClass, number>> = {};
  const contexts: Record<string, { count: number; dispositions: Record<string, number> }> = {};

  for (const row of rows) {
    dispositions[row.disposition] = (dispositions[row.disposition] ?? 0) + 1;
    stateClasses[row.stateClass] = (stateClasses[row.stateClass] ?? 0) + 1;
    const context = contexts[row.context] ?? { count: 0, dispositions: {} };
    context.count += 1;
    context.dispositions[row.disposition] = (context.dispositions[row.disposition] ?? 0) + 1;
    contexts[row.context] = context;
  }

  return {
    actorId,
    at,
    activeDecisionCount: rows.length,
    dispositions,
    stateClasses,
    contexts,
    decisions: rows,
  };
}

export async function verifyExternalStateContinuation(actorId: string) {
  const rows = await db.$queryRaw<ExternalStateContinuationDecisionRow[]>(Prisma.sql`
    SELECT * FROM "ExternalStateContinuationDecision"
    WHERE "actorId" = ${actorId}
    ORDER BY "decidedAt" ASC, "createdAt" ASC
  `);

  const failures: Array<{ id: string; reason: string }> = [];

  for (const row of rows) {
    try {
      const target = await resolveTarget({
        actorId: row.actorId,
        continuityTransitionId: row.continuityTransitionId,
        ancestryId: row.ancestryId,
      });
      if (target.sourceActorId !== row.sourceActorId) {
        failures.push({ id: row.id, reason: 'source_actor_mismatch' });
        continue;
      }
      if (target.digest !== row.targetDigest) {
        failures.push({ id: row.id, reason: 'target_digest_mismatch' });
        continue;
      }

      const expected = sha256(
        decisionBasis({
          actorId: row.actorId,
          sourceActorId: row.sourceActorId,
          targetKind: row.continuityTransitionId ? 'transition' : 'ancestry',
          targetId: row.continuityTransitionId ?? row.ancestryId!,
          targetDigest: row.targetDigest,
          stateClass: row.stateClass,
          sourceStateType: row.sourceStateType,
          sourceStateRef: row.sourceStateRef,
          sourceStateDigest: row.sourceStateDigest,
          externalPrincipalType: row.externalPrincipalType,
          externalPrincipalRef: row.externalPrincipalRef,
          context: row.context,
          disposition: row.disposition,
          successorStateRef: row.successorStateRef,
          policyFramework: row.policyFramework,
          policyVersion: row.policyVersion,
          sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
          decidedAt: row.decidedAt,
          validUntil: row.validUntil,
          conditions: row.conditions,
          reasons: row.reasons,
        }),
      );
      if (expected !== row.basisDigest) {
        failures.push({ id: row.id, reason: 'basis_digest_mismatch' });
      }
    } catch {
      failures.push({ id: row.id, reason: 'target_unverifiable' });
    }
  }

  return {
    actorId,
    decisionCount: rows.length,
    verified: failures.length === 0,
    failures,
  };
}
