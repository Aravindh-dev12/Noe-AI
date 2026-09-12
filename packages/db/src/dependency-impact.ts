import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { getDependencyExposure } from './dependency-exposure.js';
import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export type DependencyImpactDisposition =
  | 'AFFECTED'
  | 'NOT_AFFECTED'
  | 'UNDER_INVESTIGATION'
  | 'MITIGATED'
  | 'DISPUTED';

export type DependencyImpactAssessmentInput = {
  incidentId: string;
  actorId: string;
  executionId: string;
  disposition: DependencyImpactDisposition;
  evaluator: string;
  method: string;
  methodVersion: string;
  sourceEvidenceArtifactId: string;
  exposureAt?: Date;
  confidenceBps?: number;
  maxDepth?: number;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export class DependencyImpactConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'DependencyImpactConflictError';
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

type IncidentRow = {
  id: string;
  componentId: string;
  kind: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
};

export type DependencyImpactAssessmentRow = {
  id: string;
  incidentId: string;
  actorId: string;
  executionId: string;
  snapshotId: string;
  disposition: DependencyImpactDisposition;
  evaluator: string;
  method: string;
  methodVersion: string;
  sourceEvidenceArtifactId: string;
  exposureAt: Date;
  confidenceBps: number | null;
  pathBasis: Prisma.JsonValue;
  pathDigest: string;
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

function assessmentBasis(row: {
  incidentId: string;
  actorId: string;
  executionId: string;
  snapshotId: string;
  exposureAt: Date;
  disposition: DependencyImpactDisposition;
  evaluator: string;
  method: string;
  methodVersion: string;
  sourceEvidenceArtifactId: string;
  confidenceBps: number | null;
  pathDigest: string;
}) {
  return {
    incidentId: row.incidentId,
    actorId: row.actorId,
    executionId: row.executionId,
    snapshotId: row.snapshotId,
    exposureAt: row.exposureAt.toISOString(),
    disposition: row.disposition,
    evaluator: row.evaluator,
    method: row.method,
    methodVersion: row.methodVersion,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    confidenceBps: row.confidenceBps,
    pathDigest: row.pathDigest,
  };
}

async function getIncident(incidentId: string): Promise<IncidentRow> {
  const rows = await db.$queryRaw<IncidentRow[]>(Prisma.sql`
    SELECT "id", "componentId", "kind", "status", "startedAt", "endedAt"
    FROM "DependencyIncident"
    WHERE "id" = ${incidentId}
    LIMIT 1
  `);
  const incident = rows[0];
  if (!incident) {
    throw Object.assign(new Error('Dependency incident not found.'), { statusCode: 404 });
  }
  return incident;
}

function normalizePathBasis(
  incidentId: string,
  rootComponentId: string,
  exposureAt: Date,
  actorId: string,
  executionId: string,
  paths: Awaited<ReturnType<typeof getDependencyExposure>>['paths'],
) {
  const selected = paths
    .filter((path) => path.actorId === actorId && path.executionId === executionId)
    .map((path) => ({
      snapshotId: path.snapshotId,
      componentId: path.componentId,
      depth: path.depth,
      path: path.path,
      role: path.role,
      direct: path.direct,
      required: path.required,
    }))
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        a.componentId.localeCompare(b.componentId) ||
        a.role.localeCompare(b.role) ||
        a.path.join('\u0000').localeCompare(b.path.join('\u0000')),
    );

  if (selected.length === 0) {
    throw new DependencyImpactConflictError(
      'Actor execution is not potentially exposed to the incident component at exposureAt.',
    );
  }

  const snapshots = [...new Set(selected.map((path) => path.snapshotId))];
  if (snapshots.length !== 1) {
    throw new DependencyImpactConflictError(
      'Potential exposure resolved to multiple dependency snapshots for one execution.',
    );
  }

  return {
    snapshotId: snapshots[0]!,
    pathBasis: {
      version: 'noeone.dependency-impact-path.v1',
      incidentId,
      rootComponentId,
      exposureAt: exposureAt.toISOString(),
      actorId,
      executionId,
      paths: selected,
    },
  };
}

async function findAssessmentByIdempotency(key: string) {
  const rows = await db.$queryRaw<DependencyImpactAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyImpactAssessment" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findAssessmentByBasis(basisDigest: string) {
  const rows = await db.$queryRaw<DependencyImpactAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyImpactAssessment" WHERE "basisDigest" = ${basisDigest} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function recordDependencyImpactAssessment(input: DependencyImpactAssessmentInput) {
  if (input.confidenceBps !== undefined) {
    if (!Number.isInteger(input.confidenceBps) || input.confidenceBps < 0 || input.confidenceBps > 10_000) {
      throw Object.assign(new Error('confidenceBps must be an integer between 0 and 10000.'), {
        statusCode: 400,
      });
    }
  }

  const incident = await getIncident(input.incidentId);
  const exposureAt = input.exposureAt ?? incident.startedAt;
  const exposure = await getDependencyExposure(incident.componentId, exposureAt, input.maxDepth ?? 8);
  const { snapshotId, pathBasis } = normalizePathBasis(
    incident.id,
    incident.componentId,
    exposureAt,
    input.actorId,
    input.executionId,
    exposure.paths,
  );
  const pathDigest = sha256(pathBasis);
  const normalized = {
    evaluator: input.evaluator.trim(),
    method: input.method.trim().toLowerCase(),
    methodVersion: input.methodVersion.trim(),
  };
  if (!normalized.evaluator || !normalized.method || !normalized.methodVersion) {
    throw Object.assign(new Error('Evaluator, method, and methodVersion are required.'), {
      statusCode: 400,
    });
  }

  const basisDigest = sha256(
    assessmentBasis({
      incidentId: input.incidentId,
      actorId: input.actorId,
      executionId: input.executionId,
      snapshotId,
      exposureAt,
      disposition: input.disposition,
      evaluator: normalized.evaluator,
      method: normalized.method,
      methodVersion: normalized.methodVersion,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      confidenceBps: input.confidenceBps ?? null,
      pathDigest,
    }),
  );

  const existingByKey = await findAssessmentByIdempotency(input.idempotencyKey);
  if (existingByKey) {
    if (existingByKey.basisDigest !== basisDigest) {
      throw new DependencyImpactConflictError(
        'Impact-assessment idempotency key was reused with different input.',
      );
    }
    return { replayed: true, assessment: existingByKey };
  }

  const existingByBasis = await findAssessmentByBasis(basisDigest);
  if (existingByBasis) return { replayed: true, assessment: existingByBasis };

  const id = `depimpact_${randomUUID()}`;
  const rows = await db.$queryRaw<DependencyImpactAssessmentRow[]>(Prisma.sql`
    INSERT INTO "DependencyImpactAssessment" (
      "id", "incidentId", "actorId", "executionId", "snapshotId", "disposition",
      "evaluator", "method", "methodVersion", "sourceEvidenceArtifactId", "exposureAt",
      "confidenceBps", "pathBasis", "pathDigest", "basisDigest", "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${input.incidentId}, ${input.actorId}, ${input.executionId}, ${snapshotId},
      ${input.disposition}, ${normalized.evaluator}, ${normalized.method}, ${normalized.methodVersion},
      ${input.sourceEvidenceArtifactId}, ${exposureAt}, ${input.confidenceBps ?? null},
      ${json(pathBasis)}, ${pathDigest}, ${basisDigest}, ${input.idempotencyKey},
      ${json(input.metadata ?? {})}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `);

  if (rows[0]) return { replayed: false, assessment: rows[0] };

  const racedByKey = await findAssessmentByIdempotency(input.idempotencyKey);
  if (racedByKey) {
    if (racedByKey.basisDigest !== basisDigest) {
      throw new DependencyImpactConflictError(
        'Impact-assessment idempotency key raced with different input.',
      );
    }
    return { replayed: true, assessment: racedByKey };
  }
  const racedByBasis = await findAssessmentByBasis(basisDigest);
  if (racedByBasis) return { replayed: true, assessment: racedByBasis };
  throw new Error('Dependency impact assessment insert failed.');
}

export async function getDependencyImpactAssessment(assessmentId: string) {
  const rows = await db.$queryRaw<DependencyImpactAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyImpactAssessment" WHERE "id" = ${assessmentId} LIMIT 1
  `);
  const assessment = rows[0];
  if (!assessment) {
    throw Object.assign(new Error('Dependency impact assessment not found.'), { statusCode: 404 });
  }
  return assessment;
}

export async function listDependencyImpactAssessments(incidentId: string, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw Object.assign(new Error('limit must be an integer between 1 and 500.'), { statusCode: 400 });
  }
  await getIncident(incidentId);
  return db.$queryRaw<DependencyImpactAssessmentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyImpactAssessment"
    WHERE "incidentId" = ${incidentId}
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT ${limit}
  `);
}

export async function verifyDependencyImpactAssessment(assessmentId: string) {
  const assessment = await getDependencyImpactAssessment(assessmentId);
  const issues: string[] = [];

  const computedPathDigest = sha256(assessment.pathBasis);
  if (computedPathDigest !== assessment.pathDigest) issues.push('path digest mismatch');

  const computedBasisDigest = sha256(
    assessmentBasis({
      incidentId: assessment.incidentId,
      actorId: assessment.actorId,
      executionId: assessment.executionId,
      snapshotId: assessment.snapshotId,
      exposureAt: assessment.exposureAt,
      disposition: assessment.disposition,
      evaluator: assessment.evaluator,
      method: assessment.method,
      methodVersion: assessment.methodVersion,
      sourceEvidenceArtifactId: assessment.sourceEvidenceArtifactId,
      confidenceBps: assessment.confidenceBps,
      pathDigest: assessment.pathDigest,
    }),
  );
  if (computedBasisDigest !== assessment.basisDigest) issues.push('assessment basis digest mismatch');

  const contexts = await db.$queryRaw<
    Array<{ snapshotActorId: string; snapshotExecutionId: string; executionActorId: string }>
  >(Prisma.sql`
    SELECT
      s."actorId" AS "snapshotActorId",
      s."executionId" AS "snapshotExecutionId",
      e."actorId" AS "executionActorId"
    FROM "ExecutionDependencySnapshot" s
    JOIN "ActorExecution" e ON e."id" = ${assessment.executionId}
    WHERE s."id" = ${assessment.snapshotId}
    LIMIT 1
  `);
  const context = contexts[0];
  if (!context) {
    issues.push('snapshot/execution context missing');
  } else {
    if (context.snapshotActorId !== assessment.actorId) issues.push('snapshot actor mismatch');
    if (context.snapshotExecutionId !== assessment.executionId) issues.push('snapshot execution mismatch');
    if (context.executionActorId !== assessment.actorId) issues.push('execution actor mismatch');
  }

  const refs = await db.$queryRaw<Array<{ incident: boolean; evidence: boolean }>>(Prisma.sql`
    SELECT
      EXISTS(SELECT 1 FROM "DependencyIncident" WHERE "id" = ${assessment.incidentId}) AS incident,
      EXISTS(SELECT 1 FROM "EvidenceArtifact" WHERE "id" = ${assessment.sourceEvidenceArtifactId}) AS evidence
  `);
  if (!refs[0]?.incident) issues.push('incident missing');
  if (!refs[0]?.evidence) issues.push('source evidence missing');

  return {
    version: 'noeone.dependency-impact-verification.v1' as const,
    assessmentId,
    valid: issues.length === 0,
    pathDigest: assessment.pathDigest,
    basisDigest: assessment.basisDigest,
    issues,
  };
}

export async function getDependencyIncidentTriage(
  incidentId: string,
  at?: Date,
  maxDepth = 8,
) {
  const incident = await getIncident(incidentId);
  const exposureAt = at ?? incident.startedAt;
  const [exposure, assessments] = await Promise.all([
    getDependencyExposure(incident.componentId, exposureAt, maxDepth),
    listDependencyImpactAssessments(incidentId, 500),
  ]);

  const assessmentSummary = new Map<
    string,
    { actorId: string; executionId: string; dispositions: Set<string>; assessmentCount: number }
  >();
  for (const assessment of assessments) {
    const key = `${assessment.actorId}\u0000${assessment.executionId}`;
    const current = assessmentSummary.get(key) ?? {
      actorId: assessment.actorId,
      executionId: assessment.executionId,
      dispositions: new Set<string>(),
      assessmentCount: 0,
    };
    current.dispositions.add(assessment.disposition);
    current.assessmentCount += 1;
    assessmentSummary.set(key, current);
  }

  return {
    version: 'noeone.dependency-incident-triage.v1' as const,
    incident,
    exposure,
    assessments,
    assessmentSummary: [...assessmentSummary.values()].map((entry) => ({
      actorId: entry.actorId,
      executionId: entry.executionId,
      dispositions: [...entry.dispositions].sort(),
      assessmentCount: entry.assessmentCount,
    })),
    universalVerdict: null,
  };
}
