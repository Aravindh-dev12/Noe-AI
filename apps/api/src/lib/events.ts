import { randomUUID } from 'node:crypto';
import type { Prisma } from '@onbae/db';
import { createActorEvent, signEventHash } from '@onbae/event-model';

import { env } from '../env.js';

export type AppendEventInput = {
  actorId: string;
  executionId?: string;
  type: string;
  occurredAt?: Date;
  hostId: string;
  environmentVersion: string;
  issuer: string;
  payload: Record<string, unknown>;
};

export async function appendCanonicalEvent(
  tx: Prisma.TransactionClient,
  input: AppendEventInput,
) {
  const previous = await tx.actorEvent.findFirst({
    where: { actorId: input.actorId },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    select: { hash: true },
  });

  const now = new Date();
  const unsigned = {
    id: `evt_${randomUUID()}`,
    actorId: input.actorId,
    type: input.type,
    occurredAt: (input.occurredAt ?? now).toISOString(),
    observedAt: now.toISOString(),
    hostId: input.hostId,
    environmentVersion: input.environmentVersion,
    ...(input.executionId ? { executionId: input.executionId } : {}),
    payload: input.payload,
    provenance: {
      issuer: input.issuer,
      ...(previous ? { previousEventHash: previous.hash } : {}),
    },
    canonicalStatus: 'accepted' as const,
  };

  const event = createActorEvent(unsigned);
  const signature = signEventHash(event.hash, env.EVENT_SIGNING_SECRET);

  return tx.actorEvent.create({
    data: {
      id: event.id,
      actorId: event.actorId,
      executionId: event.executionId,
      hostId: event.hostId,
      type: event.type,
      occurredAt: new Date(event.occurredAt),
      observedAt: new Date(event.observedAt),
      environmentVersion: event.environmentVersion,
      payload: event.payload as Prisma.InputJsonValue,
      issuer: event.provenance.issuer,
      signature,
      previousEventHash: event.provenance.previousEventHash,
      hash: event.hash,
      canonicalStatus: 'ACCEPTED',
    },
  });
}
