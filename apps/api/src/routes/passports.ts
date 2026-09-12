import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import { db, verifyInstitutionalState } from '@onbae/db';
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
        childAncestry: {
          select: {
            parentActorId: true,
            sourceLineageId: true,
            sourceEventSequence: true,
            sourceEventHash: true,
            reason: true,
            createdAt: true,
          },
        },
        continuityTransitions: {
          where: { status: 'ACCEPTED' },
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            kind: true,
            policyVersion: true,
            predecessorLineageId: true,
            resultingLineageId: true,
            decidedAt: true,
          },
        },
        _count: {
          select: {
            events: true,
            hostReceipts: true,
            evidenceBindings: true,
            debtorCommitments: true,
            followers: true,
            matchesA: true,
            matchesB: true,
            continuityTransitions: true,
            parentAncestries: true,
          },
        },
      },
    });

    if (!actor) {
      return reply.code(404).send({ error: 'actor_not_found' });
    }

    try {
      const [verification, institutionalVerification, commitmentGroups, validationGroups, oldestOpen] =
        await Promise.all([
          verifyActorCareer(actor.id),
          verifyInstitutionalState(actor.id),
          db.commitment.groupBy({
            by: ['status'],
            where: { debtorActorId: actor.id },
            _count: { _all: true },
          }),
          db.evidenceValidation.groupBy({
            by: ['status'],
            where: { artifact: { bindings: { some: { actorId: actor.id } } } },
            _count: { _all: true },
          }),
          db.commitment.findFirst({
            where: { debtorActorId: actor.id, status: 'OPEN' },
            orderBy: { openedAt: 'asc' },
            select: { openedAt: true, dueAt: true },
          }),
        ]);

      if (!verification) {
        return reply.code(404).send({ error: 'actor_not_found' });
      }

      const commitments = Object.fromEntries(
        commitmentGroups.map((group) => [group.status.toLowerCase(), group._count._all]),
      );
      const validations = Object.fromEntries(
        validationGroups.map((group) => [group.status.toLowerCase(), group._count._all]),
      );

      return {
        passportVersion: 'noeone.actor-passport.v3',
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
        continuity: {
          transitionCount: actor._count.continuityTransitions,
          lastAcceptedTransition: actor.continuityTransitions[0] ?? null,
          ancestry: actor.childAncestry,
          descendantCount: actor._count.parentAncestries,
        },
        institutional: {
          evidenceBindingCount: actor._count.evidenceBindings,
          evidenceArtifactCount: institutionalVerification.evidenceArtifactCount,
          evidenceValidationCount: institutionalVerification.evidenceValidationCount,
          evidenceValidationsByStatus: validations,
          commitmentCount: actor._count.debtorCommitments,
          commitmentsByStatus: commitments,
          oldestOpenCommitment: oldestOpen,
          verification: institutionalVerification,
        },
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