import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import { db } from '@onbae/db';
import { z } from 'zod';

import { ActorVerificationTooLargeError, verifyActorCareer } from '../lib/actor-verification.js';

export async function passportRoutes(app: FastifyInstance) {
  app.get('/v1/actors/:handle/passport', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const handle = normalizeHandle(params.handle);
    const actor = await db.actor.findUnique({
      where: { handle },
      select: {
        id: true,
        handle: true,
        displayName: true,
        actorType: true,
        status: true,
        canonicalLineageId: true,
        createdAt: true,
        executions: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            provider: true,
            model: true,
            runtime: true,
            configHash: true,
            startedAt: true,
          },
        },
        _count: {
          select: {
            events: true,
            hostReceipts: true,
            followers: true,
            matchesA: true,
            matchesB: true,
          },
        },
      },
    });

    if (!actor) {
      return reply.code(404).send({ error: 'actor_not_found' });
    }

    try {
      const verification = await verifyActorCareer(actor.id);
      if (!verification) {
        return reply.code(404).send({ error: 'actor_not_found' });
      }

      return {
        passportVersion: 'noeone.actor-passport.v1',
        actor: {
          id: actor.id,
          handle: actor.handle,
          displayName: actor.displayName,
          actorType: actor.actorType.toLowerCase(),
          status: actor.status.toLowerCase(),
          canonicalLineageId: actor.canonicalLineageId,
          createdAt: actor.createdAt,
        },
        currentExecution: actor.executions[0] ?? null,
        career: {
          canonicalEvents: actor._count.events,
          externalHostReceipts: actor._count.hostReceipts,
          followers: actor._count.followers,
          matches: actor._count.matchesA + actor._count.matchesB,
        },
        verification,
      };
    } catch (error) {
      if (error instanceof ActorVerificationTooLargeError) {
        return reply.code(413).send({
          error: 'actor_history_too_large_for_sync_passport',
          actorId: error.actorId,
          eventCount: error.eventCount,
          maxSyncEvents: 10_000,
        });
      }
      throw error;
    }
  });
}
