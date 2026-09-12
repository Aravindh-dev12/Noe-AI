import { randomUUID } from 'node:crypto';
import type { ContinuityTransition, Prisma } from '@prisma/client';

import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type ContinuityPrincipal = {
  type: 'user' | 'admin' | 'provider' | 'system';
  id?: string | null;
};

export type RegistryContext = {
  signingSecret: string;
  hostId: string;
  environmentVersion: string;
  issuer: string;
};

export type ProposeMigrationInput = {
  actorId: string;
  provider: string;
  model: string;
  runtime?: string | null;
  configHash: string;
  principal: ContinuityPrincipal;
  policyVersion: string;
  reason?: string | null;
  idempotencyKey?: string;
  now?: Date;
};

export type TransitionDecision =
  | {
      accepted: true;
      replayed: boolean;
      transition: ContinuityTransition;
      executionId: string;
      lineageId: string;
    }
  | {
      accepted: false;
      replayed: false;
      transition: ContinuityTransition;
      reason: string;
    };

export class ContinuityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ContinuityConflictError';
  }
}

function assertSameProposal(existing: ContinuityTransition, input: ProposeMigrationInput): void {
  const same =
    existing.actorId === input.actorId &&
    existing.kind === 'MIGRATION' &&
    existing.proposedProvider === input.provider &&
    existing.proposedModel === input.model &&
    existing.proposedRuntime === (input.runtime ?? null) &&
    existing.proposedConfigHash === input.configHash;

  if (!same) {
    throw new ContinuityConflictError(
      `Continuity idempotency key ${existing.idempotencyKey} was reused with conflicting data.`,
    );
  }
}

export async function proposeMigration(
  input: ProposeMigrationInput,
): Promise<ContinuityTransition> {
  return db.$transaction(async (tx) => {
    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const actor = await tx.actor.findUniqueOrThrow({ where: { id: input.actorId } });
    if (actor.status !== 'ACTIVE') {
      throw new ContinuityConflictError('Only active actors can change execution.');
    }

    const canonicalLineage = await tx.lineageNode.findUnique({
      where: { id: actor.canonicalLineageId },
      select: { id: true, actorId: true, canonical: true },
    });
    if (
      !canonicalLineage ||
      canonicalLineage.actorId !== actor.id ||
      canonicalLineage.canonical !== true
    ) {
      throw new ContinuityConflictError('Actor canonical lineage head is inconsistent.');
    }

    const currentExecution = await tx.actorExecution.findFirst({
      where: { actorId: actor.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!currentExecution) {
      throw new ContinuityConflictError('Actor has no live execution.');
    }

    if (
      currentExecution.provider === input.provider &&
      currentExecution.model === input.model &&
      currentExecution.runtime === (input.runtime ?? null)
    ) {
      throw new ContinuityConflictError(
        'The actor is already using this execution configuration.',
      );
    }

    const idempotencyKey =
      input.idempotencyKey ??
      `continuity:migration:${actor.id}:${canonicalLineage.id}:${input.configHash}`;

    const existing = await tx.continuityTransition.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      assertSameProposal(existing, input);
      return existing;
    }

    const proposedAt = input.now ?? new Date();
    return tx.continuityTransition.create({
      data: {
        id: `ctr_${randomUUID()}`,
        actorId: actor.id,
        kind: 'MIGRATION',
        status: 'PROPOSED',
        predecessorLineageId: canonicalLineage.id,
        predecessorExecutionId: currentExecution.id,
        proposedProvider: input.provider,
        proposedModel: input.model,
        proposedRuntime: input.runtime ?? null,
        proposedConfigHash: input.configHash,
        proposedByType: input.principal.type,
        proposedById: input.principal.id ?? null,
        policyVersion: input.policyVersion,
        idempotencyKey,
        reason: input.reason ?? null,
        changeSet: {
          execution: {
            from: {
              provider: currentExecution.provider,
              model: currentExecution.model,
              runtime: currentExecution.runtime,
              configHash: currentExecution.configHash,
            },
            to: {
              provider: input.provider,
              model: input.model,
              runtime: input.runtime ?? null,
              configHash: input.configHash,
            },
          },
        } satisfies Prisma.InputJsonValue,
        proposedAt,
      },
    });
  });
}

export async function acceptContinuityTransition(
  transitionId: string,
  registry: RegistryContext,
  now = new Date(),
): Promise<TransitionDecision> {
  return db.$transaction(async (tx) => {
    const initial = await tx.continuityTransition.findUnique({
      where: { id: transitionId },
      select: { actorId: true },
    });
    if (!initial) {
      throw Object.assign(new Error('Continuity transition not found.'), { statusCode: 404 });
    }

    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${initial.actorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ContinuityTransition" WHERE "id" = ${transitionId} FOR UPDATE
    `;

    const transition = await tx.continuityTransition.findUniqueOrThrow({
      where: { id: transitionId },
    });

    if (transition.status === 'ACCEPTED') {
      if (!transition.resultingExecutionId || !transition.resultingLineageId) {
        throw new ContinuityConflictError('Accepted transition is missing its resulting head.');
      }
      return {
        accepted: true,
        replayed: true,
        transition,
        executionId: transition.resultingExecutionId,
        lineageId: transition.resultingLineageId,
      };
    }

    if (transition.status !== 'PROPOSED') {
      return {
        accepted: false,
        replayed: false,
        transition,
        reason: transition.decisionReason ?? `Transition is ${transition.status.toLowerCase()}.`,
      };
    }

    const actor = await tx.actor.findUniqueOrThrow({ where: { id: transition.actorId } });
    const currentExecution = await tx.actorExecution.findFirst({
      where: { actorId: actor.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    const staleReason =
      actor.canonicalLineageId !== transition.predecessorLineageId
        ? 'Canonical lineage advanced after this transition was proposed.'
        : currentExecution?.id !== transition.predecessorExecutionId
          ? 'Live execution changed after this transition was proposed.'
          : null;

    if (staleReason) {
      const superseded = await tx.continuityTransition.update({
        where: { id: transition.id },
        data: {
          status: 'SUPERSEDED',
          decidedAt: now,
          decisionReason: staleReason,
        },
      });
      return {
        accepted: false,
        replayed: false,
        transition: superseded,
        reason: staleReason,
      };
    }

    if (!currentExecution) {
      throw new ContinuityConflictError('Actor has no live execution.');
    }

    if (actor.status !== 'ACTIVE') {
      throw new ContinuityConflictError('Only active actors can accept continuity transitions.');
    }

    const predecessorLineage = await tx.lineageNode.findUnique({
      where: { id: transition.predecessorLineageId },
    });
    if (
      !predecessorLineage ||
      predecessorLineage.actorId !== actor.id ||
      predecessorLineage.canonical !== true
    ) {
      throw new ContinuityConflictError('Predecessor lineage is not the canonical actor head.');
    }

    const nextExecutionId = `exec_${randomUUID()}`;
    const nextLineageId = `lin_${randomUUID()}`;

    await tx.actorExecution.update({
      where: { id: currentExecution.id },
      data: { endedAt: now },
    });

    await tx.lineageNode.update({
      where: { id: predecessorLineage.id },
      data: { canonical: false },
    });

    await tx.actorExecution.create({
      data: {
        id: nextExecutionId,
        actorId: actor.id,
        provider: transition.proposedProvider,
        model: transition.proposedModel,
        runtime: transition.proposedRuntime,
        configHash: transition.proposedConfigHash,
        startedAt: now,
      },
    });

    await tx.lineageNode.create({
      data: {
        id: nextLineageId,
        actorId: actor.id,
        parentNodeId: predecessorLineage.id,
        kind: transition.kind,
        canonical: true,
        createdAt: now,
        metadata: {
          transitionId: transition.id,
          fromExecutionId: currentExecution.id,
          toExecutionId: nextExecutionId,
          policyVersion: transition.policyVersion,
          reason: transition.reason,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await tx.actor.update({
      where: { id: actor.id },
      data: { canonicalLineageId: nextLineageId },
    });

    const accepted = await tx.continuityTransition.update({
      where: { id: transition.id },
      data: {
        status: 'ACCEPTED',
        resultingExecutionId: nextExecutionId,
        resultingLineageId: nextLineageId,
        decidedAt: now,
        decisionReason: 'accepted by continuity policy',
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: actor.id,
        executionId: nextExecutionId,
        type: 'actor.continuity.transition.accepted',
        sourceKey: `continuity:${transition.id}:accepted`,
        occurredAt: now,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          transitionId: transition.id,
          kind: transition.kind.toLowerCase(),
          policyVersion: transition.policyVersion,
          predecessorLineageId: transition.predecessorLineageId,
          resultingLineageId: nextLineageId,
          from: {
            executionId: currentExecution.id,
            provider: currentExecution.provider,
            model: currentExecution.model,
            runtime: currentExecution.runtime,
          },
          to: {
            executionId: nextExecutionId,
            provider: transition.proposedProvider,
            model: transition.proposedModel,
            runtime: transition.proposedRuntime,
          },
          reason: transition.reason,
        },
      },
      registry.signingSecret,
    );

    return {
      accepted: true,
      replayed: false,
      transition: accepted,
      executionId: nextExecutionId,
      lineageId: nextLineageId,
    };
  });
}

export async function migrateActorExecution(
  input: ProposeMigrationInput,
  registry: RegistryContext,
): Promise<Extract<TransitionDecision, { accepted: true }>> {
  const proposal = await proposeMigration(input);
  const decision = await acceptContinuityTransition(proposal.id, registry, input.now ?? new Date());
  if (!decision.accepted) {
    throw new ContinuityConflictError(decision.reason);
  }
  return decision;
}
