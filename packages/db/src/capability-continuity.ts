import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export type AuthorityAdmissibilityDisposition =
  | 'ADMISSIBLE'
  | 'REVIEW_REQUIRED'
  | 'SUSPENDED'
  | 'NOT_APPLICABLE'
  | 'DISPUTED';
export type CapabilityContinuityState = 'EVIDENCE_MISSING' | 'REVIEW_REQUIRED' | 'ASSESSED';

export type ExecutionCapabilityManifestInput = {
  actorId: string;
  executionId: string;
  framework: string;
  frameworkVersion?: string | null;
  issuer: string;
  externalReference?: string | null;
  sourceEvidenceArtifactId?: string | null;
  capabilities?: string[];
  tools?: string[];
  modelRef?: string | null;
  runtimeRef?: string | null;
  effectiveAt?: Date;
  expiresAt?: Date | null;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type AuthorityAdmissibilityAssessmentInput = {
  grantId: string;
  executionId: string;
  capabilityManifestId?: string | null;
  disposition: AuthorityAdmissibilityDisposition;
  evaluator: string;
  method: string;
  methodVersion: string;
  sourceEvidenceArtifactId?: string | null;
  assessedAt?: Date;
  validUntil?: Date | null;
  reasons?: string[];
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type ExecutionCapabilityManifestRow = {
  id: string;
  actorId: string;
  executionId: string;
  framework: string;
  frameworkVersion: string | null;
  issuer: string;
  externalReference: string | null;
  sourceEvidenceArtifactId: string | null;
  capabilities: string[];
  tools: string[];
  modelRef: string | null;
  runtimeRef: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
  manifestDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type AuthorityAdmissibilityAssessmentRow = {
  id: string;
  actorId: string;
  grantId: string;
  executionId: string;
  capabilityManifestId: string | null;
  disposition: AuthorityAdmissibilityDisposition;
  evaluator: string;
  method: string;
  methodVersion: string;
  sourceEvidenceArtifactId: string | null;
  assessedAt: Date;
  validUntil: Date | null;
  reasons: string[];
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type ExecutionContext = {
  id: string;
  actorId: string;
  provider: string;
  model: string;
  runtime: string | null;
  configHash: string;
  startedAt: Date;
  endedAt: Date | null;
};

type GrantContext = {
  id: string;
  subjectActorId: string;
  status: string;
  actions: string[];
  resources: string[];
  notBefore: Date;
  expiresAt: Date | null;
};

export class CapabilityContinuityConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityContinuityConflictError';
  }
}

export class CapabilityContinuityValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityContinuityValidationError';
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
function required(value: string, field: string, max = 240): string {
  const result = value.trim();
  if (!result) throw new CapabilityContinuityValidationError(`${field} is required.`);
  if (result.length > max) throw new CapabilityContinuityValidationError(`${field} is too long.`);
  return result;
}
function optional(value: string | null | undefined, max = 1_000): string | null {
  const result = value?.trim() ?? '';
  if (!result) return null;
  if (result.length > max) throw new CapabilityContinuityValidationError('Optional text is too long.');
  return result;
}
function labelSet(values: string[] | undefined, field: string): string[] {
  const result = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if (result.length > 512 || result.some((value) => value.length > 240)) {
    throw new CapabilityContinuityValidationError(`${field} exceeds supported bounds.`);
  }
  return result;
}
function reasons(values: string[] | undefined): string[] {
  const result = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (result.length > 32 || result.some((value) => value.length > 1_000)) {
    throw new CapabilityContinuityValidationError('reasons exceeds supported bounds.');
  }
  return result;
}

async function getExecution(id: string): Promise<ExecutionContext> {
  const rows = await db.$queryRaw<ExecutionContext[]>(Prisma.sql`
    SELECT "id", "actorId", "provider", "model", "runtime", "configHash", "startedAt", "endedAt"
    FROM "ActorExecution" WHERE "id" = ${id} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Actor execution not found.'), { statusCode: 404 });
  return rows[0];
}
async function getGrant(id: string): Promise<GrantContext> {
  const rows = await db.$queryRaw<GrantContext[]>(Prisma.sql`
    SELECT "id", "subjectActorId", "status", "actions", "resources", "notBefore", "expiresAt"
    FROM "AuthorityGrant" WHERE "id" = ${id} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Authority grant not found.'), { statusCode: 404 });
  return rows[0];
}
async function getManifest(id: string) {
  const rows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest" WHERE "id" = ${id} LIMIT 1
  `);
  return rows[0] ?? null;
}
async function manifestByKey(key: string) {
  const rows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}
async function assessmentByKey(key: string) {
  const rows = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "AuthorityAdmissibilityAssessment" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}
async function requireEvidence(id: string | null | undefined) {
  if (!id) return;
  const evidence = await db.evidenceArtifact.findUnique({ where: { id }, select: { id: true } });
  if (!evidence) throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
}

function manifestBasis(row: {
  actorId: string;
  executionId: string;
  framework: string;
  frameworkVersion: string | null;
  issuer: string;
  externalReference: string | null;
  sourceEvidenceArtifactId: string | null;
  capabilities: string[];
  tools: string[];
  modelRef: string | null;
  runtimeRef: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
}) {
  return {
    version: 'noeone.execution-capability-manifest.v1',
    actorId: row.actorId,
    executionId: row.executionId,
    framework: row.framework,
    frameworkVersion: row.frameworkVersion,
    issuer: row.issuer,
    externalReference: row.externalReference,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    capabilities: [...row.capabilities].sort(),
    tools: [...row.tools].sort(),
    modelRef: row.modelRef,
    runtimeRef: row.runtimeRef,
    effectiveAt: row.effectiveAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export async function registerExecutionCapabilityManifest(input: ExecutionCapabilityManifestInput) {
  const execution = await getExecution(input.executionId);
  if (execution.actorId !== input.actorId) {
    throw new CapabilityContinuityConflictError('Execution does not belong to actor.');
  }
  await requireEvidence(input.sourceEvidenceArtifactId);

  const effectiveAt = input.effectiveAt ?? new Date();
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt && expiresAt <= effectiveAt) {
    throw new CapabilityContinuityValidationError('expiresAt must be later than effectiveAt.');
  }
  if (effectiveAt < execution.startedAt || (execution.endedAt && effectiveAt >= execution.endedAt)) {
    throw new CapabilityContinuityConflictError('Manifest effective time is outside execution lifetime.');
  }

  const normalized = {
    actorId: input.actorId,
    executionId: input.executionId,
    framework: required(input.framework, 'framework', 120).toLowerCase(),
    frameworkVersion: optional(input.frameworkVersion, 120),
    issuer: required(input.issuer, 'issuer', 500),
    externalReference: optional(input.externalReference),
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    capabilities: labelSet(input.capabilities, 'capabilities'),
    tools: labelSet(input.tools, 'tools'),
    modelRef: optional(input.modelRef, 500),
    runtimeRef: optional(input.runtimeRef, 500),
    effectiveAt,
    expiresAt,
  };
  const manifestDigest = sha256(manifestBasis(normalized));

  const existing = await manifestByKey(input.idempotencyKey);
  if (existing) {
    if (existing.manifestDigest !== manifestDigest) {
      throw new CapabilityContinuityConflictError('Manifest idempotency key was reused.');
    }
    return { replayed: true, manifest: existing };
  }

  const capabilitiesSql = textArray(normalized.capabilities);
  const toolsSql = textArray(normalized.tools);
  const id = `capman_${randomUUID()}`;
  const rows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    INSERT INTO "ExecutionCapabilityManifest" (
      "id", "actorId", "executionId", "framework", "frameworkVersion", "issuer",
      "externalReference", "sourceEvidenceArtifactId", "capabilities", "tools", "modelRef",
      "runtimeRef", "effectiveAt", "expiresAt", "manifestDigest", "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${normalized.actorId}, ${normalized.executionId}, ${normalized.framework},
      ${normalized.frameworkVersion}, ${normalized.issuer}, ${normalized.externalReference},
      ${normalized.sourceEvidenceArtifactId}, ${capabilitiesSql}, ${toolsSql}, ${normalized.modelRef},
      ${normalized.runtimeRef}, ${effectiveAt}, ${expiresAt}, ${manifestDigest}, ${input.idempotencyKey},
      ${json(input.metadata ?? {})}
    ) ON CONFLICT DO NOTHING RETURNING *
  `);
  if (rows[0]) return { replayed: false, manifest: rows[0] };

  const raced = await manifestByKey(input.idempotencyKey);
  if (raced?.manifestDigest === manifestDigest) return { replayed: true, manifest: raced };
  const equivalent = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest"
    WHERE "executionId" = ${normalized.executionId} AND "issuer" = ${normalized.issuer}
      AND "manifestDigest" = ${manifestDigest} LIMIT 1
  `);
  if (equivalent[0]) return { replayed: true, manifest: equivalent[0] };
  throw new CapabilityContinuityConflictError('Capability manifest insert conflicted.');
}

export async function recordAuthorityAdmissibilityAssessment(
  input: AuthorityAdmissibilityAssessmentInput,
) {
  const [grant, execution] = await Promise.all([getGrant(input.grantId), getExecution(input.executionId)]);
  if (grant.subjectActorId !== execution.actorId) {
    throw new CapabilityContinuityConflictError('Grant and execution do not belong to the same actor.');
  }
  await requireEvidence(input.sourceEvidenceArtifactId);

  const assessedAt = input.assessedAt ?? new Date();
  const validUntil = input.validUntil ?? null;
  if (validUntil && validUntil <= assessedAt) {
    throw new CapabilityContinuityValidationError('validUntil must be later than assessedAt.');
  }
  if (input.disposition !== 'REVIEW_REQUIRED' && !input.capabilityManifestId) {
    throw new CapabilityContinuityValidationError(
      'A capability manifest is required unless disposition is REVIEW_REQUIRED.',
    );
  }

  let manifest: ExecutionCapabilityManifestRow | null = null;
  if (input.capabilityManifestId) {
    manifest = await getManifest(input.capabilityManifestId);
    if (!manifest) throw Object.assign(new Error('Capability manifest not found.'), { statusCode: 404 });
    if (manifest.actorId !== execution.actorId || manifest.executionId !== execution.id) {
      throw new CapabilityContinuityConflictError('Manifest does not match actor/execution.');
    }
    if (manifest.effectiveAt > assessedAt || (manifest.expiresAt && manifest.expiresAt <= assessedAt)) {
      throw new CapabilityContinuityConflictError('Manifest is not current at assessedAt.');
    }
  }

  const normalizedReasons = reasons(input.reasons);
  const evaluator = required(input.evaluator, 'evaluator', 500);
  const method = required(input.method, 'method', 240).toLowerCase();
  const methodVersion = required(input.methodVersion, 'methodVersion', 120);
  const grantSnapshot = {
    id: grant.id,
    status: grant.status,
    actions: [...grant.actions].sort(),
    resources: [...grant.resources].sort(),
    notBefore: grant.notBefore.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
  const executionSnapshot = {
    id: execution.id,
    provider: execution.provider,
    model: execution.model,
    runtime: execution.runtime,
    configHash: execution.configHash,
  };
  const manifestSnapshot = manifest ? { id: manifest.id, manifestDigest: manifest.manifestDigest } : null;
  const basis = {
    version: 'noeone.authority-admissibility.v1',
    actorId: execution.actorId,
    grant: grantSnapshot,
    execution: executionSnapshot,
    capabilityManifest: manifestSnapshot,
    disposition: input.disposition,
    evaluator,
    method,
    methodVersion,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    assessedAt: assessedAt.toISOString(),
    validUntil: validUntil?.toISOString() ?? null,
    reasons: normalizedReasons,
  };
  const basisDigest = sha256(basis);
  const metadata = {
    ...(input.metadata ?? {}),
    _noeoneBasis: { grant: grantSnapshot, execution: executionSnapshot, capabilityManifest: manifestSnapshot },
  };

  const existing = await assessmentByKey(input.idempotencyKey);
  if (existing) {
    if (existing.basisDigest !== basisDigest) {
      throw new CapabilityContinuityConflictError('Assessment idempotency key was reused.');
    }
    return { replayed: true, assessment: existing };
  }

  const equivalent = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "AuthorityAdmissibilityAssessment" WHERE "basisDigest" = ${basisDigest} LIMIT 1
  `);
  if (equivalent[0]) return { replayed: true, assessment: equivalent[0] };

  const id = `admit_${randomUUID()}`;
  const reasonsSql = textArray(normalizedReasons);
  const rows = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    INSERT INTO "AuthorityAdmissibilityAssessment" (
      "id", "actorId", "grantId", "executionId", "capabilityManifestId", "disposition",
      "evaluator", "method", "methodVersion", "sourceEvidenceArtifactId", "assessedAt", "validUntil",
      "reasons", "basisDigest", "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${execution.actorId}, ${grant.id}, ${execution.id}, ${manifest?.id ?? null},
      ${input.disposition}, ${evaluator}, ${method}, ${methodVersion},
      ${input.sourceEvidenceArtifactId ?? null}, ${assessedAt}, ${validUntil}, ${reasonsSql},
      ${basisDigest}, ${input.idempotencyKey}, ${json(metadata)}
    ) ON CONFLICT DO NOTHING RETURNING *
  `);
  if (rows[0]) return { replayed: false, assessment: rows[0] };

  const raced = await assessmentByKey(input.idempotencyKey);
  if (raced?.basisDigest === basisDigest) return { replayed: true, assessment: raced };
  throw new CapabilityContinuityConflictError('Admissibility assessment insert conflicted.');
}

export async function getAuthorityAdmissibilityState(grantId: string, executionId: string, at = new Date()) {
  const [grant, execution] = await Promise.all([getGrant(grantId), getExecution(executionId)]);
  if (grant.subjectActorId !== execution.actorId) {
    throw new CapabilityContinuityConflictError('Grant and execution do not belong to the same actor.');
  }
  const manifests = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest"
    WHERE "actorId" = ${execution.actorId} AND "executionId" = ${executionId}
      AND "effectiveAt" <= ${at} AND ("expiresAt" IS NULL OR "expiresAt" > ${at})
    ORDER BY "effectiveAt" DESC, "createdAt" DESC, "id" DESC LIMIT 100
  `);
  const assessments = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT a.* FROM "AuthorityAdmissibilityAssessment" a
    LEFT JOIN "ExecutionCapabilityManifest" m ON m."id" = a."capabilityManifestId"
    WHERE a."grantId" = ${grantId} AND a."executionId" = ${executionId}
      AND a."assessedAt" <= ${at} AND (a."validUntil" IS NULL OR a."validUntil" > ${at})
      AND (a."capabilityManifestId" IS NULL OR
           (m."effectiveAt" <= ${at} AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at})))
    ORDER BY a."assessedAt" DESC, a."createdAt" DESC, a."id" DESC LIMIT 500
  `);
  const dispositions = [...new Set(assessments.map((row) => row.disposition))].sort();
  const state: CapabilityContinuityState =
    manifests.length === 0 ? 'EVIDENCE_MISSING' : assessments.length === 0 ? 'REVIEW_REQUIRED' : 'ASSESSED';
  return {
    version: 'noeone.authority-admissibility-state.v1',
    actorId: execution.actorId,
    grantId,
    executionId,
    at,
    state,
    capabilityManifestCount: manifests.length,
    assessmentCount: assessments.length,
    disagreement: dispositions.length > 1,
    dispositionCounts: Object.fromEntries(
      dispositions.map((value) => [value, assessments.filter((row) => row.disposition === value).length]),
    ),
    manifests,
    assessments,
  };
}

export async function getActorCapabilityContinuitySummary(actorId: string, at = new Date()) {
  const actor = await db.actor.findUnique({
    where: { id: actorId },
    select: { id: true, handle: true, displayName: true },
  });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  const executions = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ActorExecution" WHERE "actorId" = ${actorId}
      AND "startedAt" <= ${at} AND ("endedAt" IS NULL OR "endedAt" > ${at})
    ORDER BY "startedAt" DESC, "id" DESC LIMIT 1
  `);
  const executionId = executions[0]?.id ?? null;
  if (!executionId) {
    return {
      version: 'noeone.capability-continuity-summary.v1', actor, at, executionId: null,
      capabilityManifestCount: 0, activeGrantCount: 0, assessedGrantCount: 0,
      unassessedGrantCount: 0, dispositionCounts: {},
    };
  }
  const counts = await db.$queryRaw<Array<{ manifests: bigint; grants: bigint; assessed: bigint }>>(Prisma.sql`
    SELECT
      (SELECT count(*) FROM "ExecutionCapabilityManifest" m WHERE m."actorId" = ${actorId}
       AND m."executionId" = ${executionId} AND m."effectiveAt" <= ${at}
       AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at})) AS "manifests",
      (SELECT count(*) FROM "AuthorityGrant" g WHERE g."subjectActorId" = ${actorId}
       AND g."status" = 'ACTIVE' AND g."notBefore" <= ${at}
       AND (g."expiresAt" IS NULL OR g."expiresAt" > ${at})) AS "grants",
      (SELECT count(DISTINCT a."grantId") FROM "AuthorityAdmissibilityAssessment" a
       JOIN "AuthorityGrant" g ON g."id" = a."grantId"
       LEFT JOIN "ExecutionCapabilityManifest" m ON m."id" = a."capabilityManifestId"
       WHERE a."actorId" = ${actorId} AND a."executionId" = ${executionId}
       AND g."status" = 'ACTIVE' AND g."notBefore" <= ${at}
       AND (g."expiresAt" IS NULL OR g."expiresAt" > ${at})
       AND a."assessedAt" <= ${at} AND (a."validUntil" IS NULL OR a."validUntil" > ${at})
       AND (a."capabilityManifestId" IS NULL OR
            (m."effectiveAt" <= ${at} AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at})))) AS "assessed"
  `);
  const row = counts[0] ?? { manifests: 0n, grants: 0n, assessed: 0n };
  const dispositions = await db.$queryRaw<Array<{ disposition: string; count: bigint }>>(Prisma.sql`
    SELECT a."disposition", count(*) AS "count" FROM "AuthorityAdmissibilityAssessment" a
    LEFT JOIN "ExecutionCapabilityManifest" m ON m."id" = a."capabilityManifestId"
    WHERE a."actorId" = ${actorId} AND a."executionId" = ${executionId}
      AND a."assessedAt" <= ${at} AND (a."validUntil" IS NULL OR a."validUntil" > ${at})
      AND (a."capabilityManifestId" IS NULL OR
           (m."effectiveAt" <= ${at} AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at})))
    GROUP BY a."disposition" ORDER BY a."disposition"
  `);
  const grantCount = Number(row.grants);
  const assessedCount = Number(row.assessed);
  return {
    version: 'noeone.capability-continuity-summary.v1', actor, at, executionId,
    capabilityManifestCount: Number(row.manifests), activeGrantCount: grantCount,
    assessedGrantCount: assessedCount, unassessedGrantCount: Math.max(0, grantCount - assessedCount),
    dispositionCounts: Object.fromEntries(dispositions.map((item) => [item.disposition, Number(item.count)])),
  };
}

function basisSnapshot(metadata: Prisma.JsonValue):
  | { grant: unknown; execution: unknown; capabilityManifest: unknown }
  | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)._noeoneBasis;
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!('grant' in record) || !('execution' in record) || !('capabilityManifest' in record)) return null;
  return { grant: record.grant, execution: record.execution, capabilityManifest: record.capabilityManifest };
}

export async function verifyCapabilityContinuity(actorId: string, limit = 2_000) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new CapabilityContinuityValidationError('limit must be between 1 and 10000.');
  }
  const actor = await db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  const manifests = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest" WHERE "actorId" = ${actorId}
    ORDER BY "effectiveAt", "createdAt", "id" LIMIT ${limit + 1}
  `);
  const assessments = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "AuthorityAdmissibilityAssessment" WHERE "actorId" = ${actorId}
    ORDER BY "assessedAt", "createdAt", "id" LIMIT ${limit + 1}
  `);
  if (manifests.length > limit || assessments.length > limit) {
    throw Object.assign(new Error('Capability continuity history is too large for synchronous verification.'), {
      statusCode: 413,
    });
  }
  const issues: string[] = [];
  for (const manifest of manifests) {
    const execution = await getExecution(manifest.executionId);
    if (execution.actorId !== actorId) issues.push(`manifest ${manifest.id} execution actor mismatch`);
    if (sha256(manifestBasis(manifest)) !== manifest.manifestDigest) {
      issues.push(`manifest ${manifest.id} digest mismatch`);
    }
  }
  for (const assessment of assessments) {
    const [grant, execution] = await Promise.all([getGrant(assessment.grantId), getExecution(assessment.executionId)]);
    if (grant.subjectActorId !== actorId || execution.actorId !== actorId) {
      issues.push(`assessment ${assessment.id} actor context mismatch`);
    }
    const snapshot = basisSnapshot(assessment.metadata);
    if (!snapshot) {
      issues.push(`assessment ${assessment.id} basis snapshot missing`);
      continue;
    }
    const expected = sha256({
      version: 'noeone.authority-admissibility.v1', actorId,
      grant: snapshot.grant, execution: snapshot.execution, capabilityManifest: snapshot.capabilityManifest,
      disposition: assessment.disposition, evaluator: assessment.evaluator, method: assessment.method,
      methodVersion: assessment.methodVersion,
      sourceEvidenceArtifactId: assessment.sourceEvidenceArtifactId,
      assessedAt: assessment.assessedAt.toISOString(), validUntil: assessment.validUntil?.toISOString() ?? null,
      reasons: assessment.reasons,
    });
    if (expected !== assessment.basisDigest) issues.push(`assessment ${assessment.id} basis digest mismatch`);
  }
  return {
    version: 'noeone.capability-continuity-verify.v1', actorId,
    verified: issues.length === 0, manifestCount: manifests.length, assessmentCount: assessments.length, issues,
  };
}
