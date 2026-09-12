import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import { db } from '@onbae/db';
import { z } from 'zod';

import { ActorVerificationTooLargeError, verifyActorCareer } from '../lib/actor-verification.js';

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
        select: { id: true },
      });
      if (!actor) {
        return reply.code(404).send({ error: 'actor_not_found' });
      }

      try {
        const result = await verifyActorCareer(actor.id);
        if (!result) {
          return reply.code(404).send({ error: 'actor_not_found' });
        }
        return result;
      } catch (error) {
        if (error instanceof ActorVerificationTooLargeError) {
          return reply.code(413).send({
            error: 'actor_history_too_large_for_sync_verification',
            actorId: error.actorId,
            eventCount: error.eventCount,
            maxSyncEvents: 10_000,
          });
        }
        throw error;
      }
    },
  );
}
