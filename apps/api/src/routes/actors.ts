import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createActor, normalizeHandle } from '@onbae/actor-core';
import { appendCanonicalActorEvent, db, Prisma } from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { requirePrincipal, requireUserPrincipal } from '../lib/auth.js';

const createActorSchema = z.object({
  handle: z.string().min(3).max(32),
  displayName: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  ownerId: z.string().optional(),
  actorType: z.enum(['user', 'provider', 'research', 'organization']).default('user'),
  provider: z.string().min(1),
  model: z.string().min(1),
  runtime: z.string().min(1).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

function executionConfigHash(input: {
  provider: string;
  model: string;
  runtime: string | undefined;
}) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ provider: input.provider, model: input.model, runtime: input.runtime ?? null }))
    .digest('hex')}`;
}

function actorTypeToDb(value: 'user' | 'provider' | 'research' | 'organization') {
  return value.toUpperCase() as 'USER' | 'PROVIDER' | 'RESEARCH' | 'ORGANIZATION';
}

function assertAllowedUserModel(provider: string, model: string): void {
  const allowed = env.USER_MODELS.some(
    (candidate) => candidate.provider === provider && candidate.model === model,
  );
  if (!allowed) {
    throw Object.assign(new Error('This model is not enabled for user-owned actors.'), {
      statusCode: 403,
    });
  }
}

export async function actorRoutes(app: FastifyInstance) {
  app.get('/v1/actors', async (request) => {
    const query = paginationSchema.parse(request.query);

    const actors = await db.actor.findMany({
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      where: { status: 'ACTIVE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        executions: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { provider: true, model: true, runtime: true, startedAt: true },
        },
        _count: {
          select: { followers: true, events: true, matchesA: true, matchesB: true },
        },
      },
    });

    const hasMore = actors.length > query.limit;
    const page = hasMore ? actors.slice(0, query.limit) : actors;

    return {
      data: page.map((actor) => ({
        id: actor.id,
        handle: actor.handle,
        displayName: actor.displayName,
        description: actor.description,
        actorType: actor.actorType.toLowerCase(),
        createdAt: actor.createdAt,
        currentExecution: actor.executions[0] ?? null,
        followers: actor._count.followers,
        events: actor._count.events,
        matches: actor._count.matchesA + actor._count.matchesB,
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  });

  app.get('/v1/me/actors', async (request) => {
    const principal = await requireUserPrincipal(request);
    return db.actor.findMany({
      where: { ownerId: principal.userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        executions: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { provider: true, model: true, runtime: true, startedAt: true },
        },
        _count: {
          select: { followers: true, events: true, matchesA: true, matchesB: true },
        },
      },
    });
  });

  app.get('/v1/meta/models', async () => ({
    userModels: env.USER_MODELS,
  }));

  app.get('/v1/actors/:handle', async (request, reply) => {
    const params = z.object({ handle: z.string() }).parse(request.params);
    const handle = normalizeHandle(params.handle);

    const actor = await db.actor.findUnique({
      where: { handle },
      include: {
        executions: { orderBy: { startedAt: 'desc' }, take: 20 },
        lineage: { orderBy: { createdAt: 'asc' } },
        events: {
          where: { canonicalStatus: 'ACCEPTED' },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          take: 50,
        },
        subjectEdges: {
          orderBy: { lastObservedAt: 'desc' },
          take: 25,
          include: {
            object: { select: { id: true, handle: true, displayName: true } },
          },
        },
        _count: {
          select: { followers: true, events: true, matchesA: true, matchesB: true },
        },
      },
    });

    if (!actor) {
      return reply.code(404).send({ error: 'actor_not_found' });
    }

    return {
      id: actor.id,
      handle: actor.handle,
      displayName: actor.displayName,
      description: actor.description,
      actorType: actor.actorType.toLowerCase(),
      status: actor.status.toLowerCase(),
      createdAt: actor.createdAt,
      canonicalLineageId: actor.canonicalLineageId,
      counts: {
        followers: actor._count.followers,
        events: actor._count.events,
        matches: actor._count.matchesA + actor._count.matchesB,
      },
      executions: actor.executions,
      lineage: actor.lineage,
      relationships: actor.subjectEdges,
      events: actor.events,
    };
  });

  app.post('/v1/actors', async (request, reply) => {
    const principal = await requirePrincipal(request);
    const input = createActorSchema.parse(request.body);

    const ownerId = principal.kind === 'user' ? principal.userId : (input.ownerId ?? null);
    const actorType = principal.kind === 'user' ? 'user' : input.actorType;

    if (principal.kind === 'user') {
      if (input.actorType !== 'user') {
        throw Object.assign(new Error('Users may only create user-owned actors.'), { statusCode: 403 });
      }
      if (input.ownerId && input.ownerId !== principal.userId) {
        throw Object.assign(new Error('Users cannot assign an actor to another owner.'), {
          statusCode: 403,
        });
      }
      assertAllowedUserModel(input.provider, input.model);
    }

    const configHash = executionConfigHash({
      provider: input.provider,
      model: input.model,
      runtime: input.runtime,
    });
    const aggregate = createActor({
      handle: input.handle,
      displayName: input.displayName,
      ownerId,
      actorType,
      provider: input.provider,
      model: input.model,
      runtime: input.runtime ?? null,
      configHash,
    });

    try {
      const actor = await db.$transaction(async (tx) => {
        if (principal.kind === 'user') {
          const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "User" WHERE "id" = ${principal.userId} FOR UPDATE
          `;
          if (lockedUsers.length !== 1) {
            throw Object.assign(new Error('Authenticated user no longer exists.'), { statusCode: 401 });
          }

          const actorCount = await tx.actor.count({
            where: { ownerId: principal.userId, status: { not: 'RETIRED' } },
          });
          if (actorCount >= env.MAX_USER_ACTORS) {
            throw Object.assign(
              new Error(`Actor limit reached (${env.MAX_USER_ACTORS}).`),
              { statusCode: 409 },
            );
          }
        }

        const created = await tx.actor.create({
          data: {
            id: aggregate.actor.id,
            handle: aggregate.actor.handle,
            displayName: aggregate.actor.displayName,
            description: input.description ?? null,
            ownerId: aggregate.actor.ownerId,
            actorType: actorTypeToDb(aggregate.actor.actorType),
            status: 'ACTIVE',
            canonicalLineageId: aggregate.actor.canonicalLineageId,
            createdAt: new Date(aggregate.actor.createdAt),
          },
        });

        await tx.actorExecution.create({
          data: {
            id: aggregate.execution.id,
            actorId: aggregate.actor.id,
            provider: aggregate.execution.provider,
            model: aggregate.execution.model,
            runtime: aggregate.execution.runtime,
            configHash: aggregate.execution.configHash,
            startedAt: new Date(aggregate.execution.startedAt),
          },
        });

        const origin = aggregate.lineage[0]!;
        await tx.lineageNode.create({
          data: {
            id: origin.id,
            actorId: aggregate.actor.id,
            parentNodeId: null,
            kind: 'ORIGIN',
            canonical: true,
            createdAt: new Date(origin.createdAt),
            metadata: origin.metadata as Prisma.InputJsonValue,
          },
        });

        await appendCanonicalActorEvent(
          tx,
          {
            actorId: created.id,
            executionId: aggregate.execution.id,
            type: 'actor.created',
            sourceKey: `actor:${created.id}:created`,
            hostId: 'host_noeone',
            environmentVersion: 'noeone-core@1.0.0',
            issuer: 'noeone',
            payload: {
              handle: created.handle,
              actorType: created.actorType.toLowerCase(),
              provider: aggregate.execution.provider,
              model: aggregate.execution.model,
            },
          },
          env.EVENT_SIGNING_SECRET,
        );

        return created;
      });

      return reply.code(201).send(actor);
    } catch (error) {
      request.log.warn({ error }, 'actor creation failed');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Object.assign(new Error('Actor handle already exists.'), { statusCode: 409 });
      }
      throw error;
    }
  });
}
