import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { db } from './index.js';
import type {
  ExternalStateClass,
  ExternalStateContinuationDisposition,
} from './external-state-continuity.js';

type JsonObject = Record<string, unknown>;

const ALL_DISPOSITIONS = [
  'CONTINUED',
  'CONDITIONAL',
  'REISSUED',
  'REJECTED',
  'TERMINATED',
  'DISPUTED',
] as const satisfies readonly ExternalStateContinuationDisposition[];

const DISPOSITION_SET = new Set<string>(ALL_DISPOSITIONS);

export type TransitionClearingItemInput = {
  stateClass: ExternalStateClass;
  sourceStateType: string;
  sourceStateRef: string;
  sourceStateDigest: string;
  externalPrincipalType: string;
  externalPrincipalRef: string;
  context?: string;
  required?: boolean;
  acceptableDispositions?: ExternalStateContinuationDisposition[];
  metadata?: JsonObject;
};

export type OpenTransitionClearingCaseInput = {
  actorId: string;
  continuityTransitionId?: string | null;
  ancestryId?: string | null;
  context: string;
  policyVersion: string;
  items: TransitionClearingItemInput[];
  openedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type TransitionClearingCaseRow = {
  id: string;
  actorId: string;
  sourceActorId: string;
  continuityTransitionId: string | null;
  ancestryId: string | null;
  context: string;
  policyVersion: string;
  targetDigest: string;
  caseDigest: string;
  idempotencyKey: string;
  openedAt: Date;
  closedAt: Date | null;
  manifestDigest: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export type TransitionClearingItemRow = {
  id: string;
  caseId: string;
  stateClass: ExternalStateClass;
  sourceStateType: string;
  sourceStateRef: string;
  sourceStateDigest: string;
  externalPrincipalType: string;
  externalPrincipalRef: string;
  context: string;
  required: boolean;
  acceptableDispositions: ExternalStateContinuationDisposition[];
  decisionId: string | null;
  itemDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  decisionDisposition: ExternalStateContinuationDisposition | null;
  decisionBasisDigest: string | null;
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

export class TransitionClearingValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'TransitionClearingValidationError';
  }
}

export class TransitionClearingConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'TransitionClearingConflictError';
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

function textArray(values: readonly string[]): Prisma.Sql {
  return values.length === 0
    ? Prisma.sql`ARRAY[]::TEXT[]`
    : Prisma.sql`ARRAY[${Prisma.join([...values])}]::TEXT[]`;
}

function required(value: string, field: string, max = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new TransitionClearingValidationError(`${field} is required.`);
  if (normalized.length > max) {
    throw new TransitionClearingValidationError(`${field} is too long.`);
  }
  return normalized;
}

function requireDigest(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    throw new TransitionClearingValidationError(`${field} must be a sha256 digest.`);
  }
  return normalized;
}

function normalizeDispositions(
  values: ExternalStateContinuationDisposition[] | undefined,
): ExternalStateContinuationDisposition[] {
  const normalized = [...new Set(values ?? ['CONTINUED', 'REISSUED'])].sort();
  if (normalized.length === 0 || normalized.some((value) => !DISPOSITION_SET.has(value))) {
    throw new TransitionClearingValidationError('acceptableDispositions is invalid.');
  }
  return normalized;
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
    version: 'noeone.clearing-target.transition.v1',
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
    version: 'noeone.clearing-target.ancestry.v1',
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
    throw new TransitionClearingValidationError(
      'Exactly one of continuityTransitionId or ancestryId is required.',
    );
  }

  if (transitionId) {
    const transition = await loadTransition(transitionId);
    if (transition.actorId !== input.actorId) {
      throw new TransitionClearingConflictError('Continuity transition does not belong to actor.');
    }
    if (transition.status !== 'ACCEPTED') {
      throw new TransitionClearingConflictError('Transition clearing requires an accepted migration.');
    }
    if (!transition.resultingExecutionId || !transition.resultingLineageId) {
      throw new TransitionClearingConflictError('Accepted migration is missing resulting continuity state.');
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
    throw new TransitionClearingConflictError('Ancestry child does not match actor.');
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

function normalizeItem(input: TransitionClearingItemInput, caseContext: string) {
  const normalized = {
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
    context: required(input.context ?? caseContext, 'item.context', 240).toLowerCase(),
    required: input.required ?? true,
    acceptableDispositions: normalizeDispositions(input.acceptableDispositions),
    metadata: input.metadata ?? {},
  };

  const itemDigest = sha256({
    version: 'noeone.transition-clearing-item.v1',
    stateClass: normalized.stateClass,
    sourceStateType: normalized.sourceStateType,
    sourceStateRef: normalized.sourceStateRef,
    sourceStateDigest: normalized.sourceStateDigest,
    externalPrincipalType: normalized.externalPrincipalType,
    externalPrincipalRef: normalized.externalPrincipalRef,
    context: normalized.context,
    required: normalized.required,
    acceptableDispositions: normalized.acceptableDispositions,
  });

  return { ...normalized, itemDigest };
}

async function caseByIdempotencyKey(key: string) {
  const rows = await db.$queryRaw<TransitionClearingCaseRow[]>(Prisma.sql`
    SELECT * FROM "TransitionClearingCase" WHERE "idempotencyKey" = ${key} LIMIT 1
  `);
  return rows[0] ?? null;
}

async function caseById(id: string) {
  const rows = await db.$queryRaw<TransitionClearingCaseRow[]>(Prisma.sql`
    SELECT * FROM "TransitionClearingCase" WHERE "id" = ${id} LIMIT 1
  `);
  return rows[0] ?? null;
}

async function loadItems(caseId: string): Promise<TransitionClearingItemRow[]> {
  return db.$queryRaw<TransitionClearingItemRow[]>(Prisma.sql`
    SELECT item.*,
      decision."disposition" AS "decisionDisposition",
      decision."basisDigest" AS "decisionBasisDigest"
    FROM "TransitionClearingItem" item
    LEFT JOIN "ExternalStateContinuationDecision" decision ON decision."id" = item."decisionId"
    WHERE item."caseId" = ${caseId}
    ORDER BY item."createdAt" ASC, item."id" ASC
  `);
}

function itemState(item: TransitionClearingItemRow) {
  if (!item.decisionId || !item.decisionDisposition) return 'PENDING' as const;
  if (item.decisionDisposition === 'DISPUTED') return 'DISPUTED' as const;
  if (item.acceptableDispositions.includes(item.decisionDisposition)) return 'ACCEPTABLE' as const;
  if (item.decisionDisposition === 'CONDITIONAL') return 'CONDITIONAL' as const;
  return 'UNACCEPTABLE' as const;
}

function summarize(caseRow: TransitionClearingCaseRow, items: TransitionClearingItemRow[]) {
  const decorated = items.map((item) => ({ ...item, resolutionState: itemState(item) }));
  const requiredItems = decorated.filter((item) => item.required);
  const requiredPending = requiredItems.filter((item) => item.resolutionState === 'PENDING').length;
  const requiredDisputed = requiredItems.filter((item) => item.resolutionState === 'DISPUTED').length;
  const requiredConditional = requiredItems.filter(
    (item) => item.resolutionState === 'CONDITIONAL',
  ).length;
  const requiredUnacceptable = requiredItems.filter(
    (item) => item.resolutionState === 'UNACCEPTABLE',
  ).length;
  const ready =
    requiredPending === 0 &&
    requiredDisputed === 0 &&
    requiredConditional === 0 &&
    requiredUnacceptable === 0;

  return {
    case: caseRow,
    items: decorated,
    summary: {
      itemCount: decorated.length,
      requiredItemCount: requiredItems.length,
      requiredPending,
      requiredDisputed,
      requiredConditional,
      requiredUnacceptable,
      ready,
      closed: Boolean(caseRow.closedAt),
      status: caseRow.closedAt
        ? ('CLOSED' as const)
        : ready
          ? ('READY' as const)
          : requiredDisputed > 0
            ? ('DISPUTED' as const)
            : requiredUnacceptable > 0
              ? ('BLOCKED' as const)
              : ('OPEN' as const),
    },
  };
}

export async function getTransitionClearingCase(id: string) {
  const row = await caseById(id);
  if (!row) throw Object.assign(new Error('Transition clearing case not found.'), { statusCode: 404 });
  return summarize(row, await loadItems(id));
}

export async function openTransitionClearingCase(input: OpenTransitionClearingCaseInput) {
  const target = await resolveTarget(input);
  const context = required(input.context, 'context', 240).toLowerCase();
  const policyVersion = required(input.policyVersion, 'policyVersion', 120);
  if (input.items.length === 0 || input.items.length > 500) {
    throw new TransitionClearingValidationError('items must contain between 1 and 500 entries.');
  }

  const items = input.items.map((item) => normalizeItem(item, context));
  if (new Set(items.map((item) => item.itemDigest)).size !== items.length) {
    throw new TransitionClearingValidationError('Duplicate reconciliation items are not allowed.');
  }

  const semanticItems = items
    .map((item) => ({
      itemDigest: item.itemDigest,
      stateClass: item.stateClass,
      sourceStateType: item.sourceStateType,
      sourceStateRef: item.sourceStateRef,
      sourceStateDigest: item.sourceStateDigest,
      externalPrincipalType: item.externalPrincipalType,
      externalPrincipalRef: item.externalPrincipalRef,
      context: item.context,
      required: item.required,
      acceptableDispositions: item.acceptableDispositions,
    }))
    .sort((a, b) => a.itemDigest.localeCompare(b.itemDigest));

  const caseDigest = sha256({
    version: 'noeone.transition-clearing-case.v1',
    actorId: target.actorId,
    sourceActorId: target.sourceActorId,
    target: { kind: target.kind, id: target.id, digest: target.digest },
    context,
    policyVersion,
    items: semanticItems,
  });

  const existing = await caseByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (existing.caseDigest !== caseDigest) {
      throw new TransitionClearingConflictError('Transition clearing idempotency key was reused.');
    }
    return { replayed: true, ...(await getTransitionClearingCase(existing.id)) };
  }

  const id = `clear_${randomUUID()}`;
  const openedAt = input.openedAt ?? new Date();
  const caseMetadata = {
    ...(input.metadata ?? {}),
    _noeoneTarget: target.snapshot,
  };

  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TransitionClearingCase" (
        "id", "actorId", "sourceActorId", "continuityTransitionId", "ancestryId",
        "context", "policyVersion", "targetDigest", "caseDigest", "idempotencyKey",
        "openedAt", "metadata"
      ) VALUES (
        ${id}, ${target.actorId}, ${target.sourceActorId},
        ${target.kind === 'transition' ? target.id : null},
        ${target.kind === 'ancestry' ? target.id : null},
        ${context}, ${policyVersion}, ${target.digest}, ${caseDigest}, ${input.idempotencyKey},
        ${openedAt}, ${json(caseMetadata)}
      )
    `);

    for (const item of items) {
      const itemId = `clearitem_${randomUUID()}`;
      const itemIdempotencyKey = sha256({ caseDigest, itemDigest: item.itemDigest });
      const acceptable = textArray(item.acceptableDispositions);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TransitionClearingItem" (
          "id", "caseId", "stateClass", "sourceStateType", "sourceStateRef",
          "sourceStateDigest", "externalPrincipalType", "externalPrincipalRef", "context",
          "required", "acceptableDispositions", "itemDigest", "idempotencyKey", "metadata"
        ) VALUES (
          ${itemId}, ${id}, ${item.stateClass}, ${item.sourceStateType}, ${item.sourceStateRef},
          ${item.sourceStateDigest}, ${item.externalPrincipalType}, ${item.externalPrincipalRef},
          ${item.context}, ${item.required}, ${acceptable}, ${item.itemDigest},
          ${itemIdempotencyKey}, ${json(item.metadata)}
        )
      `);
    }
  });

  return { replayed: false, ...(await getTransitionClearingCase(id)) };
}

export async function attachTransitionClearingDecision(input: {
  caseId: string;
  itemId: string;
  decisionId: string;
}) {
  const caseRow = await caseById(input.caseId);
  if (!caseRow) throw Object.assign(new Error('Transition clearing case not found.'), { statusCode: 404 });
  if (caseRow.closedAt) {
    throw new TransitionClearingConflictError('Closed transition clearing cases are immutable.');
  }

  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "TransitionClearingItem"
    SET "decisionId" = ${input.decisionId}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.itemId} AND "caseId" = ${input.caseId}
  `);
  if (updated !== 1) {
    throw Object.assign(new Error('Transition clearing item not found.'), { statusCode: 404 });
  }

  return getTransitionClearingCase(input.caseId);
}

function manifestPayload(
  caseRow: TransitionClearingCaseRow,
  items: TransitionClearingItemRow[],
  closedAt: Date,
) {
  return {
    version: 'noeone.transition-manifest.v1',
    caseId: caseRow.id,
    actorId: caseRow.actorId,
    sourceActorId: caseRow.sourceActorId,
    target: {
      continuityTransitionId: caseRow.continuityTransitionId,
      ancestryId: caseRow.ancestryId,
      targetDigest: caseRow.targetDigest,
    },
    context: caseRow.context,
    policyVersion: caseRow.policyVersion,
    openedAt: caseRow.openedAt.toISOString(),
    closedAt: closedAt.toISOString(),
    items: items
      .map((item) => ({
        itemDigest: item.itemDigest,
        required: item.required,
        acceptableDispositions: [...item.acceptableDispositions].sort(),
        decisionId: item.decisionId,
        decisionDisposition: item.decisionDisposition,
        decisionBasisDigest: item.decisionBasisDigest,
      }))
      .sort((a, b) => a.itemDigest.localeCompare(b.itemDigest)),
  };
}

export async function closeTransitionClearingCase(id: string, closedAt = new Date()) {
  const current = await getTransitionClearingCase(id);
  if (current.case.closedAt) return { replayed: true, ...current };
  if (!current.summary.ready) {
    throw new TransitionClearingConflictError(
      'Transition clearing case cannot close until all required items have acceptable decisions.',
    );
  }
  if (closedAt < current.case.openedAt) {
    throw new TransitionClearingValidationError('closedAt cannot precede openedAt.');
  }

  const manifestDigest = sha256(manifestPayload(current.case, current.items, closedAt));
  await db.$executeRaw(Prisma.sql`
    UPDATE "TransitionClearingCase"
    SET "closedAt" = ${closedAt}, "manifestDigest" = ${manifestDigest},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "closedAt" IS NULL
  `);

  return { replayed: false, ...(await getTransitionClearingCase(id)) };
}

export async function verifyTransitionClearingCase(id: string) {
  const current = await getTransitionClearingCase(id);
  const failures: string[] = [];

  try {
    const target = await resolveTarget({
      actorId: current.case.actorId,
      continuityTransitionId: current.case.continuityTransitionId,
      ancestryId: current.case.ancestryId,
    });
    if (target.sourceActorId !== current.case.sourceActorId) failures.push('source_actor_mismatch');
    if (target.digest !== current.case.targetDigest) failures.push('target_digest_mismatch');
  } catch {
    failures.push('target_unverifiable');
  }

  const semanticItems = current.items
    .map((item) => ({
      itemDigest: item.itemDigest,
      stateClass: item.stateClass,
      sourceStateType: item.sourceStateType,
      sourceStateRef: item.sourceStateRef,
      sourceStateDigest: item.sourceStateDigest,
      externalPrincipalType: item.externalPrincipalType,
      externalPrincipalRef: item.externalPrincipalRef,
      context: item.context,
      required: item.required,
      acceptableDispositions: [...item.acceptableDispositions].sort(),
    }))
    .sort((a, b) => a.itemDigest.localeCompare(b.itemDigest));

  const expectedCaseDigest = sha256({
    version: 'noeone.transition-clearing-case.v1',
    actorId: current.case.actorId,
    sourceActorId: current.case.sourceActorId,
    target: {
      kind: current.case.continuityTransitionId ? 'transition' : 'ancestry',
      id: current.case.continuityTransitionId ?? current.case.ancestryId!,
      digest: current.case.targetDigest,
    },
    context: current.case.context,
    policyVersion: current.case.policyVersion,
    items: semanticItems,
  });
  if (expectedCaseDigest !== current.case.caseDigest) failures.push('case_digest_mismatch');

  if (current.case.closedAt && current.case.manifestDigest) {
    const expectedManifest = sha256(
      manifestPayload(current.case, current.items, current.case.closedAt),
    );
    if (expectedManifest !== current.case.manifestDigest) failures.push('manifest_digest_mismatch');
    if (!current.summary.ready) failures.push('closed_case_not_ready');
  }

  return {
    caseId: id,
    actorId: current.case.actorId,
    verified: failures.length === 0,
    failures,
    manifestDigest: current.case.manifestDigest,
    summary: current.summary,
  };
}
