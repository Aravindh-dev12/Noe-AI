import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createResearchFork, normalizeHandle, type ActorAggregate } from '@onbae/actor-core';
import {
  appendCanonicalActorEvent,
  db,
  migrateActorExecution,
  Prisma,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertActorControl, assertAdmin, requirePrincipal, type Principal } from '../lib/auth.js';

const migrateActorSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  runtime: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});

const forkActorSchema = z.object({
  handle: z.string().min(3).max(32),
  displayName: z.string().min(1).max(80),
  ownerId: z.string().optional(),
  reason: z.string().max(500).optional(),
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

function continuityPrincipal(principal: Principal) {
  return principal.kind === 'admin'
    ? ({ type: 'admin' } as const)
    : ({ type: 'user', id: principal.userId } as const);
}

export async function migrateActorHandler(request: FastifyRequest, reply: FastifyReply) {
  const principal = await requirePrincipal(request);
  const params = z.object({ actorId: z.string().min(1) }).parse(request.params);
  const input = migrateActorSchema.parse(request.body);

  const actor = await db.actor.findUnique({
    where: { id: params.actorId },
    select: { id: true, ownerId: true, actorType: true, status: true },
  });
  if (!actor) {
    return reply.code(404).send({ error: 'actor_not_found' });
  }
  assertActorControl(principal, actor);
  if (principal.kind === 'user') {
    assertAllowedUserModel(input.provider, input.model);
  }

  const configHash = executionConfigHash({
    provider: input.provider,
    model: input.model,
    runtime: input.runtime,
  });

  const decision = await migrateActorExecution(
    {
      actorId: actor.id,
      provider: input.provider,
      model: input.model,
      runtime: input.runtime ?? null,
      configHash,
      principal: continuityPrincipal(principal),
      policyVersion: principal.kind === 'admin' ? 'admin-direct-v1' : 'user-owner-direct-v1',
      reason: input.reason ?? null,
    },
    {
      signingSecret: env.EVENT_SIGNING_SECRET,
      hostId: 'host_noeone',
      environmentVersion: 'noeone-core@1.0.0',
      issuer: 'noeone',
    },
  );

  return reply.code(decision.replayed ? 200 : 201).send({
    actorId: actor.id,
    transitionId: decision.transition.id,
    transitionStatus: decision.transition.status.toLowerCase(),
    executionId: decision.executionId,
    lineageId: decision.lineageId,
    replayed: decision.replayed,
  });
}

export async function continuityRoutes(app: FastifyInstance) {
  // Preferred endpoint. The legacy /migrate route is registered here too so
  // every migration path crosses the same governed transition boundary.
  app.post('/v1/actors/:actorId/continuity/migrations', migrateActorHandler);
  app.post('/v1/actors/:actorId/migrate', migrateActorHandler);

  app.get('/v1/continuity/:transitionId', async (request, reply) => {
    const params = z.object({ transitionId: z.string().min(1) }).parse(request.params);
    const transition = await db.continuityTransition.findUnique({
      where: { id: params.transitionId },
      include: {
        actor: { select: { id: true, handle: true, displayName: true } },
      },
    });
    if (!transition) {
      return reply.code(404).send({ error: 'continuity_transition_not_found' });
    }
    return transition;
  });

  app.get('/v1/actors/:handle/continuity', async (request, reply) => {
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
        },
        lineage: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        continuityTransitions: {
          orderBy: { proposedAt: 'desc' },
          take: 100,
        },
        childAncestry: {
          include: {
            parentActor: { select: { id: true, handle: true, displayName: true } },
          },
        },
        parentAncestries: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            childActor: { select: { id: true, handle: true, displayName: true, status: true } },
          },
        },
      },
    });

    if (!actor) {
      return reply.code(404).send({ error: 'actor_not_found' });
    }

    return {
      version: 'noeone.continuity.v1',
      actor: {
        id: actor.id,
        handle: actor.handle,
        displayName: actor.displayName,
        actorType: actor.actorType.toLowerCase(),
        status: actor.status.toLowerCase(),
        createdAt: actor.createdAt,
      },
      canonicalLineageId: actor.canonicalLineageId,
      currentExecution: actor.executions[0] ?? null,
      lineage: actor.lineage,
      transitions: actor.continuityTransitions,
      ancestry: actor.childAncestry,
      descendants: actor.parentAncestries,
    };
  });

  app.post('/v1/actors/:actorId/forks', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ actorId: z.string().min(1) }).parse(request.params);
    const input = forkActorSchema.parse(request.body);

    try {
      const result = await db.$transaction(async (tx) => {
        const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Actor" WHERE "id" = ${params.actorId} FOR UPDATE
        `;
        if (lockedActors.length !== 1) {
          throw Object.assign(new Error('Source actor not found.'), { statusCode: 404 });
        }

        const sourceActor = await tx.actor.findUniqueOrThrow({ where: { id: params.actorId } });
        if (sourceActor.status !== 'ACTIVE') {
          throw Object.assign(new Error('Only active actors can be forked.'), { statusCode: 409 });
        }

        const sourceExecution = await tx.actorExecution.findFirst({
          where: { actorId: sourceActor.id, endedAt: null },
          orderBy: { startedAt: 'desc' },
        });
        if (!sourceExecution) {
          throw Object.assign(new Error('Source actor has no live execution.'), { statusCode: 409 });
        }

        const sourceLineage = await tx.lineageNode.findUnique({
          where: { id: sourceActor.canonicalLineageId },
        });
        if (!sourceLineage || !sourceLineage.canonical || sourceLineage.actorId !== sourceActor.id) {
          throw Object.assign(new Error('Source actor canonical lineage is inconsistent.'), {
            statusCode: 409,
          });
        }

        const sourceAggregate: ActorAggregate = {
          actor: {
            id: sourceActor.id,
            handle: sourceActor.handle,
            displayName: sourceActor.displayName,
            createdAt: sourceActor.createdAt.toISOString(),
            ownerId: sourceActor.ownerId,
            actorType: sourceActor.actorType.toLowerCase() as ActorAggregate['actor']['actorType'],
            canonicalLineageId: sourceActor.canonicalLineageId,
            status: sourceActor.status.toLowerCase() as ActorAggregate['actor']['status'],
          },
          execution: {
            id: sourceExecution.id,
            actorId: sourceExecution.actorId,
            provider: sourceExecution.provider,
            model: sourceExecution.model,
            runtime: sourceExecution.runtime,
            configHash: sourceExecution.configHash,
            startedAt: sourceExecution.startedAt.toISOString(),
            endedAt: sourceExecution.endedAt?.toISOString() ?? null,
          },
          lineage: [
            {
              id: sourceLineage.id,
              actorId: sourceLineage.actorId,
              parentNodeId: sourceLineage.parentNodeId,
              kind: sourceLineage.kind.toLowerCase() as 'origin' | 'migration' | 'fork' | 'merge' | 'restore',
              canonical: sourceLineage.canonical,
              createdAt: sourceLineage.createdAt.toISOString(),
              metadata: sourceLineage.metadata as Record<string, unknown>,
            },
          ],
        };

        const fork = createResearchFork(sourceAggregate, {
          handle: input.handle,
          displayName: input.displayName,
          ownerId: input.ownerId ?? null,
        });
        const now = new Date(fork.forkActor.createdAt);
        const sourceEvent = await tx.actorEvent.findFirst({
          where: { actorId: sourceActor.id },
          orderBy: { sequence: 'desc' },
          select: { sequence: true, hash: true },
        });

        const child = await tx.actor.create({
          data: {
            id: fork.forkActor.id,
            handle: fork.forkActor.handle,
            displayName: fork.forkActor.displayName,
            ownerId: fork.forkActor.ownerId,
            actorType: 'RESEARCH',
            status: 'ACTIVE',
            canonicalLineageId: fork.forkActor.canonicalLineageId,
            createdAt: now,
          },
        });

        await tx.actorExecution.create({
          data: {
            id: fork.forkExecution.id,
            actorId: child.id,
            provider: fork.forkExecution.provider,
            model: fork.forkExecution.model,
            runtime: fork.forkExecution.runtime,
            configHash: fork.forkExecution.configHash,
            startedAt: now,
          },
        });

        await tx.lineageNode.create({
          data: {
            id: fork.forkLineage.id,
            actorId: child.id,
            parentNodeId: fork.forkLineage.parentNodeId,
            kind: 'FORK',
            canonical: true,
            createdAt: now,
            metadata: fork.forkLineage.metadata as Prisma.InputJsonValue,
          },
        });

        const ancestry = await tx.actorAncestry.create({
          data: {
            id: `anc_${randomUUID()}`,
            childActorId: child.id,
            parentActorId: sourceActor.id,
            sourceLineageId: sourceLineage.id,
            sourceEventSequence: sourceEvent?.sequence ?? null,
            sourceEventHash: sourceEvent?.hash ?? null,
            reason: input.reason ?? 'research fork',
            createdAt: now,
          },
        });

        await appendCanonicalActorEvent(
          tx,
          {
            actorId: sourceActor.id,
            executionId: sourceExecution.id,
            type: 'actor.fork.created',
            sourceKey: `fork:${child.id}:parent`,
            occurredAt: now,
            hostId: 'host_noeone',
            environmentVersion: 'noeone-core@1.0.0',
            issuer: 'noeone',
            payload: {
              childActorId: child.id,
              sourceLineageId: sourceLineage.id,
              ancestryId: ancestry.id,
              reason: ancestry.reason,
            },
          },
          env.EVENT_SIGNING_SECRET,
        );

        await appendCanonicalActorEvent(
          tx,
          {
            actorId: child.id,
            executionId: fork.forkExecution.id,
            type: 'actor.fork.origin',
            sourceKey: `fork:${child.id}:origin`,
            occurredAt: now,
            hostId: 'host_noeone',
            environmentVersion: 'noeone-core@1.0.0',
            issuer: 'noeone',
            payload: {
              parentActorId: sourceActor.id,
              sourceLineageId: sourceLineage.id,
              sourceEventSequence: ancestry.sourceEventSequence,
              sourceEventHash: ancestry.sourceEventHash,
              ancestryId: ancestry.id,
              reason: ancestry.reason,
            },
          },
          env.EVENT_SIGNING_SECRET,
        );

        return { child, ancestry };
      });

      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Object.assign(new Error('Fork handle or ancestry already exists.'), { statusCode: 409 });
      }
      throw error;
    }
  });
}
