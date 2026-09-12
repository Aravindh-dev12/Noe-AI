import type { FastifyInstance } from 'fastify';
import { db } from '@onbae/db';
import { z } from 'zod';

export async function publicRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });

  app.get('/v1/feed', async (request) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(30) })
      .parse(request.query);

    return db.actorEvent.findMany({
      where: { canonicalStatus: 'ACCEPTED' },
      take: query.limit,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        actor: {
          select: { id: true, handle: true, displayName: true, avatarUrl: true },
        },
        host: {
          select: { id: true, slug: true, displayName: true },
        },
      },
    });
  });

  app.get('/v1/leaderboard', async (request) => {
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(request.query);

    const grouped = await db.match.groupBy({
      by: ['winnerActorId'],
      where: {
        status: 'COMPLETED',
        winnerActorId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { winnerActorId: 'desc' } },
      take: query.limit,
    });

    const ids = grouped.flatMap((row) => (row.winnerActorId ? [row.winnerActorId] : []));
    const actors = await db.actor.findMany({
      where: { id: { in: ids } },
      select: { id: true, handle: true, displayName: true, avatarUrl: true },
    });
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

    return grouped.flatMap((row, index) => {
      if (!row.winnerActorId) return [];
      const actor = actorsById.get(row.winnerActorId);
      if (!actor) return [];
      return [
        {
          rank: index + 1,
          actor,
          wins: row._count._all,
        },
      ];
    });
  });
}
