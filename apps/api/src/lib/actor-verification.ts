import { db } from '@onbae/db';
import {
  actorEventSchema,
  assertEventChain,
  hashHostReceipt,
  hostReceiptSchema,
  verifyEventSignature,
  verifyHostReceiptSignature,
  type ActorEvent,
} from '@onbae/event-model';

import { env } from '../env.js';

export const MAX_SYNC_VERIFY_EVENTS = 10_000;

export class ActorVerificationTooLargeError extends Error {
  readonly statusCode = 413;
  readonly actorId: string;
  readonly eventCount: number;

  constructor(actorId: string, eventCount: number) {
    super('Actor history is too large for synchronous verification.');
    this.actorId = actorId;
    this.eventCount = eventCount;
  }
}

function toActorEvent(event: {
  id: string;
  actorId: string;
  executionId: string | null;
  hostId: string;
  type: string;
  sourceKey: string | null;
  occurredAt: Date;
  observedAt: Date;
  environmentVersion: string;
  payload: unknown;
  issuer: string;
  signature: string | null;
  previousEventHash: string | null;
  hash: string;
  canonicalStatus: 'ACCEPTED' | 'DISPUTED' | 'SUPERSEDED';
}): ActorEvent {
  return actorEventSchema.parse({
    id: event.id,
    actorId: event.actorId,
    type: event.type,
    ...(event.sourceKey ? { sourceKey: event.sourceKey } : {}),
    occurredAt: event.occurredAt.toISOString(),
    observedAt: event.observedAt.toISOString(),
    hostId: event.hostId,
    environmentVersion: event.environmentVersion,
    ...(event.executionId ? { executionId: event.executionId } : {}),
    payload: event.payload,
    provenance: {
      issuer: event.issuer,
      ...(event.signature ? { signature: event.signature } : {}),
      ...(event.previousEventHash ? { previousEventHash: event.previousEventHash } : {}),
    },
    canonicalStatus: event.canonicalStatus.toLowerCase(),
    hash: event.hash,
  });
}

export async function verifyActorCareer(actorId: string) {
  const actor = await db.actor.findUnique({
    where: { id: actorId },
    select: { id: true, handle: true, canonicalLineageId: true },
  });
  if (!actor) return null;

  const eventCount = await db.actorEvent.count({ where: { actorId } });
  if (eventCount > MAX_SYNC_VERIFY_EVENTS) {
    throw new ActorVerificationTooLargeError(actorId, eventCount);
  }

  const [storedEvents, storedReceipts] = await Promise.all([
    db.actorEvent.findMany({
      where: { actorId },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        actorId: true,
        sequence: true,
        executionId: true,
        hostId: true,
        type: true,
        sourceKey: true,
        occurredAt: true,
        observedAt: true,
        environmentVersion: true,
        payload: true,
        issuer: true,
        signature: true,
        previousEventHash: true,
        hash: true,
        canonicalStatus: true,
      },
    }),
    db.hostReceipt.findMany({
      where: { actorId },
      orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }],
      include: {
        hostKey: true,
        actorEvent: {
          select: {
            id: true,
            actorId: true,
            hostId: true,
            type: true,
            sourceKey: true,
            environmentVersion: true,
          },
        },
      },
    }),
  ]);

  const issues: string[] = [];
  const sequenceValid = storedEvents.every((event, index) => event.sequence === index + 1);

  let events: ActorEvent[] = [];
  let schemaValid = true;
  try {
    events = storedEvents.map(toActorEvent);
  } catch {
    schemaValid = false;
    issues.push('stored_event_schema_invalid');
  }

  let hashChainValid = schemaValid;
  if (schemaValid) {
    try {
      if (!sequenceValid) {
        throw new Error('Actor event sequence is not contiguous from 1.');
      }
      if (events[0]?.provenance.previousEventHash) {
        throw new Error('The first stored actor event declares a previous event hash.');
      }
      assertEventChain(events);
    } catch (error) {
      hashChainValid = false;
      issues.push(error instanceof Error ? error.message : 'event_chain_invalid');
    }
  } else if (!sequenceValid) {
    issues.push('event_sequence_invalid');
  }

  let registryChecked = 0;
  let registryValid = 0;
  let registryInvalid = 0;
  let registryMissing = 0;

  for (const event of events) {
    registryChecked += 1;
    const signature = event.provenance.signature;
    if (!signature) {
      registryMissing += 1;
      continue;
    }
    if (verifyEventSignature(event.hash, signature, env.EVENT_SIGNING_SECRET)) {
      registryValid += 1;
    } else {
      registryInvalid += 1;
    }
  }

  if (registryInvalid > 0) issues.push('registry_signature_invalid');
  if (registryMissing > 0) issues.push('registry_signature_missing');

  let receiptValid = 0;
  let receiptInvalid = 0;

  for (const stored of storedReceipts) {
    let valid = true;
    try {
      const receipt = hostReceiptSchema.parse({
        version: stored.version,
        receiptId: stored.receiptId,
        hostId: stored.hostId,
        keyId: stored.keyId,
        actorId: stored.actorId,
        ...(stored.executionId ? { executionId: stored.executionId } : {}),
        environmentId: stored.environmentId,
        environmentVersion: stored.environmentVersion,
        type: stored.type,
        occurredAt: stored.occurredAt.toISOString(),
        payload: stored.payload,
      });

      valid =
        stored.hostKey.hostId === stored.hostId &&
        stored.hostKey.algorithm === 'ed25519' &&
        stored.hostKey.status !== 'revoked' &&
        hashHostReceipt(receipt) === stored.contentHash &&
        verifyHostReceiptSignature(receipt, stored.signature, stored.hostKey.publicKeyPem) &&
        stored.actorEvent.actorId === stored.actorId &&
        stored.actorEvent.hostId === stored.hostId &&
        stored.actorEvent.type === stored.type &&
        stored.actorEvent.environmentVersion === stored.environmentVersion &&
        stored.actorEvent.sourceKey === `host-receipt:${stored.contentHash}`;
    } catch {
      valid = false;
    }

    if (valid) receiptValid += 1;
    else receiptInvalid += 1;
  }

  if (receiptInvalid > 0) issues.push('host_receipt_invalid');

  const registrySignaturesValid = registryInvalid === 0 && registryMissing === 0;
  const hostReceiptsValid = receiptInvalid === 0;
  const valid = schemaValid && hashChainValid && registrySignaturesValid && hostReceiptsValid;

  return {
    verificationVersion: 'noeone.verify.v1' as const,
    actorId: actor.id,
    handle: actor.handle,
    canonicalLineageId: actor.canonicalLineageId,
    valid,
    eventCount,
    chain: {
      valid: hashChainValid,
      sequenceValid,
      headHash: events.at(-1)?.hash ?? null,
      headSequence: storedEvents.at(-1)?.sequence ?? null,
    },
    registrySignatures: {
      checked: registryChecked,
      valid: registryValid,
      invalid: registryInvalid,
      missing: registryMissing,
    },
    hostReceipts: {
      checked: storedReceipts.length,
      valid: receiptValid,
      invalid: receiptInvalid,
    },
    reason: issues[0] ?? null,
    issues,
  };
}
