import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import { db } from '@onbae/db';
import {
  actorEventSchema,
  assertEventChain,
  verifyEventSignature,
  type ActorEvent,
} from '@onbae/event-model';
import { z } from 'zod';

import { env } from '../env.js';

const MAX_SYNC_VERIFY_EVENTS = 10_000;

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

export async function verificationRoutes(app: FastifyInstance) {
  app.get(
    '/v1/actors/:handle/verify',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const params = z.object({ handle: z.string().min(1) }).parse(request.params);
      const handle = normalizeHandle(params.handle);

      const actor = await db.actor.findUnique({
        where: { handle },
        select: { id: true, handle: true, canonicalLineageId: true },
      });
      if (!actor) {
        return reply.code(404).send({ error: 'actor_not_found' });
      }

      const eventCount = await db.actorEvent.count({ where: { actorId: actor.id } });
      if (eventCount > MAX_SYNC_VERIFY_EVENTS) {
        return reply.code(413).send({
          error: 'actor_history_too_large_for_sync_verification',
          actorId: actor.id,
          eventCount,
          maxSyncEvents: MAX_SYNC_VERIFY_EVENTS,
        });
      }

      const storedEvents = await db.actorEvent.findMany({
        where: { actorId: actor.id },
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
      });

      const sequenceValid = storedEvents.every((event, index) => event.sequence === index + 1);

      let events: ActorEvent[];
      try {
        events = storedEvents.map(toActorEvent);
      } catch (error) {
        request.log.error({ err: error, actorId: actor.id }, 'stored actor event failed schema validation');
        return {
          actorId: actor.id,
          handle: actor.handle,
          valid: false,
          eventCount,
          chain: { valid: false, sequenceValid, headHash: null, headSequence: null },
          onbaeSignatures: { checked: 0, valid: 0, invalid: 0, missing: 0 },
          reason: 'stored_event_schema_invalid',
        };
      }

      let hashChainValid = true;
      let reason: string | null = null;
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
        reason = error instanceof Error ? error.message : 'event_chain_invalid';
      }

      let checked = 0;
      let signatureValid = 0;
      let signatureInvalid = 0;
      let signatureMissing = 0;

      for (const event of events) {
        // Onbae currently signs first-party canonical events with the server event
        // secret. Third-party hosts will need asymmetric host-key verification and
        // are deliberately not treated as HMAC-verifiable here.
        if (event.hostId !== 'host_onbae') continue;
        checked += 1;
        const signature = event.provenance.signature;
        if (!signature) {
          signatureMissing += 1;
        } else if (verifyEventSignature(event.hash, signature, env.EVENT_SIGNING_SECRET)) {
          signatureValid += 1;
        } else {
          signatureInvalid += 1;
        }
      }

      const signaturesValid = signatureInvalid === 0 && signatureMissing === 0;
      const valid = hashChainValid && signaturesValid;

      return {
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
        onbaeSignatures: {
          checked,
          valid: signatureValid,
          invalid: signatureInvalid,
          missing: signatureMissing,
        },
        externalHostVerification: 'not_yet_supported',
        reason,
      };
    },
  );
}
