import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createActorEvent, signEventHash } from '@onbae/event-model';

export type AppendCanonicalActorEventInput = {
  actorId: string;
  executionId?: string;
  type: string;
  sourceKey?: string;
  occurredAt?: Date;
  hostId: string;
  environmentVersion: string;
  issuer: string;
  payload: Record<string, unknown>;
};

/**
 * Append one canonical actor event while serializing writes for the actor.
 *
 * The actor row lock ensures concurrent writers cannot both observe the same
 * chain tail. sourceKey provides semantic idempotency for retryable operations
 * such as match completion and execution migration.
 */
export async function appendCanonicalActorEvent(
  tx: Prisma.TransactionClient,
  input: AppendCanonicalActorEventInput,
  signingSecret: string,
) {
  const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Actor"
    WHERE "id" = ${input.actorId}
    FOR UPDATE
  `;

  if (lockedActors.length !== 1) {
    throw new Error(`Actor ${input.actorId} does not exist.`);
  }

  if (input.sourceKey) {
    const existing = await tx.actorEvent.findUnique({
      where: { sourceKey: input.sourceKey },
    });

    if (existing) {
      if (existing.actorId !== input.actorId || existing.type !== input.type) {
        throw new Error(
          `Event source key ${input.sourceKey} is already bound to another canonical event.`,
        );
      }
      return existing;
    }
  }

  if (input.executionId) {
    const execution = await tx.actorExecution.findUnique({
      where: { id: input.executionId },
      select: { actorId: true },
    });

    if (!execution || execution.actorId !== input.actorId) {
      throw new Error(
        `Execution ${input.executionId} does not belong to actor ${input.actorId}.`,
      );
    }
  }

  const host = await tx.host.findUnique({
    where: { id: input.hostId },
    select: { id: true, status: true },
  });
  if (!host || host.status !== 'active') {
    throw new Error(`Host ${input.hostId} is unavailable.`);
  }

  const previous = await tx.actorEvent.findFirst({
    where: { actorId: input.actorId },
    orderBy: [{ createdAt: 'desc' }, { observedAt: 'desc' }, { id: 'desc' }],
    select: { hash: true },
  });

  const now = new Date();
  const event = createActorEvent({
    id: `evt_${randomUUID()}`,
    actorId: input.actorId,
    ...(input.executionId ? { executionId: input.executionId } : {}),
    type: input.type,
    ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
    occurredAt: (input.occurredAt ?? now).toISOString(),
    observedAt: now.toISOString(),
    hostId: input.hostId,
    environmentVersion: input.environmentVersion,
    payload: input.payload,
    provenance: {
      issuer: input.issuer,
      ...(previous ? { previousEventHash: previous.hash } : {}),
    },
    canonicalStatus: 'accepted',
  });

  const signature = signEventHash(event.hash, signingSecret);

  return tx.actorEvent.create({
    data: {
      id: event.id,
      actorId: event.actorId,
      ...(event.executionId ? { executionId: event.executionId } : {}),
      hostId: event.hostId,
      type: event.type,
      ...(event.sourceKey ? { sourceKey: event.sourceKey } : {}),
      occurredAt: new Date(event.occurredAt),
      observedAt: new Date(event.observedAt),
      environmentVersion: event.environmentVersion,
      payload: event.payload as Prisma.InputJsonValue,
      issuer: event.provenance.issuer,
      signature,
      ...(event.provenance.previousEventHash
        ? { previousEventHash: event.provenance.previousEventHash }
        : {}),
      hash: event.hash,
      canonicalStatus: 'ACCEPTED',
    },
  });
}
