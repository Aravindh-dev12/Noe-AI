import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db } from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';
import { matchQueue } from '../lib/queue.js';

const createMatchSchema = z.object({
  actorAId: z.string().min(1),
  actorBId: z.string().min(1),
  environmentId: z.string().default('env_triad_v1'),
  seed: z.string().max(200).optional(),
});

export async function matchRoutes(app: FastifyInstance) {
  app.post('/v1/matches', async (request, reply) => {
    assertAdmin(request);
    const input = createMatchSchema.parse(request.body);

    if (input.actorAId === input.actorBId) {
      return reply.code(400).send({ error: 'actors_must_be_distinct' });
    }

    const [actorA, actorB, environment] = await Promise.all([
      db.actor.findUnique({ where: { id: input.actorAId } }),
      db.actor.findUnique({ where: { id: input.actorBId } }),
      db.environment.findUnique({ where: { id: input.environmentId } }),
    ]);

    if (!actorA || !actorB) {
      return reply.code(404).send({ error: 'actor_not_found' });
    }
    if (!environment || environment.status !== 'ACTIVE') {
      return reply.code(404).send({ error: 'environment_not_found' });
    }

    const matchId = `match_${randomUUID()}`;
    const match = await db.match.create({
      data: {
        id: matchId,
        environmentId: environment.id,
        actorAId: actorA.id,
        actorBId: actorB.id,
        seed: input.seed ?? null,
        status: 'SCHEDULED',
      },
    });

    try {
      await matchQueue.add('run-match', { matchId }, { jobId: matchId });
    } catch (error) {
      await db.match.update({
        where: { id: matchId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'queue enqueue failed',
        },
      });
      throw error;
    }

    return reply.code(202).send(match);
  });

  app.get('/v1/matches/:matchId', async (request, reply) => {
    const params = z.object({ matchId: z.string() }).parse(request.params);
    const match = await db.match.findUnique({
      where: { id: params.matchId },
      include: {
        environment: true,
        actorA: { select: { id: true, handle: true, displayName: true } },
        actorB: { select: { id: true, handle: true, displayName: true } },
        winner: { select: { id: true, handle: true, displayName: true } },
      },
    });

    if (!match) {
      return reply.code(404).send({ error: 'match_not_found' });
    }

    return match;
  });

  app.get('/v1/matches', async (request) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(30) })
      .parse(request.query);

    return db.match.findMany({
      take: query.limit,
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      include: {
        environment: { select: { slug: true, displayName: true, version: true } },
        actorA: { select: { id: true, handle: true, displayName: true } },
        actorB: { select: { id: true, handle: true, displayName: true } },
        winner: { select: { id: true, handle: true, displayName: true } },
      },
    });
  });
}
