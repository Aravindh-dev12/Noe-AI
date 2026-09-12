import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export const ACTOR_RESOLUTION_STATUSES = [
  'OPEN',
  'FREEZE_PENDING',
  'FROZEN',
  'INVENTORY',
  'AWAITING_EXTERNAL_DECISIONS',
  'PARTIALLY_RESOLVED',
  'SUCCESSION_PENDING',
  'RESOLVED',
  'DISPUTED',
  'SUPERSEDED',
  'ABANDONED',
] as const;
export type ActorResolutionStatus = (typeof ACTOR_RESOLUTION_STATUSES)[number];

export const ACTOR_RESOLUTION_TRIGGERS = [
  'PLANNED_RETIREMENT',
  'PRINCIPAL_LOSS',
  'PRINCIPAL_INCAPACITY',
  'OPERATOR_DISSOLUTION',
  'KEY_COMPROMISE',
  'KEY_LOSS',
  'SECURITY_EMERGENCY',
  'REGULATORY_OR_POLICY_BLOCK',
  'RESOURCE_INSOLVENCY',
  'PROVIDER_FAILURE',
  'CONTESTED_SUCCESSION',
  'BEHAVIORAL_DISCONTINUITY',
  'OTHER',
] as const;
export type ActorResolutionTrigger = (typeof ACTOR_RESOLUTION_TRIGGERS)[number];

export const ACTOR_RESOLUTION_ITEM_CLASSES = [
  'AUTHORITY',
  'CREDENTIAL',
  'COMMITMENT',
  'CLAIM',
  'REMEDY',
  'EXTERNAL_STATE',
  'DEPENDENCY',
  'HOST_RELATIONSHIP',
  'RELATIONSHIP',
  'AUDIENCE',
  'RESOURCE',
  'PENDING_WORK',
  'EVIDENCE_RETENTION',
  'OTHER',
] as const;
export type ActorResolutionItemClass = (typeof ACTOR_RESOLUTION_ITEM_CLASSES)[number];

export const ACTOR_RESOLUTION_DISPOSITIONS = [
  'REVOKE',
  'FREEZE',
  'CONTINUE_UNDER_PRINCIPAL',
  'TRANSFER_TO_SUCCESSOR',
  'REISSUE_TO_SUCCESSOR',
  'SETTLE',
  'ESCROW_OR_HOLD',
  'EXPIRE',
  'TERMINATE',
  'ARCHIVE_ONLY',
  'DISPUTE',
  'ORPHAN',
  'NO_ACTION_REQUIRED',
] as const;
export type ActorResolutionDisposition = (typeof ACTOR_RESOLUTION_DISPOSITIONS)[number];

export type OpenActorResolutionCaseInput = {
  actorId: string;
  primaryTrigger: ActorResolutionTrigger;
  resolutionContext: string;
  openedByType: string;
  openedByRef?: string;
  sourceEvidenceArtifactId?: string;
  freezePolicyVersion: string;
  openedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type AddActorResolutionItemInput = {
  caseId: string;
  itemClass: ActorResolutionItemClass;
  sourceType: string;
  sourceRef: string;
  sourceDigest: string;
  externalPrincipalType?: string;
  externalPrincipalRef?: string;
  requiredAction: string;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type RecordActorResolutionDecisionInput = {
  itemId: string;
  disposition: ActorResolutionDisposition;
  successorActorId?: string;
  evidenceArtifactId?: string;
  externalPrincipalType?: string;
  externalPrincipalRef?: string;
  decidedByType: string;
  decidedByRef?: string;
  reason?: string;
  occurredAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type ActorResolutionCaseRow = {
  id: string;
  actorId: string;
  status: ActorResolutionStatus;
  primaryTrigger: ActorResolutionTrigger;
  resolutionContext: string;
  openedByType: string;
  openedByRef: string | null;
  sourceEvidenceArtifactId: string | null;
  freezePolicyVersion: string;
  successorActorId: string | null;
  caseDigest: string;
  idempotencyKey: string;
  openedAt: Date;
  frozenAt: Date | null;
  resolvedAt: Date | null;
  finalDisposition: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export type ActorResolutionItemRow = {
  id: string;
  caseId: string;
  itemClass: ActorResolutionItemClass;
  sourceType: string;
  sourceRef: string;
  sourceDigest: string;
  externalPrincipalType: string | null;
  externalPrincipalRef: string | null;
  requiredAction: string;
  status: 'PENDING' | 'ACTION_REQUESTED' | 'CONFIRMED' | 'RESOLVED' | 'DISPUTED' | 'ORPHANED';
  latestDecisionId: string | null;
  itemDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export class ActorResolutionValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ActorResolutionValidationError';
  }
}

export class ActorResolutionConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ActorResolutionConflictError';
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

function required(value: string, field: string, max = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new ActorResolutionValidationError(`${field} is required.`);
  if (normalized.length > max) throw new ActorResolutionValidationError(`${field} is too long.`);
  return normalized;
}

function requireDigest(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    throw new ActorResolutionValidationError(`${field} must be a sha256 digest.`);
  }
  return normalized;
}

function caseSnapshot(input: {
  actorId: string;
  primaryTrigger: ActorResolutionTrigger;
  resolutionContext: string;
  openedByType: string;
  openedByRef: string | null;
  sourceEvidenceArtifactId: string | null;
  freezePolicyVersion: string;
  openedAt: Date;
}) {
  return {
    version: 'noeone.actor-resolution-case.v1',
    actorId: input.actorId,
    primaryTrigger: input.primaryTrigger,
    resolutionContext: input.resolutionContext,
    openedByType: input.openedByType,
    openedByRef: input.openedByRef,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
    freezePolicyVersion: input.freezePolicyVersion,
    openedAt: input.openedAt.toISOString(),
  };
}

function itemSnapshot(input: {
  caseId: string;
  itemClass: ActorResolutionItemClass;
  sourceType: string;
  sourceRef: string;
  sourceDigest: string;
  externalPrincipalType: string | null;
  externalPrincipalRef: string | null;
  requiredAction: string;
}) {
  return {
    version: 'noeone.actor-resolution-item.v1',
    caseId: input.caseId,
    itemClass: input.itemClass,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    sourceDigest: input.sourceDigest,
    externalPrincipalType: input.externalPrincipalType,
    externalPrincipalRef: input.externalPrincipalRef,
    requiredAction: input.requiredAction,
  };
}

function decisionSnapshot(input: {
  itemId: string;
  disposition: ActorResolutionDisposition;
  successorActorId: string | null;
  evidenceArtifactId: string | null;
  externalPrincipalType: string | null;
  externalPrincipalRef: string | null;
  decidedByType: string;
  decidedByRef: string | null;
  reason: string | null;
  occurredAt: Date;
}) {
  return {
    version: 'noeone.actor-resolution-decision.v1',
    itemId: input.itemId,
    disposition: input.disposition,
    successorActorId: input.successorActorId,
    evidenceArtifactId: input.evidenceArtifactId,
    externalPrincipalType: input.externalPrincipalType,
    externalPrincipalRef: input.externalPrincipalRef,
    decidedByType: input.decidedByType,
    decidedByRef: input.decidedByRef,
    reason: input.reason,
    occurredAt: input.occurredAt.toISOString(),
  };
}

function transitionDigest(input: {
  caseId: string;
  fromStatus: ActorResolutionStatus | null;
  toStatus: ActorResolutionStatus;
  reason: string | null;
  evidenceArtifactId: string | null;
  decidedByType: string;
  decidedByRef: string | null;
  occurredAt: Date;
}) {
  return sha256({ version: 'noeone.actor-resolution-transition.v1', ...input });
}

async function getCaseOrThrow(caseId: string): Promise<ActorResolutionCaseRow> {
  const rows = await db.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionCase" WHERE "id" = ${caseId} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Actor resolution case not found.'), { statusCode: 404 });
  return rows[0];
}

async function transitionCase(input: {
  caseId: string;
  toStatus: ActorResolutionStatus;
  reason?: string;
  evidenceArtifactId?: string;
  decidedByType: string;
  decidedByRef?: string;
  occurredAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
}) {
  const replay = await db.$queryRaw<Array<{ id: string; toStatus: ActorResolutionStatus }>>(Prisma.sql`
    SELECT "id", "toStatus" FROM "ActorResolutionTransition" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  if (replay[0]) return { transition: replay[0], replayed: true };

  const occurredAt = input.occurredAt ?? new Date();
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${input.caseId} FOR UPDATE
    `);
    const current = rows[0];
    if (!current) throw Object.assign(new Error('Actor resolution case not found.'), { statusCode: 404 });
    if (['RESOLVED', 'SUPERSEDED', 'ABANDONED'].includes(current.status)) {
      throw new ActorResolutionConflictError(`Resolution case is terminal (${current.status}).`);
    }

    if (input.evidenceArtifactId) {
      const evidence = await tx.evidenceArtifact.findUnique({
        where: { id: input.evidenceArtifactId },
        select: { id: true },
      });
      if (!evidence) throw new ActorResolutionValidationError('evidenceArtifactId does not exist.');
    }

    const reason = input.reason?.trim() || null;
    const decidedByType = required(input.decidedByType, 'decidedByType', 240);
    const decidedByRef = input.decidedByRef?.trim() || null;
    const id = `rest_${randomUUID()}`;
    const digest = transitionDigest({
      caseId: current.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      reason,
      evidenceArtifactId: input.evidenceArtifactId ?? null,
      decidedByType,
      decidedByRef,
      occurredAt,
    });

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ActorResolutionTransition" (
        "id", "caseId", "fromStatus", "toStatus", "reason", "evidenceArtifactId",
        "decidedByType", "decidedByRef", "occurredAt", "idempotencyKey", "transitionDigest", "metadata"
      ) VALUES (
        ${id}, ${current.id}, ${current.status}, ${input.toStatus}, ${reason}, ${input.evidenceArtifactId ?? null},
        ${decidedByType}, ${decidedByRef}, ${occurredAt}, ${input.idempotencyKey}, ${digest}, ${json(input.metadata ?? {})}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorResolutionCase"
      SET "status" = ${input.toStatus}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${current.id}
    `);

    return { transition: { id, toStatus: input.toStatus }, replayed: false };
  });
}

export async function openActorResolutionCase(input: OpenActorResolutionCaseInput) {
  const replay = await db.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionCase" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  if (replay[0]) return { case: replay[0], replayed: true };

  const actor = await db.actor.findUnique({
    where: { id: input.actorId },
    select: { id: true, status: true },
  });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  if (actor.status === 'RETIRED') {
    throw new ActorResolutionConflictError('A retired actor cannot open a new operational resolution case.');
  }
  if (input.sourceEvidenceArtifactId) {
    const evidence = await db.evidenceArtifact.findUnique({
      where: { id: input.sourceEvidenceArtifactId },
      select: { id: true },
    });
    if (!evidence) throw new ActorResolutionValidationError('sourceEvidenceArtifactId does not exist.');
  }

  const openedAt = input.openedAt ?? new Date();
  const normalized = {
    actorId: actor.id,
    primaryTrigger: input.primaryTrigger,
    resolutionContext: required(input.resolutionContext, 'resolutionContext', 1000),
    openedByType: required(input.openedByType, 'openedByType', 240),
    openedByRef: input.openedByRef?.trim() || null,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
    freezePolicyVersion: required(input.freezePolicyVersion, 'freezePolicyVersion', 120),
    openedAt,
  };
  const caseDigest = sha256(caseSnapshot(normalized));
  const caseId = `res_${randomUUID()}`;
  const transitionId = `rest_${randomUUID()}`;
  const openingDigest = transitionDigest({
    caseId,
    fromStatus: null,
    toStatus: 'OPEN',
    reason: 'resolution case opened',
    evidenceArtifactId: normalized.sourceEvidenceArtifactId,
    decidedByType: normalized.openedByType,
    decidedByRef: normalized.openedByRef,
    occurredAt: openedAt,
  });

  const created = await db.$transaction(async (tx) => {
    const duplicate = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    if (duplicate[0]) return duplicate[0];

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ActorResolutionCase" (
        "id", "actorId", "status", "primaryTrigger", "resolutionContext", "openedByType",
        "openedByRef", "sourceEvidenceArtifactId", "freezePolicyVersion", "caseDigest",
        "idempotencyKey", "openedAt", "metadata"
      ) VALUES (
        ${caseId}, ${normalized.actorId}, 'OPEN', ${normalized.primaryTrigger}, ${normalized.resolutionContext},
        ${normalized.openedByType}, ${normalized.openedByRef}, ${normalized.sourceEvidenceArtifactId},
        ${normalized.freezePolicyVersion}, ${caseDigest}, ${input.idempotencyKey}, ${openedAt}, ${json(input.metadata ?? {})}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ActorResolutionTransition" (
        "id", "caseId", "fromStatus", "toStatus", "reason", "evidenceArtifactId",
        "decidedByType", "decidedByRef", "occurredAt", "idempotencyKey", "transitionDigest", "metadata"
      ) VALUES (
        ${transitionId}, ${caseId}, NULL, 'OPEN', 'resolution case opened', ${normalized.sourceEvidenceArtifactId},
        ${normalized.openedByType}, ${normalized.openedByRef}, ${openedAt}, ${`${input.idempotencyKey}:opened`},
        ${openingDigest}, ${json({})}
      )
    `);

    const rows = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${caseId}
    `);
    return rows[0]!;
  });

  return { case: created, replayed: created.id !== caseId };
}

export async function addActorResolutionItem(input: AddActorResolutionItemInput) {
  const replay = await db.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionItem" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  if (replay[0]) return { item: replay[0], replayed: true };

  await getCaseOrThrow(input.caseId);
  const normalized = {
    caseId: input.caseId,
    itemClass: input.itemClass,
    sourceType: required(input.sourceType, 'sourceType', 240),
    sourceRef: required(input.sourceRef, 'sourceRef', 500),
    sourceDigest: requireDigest(input.sourceDigest, 'sourceDigest'),
    externalPrincipalType: input.externalPrincipalType?.trim() || null,
    externalPrincipalRef: input.externalPrincipalRef?.trim() || null,
    requiredAction: required(input.requiredAction, 'requiredAction', 1000),
  };
  if ((normalized.externalPrincipalType === null) !== (normalized.externalPrincipalRef === null)) {
    throw new ActorResolutionValidationError(
      'externalPrincipalType and externalPrincipalRef must be supplied together.',
    );
  }

  const itemDigest = sha256(itemSnapshot(normalized));
  const id = `resi_${randomUUID()}`;
  try {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "ActorResolutionItem" (
        "id", "caseId", "itemClass", "sourceType", "sourceRef", "sourceDigest",
        "externalPrincipalType", "externalPrincipalRef", "requiredAction", "status",
        "itemDigest", "idempotencyKey", "metadata"
      ) VALUES (
        ${id}, ${normalized.caseId}, ${normalized.itemClass}, ${normalized.sourceType}, ${normalized.sourceRef},
        ${normalized.sourceDigest}, ${normalized.externalPrincipalType}, ${normalized.externalPrincipalRef},
        ${normalized.requiredAction}, 'PENDING', ${itemDigest}, ${input.idempotencyKey}, ${json(input.metadata ?? {})}
      )
    `);
  } catch (error) {
    const duplicate = await db.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItem"
      WHERE "caseId" = ${input.caseId} AND "sourceType" = ${normalized.sourceType} AND "sourceRef" = ${normalized.sourceRef}
      LIMIT 1
    `);
    if (duplicate[0]) return { item: duplicate[0], replayed: true };
    throw error;
  }

  const rows = await db.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionItem" WHERE "id" = ${id}
  `);
  return { item: rows[0]!, replayed: false };
}

export async function requestActorResolutionItemAction(input: {
  itemId: string;
  requestedByType: string;
  requestedByRef?: string;
  reason?: string;
}) {
  const requestedByType = required(input.requestedByType, 'requestedByType', 240);
  const requestedAt = new Date().toISOString();
  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "ActorResolutionItem"
    SET "status" = CASE WHEN "status" = 'PENDING' THEN 'ACTION_REQUESTED' ELSE "status" END,
        "metadata" = "metadata" || ${json({
          actionRequest: {
            requestedByType,
            requestedByRef: input.requestedByRef?.trim() || null,
            reason: input.reason?.trim() || null,
            requestedAt,
          },
        })},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.itemId} AND "status" IN ('PENDING', 'ACTION_REQUESTED')
  `);
  if (updated === 0) {
    throw new ActorResolutionConflictError('Resolution item is missing or no longer requestable.');
  }
  const rows = await db.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionItem" WHERE "id" = ${input.itemId}
  `);
  return rows[0]!;
}

async function discoveredItem(
  caseId: string,
  input: Omit<AddActorResolutionItemInput, 'caseId' | 'idempotencyKey'>,
) {
  return addActorResolutionItem({
    ...input,
    caseId,
    idempotencyKey: `resolution-discovery:${caseId}:${input.sourceType}:${input.sourceRef}`,
  });
}

export async function discoverActorResolutionInventory(caseId: string) {
  let resolutionCase = await getCaseOrThrow(caseId);
  if (['RESOLVED', 'SUPERSEDED', 'ABANDONED'].includes(resolutionCase.status)) {
    throw new ActorResolutionConflictError('Cannot discover inventory for a terminal resolution case.');
  }

  if (resolutionCase.status === 'OPEN') {
    await transitionCase({
      caseId,
      toStatus: 'INVENTORY',
      reason: 'resolution inventory started',
      decidedByType: 'noeone-system',
      decidedByRef: 'inventory-v1',
      idempotencyKey: `resolution-inventory-start:${caseId}`,
    });
    resolutionCase = await getCaseOrThrow(caseId);
  }

  const actorId = resolutionCase.actorId;
  const [grants, commitments, claimLinks, dependencySnapshots, clearingCases] = await Promise.all([
    db.authorityGrant.findMany({
      where: { subjectActorId: actorId, status: 'ACTIVE' },
      select: {
        id: true,
        grantorType: true,
        grantorRef: true,
        actions: true,
        resources: true,
        externalFramework: true,
        externalReference: true,
        expiresAt: true,
        sourceEvidenceArtifactId: true,
      },
    }),
    db.commitment.findMany({
      where: { debtorActorId: actorId, status: { in: ['OPEN', 'DISPUTED'] } },
      select: {
        id: true,
        status: true,
        kind: true,
        termsDigest: true,
        creditorActorId: true,
        creditorExternalRef: true,
        externalFramework: true,
        externalReference: true,
        dueAt: true,
      },
    }),
    db.claimActorLink.findMany({
      where: {
        actorId,
        claim: { status: { in: ['FILED', 'RESPONDED', 'UNDER_REVIEW', 'ADJUDICATED'] } },
      },
      select: {
        role: true,
        claim: {
          select: {
            id: true,
            status: true,
            claimType: true,
            claimDigest: true,
            externalFramework: true,
            externalReference: true,
            filedAt: true,
            remedies: {
              where: { status: { in: ['ORDERED', 'FAILED'] } },
              select: { id: true, kind: true, status: true, termsDigest: true, dueAt: true },
            },
          },
        },
      },
    }),
    db.$queryRaw<Array<{ id: string; executionId: string; manifestDigest: string; effectiveAt: Date }>>(Prisma.sql`
      SELECT "id", "executionId", "manifestDigest", "effectiveAt"
      FROM "ExecutionDependencySnapshot"
      WHERE "actorId" = ${actorId}
      ORDER BY "effectiveAt" DESC LIMIT 1
    `),
    db.$queryRaw<Array<{ id: string; caseDigest: string; context: string }>>(Prisma.sql`
      SELECT "id", "caseDigest", "context"
      FROM "TransitionClearingCase"
      WHERE ("actorId" = ${actorId} OR "sourceActorId" = ${actorId}) AND "closedAt" IS NULL
      ORDER BY "openedAt" DESC
    `),
  ]);

  const results: ActorResolutionItemRow[] = [];

  for (const grant of grants) {
    const snapshot = {
      id: grant.id,
      grantorType: grant.grantorType,
      grantorRef: grant.grantorRef,
      actions: [...grant.actions].sort(),
      resources: [...grant.resources].sort(),
      externalFramework: grant.externalFramework,
      externalReference: grant.externalReference,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      sourceEvidenceArtifactId: grant.sourceEvidenceArtifactId,
    };
    const result = await discoveredItem(caseId, {
      itemClass: 'AUTHORITY',
      sourceType: 'AuthorityGrant',
      sourceRef: grant.id,
      sourceDigest: sha256({ version: 'noeone.resolution-source.authority.v1', ...snapshot }),
      externalPrincipalType: grant.grantorType,
      externalPrincipalRef: grant.grantorRef,
      requiredAction:
        'Revoke, freeze, expire, or explicitly continue this authority under the controlling principal policy.',
      metadata: { discoveredFrom: 'noeone.authority', snapshot },
    });
    results.push(result.item);
  }

  for (const commitment of commitments) {
    const snapshot = {
      id: commitment.id,
      status: commitment.status,
      kind: commitment.kind,
      termsDigest: commitment.termsDigest,
      creditorActorId: commitment.creditorActorId,
      creditorExternalRef: commitment.creditorExternalRef,
      externalFramework: commitment.externalFramework,
      externalReference: commitment.externalReference,
      dueAt: commitment.dueAt?.toISOString() ?? null,
    };
    const principalType = commitment.creditorActorId
      ? 'actor'
      : commitment.creditorExternalRef
        ? 'external'
        : undefined;
    const principalRef = commitment.creditorActorId ?? commitment.creditorExternalRef ?? undefined;
    const result = await discoveredItem(caseId, {
      itemClass: 'COMMITMENT',
      sourceType: 'Commitment',
      sourceRef: commitment.id,
      sourceDigest: sha256({ version: 'noeone.resolution-source.commitment.v1', ...snapshot }),
      ...(principalType && principalRef
        ? { externalPrincipalType: principalType, externalPrincipalRef: principalRef }
        : {}),
      requiredAction:
        'Settle, terminate under governing terms, transfer with required consent, or explicitly orphan this commitment.',
      metadata: { discoveredFrom: 'noeone.commitment', snapshot },
    });
    results.push(result.item);
  }

  for (const link of claimLinks) {
    const claim = link.claim;
    const snapshot = {
      id: claim.id,
      status: claim.status,
      claimType: claim.claimType,
      claimDigest: claim.claimDigest,
      actorRole: link.role,
      externalFramework: claim.externalFramework,
      externalReference: claim.externalReference,
      filedAt: claim.filedAt.toISOString(),
    };
    const result = await discoveredItem(caseId, {
      itemClass: 'CLAIM',
      sourceType: 'Claim',
      sourceRef: claim.id,
      sourceDigest: sha256({ version: 'noeone.resolution-source.claim.v1', ...snapshot }),
      requiredAction:
        'Preserve the claim and determine whether a principal or successor must respond, settle, or continue proceedings.',
      metadata: { discoveredFrom: 'noeone.claim', snapshot },
    });
    results.push(result.item);

    for (const remedy of claim.remedies) {
      const remedySnapshot = {
        id: remedy.id,
        claimId: claim.id,
        kind: remedy.kind,
        status: remedy.status,
        termsDigest: remedy.termsDigest,
        dueAt: remedy.dueAt?.toISOString() ?? null,
      };
      const remedyResult = await discoveredItem(caseId, {
        itemClass: 'REMEDY',
        sourceType: 'RemedyOrder',
        sourceRef: remedy.id,
        sourceDigest: sha256({ version: 'noeone.resolution-source.remedy.v1', ...remedySnapshot }),
        requiredAction:
          'Satisfy, settle, transfer if institutionally valid, or preserve as unresolved liability.',
        metadata: { discoveredFrom: 'noeone.remedy', snapshot: remedySnapshot },
      });
      results.push(remedyResult.item);
    }
  }

  for (const snapshot of dependencySnapshots) {
    const result = await discoveredItem(caseId, {
      itemClass: 'DEPENDENCY',
      sourceType: 'ExecutionDependencySnapshot',
      sourceRef: snapshot.id,
      sourceDigest: requireDigest(snapshot.manifestDigest, 'dependency manifestDigest'),
      requiredAction:
        'Assess downstream dependency exposure and ensure consumers fail closed or receive a replacement or termination decision.',
      metadata: {
        discoveredFrom: 'noeone.dependency',
        executionId: snapshot.executionId,
        effectiveAt: snapshot.effectiveAt.toISOString(),
      },
    });
    results.push(result.item);
  }

  for (const clearing of clearingCases) {
    const result = await discoveredItem(caseId, {
      itemClass: 'EXTERNAL_STATE',
      sourceType: 'TransitionClearingCase',
      sourceRef: clearing.id,
      sourceDigest: requireDigest(clearing.caseDigest, 'transition clearing caseDigest'),
      requiredAction:
        'Close, supersede, or explicitly preserve this in-flight transition reconciliation before resolution completes.',
      metadata: { discoveredFrom: 'noeone.transition-clearing', context: clearing.context },
    });
    results.push(result.item);
  }

  const targetStatus: ActorResolutionStatus =
    results.length > 0 ? 'AWAITING_EXTERNAL_DECISIONS' : 'INVENTORY';
  const latestCase = await getCaseOrThrow(caseId);
  if (latestCase.status !== targetStatus) {
    await transitionCase({
      caseId,
      toStatus: targetStatus,
      reason: `resolution inventory discovered ${results.length} item(s)`,
      decidedByType: 'noeone-system',
      decidedByRef: 'inventory-v1',
      idempotencyKey: `resolution-inventory-complete:${caseId}:${targetStatus}`,
      metadata: { discoveredItemCount: results.length },
    });
  }

  return { caseId, actorId, itemCount: results.length, items: results };
}

export async function getActorResolutionCase(caseId: string) {
  const resolutionCase = await getCaseOrThrow(caseId);
  const [transitions, items, decisions] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT * FROM "ActorResolutionTransition"
      WHERE "caseId" = ${caseId}
      ORDER BY "occurredAt", "createdAt"
    `),
    db.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItem"
      WHERE "caseId" = ${caseId}
      ORDER BY "createdAt", "id"
    `),
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT decision.* FROM "ActorResolutionItemDecision" decision
      JOIN "ActorResolutionItem" item ON item."id" = decision."itemId"
      WHERE item."caseId" = ${caseId}
      ORDER BY decision."occurredAt", decision."createdAt"
    `),
  ]);
  return { case: resolutionCase, transitions, items, decisions };
}

export async function getActorResolutionSummary(actorId: string) {
  const cases = await db.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionCase" WHERE "actorId" = ${actorId} ORDER BY "openedAt" DESC
  `);
  if (cases.length === 0) return { actorId, activeCase: null, latestCase: null };
  const activeCase =
    cases.find((entry) => !['RESOLVED', 'SUPERSEDED', 'ABANDONED'].includes(entry.status)) ?? null;
  return { actorId, activeCase, latestCase: cases[0] ?? null };
}

export async function verifyActorResolutionCase(caseId: string) {
  const state = await getActorResolutionCase(caseId);
  const errors: string[] = [];
  const row = state.case;

  const expectedCaseDigest = sha256(
    caseSnapshot({
      actorId: row.actorId,
      primaryTrigger: row.primaryTrigger,
      resolutionContext: row.resolutionContext,
      openedByType: row.openedByType,
      openedByRef: row.openedByRef,
      sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
      freezePolicyVersion: row.freezePolicyVersion,
      openedAt: row.openedAt,
    }),
  );
  if (expectedCaseDigest !== row.caseDigest) errors.push('case_digest_mismatch');

  for (const item of state.items) {
    const expected = sha256(
      itemSnapshot({
        caseId: item.caseId,
        itemClass: item.itemClass,
        sourceType: item.sourceType,
        sourceRef: item.sourceRef,
        sourceDigest: item.sourceDigest,
        externalPrincipalType: item.externalPrincipalType,
        externalPrincipalRef: item.externalPrincipalRef,
        requiredAction: item.requiredAction,
      }),
    );
    if (expected !== item.itemDigest) errors.push(`item_digest_mismatch:${item.id}`);
  }

  for (const raw of state.decisions) {
    const decision = raw as {
      id: string;
      itemId: string;
      disposition: ActorResolutionDisposition;
      successorActorId: string | null;
      evidenceArtifactId: string | null;
      externalPrincipalType: string | null;
      externalPrincipalRef: string | null;
      decidedByType: string;
      decidedByRef: string | null;
      reason: string | null;
      occurredAt: Date;
      basisDigest: string;
    };
    const expected = sha256(
      decisionSnapshot({
        itemId: decision.itemId,
        disposition: decision.disposition,
        successorActorId: decision.successorActorId,
        evidenceArtifactId: decision.evidenceArtifactId,
        externalPrincipalType: decision.externalPrincipalType,
        externalPrincipalRef: decision.externalPrincipalRef,
        decidedByType: decision.decidedByType,
        decidedByRef: decision.decidedByRef,
        reason: decision.reason,
        occurredAt: decision.occurredAt,
      }),
    );
    if (expected !== decision.basisDigest) errors.push(`decision_digest_mismatch:${decision.id}`);
  }

  for (const raw of state.transitions) {
    const transition = raw as {
      id: string;
      caseId: string;
      fromStatus: ActorResolutionStatus | null;
      toStatus: ActorResolutionStatus;
      reason: string | null;
      evidenceArtifactId: string | null;
      decidedByType: string;
      decidedByRef: string | null;
      occurredAt: Date;
      transitionDigest: string;
    };
    const expected = transitionDigest({
      caseId: transition.caseId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      reason: transition.reason,
      evidenceArtifactId: transition.evidenceArtifactId,
      decidedByType: transition.decidedByType,
      decidedByRef: transition.decidedByRef,
      occurredAt: transition.occurredAt,
    });
    if (expected !== transition.transitionDigest) {
      errors.push(`transition_digest_mismatch:${transition.id}`);
    }
  }

  return {
    version: 'noeone.actor-resolution-verification.v1',
    caseId,
    actorId: row.actorId,
    verified: errors.length === 0,
    errors,
    counts: {
      transitions: state.transitions.length,
      items: state.items.length,
      decisions: state.decisions.length,
    },
    legalFinality: null,
    externalRevocationConfirmedByNoeone: false,
  };
}
