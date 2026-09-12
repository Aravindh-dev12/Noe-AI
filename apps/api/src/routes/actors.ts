import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createActor, normalizeHandle } from '@onbae/actor-core';
import { appendCanonicalActorEvent, db, type Prisma } from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

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

const migrateActorSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  runtime: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
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
    assertAdmin(request);
    const input = createActorSchema.parse(request.body);
    const configHash = executionConfigHash({
      provider: input.provider,
      model: input.model,
      runtime: input.runtime,
    });
    const aggregate = createActor({
      handle: input.handle,
      displayName: input.displayName,
      ownerId: input.ownerId ?? null,
      actorType: input.actorType,
      provider: input.provider,
      model: input.model,
      runtime: input.runtime ?? null,
      configHash,
    });

    try {
      const actor = await db.$transaction(async (tx) => {
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
            hostId: 'host_onbae',
            environmentVersion: 'onbae-core@1.0.0',
            issuer: 'onbae',
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
      throw error;
    }
  });

  app.post('/v1/actors/:actorId/migrate', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ actorId: z.string() }).parse(request.params);
    const input = migrateActorSchema.parse(request.body);
    const now = new Date();
    const nextExecutionId = `exec_${randomUUID()}`;
    const nextLineageId = `lin_${randomUUID()}`;
    const configHash = executionConfigHash({
      provider: input.provider,
      model: input.model,
      runtime: input.runtime,
    });

    const result = await db.$transaction(async (tx) => {
      const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Actor" WHERE "id" = ${params.actorId} FOR UPDATE
      `;
      if (lockedActors.length !== 1) {
        throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
      }

      const actor = await tx.actor.findUniqueOrThrow({ where: { id: params.actorId } });
      if (actor.status !== 'ACTIVE') {
        throw Object.assign(new Error('Actor is not active.'), { statusCode: 409 });
      }

      const currentExecution = await tx.actorExecution.findFirst({
        where: { actorId: actor.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });
      if (!currentExecution) {
        throw new Error('Actor has no active execution.');
      }

      await tx.actorExecution.update({
        where: { id: currentExecution.id },
        data: { endedAt: now },
      });

      await tx.lineageNode.update({
        where: { id: actor.canonicalLineageId },
        data: { canonical: false },
      });

      await tx.actorExecution.create({
        data: {
          id: nextExecutionId,
          actorId: actor.id,
          provider: input.provider,
          model: input.model,
          runtime: input.runtime ?? null,
          configHash,
          startedAt: now,
        },
      });

      await tx.lineageNode.create({
        data: {
          id: nextLineageId,
          actorId: actor.id,
          parentNodeId: actor.canonicalLineageId,
          kind: 'MIGRATION',
          canonical: true,
          createdAt: now,
          metadata: {
            fromExecutionId: currentExecution.id,
            toExecutionId: nextExecutionId,
            reason: input.reason ?? 'execution migration',
          },
        },
      });

      await tx.actor.update({
        where: { id: actor.id },
        data: { canonicalLineageId: nextLineageId },
      });

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: actor.id,
          executionId: nextExecutionId,
          type: 'actor.execution.migrated',
          sourceKey: `lineage:${nextLineageId}:migration`,
          occurredAt: now,
          hostId: 'host_onbae',
          environmentVersion: 'onbae-core@1.0.0',
          issuer: 'onbae',
          payload: {
            from: {
              provider: currentExecution.provider,
              model: currentExecution.model,
              executionId: currentExecution.id,
            },
            to: {
              provider: input.provider,
              model: input.model,
              executionId: nextExecutionId,
            },
            reason: input.reason ?? null,
          },
        },
        env.EVENT_SIGNING_SECRET,
      );

      return {
        actorId: actor.id,
        previousExecutionId: currentExecution.id,
        executionId: nextExecutionId,
        lineageId: nextLineageId,
      };
    });

    return reply.code(201).send(result);
  });
}
