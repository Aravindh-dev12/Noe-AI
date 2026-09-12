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

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function json(value: unknown): Prisma.Sql {
  return Prisma.sql`CAST(${JSON.stringify(value)} AS jsonb)`;
}

function textArray(values: string[]): Prisma.Sql {
  return values.length === 0
    ? Prisma.sql`ARRAY[]::TEXT[]`
    : Prisma.sql`ARRAY[${Prisma.join(values)}]::TEXT[]`;
}

function normalizeLabelSet(values: string[] | undefined, field: string): string[] {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if (normalized.some((value) => value.length > 240)) {
    throw new CapabilityContinuityValidationError(`${field} values must be at most 240 characters.`);
  }
  if (normalized.length > 512) {
    throw new CapabilityContinuityValidationError(`${field} cannot contain more than 512 values.`);
  }
  return normalized;
}

function normalizeRequired(value: string, field: string, max = 240): string {
  const normalized = value.trim();
  if (!normalized) throw new CapabilityContinuityValidationError(`${field} is required.`);
  if (normalized.length > max) {
    throw new CapabilityContinuityValidationError(`${field} must be at most ${max} characters.`);
  }
  return normalized;
}

function normalizeOptional(value: string | null | undefined, max = 500): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new CapabilityContinuityValidationError(`Optional text must be at most ${max} characters.`);
  }
  return normalized;
}

function normalizeReasons(values: string[] | undefined): string[] {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > 32) {
    throw new CapabilityContinuityValidationError('reasons cannot contain more than 32 values.');
  }
  if (normalized.some((value) => value.length > 1_000)) {
    throw new CapabilityContinuityValidationError('reason values must be at most 1000 characters.');
  }
  return normalized;
}

async function executionContext(executionId: string) {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      actorId: string;
      provider: string;
      model: string;
      runtime: string | null;
      configHash: string;
      startedAt: Date;
      endedAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT "id", "actorId", "provider", "model", "runtime", "configHash", "startedAt", "endedAt"
    FROM "ActorExecution"
    WHERE "id" = ${executionId}
    LIMIT 1
  `);
  const execution = rows[0];
  if (!execution) {
    throw Object.assign(new Error('Actor execution not found.'), { statusCode: 404 });
  }
  return execution;
}

async function grantContext(grantId: string) {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      subjectActorId: string;
      status: string;
      actions: string[];
      resources: string[];
      notBefore: Date;
      expiresAt: Date | null;
      updatedAt: Date;
    }>
  >(Prisma.sql`
    SELECT "id", "subjectActorId", "status", "actions", "resources", "notBefore", "expiresAt", "updatedAt"
    FROM "AuthorityGrant"
    WHERE "id" = ${grantId}
    LIMIT 1
  `);
  const grant = rows[0];
  if (!grant) throw Object.assign(new Error('Authority grant not found.'), { statusCode: 404 });
  return grant;
}

async function findManifestById(id: string) {
  const rows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest" WHERE "id" = ${id} LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findManifestByIdempotency(key: string) {
  const rows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findAssessmentByIdempotency(key: string) {
  const rows = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "AuthorityAdmissibilityAssessment" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function registerExecutionCapabilityManifest(input: ExecutionCapabilityManifestInput) {
  const execution = await executionContext(input.executionId);
  if (execution.actorId !== input.actorId) {
    throw new CapabilityContinuityConflictError('Execution does not belong to the requested actor.');
  }

  const framework = normalizeRequired(input.framework, 'framework', 120).toLowerCase();
  const frameworkVersion = normalizeOptional(input.frameworkVersion, 120);
  const issuer = normalizeRequired(input.issuer, 'issuer', 500);
  const externalReference = normalizeOptional(input.externalReference, 1_000);
  const modelRef = normalizeOptional(input.modelRef, 500);
  const runtimeRef = normalizeOptional(input.runtimeRef, 500);
  const capabilities = normalizeLabelSet(input.capabilities, 'capabilities');
  const tools = normalizeLabelSet(input.tools, 'tools');
  const effectiveAt = input.effectiveAt ?? new Date();
  const expiresAt = input.expiresAt ?? null;

  if (expiresAt && expiresAt.getTime() <= effectiveAt.getTime()) {
    throw new CapabilityContinuityValidationError('expiresAt must be later than effectiveAt.');
  }
  if (effectiveAt.getTime() < execution.startedAt.getTime()) {
    throw new CapabilityContinuityConflictError('Capability manifest cannot predate its execution.');
  }
  if (execution.endedAt && effectiveAt.getTime() >= execution.endedAt.getTime()) {
    throw new CapabilityContinuityConflictError('Capability manifest cannot start after execution ended.');
  }

  if (input.sourceEvidenceArtifactId) {
    const evidence = await db.evidenceArtifact.findUnique({
      where: { id: input.sourceEvidenceArtifactId },
      select: { id: true },
    });
    if (!evidence) throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
  }

  const semanticBasis = {
    version: 'noeone.execution-capability-manifest.v1',
    actorId: input.actorId,
    executionId: input.executionId,
    framework,
    frameworkVersion,
    issuer,
    externalReference,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    capabilities,
    tools,
    modelRef,
    runtimeRef,
    effectiveAt: effectiveAt.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
  };
  const manifestDigest = sha256(semanticBasis);

  const existing = await findManifestByIdempotency(input.idempotencyKey);
  if (existing) {
    if (existing.manifestDigest !== manifestDigest) {
      throw new CapabilityContinuityConflictError(
        'Capability-manifest idempotency key was reused with different input.',
      );
    }
    return { replayed: true, manifest: existing };
  }

  const sameRows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest"
    WHERE "executionId" = ${input.executionId}
      AND "issuer" = ${issuer}
      AND "manifestDigest" = ${manifestDigest}
    LIMIT 1
  `);
  if (sameRows[0]) return { replayed: true, manifest: sameRows[0] };

  const id = `capman_${randomUUID()}`;
  const capabilityArray = textArray(capabilities);
  const toolArray = textArray(tools);
  const rows = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    INSERT INTO "ExecutionCapabilityManifest" (
      "id", "actorId", "executionId", "framework", "frameworkVersion", "issuer",
      "externalReference", "sourceEvidenceArtifactId", "capabilities", "tools",
      "modelRef", "runtimeRef", "effectiveAt", "expiresAt", "manifestDigest",
      "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${input.actorId}, ${input.executionId}, ${framework}, ${frameworkVersion}, ${issuer},
      ${externalReference}, ${input.sourceEvidenceArtifactId ?? null}, ${capabilityArray}, ${toolArray},
      ${modelRef}, ${runtimeRef}, ${effectiveAt}, ${expiresAt}, ${manifestDigest},
      ${input.idempotencyKey}, ${json(input.metadata ?? {})}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `);
  if (rows[0]) return { replayed: false, manifest: rows[0] };

  const raced = await findManifestByIdempotency(input.idempotencyKey);
  if (raced && raced.manifestDigest === manifestDigest) return { replayed: true, manifest: raced };
  throw new CapabilityContinuityConflictError('Capability manifest insert conflicted.');
}

export async function recordAuthorityAdmissibilityAssessment(
  input: AuthorityAdmissibilityAssessmentInput,
) {
  const [grant, execution] = await Promise.all([
    grantContext(input.grantId),
    executionContext(input.executionId),
  ]);
  if (grant.subjectActorId !== execution.actorId) {
    throw new CapabilityContinuityConflictError('Grant and execution do not belong to the same actor.');
  }

  const evaluator = normalizeRequired(input.evaluator, 'evaluator', 500);
  const method = normalizeRequired(input.method, 'method', 240).toLowerCase();
  const methodVersion = normalizeRequired(input.methodVersion, 'methodVersion', 120);
  const reasons = normalizeReasons(input.reasons);
  const assessedAt = input.assessedAt ?? new Date();
  const validUntil = input.validUntil ?? null;

  if (validUntil && validUntil.getTime() <= assessedAt.getTime()) {
    throw new CapabilityContinuityValidationError('validUntil must be later than assessedAt.');
  }
  if (
    input.disposition !== 'REVIEW_REQUIRED' &&
    (input.capabilityManifestId === undefined || input.capabilityManifestId === null)
  ) {
    throw new CapabilityContinuityValidationError(
      'A capability manifest is required unless disposition is REVIEW_REQUIRED.',
    );
  }

  let manifest: ExecutionCapabilityManifestRow | null = null;
  if (input.capabilityManifestId) {
    manifest = await findManifestById(input.capabilityManifestId);
    if (!manifest) throw Object.assign(new Error('Capability manifest not found.'), { statusCode: 404 });
    if (manifest.actorId !== execution.actorId || manifest.executionId !== execution.id) {
      throw new CapabilityContinuityConflictError(
        'Capability manifest does not belong to the grant actor/execution.',
      );
    }
    if (manifest.effectiveAt.getTime() > assessedAt.getTime()) {
      throw new CapabilityContinuityConflictError('Capability manifest was not yet effective at assessedAt.');
    }
    if (manifest.expiresAt && manifest.expiresAt.getTime() <= assessedAt.getTime()) {
      throw new CapabilityContinuityConflictError('Capability manifest was expired at assessedAt.');
    }
  }

  if (input.sourceEvidenceArtifactId) {
    const evidence = await db.evidenceArtifact.findUnique({
      where: { id: input.sourceEvidenceArtifactId },
      select: { id: true },
    });
    if (!evidence) throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
  }

  const basis = {
    version: 'noeone.authority-admissibility.v1',
    actorId: execution.actorId,
    grant: {
      id: grant.id,
      status: grant.status,
      actions: [...grant.actions].sort(),
      resources: [...grant.resources].sort(),
      notBefore: grant.notBefore.toISOString(),
      expiresAt: grant.expiresAt?.toISOString() ?? null,
    },
    execution: {
      id: execution.id,
      provider: execution.provider,
      model: execution.model,
      runtime: execution.runtime,
      configHash: execution.configHash,
    },
    capabilityManifest: manifest
      ? { id: manifest.id, manifestDigest: manifest.manifestDigest }
      : null,
    disposition: input.disposition,
    evaluator,
    method,
    methodVersion,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    assessedAt: assessedAt.toISOString(),
    validUntil: validUntil?.toISOString() ?? null,
    reasons,
  };
  const basisDigest = sha256(basis);

  const existing = await findAssessmentByIdempotency(input.idempotencyKey);
  if (existing) {
    if (existing.basisDigest !== basisDigest) {
      throw new CapabilityContinuityConflictError(
        'Admissibility-assessment idempotency key was reused with different input.',
      );
    }
    return { replayed: true, assessment: existing };
  }

  const sameRows = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "AuthorityAdmissibilityAssessment"
    WHERE "basisDigest" = ${basisDigest}
    LIMIT 1
  `);
  if (sameRows[0]) return { replayed: true, assessment: sameRows[0] };

  const id = `admit_${randomUUID()}`;
  const reasonArray = textArray(reasons);
  const rows = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    INSERT INTO "AuthorityAdmissibilityAssessment" (
      "id", "actorId", "grantId", "executionId", "capabilityManifestId", "disposition",
      "evaluator", "method", "methodVersion", "sourceEvidenceArtifactId", "assessedAt",
      "validUntil", "reasons", "basisDigest", "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${execution.actorId}, ${grant.id}, ${execution.id}, ${manifest?.id ?? null},
      ${input.disposition}, ${evaluator}, ${method}, ${methodVersion},
      ${input.sourceEvidenceArtifactId ?? null}, ${assessedAt}, ${validUntil}, ${reasonArray},
      ${basisDigest}, ${input.idempotencyKey}, ${json(input.metadata ?? {})}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `);
  if (rows[0]) return { replayed: false, assessment: rows[0] };

  const raced = await findAssessmentByIdempotency(input.idempotencyKey);
  if (raced && raced.basisDigest === basisDigest) return { replayed: true, assessment: raced };
  throw new CapabilityContinuityConflictError('Admissibility assessment insert conflicted.');
}

export async function getAuthorityAdmissibilityState(
  grantId: string,
  executionId: string,
  at = new Date(),
) {
  const [grant, execution] = await Promise.all([grantContext(grantId), executionContext(executionId)]);
  if (grant.subjectActorId !== execution.actorId) {
    throw new CapabilityContinuityConflictError('Grant and execution do not belong to the same actor.');
  }

  const manifests = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest"
    WHERE "actorId" = ${execution.actorId}
      AND "executionId" = ${executionId}
      AND "effectiveAt" <= ${at}
      AND ("expiresAt" IS NULL OR "expiresAt" > ${at})
    ORDER BY "effectiveAt" DESC, "createdAt" DESC, "id" DESC
    LIMIT 100
  `);

  const assessments = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT a.*
    FROM "AuthorityAdmissibilityAssessment" a
    LEFT JOIN "ExecutionCapabilityManifest" m ON m."id" = a."capabilityManifestId"
    WHERE a."grantId" = ${grantId}
      AND a."executionId" = ${executionId}
      AND a."assessedAt" <= ${at}
      AND (a."validUntil" IS NULL OR a."validUntil" > ${at})
      AND (
        a."capabilityManifestId" IS NULL OR
        (m."effectiveAt" <= ${at} AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at}))
      )
    ORDER BY a."assessedAt" DESC, a."createdAt" DESC, a."id" DESC
    LIMIT 500
  `);

  const dispositions = [...new Set(assessments.map((assessment) => assessment.disposition))].sort();
  const state: CapabilityContinuityState =
    manifests.length === 0 ? 'EVIDENCE_MISSING' : assessments.length === 0 ? 'REVIEW_REQUIRED' : 'ASSESSED';

  const dispositionCounts = Object.fromEntries(
    dispositions.map((disposition) => [
      disposition,
      assessments.filter((assessment) => assessment.disposition === disposition).length,
    ]),
  );

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
    dispositionCounts,
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

  const executionRows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ActorExecution"
    WHERE "actorId" = ${actorId}
      AND "startedAt" <= ${at}
      AND ("endedAt" IS NULL OR "endedAt" > ${at})
    ORDER BY "startedAt" DESC, "id" DESC
    LIMIT 1
  `);
  const executionId = executionRows[0]?.id ?? null;
  if (!executionId) {
    return {
      version: 'noeone.capability-continuity-summary.v1',
      actor,
      at,
      executionId: null,
      capabilityManifestCount: 0,
      activeGrantCount: 0,
      assessedGrantCount: 0,
      unassessedGrantCount: 0,
      dispositionCounts: {},
    };
  }

  const countRows = await db.$queryRaw<
    Array<{
      manifestCount: bigint;
      activeGrantCount: bigint;
      assessedGrantCount: bigint;
    }>
  >(Prisma.sql`
    SELECT
      (SELECT count(*) FROM "ExecutionCapabilityManifest" m
       WHERE m."actorId" = ${actorId}
         AND m."executionId" = ${executionId}
         AND m."effectiveAt" <= ${at}
         AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at})) AS "manifestCount",
      (SELECT count(*) FROM "AuthorityGrant" g
       WHERE g."subjectActorId" = ${actorId}
         AND g."status" = 'ACTIVE'
         AND g."notBefore" <= ${at}
         AND (g."expiresAt" IS NULL OR g."expiresAt" > ${at})) AS "activeGrantCount",
      (SELECT count(DISTINCT a."grantId")
       FROM "AuthorityAdmissibilityAssessment" a
       JOIN "AuthorityGrant" g ON g."id" = a."grantId"
       LEFT JOIN "ExecutionCapabilityManifest" m ON m."id" = a."capabilityManifestId"
       WHERE a."actorId" = ${actorId}
         AND a."executionId" = ${executionId}
         AND g."status" = 'ACTIVE'
         AND g."notBefore" <= ${at}
         AND (g."expiresAt" IS NULL OR g."expiresAt" > ${at})
         AND a."assessedAt" <= ${at}
         AND (a."validUntil" IS NULL OR a."validUntil" > ${at})
         AND (a."capabilityManifestId" IS NULL OR
              (m."effectiveAt" <= ${at} AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at}))))
       AS "assessedGrantCount"
  `);
  const counts = countRows[0] ?? { manifestCount: 0n, activeGrantCount: 0n, assessedGrantCount: 0n };

  const dispositionRows = await db.$queryRaw<Array<{ disposition: string; count: bigint }>>(Prisma.sql`
    SELECT a."disposition", count(*) AS "count"
    FROM "AuthorityAdmissibilityAssessment" a
    LEFT JOIN "ExecutionCapabilityManifest" m ON m."id" = a."capabilityManifestId"
    WHERE a."actorId" = ${actorId}
      AND a."executionId" = ${executionId}
      AND a."assessedAt" <= ${at}
      AND (a."validUntil" IS NULL OR a."validUntil" > ${at})
      AND (a."capabilityManifestId" IS NULL OR
           (m."effectiveAt" <= ${at} AND (m."expiresAt" IS NULL OR m."expiresAt" > ${at})))
    GROUP BY a."disposition"
    ORDER BY a."disposition"
  `);

  const activeGrantCount = Number(counts.activeGrantCount);
  const assessedGrantCount = Number(counts.assessedGrantCount);
  return {
    version: 'noeone.capability-continuity-summary.v1',
    actor,
    at,
    executionId,
    capabilityManifestCount: Number(counts.manifestCount),
    activeGrantCount,
    assessedGrantCount,
    unassessedGrantCount: Math.max(0, activeGrantCount - assessedGrantCount),
    dispositionCounts: Object.fromEntries(
      dispositionRows.map((row) => [row.disposition, Number(row.count)]),
    ),
  };
}

export async function verifyCapabilityContinuity(actorId: string, limit = 2_000) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new CapabilityContinuityValidationError('limit must be an integer between 1 and 10000.');
  }

  const actor = await db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const manifests = await db.$queryRaw<ExecutionCapabilityManifestRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionCapabilityManifest"
    WHERE "actorId" = ${actorId}
    ORDER BY "effectiveAt" ASC, "createdAt" ASC, "id" ASC
    LIMIT ${limit + 1}
  `);
  if (manifests.length > limit) {
    throw Object.assign(new Error('Capability continuity history is too large for synchronous verification.'), {
      statusCode: 413,
    });
  }

  const assessments = await db.$queryRaw<AuthorityAdmissibilityAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "AuthorityAdmissibilityAssessment"
    WHERE "actorId" = ${actorId}
    ORDER BY "assessedAt" ASC, "createdAt" ASC, "id" ASC
    LIMIT ${limit + 1}
  `);
  if (assessments.length > limit) {
    throw Object.assign(new Error('Admissibility history is too large for synchronous verification.'), {
      statusCode: 413,
    });
  }

  const issues: string[] = [];
  for (const manifest of manifests) {
    const execution = await executionContext(manifest.executionId);
    if (execution.actorId !== actorId) issues.push(`manifest ${manifest.id} execution actor mismatch`);
    const expected = sha256({
      version: 'noeone.execution-capability-manifest.v1',
      actorId: manifest.actorId,
      executionId: manifest.executionId,
      framework: manifest.framework,
      frameworkVersion: manifest.frameworkVersion,
      issuer: manifest.issuer,
      externalReference: manifest.externalReference,
      sourceEvidenceArtifactId: manifest.sourceEvidenceArtifactId,
      capabilities: [...manifest.capabilities].sort(),
      tools: [...manifest.tools].sort(),
      modelRef: manifest.modelRef,
      runtimeRef: manifest.runtimeRef,
      effectiveAt: manifest.effectiveAt.toISOString(),
      expiresAt: manifest.expiresAt?.toISOString() ?? null,
    });
    if (expected !== manifest.manifestDigest) issues.push(`manifest ${manifest.id} digest mismatch`);
  }

  for (const assessment of assessments) {
    const [grant, execution] = await Promise.all([
      grantContext(assessment.grantId),
      executionContext(assessment.executionId),
    ]);
    if (grant.subjectActorId !== actorId || execution.actorId !== actorId) {
      issues.push(`assessment ${assessment.id} actor context mismatch`);
    }
    let manifest: ExecutionCapabilityManifestRow | null = null;
    if (assessment.capabilityManifestId) {
      manifest = await findManifestById(assessment.capabilityManifestId);
      if (!manifest || manifest.executionId !== assessment.executionId || manifest.actorId !== actorId) {
        issues.push(`assessment ${assessment.id} manifest context mismatch`);
        continue;
      }
    }
    const expected = sha256({
      version: 'noeone.authority-admissibility.v1',
      actorId,
      grant: {
        id: grant.id,
        status: grant.status,
        actions: [...grant.actions].sort(),
        resources: [...grant.resources].sort(),
        notBefore: grant.notBefore.toISOString(),
        expiresAt: grant.expiresAt?.toISOString() ?? null,
      },
      execution: {
        id: execution.id,
        provider: execution.provider,
        model: execution.model,
        runtime: execution.runtime,
        configHash: execution.configHash,
      },
      capabilityManifest: manifest
        ? { id: manifest.id, manifestDigest: manifest.manifestDigest }
        : null,
      disposition: assessment.disposition,
      evaluator: assessment.evaluator,
      method: assessment.method,
      methodVersion: assessment.methodVersion,
      sourceEvidenceArtifactId: assessment.sourceEvidenceArtifactId,
      assessedAt: assessment.assessedAt.toISOString(),
      validUntil: assessment.validUntil?.toISOString() ?? null,
      reasons: assessment.reasons,
    });
    if (expected !== assessment.basisDigest) issues.push(`assessment ${assessment.id} basis digest mismatch`);
  }

  return {
    version: 'noeone.capability-continuity-verify.v1',
    actorId,
    verified: issues.length === 0,
    manifestCount: manifests.length,
    assessmentCount: assessments.length,
    issues,
  };
}
