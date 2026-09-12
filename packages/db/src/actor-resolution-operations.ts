import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import type {
  ActorResolutionCaseRow,
  ActorResolutionDisposition,
  ActorResolutionItemRow,
  ActorResolutionStatus,
  RecordActorResolutionDecisionInput,
} from './actor-resolution.js';
import { db } from './index.js';

type JsonObject = Record<string, unknown>;

type DecisionRow = {
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
  basisDigest: string;
  occurredAt: Date;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type ConfirmationRow = {
  id: string;
  itemId: string;
  decisionId: string;
  evidenceArtifactId: string;
  confirmerType: string;
  confirmerRef: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  confirmedAt: Date;
  confirmationDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export class ActorResolutionOperationConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ActorResolutionOperationConflictError';
  }
}

export class ActorResolutionOperationValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ActorResolutionOperationValidationError';
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function json(value: unknown): Prisma.Sql {
  return Prisma.sql`CAST(${JSON.stringify(value)} AS jsonb)`;
}

function required(value: string, field: string, max = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new ActorResolutionOperationValidationError(`${field} is required.`);
  if (normalized.length > max) throw new ActorResolutionOperationValidationError(`${field} is too long.`);
  return normalized;
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
  return digest({ version: 'noeone.actor-resolution-transition.v1', ...input });
}

function decisionDigest(input: {
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
  return digest({ version: 'noeone.actor-resolution-decision.v1', ...input });
}

function confirmationDigest(input: {
  itemId: string;
  decisionId: string;
  evidenceArtifactId: string;
  confirmerType: string;
  confirmerRef: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  confirmedAt: Date;
}) {
  return digest({ version: 'noeone.actor-resolution-confirmation.v1', ...input });
}

async function assertEvidence(
  tx: Prisma.TransactionClient,
  evidenceArtifactId: string | undefined,
) {
  if (!evidenceArtifactId) return;
  const evidence = await tx.evidenceArtifact.findUnique({
    where: { id: evidenceArtifactId },
    select: { id: true },
  });
  if (!evidence) {
    throw new ActorResolutionOperationValidationError('evidenceArtifactId does not exist.');
  }
}

function isTerminal(status: ActorResolutionStatus): boolean {
  return status === 'RESOLVED' || status === 'SUPERSEDED' || status === 'ABANDONED';
}

export async function freezeActorResolutionCaseAtomic(input: {
  caseId: string;
  reason?: string;
  evidenceArtifactId?: string;
  decidedByType: string;
  decidedByRef?: string;
  idempotencyKey: string;
  metadata?: JsonObject;
}) {
  return db.$transaction(async (tx) => {
    const replay = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ActorResolutionTransition" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    if (replay[0]) {
      const rows = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
        SELECT * FROM "ActorResolutionCase" WHERE "id" = ${input.caseId} LIMIT 1
      `);
      return { case: rows[0]!, replayed: true };
    }

    const rows = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${input.caseId} FOR UPDATE
    `);
    const current = rows[0];
    if (!current) throw Object.assign(new Error('Actor resolution case not found.'), { statusCode: 404 });
    if (isTerminal(current.status)) {
      throw new ActorResolutionOperationConflictError(`Resolution case is terminal (${current.status}).`);
    }
    if (current.status === 'FROZEN') return { case: current, replayed: true };
    await assertEvidence(tx, input.evidenceArtifactId);

    const occurredAt = new Date();
    const decidedByType = required(input.decidedByType, 'decidedByType', 240);
    const decidedByRef = input.decidedByRef?.trim() || null;
    const reason = input.reason?.trim() || 'registry freeze applied';
    const transitionId = `rest_${randomUUID()}`;
    const td = transitionDigest({
      caseId: current.id,
      fromStatus: current.status,
      toStatus: 'FROZEN',
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
        ${transitionId}, ${current.id}, ${current.status}, 'FROZEN', ${reason}, ${input.evidenceArtifactId ?? null},
        ${decidedByType}, ${decidedByRef}, ${occurredAt}, ${input.idempotencyKey}, ${td}, ${json(input.metadata ?? {})}
      )
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorResolutionCase"
      SET "status" = 'FROZEN', "frozenAt" = COALESCE("frozenAt", ${occurredAt}), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${current.id}
    `);
    await tx.actor.updateMany({
      where: { id: current.actorId, status: { not: 'RETIRED' } },
      data: { status: 'PAUSED' },
    });

    const updated = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${current.id}
    `);
    return { case: updated[0]!, replayed: false };
  });
}

export async function recordActorResolutionDecisionSafely(
  input: RecordActorResolutionDecisionInput,
) {
  const existing = await db.$queryRaw<DecisionRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionItemDecision" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  if (existing[0]) return { decision: existing[0], replayed: true };

  return db.$transaction(async (tx) => {
    const items = await tx.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItem" WHERE "id" = ${input.itemId} FOR UPDATE
    `);
    const item = items[0];
    if (!item) throw Object.assign(new Error('Actor resolution item not found.'), { statusCode: 404 });

    const cases = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${item.caseId} FOR UPDATE
    `);
    const currentCase = cases[0]!;
    if (isTerminal(currentCase.status)) {
      throw new ActorResolutionOperationConflictError('Cannot decide an item on a terminal resolution case.');
    }
    await assertEvidence(tx, input.evidenceArtifactId);

    const successorActorId = input.successorActorId ?? null;
    if (input.disposition === 'TRANSFER_TO_SUCCESSOR' || input.disposition === 'REISSUE_TO_SUCCESSOR') {
      if (!successorActorId) {
        throw new ActorResolutionOperationValidationError('successorActorId is required for transfer/reissue.');
      }
      if (successorActorId === currentCase.actorId) {
        throw new ActorResolutionOperationValidationError('Successor must be a distinct actor.');
      }
      const successor = await tx.actor.findUnique({ where: { id: successorActorId }, select: { id: true } });
      if (!successor) throw new ActorResolutionOperationValidationError('successorActorId does not exist.');
      if (currentCase.successorActorId && currentCase.successorActorId !== successorActorId) {
        throw new ActorResolutionOperationConflictError(
          `Resolution case already names a different successor (${currentCase.successorActorId}).`,
        );
      }
    }

    const occurredAt = input.occurredAt ?? new Date();
    const normalized = {
      itemId: item.id,
      disposition: input.disposition,
      successorActorId,
      evidenceArtifactId: input.evidenceArtifactId ?? null,
      externalPrincipalType: input.externalPrincipalType?.trim() || item.externalPrincipalType,
      externalPrincipalRef: input.externalPrincipalRef?.trim() || item.externalPrincipalRef,
      decidedByType: required(input.decidedByType, 'decidedByType', 240),
      decidedByRef: input.decidedByRef?.trim() || null,
      reason: input.reason?.trim() || null,
      occurredAt,
    };
    if ((normalized.externalPrincipalType === null) !== (normalized.externalPrincipalRef === null)) {
      throw new ActorResolutionOperationValidationError(
        'externalPrincipalType and externalPrincipalRef must be supplied together.',
      );
    }

    const basisDigest = decisionDigest(normalized);
    const decisionId = `resd_${randomUUID()}`;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ActorResolutionItemDecision" (
        "id", "itemId", "disposition", "successorActorId", "evidenceArtifactId",
        "externalPrincipalType", "externalPrincipalRef", "decidedByType", "decidedByRef",
        "reason", "basisDigest", "occurredAt", "idempotencyKey", "metadata"
      ) VALUES (
        ${decisionId}, ${item.id}, ${normalized.disposition}, ${normalized.successorActorId},
        ${normalized.evidenceArtifactId}, ${normalized.externalPrincipalType}, ${normalized.externalPrincipalRef},
        ${normalized.decidedByType}, ${normalized.decidedByRef}, ${normalized.reason}, ${basisDigest},
        ${occurredAt}, ${input.idempotencyKey}, ${json(input.metadata ?? {})}
      )
    `);

    const immediateTerminal = input.disposition === 'ORPHAN' ||
      input.disposition === 'NO_ACTION_REQUIRED' || input.disposition === 'ARCHIVE_ONLY';
    const itemStatus = input.disposition === 'DISPUTE'
      ? 'DISPUTED'
      : input.disposition === 'ORPHAN'
        ? 'ORPHANED'
        : immediateTerminal
          ? 'RESOLVED'
          : 'ACTION_REQUESTED';

    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorResolutionItem"
      SET "latestDecisionId" = ${decisionId}, "status" = ${itemStatus}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${item.id}
    `);

    if (successorActorId && currentCase.status !== 'SUCCESSION_PENDING') {
      const transitionId = `rest_${randomUUID()}`;
      const reason = 'successor-specific resolution decision recorded';
      const td = transitionDigest({
        caseId: currentCase.id,
        fromStatus: currentCase.status,
        toStatus: 'SUCCESSION_PENDING',
        reason,
        evidenceArtifactId: input.evidenceArtifactId ?? null,
        decidedByType: normalized.decidedByType,
        decidedByRef: normalized.decidedByRef,
        occurredAt,
      });
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ActorResolutionTransition" (
          "id", "caseId", "fromStatus", "toStatus", "reason", "evidenceArtifactId",
          "decidedByType", "decidedByRef", "occurredAt", "idempotencyKey", "transitionDigest", "metadata"
        ) VALUES (
          ${transitionId}, ${currentCase.id}, ${currentCase.status}, 'SUCCESSION_PENDING', ${reason},
          ${input.evidenceArtifactId ?? null}, ${normalized.decidedByType}, ${normalized.decidedByRef},
          ${occurredAt}, ${`${input.idempotencyKey}:case-successor`}, ${td}, ${json({ successorActorId })}
        )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ActorResolutionCase"
        SET "successorActorId" = ${successorActorId}, "status" = 'SUCCESSION_PENDING', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${currentCase.id}
      `);
    }

    const rows = await tx.$queryRaw<DecisionRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItemDecision" WHERE "id" = ${decisionId}
    `);
    return { decision: rows[0]!, replayed: false };
  });
}

export async function confirmActorResolutionItemAction(input: {
  itemId: string;
  decisionId: string;
  evidenceArtifactId: string;
  confirmerType: string;
  confirmerRef?: string;
  externalFramework?: string;
  externalReference?: string;
  confirmedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
}) {
  const existing = await db.$queryRaw<ConfirmationRow[]>(Prisma.sql`
    SELECT * FROM "ActorResolutionItemConfirmation" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  if (existing[0]) return { confirmation: existing[0], replayed: true };

  return db.$transaction(async (tx) => {
    const items = await tx.$queryRaw<ActorResolutionItemRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItem" WHERE "id" = ${input.itemId} FOR UPDATE
    `);
    const item = items[0];
    if (!item) throw Object.assign(new Error('Actor resolution item not found.'), { statusCode: 404 });
    if (item.latestDecisionId !== input.decisionId) {
      throw new ActorResolutionOperationConflictError('Confirmation must reference the current item decision.');
    }
    if (item.status !== 'ACTION_REQUESTED' && item.status !== 'CONFIRMED') {
      throw new ActorResolutionOperationConflictError(`Item is not awaiting confirmation (${item.status}).`);
    }

    const decisionRows = await tx.$queryRaw<DecisionRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItemDecision" WHERE "id" = ${input.decisionId} LIMIT 1
    `);
    const decision = decisionRows[0];
    if (!decision || decision.itemId !== item.id) {
      throw new ActorResolutionOperationConflictError('Decision does not belong to the resolution item.');
    }
    if (['DISPUTE', 'ORPHAN', 'NO_ACTION_REQUIRED', 'ARCHIVE_ONLY'].includes(decision.disposition)) {
      throw new ActorResolutionOperationValidationError(
        `${decision.disposition} is a terminal decision and does not accept action confirmation.`,
      );
    }

    await assertEvidence(tx, input.evidenceArtifactId);
    const confirmedAt = input.confirmedAt ?? new Date();
    const normalized = {
      itemId: item.id,
      decisionId: decision.id,
      evidenceArtifactId: input.evidenceArtifactId,
      confirmerType: required(input.confirmerType, 'confirmerType', 240),
      confirmerRef: input.confirmerRef?.trim() || null,
      externalFramework: input.externalFramework?.trim() || null,
      externalReference: input.externalReference?.trim() || null,
      confirmedAt,
    };
    const confirmationDigestValue = confirmationDigest(normalized);
    const confirmationId = `resc_${randomUUID()}`;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ActorResolutionItemConfirmation" (
        "id", "itemId", "decisionId", "evidenceArtifactId", "confirmerType", "confirmerRef",
        "externalFramework", "externalReference", "confirmedAt", "confirmationDigest", "idempotencyKey", "metadata"
      ) VALUES (
        ${confirmationId}, ${item.id}, ${decision.id}, ${input.evidenceArtifactId}, ${normalized.confirmerType},
        ${normalized.confirmerRef}, ${normalized.externalFramework}, ${normalized.externalReference}, ${confirmedAt},
        ${confirmationDigestValue}, ${input.idempotencyKey}, ${json(input.metadata ?? {})}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorResolutionItem"
      SET "status" = 'CONFIRMED', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${item.id}
    `);

    const rows = await tx.$queryRaw<ConfirmationRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionItemConfirmation" WHERE "id" = ${confirmationId}
    `);
    return { confirmation: rows[0]!, replayed: false };
  });
}

export async function closeActorResolutionCaseAtomic(input: {
  caseId: string;
  finalDisposition: string;
  decidedByType: string;
  decidedByRef?: string;
  evidenceArtifactId?: string;
  reason?: string;
  idempotencyKey: string;
  metadata?: JsonObject;
}) {
  return db.$transaction(async (tx) => {
    const replay = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ActorResolutionTransition" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    const rows = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${input.caseId} FOR UPDATE
    `);
    const current = rows[0];
    if (!current) throw Object.assign(new Error('Actor resolution case not found.'), { statusCode: 404 });
    if (replay[0] && current.status === 'RESOLVED') return { case: current, replayed: true };
    if (isTerminal(current.status)) {
      throw new ActorResolutionOperationConflictError(`Resolution case is terminal (${current.status}).`);
    }

    const unresolved = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ActorResolutionItem"
      WHERE "caseId" = ${current.id} AND "status" NOT IN ('RESOLVED', 'CONFIRMED', 'ORPHANED')
      FOR UPDATE
    `);
    if (unresolved.length > 0) {
      throw new ActorResolutionOperationConflictError(
        `Resolution case has ${unresolved.length} unresolved item(s).`,
      );
    }
    await assertEvidence(tx, input.evidenceArtifactId);

    const occurredAt = new Date();
    const finalDisposition = required(input.finalDisposition, 'finalDisposition', 240);
    const decidedByType = required(input.decidedByType, 'decidedByType', 240);
    const decidedByRef = input.decidedByRef?.trim() || null;
    const reason = input.reason?.trim() || 'resolution completed';
    const transitionId = `rest_${randomUUID()}`;
    const td = transitionDigest({
      caseId: current.id,
      fromStatus: current.status,
      toStatus: 'RESOLVED',
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
        ${transitionId}, ${current.id}, ${current.status}, 'RESOLVED', ${reason}, ${input.evidenceArtifactId ?? null},
        ${decidedByType}, ${decidedByRef}, ${occurredAt}, ${input.idempotencyKey}, ${td}, ${json(input.metadata ?? {})}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorResolutionCase"
      SET "status" = 'RESOLVED', "resolvedAt" = ${occurredAt}, "finalDisposition" = ${finalDisposition},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${current.id}
    `);
    await tx.actor.update({ where: { id: current.actorId }, data: { status: 'RETIRED' } });

    const updated = await tx.$queryRaw<ActorResolutionCaseRow[]>(Prisma.sql`
      SELECT * FROM "ActorResolutionCase" WHERE "id" = ${current.id}
    `);
    return { case: updated[0]!, replayed: false };
  });
}

export async function verifyActorResolutionConfirmations(caseId: string) {
  const rows = await db.$queryRaw<ConfirmationRow[]>(Prisma.sql`
    SELECT c.* FROM "ActorResolutionItemConfirmation" c
    JOIN "ActorResolutionItem" i ON i."id" = c."itemId"
    WHERE i."caseId" = ${caseId}
    ORDER BY c."confirmedAt", c."createdAt"
  `);
  const errors: string[] = [];
  for (const row of rows) {
    const expected = confirmationDigest({
      itemId: row.itemId,
      decisionId: row.decisionId,
      evidenceArtifactId: row.evidenceArtifactId,
      confirmerType: row.confirmerType,
      confirmerRef: row.confirmerRef,
      externalFramework: row.externalFramework,
      externalReference: row.externalReference,
      confirmedAt: row.confirmedAt,
    });
    if (expected !== row.confirmationDigest) errors.push(`confirmation_digest_mismatch:${row.id}`);
  }
  return {
    version: 'noeone.actor-resolution-confirmations.v1',
    caseId,
    verified: errors.length === 0,
    confirmationCount: rows.length,
    errors,
  };
}
