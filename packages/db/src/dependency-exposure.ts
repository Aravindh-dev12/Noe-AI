import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

import { db } from './index.js';

type DbClient = PrismaClient | Prisma.TransactionClient;
type JsonObject = Record<string, unknown>;

export type DependencyComponentInput = {
  kind: string;
  canonicalName: string;
  provider?: string;
  version?: string;
  purl?: string;
  externalFramework?: string;
  externalReference?: string;
  metadata?: JsonObject;
};

export type DependencyBindingInput = {
  componentId: string;
  role: string;
  direct?: boolean;
  required?: boolean;
  evidenceArtifactId?: string;
  disclosureClass?: 'private' | 'aggregate' | 'public';
  metadata?: JsonObject;
};

export type DependencySnapshotInput = {
  actorId: string;
  executionId: string;
  framework: string;
  manifestDigest: string;
  sourceEvidenceArtifactId?: string;
  effectiveAt: Date;
  idempotencyKey: string;
  dependencies: DependencyBindingInput[];
  metadata?: JsonObject;
};

export type DependencyRelationInput = {
  sourceComponentId: string;
  targetComponentId: string;
  relationType: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  sourceEvidenceArtifactId?: string;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type DependencyIncidentInput = {
  componentId: string;
  kind: string;
  status?: 'OBSERVED' | 'RESOLVED' | 'DISPUTED' | 'RETRACTED';
  sourceEvidenceArtifactId: string;
  startedAt: Date;
  endedAt?: Date;
  externalFramework?: string;
  externalReference?: string;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type DependencyExposure = {
  version: 'noeone.dependency-exposure.v1';
  componentId: string;
  at: string;
  maxDepth: number;
  impactedComponentCount: number;
  impactedActorCount: number;
  impactedExecutionCount: number;
  openCommitmentCount: number;
  paths: Array<{
    actorId: string;
    actorHandle: string;
    executionId: string;
    snapshotId: string;
    componentId: string;
    componentName: string;
    componentKind: string;
    depth: number;
    path: string[];
    role: string;
    direct: boolean;
    required: boolean;
    openCommitmentCount: number;
  }>;
};

export class DependencyConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'DependencyConflictError';
  }
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function json(value: JsonObject | undefined): Prisma.Sql {
  return Prisma.sql`CAST(${JSON.stringify(value ?? {})} AS jsonb)`;
}

function normalizeComponent(input: DependencyComponentInput) {
  const normalized = {
    kind: input.kind.trim().toLowerCase(),
    canonicalName: input.canonicalName.trim(),
    provider: normalizeOptional(input.provider),
    version: normalizeOptional(input.version),
    purl: normalizeOptional(input.purl),
    externalFramework: normalizeOptional(input.externalFramework)?.toLowerCase() ?? null,
    externalReference: normalizeOptional(input.externalReference),
  };
  if (!normalized.kind || !normalized.canonicalName) {
    throw Object.assign(new Error('Dependency kind and canonical name are required.'), {
      statusCode: 400,
    });
  }
  return normalized;
}

export function dependencyComponentIdentityDigest(input: DependencyComponentInput): string {
  return sha256(normalizeComponent(input));
}

type ComponentRow = {
  id: string;
  kind: string;
  canonicalName: string;
  provider: string | null;
  version: string | null;
  purl: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  identityDigest: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

type SnapshotRow = {
  id: string;
  actorId: string;
  executionId: string;
  framework: string;
  manifestDigest: string;
  sourceEvidenceArtifactId: string | null;
  effectiveAt: Date;
  capturedAt: Date;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
};

type RelationRow = {
  id: string;
  sourceComponentId: string;
  targetComponentId: string;
  relationType: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceEvidenceArtifactId: string | null;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type IncidentRow = {
  id: string;
  componentId: string;
  kind: string;
  status: 'OBSERVED' | 'RESOLVED' | 'DISPUTED' | 'RETRACTED';
  sourceEvidenceArtifactId: string;
  startedAt: Date;
  endedAt: Date | null;
  externalFramework: string | null;
  externalReference: string | null;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export async function registerDependencyComponent(input: DependencyComponentInput) {
  const normalized = normalizeComponent(input);
  const identityDigest = dependencyComponentIdentityDigest(input);
  const id = `dep_${randomUUID()}`;

  const inserted = await db.$queryRaw<ComponentRow[]>(Prisma.sql`
    INSERT INTO "DependencyComponent" (
      "id", "kind", "canonicalName", "provider", "version", "purl",
      "externalFramework", "externalReference", "identityDigest", "metadata"
    ) VALUES (
      ${id}, ${normalized.kind}, ${normalized.canonicalName}, ${normalized.provider},
      ${normalized.version}, ${normalized.purl}, ${normalized.externalFramework},
      ${normalized.externalReference}, ${identityDigest}, ${json(input.metadata)}
    )
    ON CONFLICT ("identityDigest") DO NOTHING
    RETURNING *
  `);

  if (inserted[0]) return { replayed: false, component: inserted[0] };

  const existing = await db.$queryRaw<ComponentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyComponent" WHERE "identityDigest" = ${identityDigest} LIMIT 1
  `);
  if (!existing[0]) throw new Error('Dependency component conflict resolution failed.');
  return { replayed: true, component: existing[0] };
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

async function findSnapshotByIdempotency(tx: DbClient, key: string) {
  const rows = await tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
    SELECT * FROM "ExecutionDependencySnapshot" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function createDependencySnapshot(input: DependencySnapshotInput) {
  if (input.dependencies.length === 0) {
    throw Object.assign(new Error('A dependency snapshot requires at least one dependency.'), {
      statusCode: 400,
    });
  }

  const duplicateKeys = new Set<string>();
  for (const dependency of input.dependencies) {
    const key = `${dependency.componentId}\u0000${dependency.role.trim().toLowerCase()}`;
    if (duplicateKeys.has(key)) {
      throw Object.assign(new Error('Duplicate component/role binding in snapshot.'), {
        statusCode: 400,
      });
    }
    duplicateKeys.add(key);
  }

  return db.$transaction(async (tx) => {
    const replay = await findSnapshotByIdempotency(tx, input.idempotencyKey);
    if (replay) {
      if (
        replay.actorId !== input.actorId ||
        replay.executionId !== input.executionId ||
        replay.framework !== input.framework.trim().toLowerCase() ||
        replay.manifestDigest !== input.manifestDigest ||
        !sameInstant(replay.effectiveAt, input.effectiveAt)
      ) {
        throw new DependencyConflictError('Snapshot idempotency key was reused with different input.');
      }
      return { replayed: true, snapshot: replay };
    }

    const execution = await tx.actorExecution.findUnique({
      where: { id: input.executionId },
      select: { id: true, actorId: true, startedAt: true, endedAt: true },
    });
    if (!execution) {
      throw Object.assign(new Error('Actor execution not found.'), { statusCode: 404 });
    }
    if (execution.actorId !== input.actorId) {
      throw new DependencyConflictError('Execution does not belong to the requested actor.');
    }
    if (input.effectiveAt.getTime() < execution.startedAt.getTime()) {
      throw new DependencyConflictError('Dependency snapshot predates execution start.');
    }
    if (execution.endedAt && input.effectiveAt.getTime() > execution.endedAt.getTime()) {
      throw new DependencyConflictError('Dependency snapshot is after execution end.');
    }

    const componentIds = [...new Set(input.dependencies.map((entry) => entry.componentId))];
    const components = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "DependencyComponent"
      WHERE "id" IN (${Prisma.join(componentIds)})
    `);
    if (components.length !== componentIds.length) {
      throw Object.assign(new Error('One or more dependency components were not found.'), {
        statusCode: 404,
      });
    }

    const id = `depsnap_${randomUUID()}`;
    const rows = await tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
      INSERT INTO "ExecutionDependencySnapshot" (
        "id", "actorId", "executionId", "framework", "manifestDigest",
        "sourceEvidenceArtifactId", "effectiveAt", "idempotencyKey", "metadata"
      ) VALUES (
        ${id}, ${input.actorId}, ${input.executionId}, ${input.framework.trim().toLowerCase()},
        ${input.manifestDigest}, ${input.sourceEvidenceArtifactId ?? null}, ${input.effectiveAt},
        ${input.idempotencyKey}, ${json(input.metadata)}
      )
      RETURNING *
    `);
    const snapshot = rows[0];
    if (!snapshot) throw new Error('Dependency snapshot insert failed.');

    for (const binding of input.dependencies) {
      const role = binding.role.trim().toLowerCase();
      if (!role) throw Object.assign(new Error('Dependency role is required.'), { statusCode: 400 });
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SnapshotDependency" (
          "snapshotId", "componentId", "role", "direct", "required",
          "evidenceArtifactId", "disclosureClass", "metadata"
        ) VALUES (
          ${id}, ${binding.componentId}, ${role}, ${binding.direct ?? true},
          ${binding.required ?? true}, ${binding.evidenceArtifactId ?? null},
          ${binding.disclosureClass ?? 'private'}, ${json(binding.metadata)}
        )
      `);
    }

    return { replayed: false, snapshot };
  });
}

async function findRelationByIdempotency(tx: DbClient, key: string) {
  const rows = await tx.$queryRaw<RelationRow[]>(Prisma.sql`
    SELECT * FROM "DependencyRelation" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function createDependencyRelation(input: DependencyRelationInput) {
  if (input.sourceComponentId === input.targetComponentId) {
    throw Object.assign(new Error('A dependency component cannot depend on itself.'), {
      statusCode: 400,
    });
  }
  if (input.effectiveTo && input.effectiveTo.getTime() <= input.effectiveFrom.getTime()) {
    throw Object.assign(new Error('effectiveTo must be after effectiveFrom.'), { statusCode: 400 });
  }

  return db.$transaction(async (tx) => {
    const replay = await findRelationByIdempotency(tx, input.idempotencyKey);
    if (replay) {
      const sameEnd =
        (replay.effectiveTo === null && input.effectiveTo === undefined) ||
        (replay.effectiveTo !== null &&
          input.effectiveTo !== undefined &&
          sameInstant(replay.effectiveTo, input.effectiveTo));
      if (
        replay.sourceComponentId !== input.sourceComponentId ||
        replay.targetComponentId !== input.targetComponentId ||
        replay.relationType !== input.relationType.trim().toLowerCase() ||
        !sameInstant(replay.effectiveFrom, input.effectiveFrom) ||
        !sameEnd
      ) {
        throw new DependencyConflictError('Relation idempotency key was reused with different input.');
      }
      return { replayed: true, relation: replay };
    }

    const ids = [input.sourceComponentId, input.targetComponentId];
    const components = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "DependencyComponent" WHERE "id" IN (${Prisma.join(ids)})
    `);
    if (components.length !== 2) {
      throw Object.assign(new Error('Dependency relation component not found.'), { statusCode: 404 });
    }

    const id = `deprel_${randomUUID()}`;
    const rows = await tx.$queryRaw<RelationRow[]>(Prisma.sql`
      INSERT INTO "DependencyRelation" (
        "id", "sourceComponentId", "targetComponentId", "relationType",
        "effectiveFrom", "effectiveTo", "sourceEvidenceArtifactId", "idempotencyKey", "metadata"
      ) VALUES (
        ${id}, ${input.sourceComponentId}, ${input.targetComponentId},
        ${input.relationType.trim().toLowerCase()}, ${input.effectiveFrom},
        ${input.effectiveTo ?? null}, ${input.sourceEvidenceArtifactId ?? null},
        ${input.idempotencyKey}, ${json(input.metadata)}
      )
      RETURNING *
    `);
    const relation = rows[0];
    if (!relation) throw new Error('Dependency relation insert failed.');
    return { replayed: false, relation };
  });
}

async function findIncidentByIdempotency(tx: DbClient, key: string) {
  const rows = await tx.$queryRaw<IncidentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyIncident" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function recordDependencyIncident(input: DependencyIncidentInput) {
  if (input.endedAt && input.endedAt.getTime() < input.startedAt.getTime()) {
    throw Object.assign(new Error('Incident end cannot precede its start.'), { statusCode: 400 });
  }

  return db.$transaction(async (tx) => {
    const replay = await findIncidentByIdempotency(tx, input.idempotencyKey);
    if (replay) {
      if (
        replay.componentId !== input.componentId ||
        replay.kind !== input.kind.trim().toLowerCase() ||
        !sameInstant(replay.startedAt, input.startedAt)
      ) {
        throw new DependencyConflictError('Incident idempotency key was reused with different input.');
      }
      return { replayed: true, incident: replay };
    }

    const id = `depinc_${randomUUID()}`;
    const rows = await tx.$queryRaw<IncidentRow[]>(Prisma.sql`
      INSERT INTO "DependencyIncident" (
        "id", "componentId", "kind", "status", "sourceEvidenceArtifactId",
        "startedAt", "endedAt", "externalFramework", "externalReference",
        "idempotencyKey", "metadata"
      ) VALUES (
        ${id}, ${input.componentId}, ${input.kind.trim().toLowerCase()},
        ${input.status ?? 'OBSERVED'}, ${input.sourceEvidenceArtifactId}, ${input.startedAt},
        ${input.endedAt ?? null}, ${input.externalFramework ?? null},
        ${input.externalReference ?? null}, ${input.idempotencyKey}, ${json(input.metadata)}
      )
      RETURNING *
    `);
    const incident = rows[0];
    if (!incident) throw new Error('Dependency incident insert failed.');
    return { replayed: false, incident };
  });
}

type ActorDependencyRow = {
  snapshotId: string;
  effectiveAt: Date;
  capturedAt: Date;
  framework: string;
  manifestDigest: string;
  componentId: string;
  kind: string;
  canonicalName: string;
  provider: string | null;
  version: string | null;
  purl: string | null;
  role: string;
  direct: boolean;
  required: boolean;
  disclosureClass: string;
};

export async function getActorDependencyState(actorId: string, at = new Date()) {
  const actor = await db.actor.findUnique({
    where: { id: actorId },
    select: { id: true, handle: true, displayName: true },
  });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const execution = await db.actorExecution.findFirst({
    where: {
      actorId,
      startedAt: { lte: at },
      OR: [{ endedAt: null }, { endedAt: { gt: at } }],
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true, provider: true, model: true, runtime: true, startedAt: true, endedAt: true },
  });
  if (!execution) {
    return {
      version: 'noeone.actor-dependencies.v1' as const,
      actor,
      at: at.toISOString(),
      execution: null,
      snapshot: null,
      dependencies: [],
    };
  }

  const rows = await db.$queryRaw<ActorDependencyRow[]>(Prisma.sql`
    WITH latest AS (
      SELECT * FROM "ExecutionDependencySnapshot"
      WHERE "executionId" = ${execution.id} AND "effectiveAt" <= ${at}
      ORDER BY "effectiveAt" DESC, "capturedAt" DESC, "id" DESC
      LIMIT 1
    )
    SELECT
      s."id" AS "snapshotId", s."effectiveAt", s."capturedAt", s."framework", s."manifestDigest",
      c."id" AS "componentId", c."kind", c."canonicalName", c."provider", c."version", c."purl",
      d."role", d."direct", d."required", d."disclosureClass"
    FROM latest s
    JOIN "SnapshotDependency" d ON d."snapshotId" = s."id"
    JOIN "DependencyComponent" c ON c."id" = d."componentId"
    ORDER BY d."direct" DESC, d."required" DESC, c."kind", c."canonicalName", d."role"
  `);

  const first = rows[0];
  return {
    version: 'noeone.actor-dependencies.v1' as const,
    actor,
    at: at.toISOString(),
    execution,
    snapshot: first
      ? {
          id: first.snapshotId,
          effectiveAt: first.effectiveAt,
          capturedAt: first.capturedAt,
          framework: first.framework,
          manifestDigest: first.manifestDigest,
        }
      : null,
    dependencies: rows.map((row) => ({
      componentId: row.componentId,
      kind: row.kind,
      canonicalName: row.canonicalName,
      provider: row.provider,
      version: row.version,
      purl: row.purl,
      role: row.role,
      direct: row.direct,
      required: row.required,
      disclosureClass: row.disclosureClass,
    })),
  };
}

type ExposureRow = {
  actorId: string;
  actorHandle: string;
  executionId: string;
  snapshotId: string;
  componentId: string;
  componentName: string;
  componentKind: string;
  depth: number;
  path: string[];
  role: string;
  direct: boolean;
  required: boolean;
  openCommitmentCount: bigint;
};

export async function getDependencyExposure(
  componentId: string,
  at = new Date(),
  maxDepth = 6,
): Promise<DependencyExposure> {
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 16) {
    throw Object.assign(new Error('maxDepth must be an integer between 0 and 16.'), {
      statusCode: 400,
    });
  }

  const component = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "DependencyComponent" WHERE "id" = ${componentId} LIMIT 1
  `);
  if (!component[0]) {
    throw Object.assign(new Error('Dependency component not found.'), { statusCode: 404 });
  }

  const rows = await db.$queryRaw<ExposureRow[]>(Prisma.sql`
    WITH RECURSIVE impacted AS (
      SELECT
        c."id" AS "componentId",
        0::integer AS depth,
        ARRAY[c."id"]::text[] AS path
      FROM "DependencyComponent" c
      WHERE c."id" = ${componentId}

      UNION ALL

      SELECT
        r."sourceComponentId" AS "componentId",
        i.depth + 1,
        i.path || r."sourceComponentId"
      FROM impacted i
      JOIN "DependencyRelation" r ON r."targetComponentId" = i."componentId"
      WHERE i.depth < ${maxDepth}
        AND r."effectiveFrom" <= ${at}
        AND (r."effectiveTo" IS NULL OR r."effectiveTo" > ${at})
        AND NOT (r."sourceComponentId" = ANY(i.path))
    ),
    shortest AS (
      SELECT DISTINCT ON ("componentId") "componentId", depth, path
      FROM impacted
      ORDER BY "componentId", depth ASC, array_length(path, 1) ASC
    ),
    active_executions AS (
      SELECT e.*
      FROM "ActorExecution" e
      WHERE e."startedAt" <= ${at}
        AND (e."endedAt" IS NULL OR e."endedAt" > ${at})
    ),
    latest_snapshots AS (
      SELECT DISTINCT ON (s."executionId") s.*
      FROM "ExecutionDependencySnapshot" s
      JOIN active_executions e ON e."id" = s."executionId"
      WHERE s."effectiveAt" <= ${at}
      ORDER BY s."executionId", s."effectiveAt" DESC, s."capturedAt" DESC, s."id" DESC
    )
    SELECT DISTINCT
      a."id" AS "actorId",
      a."handle" AS "actorHandle",
      e."id" AS "executionId",
      s."id" AS "snapshotId",
      c."id" AS "componentId",
      c."canonicalName" AS "componentName",
      c."kind" AS "componentKind",
      i.depth,
      i.path,
      d."role",
      d."direct",
      d."required",
      (
        SELECT count(*)
        FROM "Commitment" cm
        WHERE cm."debtorActorId" = a."id"
          AND cm."openedAt" <= ${at}
          AND (cm."closedAt" IS NULL OR cm."closedAt" > ${at})
      ) AS "openCommitmentCount"
    FROM shortest i
    JOIN "SnapshotDependency" d ON d."componentId" = i."componentId"
    JOIN latest_snapshots s ON s."id" = d."snapshotId"
    JOIN active_executions e ON e."id" = s."executionId"
    JOIN "Actor" a ON a."id" = s."actorId"
    JOIN "DependencyComponent" c ON c."id" = d."componentId"
    ORDER BY i.depth ASC, a."handle", e."id", c."canonicalName", d."role"
  `);

  const actorIds = new Set(rows.map((row) => row.actorId));
  const executionIds = new Set(rows.map((row) => row.executionId));
  const impactedComponentIds = new Set(rows.map((row) => row.componentId));
  impactedComponentIds.add(componentId);
  const openCommitments = new Map<string, number>();
  for (const row of rows) openCommitments.set(row.actorId, Number(row.openCommitmentCount));

  return {
    version: 'noeone.dependency-exposure.v1',
    componentId,
    at: at.toISOString(),
    maxDepth,
    impactedComponentCount: impactedComponentIds.size,
    impactedActorCount: actorIds.size,
    impactedExecutionCount: executionIds.size,
    openCommitmentCount: [...openCommitments.values()].reduce((sum, count) => sum + count, 0),
    paths: rows.map((row) => ({
      actorId: row.actorId,
      actorHandle: row.actorHandle,
      executionId: row.executionId,
      snapshotId: row.snapshotId,
      componentId: row.componentId,
      componentName: row.componentName,
      componentKind: row.componentKind,
      depth: row.depth,
      path: row.path,
      role: row.role,
      direct: row.direct,
      required: row.required,
      openCommitmentCount: Number(row.openCommitmentCount),
    })),
  };
}

export async function getDependencyComponent(componentId: string) {
  const components = await db.$queryRaw<ComponentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyComponent" WHERE "id" = ${componentId} LIMIT 1
  `);
  const component = components[0];
  if (!component) {
    throw Object.assign(new Error('Dependency component not found.'), { statusCode: 404 });
  }

  const incidents = await db.$queryRaw<IncidentRow[]>(Prisma.sql`
    SELECT * FROM "DependencyIncident"
    WHERE "componentId" = ${componentId}
    ORDER BY "startedAt" DESC, "createdAt" DESC
    LIMIT 100
  `);
  return { component, incidents };
}

export async function verifyActorDependencyState(actorId: string) {
  const actor = await db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const mismatches = await db.$queryRaw<Array<{ snapshotId: string }>>(Prisma.sql`
    SELECT s."id" AS "snapshotId"
    FROM "ExecutionDependencySnapshot" s
    JOIN "ActorExecution" e ON e."id" = s."executionId"
    WHERE s."actorId" = ${actorId} AND e."actorId" <> s."actorId"
  `);

  const malformedBindings = await db.$queryRaw<Array<{ snapshotId: string; componentId: string }>>(
    Prisma.sql`
      SELECT d."snapshotId", d."componentId"
      FROM "SnapshotDependency" d
      JOIN "ExecutionDependencySnapshot" s ON s."id" = d."snapshotId"
      WHERE s."actorId" = ${actorId}
        AND (length(btrim(d."role")) = 0 OR d."disclosureClass" NOT IN ('private', 'aggregate', 'public'))
    `,
  );

  const snapshots = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM "ExecutionDependencySnapshot" WHERE "actorId" = ${actorId}
  `);

  const issues = [
    ...mismatches.map((row) => `snapshot ${row.snapshotId} execution belongs to another actor`),
    ...malformedBindings.map(
      (row) => `snapshot ${row.snapshotId} contains malformed binding for ${row.componentId}`,
    ),
  ];

  return {
    version: 'noeone.dependency-verification.v1' as const,
    actorId,
    valid: issues.length === 0,
    snapshotCount: Number(snapshots[0]?.count ?? 0n),
    issues,
  };
}
