import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export type ContinuityRecognitionRelation =
  | 'SAME_ACTOR'
  | 'SUCCESSOR'
  | 'DESCENDANT'
  | 'UNRELATED';

export type ContinuityRecognitionDisposition =
  | 'RECOGNIZED'
  | 'CONDITIONAL'
  | 'REJECTED'
  | 'DISPUTED';

export type ContinuityRecognitionAssessmentInput = {
  actorId: string;
  continuityTransitionId?: string | null;
  ancestryId?: string | null;
  relation: ContinuityRecognitionRelation;
  disposition: ContinuityRecognitionDisposition;
  recognizerType: string;
  recognizerRef: string;
  context: string;
  policyFramework?: string | null;
  policyVersion: string;
  sourceEvidenceArtifactId?: string | null;
  assessedAt?: Date;
  validUntil?: Date | null;
  conditions?: string[];
  reasons?: string[];
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type ContinuityRecognitionAssessmentRow = {
  id: string;
  actorId: string;
  continuityTransitionId: string | null;
  ancestryId: string | null;
  relation: ContinuityRecognitionRelation;
  disposition: ContinuityRecognitionDisposition;
  recognizerType: string;
  recognizerRef: string;
  context: string;
  policyFramework: string | null;
  policyVersion: string;
  sourceEvidenceArtifactId: string | null;
  assessedAt: Date;
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
  | { kind: 'transition'; id: string; actorId: string; digest: string; snapshot: JsonObject }
  | { kind: 'ancestry'; id: string; actorId: string; digest: string; snapshot: JsonObject };

export class RecognitionContinuityValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'RecognitionContinuityValidationError';
  }
}

export class RecognitionContinuityConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'RecognitionContinuityConflictError';
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
  if (!result) throw new RecognitionContinuityValidationError(`${field} is required.`);
  if (result.length > max) throw new RecognitionContinuityValidationError(`${field} is too long.`);
  return result;
}

function optional(value: string | null | undefined, max = 1_000): string | null {
  const result = value?.trim() ?? '';
  if (!result) return null;
  if (result.length > max) throw new RecognitionContinuityValidationError('Optional text is too long.');
  return result;
}

function labels(values: string[] | undefined, field: string): string[] {
  const result = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if (result.length > 64 || result.some((value) => value.length > 1_000)) {
    throw new RecognitionContinuityValidationError(`${field} exceeds supported bounds.`);
  }
  return result;
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
    version: 'noeone.recognition-target.transition.v1',
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
    version: 'noeone.recognition-target.ancestry.v1',
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
    throw new RecognitionContinuityValidationError(
      'Exactly one of continuityTransitionId or ancestryId is required.',
    );
  }

  if (transitionId) {
    const transition = await loadTransition(transitionId);
    if (transition.actorId !== input.actorId) {
      throw new RecognitionContinuityConflictError('Continuity transition does not belong to actor.');
    }
    if (transition.status !== 'ACCEPTED') {
      throw new RecognitionContinuityConflictError(
        'Only accepted continuity transitions can be recognized.',
      );
    }
    if (!transition.resultingExecutionId || !transition.resultingLineageId) {
      throw new RecognitionContinuityConflictError('Accepted transition is missing resulting continuity state.');
    }
    const snapshot = transitionSnapshot(transition);
    return {
      kind: 'transition',
      id: transition.id,
      actorId: transition.actorId,
      digest: sha256(snapshot),
      snapshot,
    };
  }

  const ancestry = await loadAncestry(ancestryId!);
  if (ancestry.childActorId !== input.actorId) {
    throw new RecognitionContinuityConflictError('Ancestry child does not match actor.');
  }
  const snapshot = ancestrySnapshot(ancestry);
  return {
    kind: 'ancestry',
    id: ancestry.id,
    actorId: ancestry.childActorId,
    digest: sha256(snapshot),
    snapshot,
  };
}

function assessmentBasis(row: {
  actorId: string;
  targetKind: 'transition' | 'ancestry';
  targetId: string;
  targetDigest: string;
  relation: ContinuityRecognitionRelation;
  disposition: ContinuityRecognitionDisposition;
  recognizerType: string;
  recognizerRef: string;
  context: string;
  policyFramework: string | null;
  policyVersion: string;
  sourceEvidenceArtifactId: string | null;
  assessedAt: Date;
  validUntil: Date | null;
  conditions: string[];
  reasons: string[];
}) {
  return {
    version: 'noeone.continuity-recognition.v1',
    actorId: row.actorId,
    target: { kind: row.targetKind, id: row.targetId, digest: row.targetDigest },
    relation: row.relation,
    disposition: row.disposition,
    recognizerType: row.recognizerType,
    recognizerRef: row.recognizerRef,
    context: row.context,
    policyFramework: row.policyFramework,
    policyVersion: row.policyVersion,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    assessedAt: row.assessedAt.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    conditions: row.conditions,
    reasons: row.reasons,
  };
}

async function assessmentByKey(key: string) {
  const rows = await db.$queryRaw<ContinuityRecognitionAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "ContinuityRecognitionAssessment" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function recordContinuityRecognitionAssessment(
  input: ContinuityRecognitionAssessmentInput,
) {
  const target = await resolveTarget(input);
  await requireEvidence(input.sourceEvidenceArtifactId);

  // Idempotency must survive server-generated timestamps. A retry that omits
  // assessedAt/validUntil inherits the persisted values before recomputing the
  // semantic basis; explicit caller changes still produce a conflict.
  const existing = await assessmentByKey(input.idempotencyKey);
  const assessedAt = input.assessedAt ?? existing?.assessedAt ?? new Date();
  const validUntil =
    input.validUntil === undefined ? (existing?.validUntil ?? null) : input.validUntil;
  if (validUntil && validUntil <= assessedAt) {
    throw new RecognitionContinuityValidationError('validUntil must be later than assessedAt.');
  }

  const normalized = {
    actorId: input.actorId,
    targetKind: target.kind,
    targetId: target.id,
    targetDigest: target.digest,
    relation: input.relation,
    disposition: input.disposition,
    recognizerType: required(input.recognizerType, 'recognizerType', 120).toLowerCase(),
    recognizerRef: required(input.recognizerRef, 'recognizerRef'),
    context: required(input.context, 'context', 240).toLowerCase(),
    policyFramework: optional(input.policyFramework, 240)?.toLowerCase() ?? null,
    policyVersion: required(input.policyVersion, 'policyVersion', 120),
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    assessedAt,
    validUntil,
    conditions: labels(input.conditions, 'conditions'),
    reasons: labels(input.reasons, 'reasons'),
  };

  const basisDigest = sha256(assessmentBasis(normalized));
  if (existing) {
    if (existing.basisDigest !== basisDigest) {
      throw new RecognitionContinuityConflictError('Recognition idempotency key was reused.');
    }
    return { replayed: true, assessment: existing };
  }

  const id = `recog_${randomUUID()}`;
  const conditionsSql = textArray(normalized.conditions);
  const reasonsSql = textArray(normalized.reasons);
  const metadata = {
    ...(input.metadata ?? {}),
    _noeoneTarget: target.snapshot,
  };
  const rows = await db.$queryRaw<ContinuityRecognitionAssessmentRow[]>(Prisma.sql`
    INSERT INTO "ContinuityRecognitionAssessment" (
      "id", "actorId", "continuityTransitionId", "ancestryId", "relation", "disposition",
      "recognizerType", "recognizerRef", "context", "policyFramework", "policyVersion",
      "sourceEvidenceArtifactId", "assessedAt", "validUntil", "conditions", "reasons",
      "targetDigest", "basisDigest", "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${normalized.actorId}, ${target.kind === 'transition' ? target.id : null},
      ${target.kind === 'ancestry' ? target.id : null}, ${normalized.relation},
      ${normalized.disposition}, ${normalized.recognizerType}, ${normalized.recognizerRef},
      ${normalized.context}, ${normalized.policyFramework}, ${normalized.policyVersion},
      ${normalized.sourceEvidenceArtifactId}, ${normalized.assessedAt}, ${normalized.validUntil},
      ${conditionsSql}, ${reasonsSql}, ${normalized.targetDigest}, ${basisDigest},
      ${input.idempotencyKey}, ${json(metadata)}
    ) ON CONFLICT DO NOTHING RETURNING *
  `);
  if (rows[0]) return { replayed: false, assessment: rows[0] };

  const raced = await assessmentByKey(input.idempotencyKey);
  if (raced?.basisDigest === basisDigest) return { replayed: true, assessment: raced };
  const equivalent = await db.$queryRaw<ContinuityRecognitionAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "ContinuityRecognitionAssessment" WHERE "basisDigest" = ${basisDigest} LIMIT 1
  `);
  if (equivalent[0]) return { replayed: true, assessment: equivalent[0] };
  throw new RecognitionContinuityConflictError('Recognition assessment insert conflicted.');
}

export async function getActorRecognitionSummary(actorId: string, at = new Date()) {
  const actor = await db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const rows = await db.$queryRaw<ContinuityRecognitionAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "ContinuityRecognitionAssessment"
    WHERE "actorId" = ${actorId}
      AND "assessedAt" <= ${at}
      AND ("validUntil" IS NULL OR "validUntil" > ${at})
    ORDER BY "context" ASC, "assessedAt" DESC, "id" DESC
  `);

  const contexts: Record<
    string,
    {
      assessmentCount: number;
      recognizers: string[];
      relationCounts: Partial<Record<ContinuityRecognitionRelation, number>>;
      dispositionCounts: Partial<Record<ContinuityRecognitionDisposition, number>>;
      disagreement: boolean;
    }
  > = {};

  for (const row of rows) {
    const entry = (contexts[row.context] ??= {
      assessmentCount: 0,
      recognizers: [],
      relationCounts: {},
      dispositionCounts: {},
      disagreement: false,
    });
    entry.assessmentCount += 1;
    const recognizer = `${row.recognizerType}:${row.recognizerRef}`;
    if (!entry.recognizers.includes(recognizer)) entry.recognizers.push(recognizer);
    entry.relationCounts[row.relation] = (entry.relationCounts[row.relation] ?? 0) + 1;
    entry.dispositionCounts[row.disposition] = (entry.dispositionCounts[row.disposition] ?? 0) + 1;
  }

  for (const [context, entry] of Object.entries(contexts)) {
    entry.recognizers.sort();
    const pairs = new Set(
      rows
        .filter((row) => row.context === context)
        .map((row) => `${row.relation}:${row.disposition}`),
    );
    entry.disagreement = pairs.size > 1;
  }

  return {
    version: 'noeone.recognition-summary.v1',
    actorId,
    asOf: at.toISOString(),
    assessmentCount: rows.length,
    contexts,
    assessments: rows,
  };
}

export async function verifyRecognitionContinuity(actorId: string) {
  const rows = await db.$queryRaw<ContinuityRecognitionAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "ContinuityRecognitionAssessment"
    WHERE "actorId" = ${actorId}
    ORDER BY "assessedAt" ASC, "id" ASC
  `);

  const failures: Array<{ assessmentId: string; reason: string }> = [];
  for (const row of rows) {
    try {
      const target = await resolveTarget({
        actorId: row.actorId,
        continuityTransitionId: row.continuityTransitionId,
        ancestryId: row.ancestryId,
      });
      if (target.digest !== row.targetDigest) {
        failures.push({ assessmentId: row.id, reason: 'target_digest_mismatch' });
        continue;
      }
      if (row.sourceEvidenceArtifactId) {
        const evidence = await db.evidenceArtifact.findUnique({
          where: { id: row.sourceEvidenceArtifactId },
          select: { id: true },
        });
        if (!evidence) {
          failures.push({ assessmentId: row.id, reason: 'source_evidence_missing' });
          continue;
        }
      }
      const expected = sha256(
        assessmentBasis({
          actorId: row.actorId,
          targetKind: target.kind,
          targetId: target.id,
          targetDigest: row.targetDigest,
          relation: row.relation,
          disposition: row.disposition,
          recognizerType: row.recognizerType,
          recognizerRef: row.recognizerRef,
          context: row.context,
          policyFramework: row.policyFramework,
          policyVersion: row.policyVersion,
          sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
          assessedAt: row.assessedAt,
          validUntil: row.validUntil,
          conditions: row.conditions,
          reasons: row.reasons,
        }),
      );
      if (expected !== row.basisDigest) {
        failures.push({ assessmentId: row.id, reason: 'basis_digest_mismatch' });
      }
    } catch (error) {
      failures.push({
        assessmentId: row.id,
        reason: error instanceof Error ? error.message : 'verification_error',
      });
    }
  }

  return {
    version: 'noeone.recognition-verification.v1',
    actorId,
    verified: failures.length === 0,
    assessmentCount: rows.length,
    failures,
  };
}
