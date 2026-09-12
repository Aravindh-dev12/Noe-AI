import { randomUUID } from 'node:crypto';
import type {
  ActorEvidenceBinding,
  Commitment,
  CommitmentStatus,
  CommitmentTransition,
  EvidenceArtifact,
  EvidenceValidation,
  EvidenceValidationStatus,
  Prisma,
} from '@prisma/client';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type InstitutionalPrincipal = {
  type: 'user' | 'admin' | 'provider' | 'system';
  id?: string | null;
};

export type RegisterEvidenceInput = {
  actorId: string;
  role: string;
  kind: string;
  issuer: string;
  externalId?: string | null;
  uri?: string | null;
  digest: string;
  digestAlgorithm?: string;
  observedAt?: Date;
  artifactMetadata?: Prisma.InputJsonObject;
  bindingMetadata?: Prisma.InputJsonObject;
};

export type RecordEvidenceValidationInput = {
  evidenceArtifactId: string;
  validator: string;
  status: EvidenceValidationStatus;
  method?: string | null;
  reason?: string | null;
  idempotencyKey: string;
  checkedAt?: Date;
  metadata?: Prisma.InputJsonObject;
};

export type CreateCommitmentInput = {
  debtorActorId: string;
  creditorActorId?: string | null;
  creditorExternalRef?: string | null;
  kind: string;
  termsDigest: string;
  termsUri?: string | null;
  sourceEvidenceArtifactId?: string | null;
  externalFramework?: string | null;
  externalReference?: string | null;
  dueAt?: Date | null;
  principal: InstitutionalPrincipal;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
  now?: Date;
};

export type TransitionCommitmentInput = {
  commitmentId: string;
  toStatus: CommitmentStatus;
  evidenceArtifactId?: string | null;
  reason?: string | null;
  principal: InstitutionalPrincipal;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
  now?: Date;
};

export class InstitutionalConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'InstitutionalConflictError';
  }
}

const terminalStatuses = new Set<CommitmentStatus>(['FULFILLED', 'BREACHED', 'CANCELLED']);

export function isCommitmentTransitionAllowed(
  from: CommitmentStatus,
  to: CommitmentStatus,
): boolean {
  if (from === 'OPEN') {
    return to === 'FULFILLED' || to === 'BREACHED' || to === 'CANCELLED' || to === 'DISPUTED';
  }

  if (from === 'DISPUTED') {
    return to === 'OPEN' || to === 'FULFILLED' || to === 'BREACHED' || to === 'CANCELLED';
  }

  return false;
}

function sameArtifact(existing: EvidenceArtifact, input: RegisterEvidenceInput): boolean {
  return (
    existing.kind === input.kind &&
    existing.issuer === input.issuer &&
    existing.externalId === (input.externalId ?? null) &&
    existing.uri === (input.uri ?? null) &&
    existing.digest === input.digest &&
    existing.digestAlgorithm === (input.digestAlgorithm ?? 'sha256') &&
    canonicalJson(existing.metadata) === canonicalJson(input.artifactMetadata ?? {})
  );
}

function sameBinding(existing: ActorEvidenceBinding, input: RegisterEvidenceInput): boolean {
  return (
    existing.actorId === input.actorId &&
    existing.role === input.role &&
    canonicalJson(existing.metadata) === canonicalJson(input.bindingMetadata ?? {})
  );
}

/**
 * Register one immutable evidence artifact and bind it to an actor in a typed role.
 * The same issuer/digest artifact can be bound to many actors without duplication.
 */
export async function registerEvidenceReference(
  input: RegisterEvidenceInput,
  registry: RegistryContext,
): Promise<{
  artifact: EvidenceArtifact;
  binding: ActorEvidenceBinding;
  replayed: boolean;
}> {
  return db.$transaction(async (tx) => {
    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const observedAt = input.observedAt ?? new Date();
    const artifact = await tx.evidenceArtifact.upsert({
      where: {
        issuer_digest: {
          issuer: input.issuer,
          digest: input.digest,
        },
      },
      update: {},
      create: {
        id: `eva_${randomUUID()}`,
        kind: input.kind,
        issuer: input.issuer,
        externalId: input.externalId ?? null,
        uri: input.uri ?? null,
        digest: input.digest,
        digestAlgorithm: input.digestAlgorithm ?? 'sha256',
        observedAt,
        metadata: input.artifactMetadata ?? {},
      },
    });

    if (!sameArtifact(artifact, input)) {
      throw new InstitutionalConflictError(
        'The issuer/digest evidence identity was reused with conflicting immutable artifact data.',
      );
    }

    const existingBinding = await tx.actorEvidenceBinding.findUnique({
      where: {
        actorId_evidenceArtifactId_role: {
          actorId: input.actorId,
          evidenceArtifactId: artifact.id,
          role: input.role,
        },
      },
    });

    if (existingBinding) {
      if (!sameBinding(existingBinding, input)) {
        throw new InstitutionalConflictError(
          'The actor/evidence/role binding was reused with conflicting binding metadata.',
        );
      }
      return { artifact, binding: existingBinding, replayed: true };
    }

    const binding = await tx.actorEvidenceBinding.create({
      data: {
        id: `evb_${randomUUID()}`,
        actorId: input.actorId,
        evidenceArtifactId: artifact.id,
        role: input.role,
        boundAt: observedAt,
        metadata: input.bindingMetadata ?? {},
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: input.actorId,
        type: 'actor.evidence.bound',
        sourceKey: `institutional:evidence-binding:${binding.id}`,
        occurredAt: observedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          evidenceArtifactId: artifact.id,
          evidenceBindingId: binding.id,
          role: binding.role,
          kind: artifact.kind,
          issuer: artifact.issuer,
          externalId: artifact.externalId,
          digest: artifact.digest,
          digestAlgorithm: artifact.digestAlgorithm,
        },
      },
      registry.signingSecret,
    );

    return { artifact, binding, replayed: false };
  });
}

function sameValidation(
  existing: EvidenceValidation,
  input: RecordEvidenceValidationInput,
): boolean {
  return (
    existing.evidenceArtifactId === input.evidenceArtifactId &&
    existing.validator === input.validator &&
    existing.status === input.status &&
    existing.method === (input.method ?? null) &&
    existing.reason === (input.reason ?? null) &&
    canonicalJson(existing.metadata) === canonicalJson(input.metadata ?? {})
  );
}

/**
 * Store a validator judgment without collapsing multiple validators into one
 * global truth value. Validation history is append-only and idempotent.
 */
export async function recordEvidenceValidation(
  input: RecordEvidenceValidationInput,
): Promise<{ validation: EvidenceValidation; replayed: boolean }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.evidenceValidation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (!sameValidation(existing, input)) {
        throw new InstitutionalConflictError(
          `Evidence validation idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      return { validation: existing, replayed: true };
    }

    const artifact = await tx.evidenceArtifact.findUnique({
      where: { id: input.evidenceArtifactId },
      select: { id: true },
    });
    if (!artifact) {
      throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
    }

    const validation = await tx.evidenceValidation.create({
      data: {
        id: `evv_${randomUUID()}`,
        evidenceArtifactId: input.evidenceArtifactId,
        validator: input.validator,
        status: input.status,
        method: input.method ?? null,
        reason: input.reason ?? null,
        checkedAt: input.checkedAt ?? new Date(),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
    });
    return { validation, replayed: false };
  });
}

function sameCommitment(existing: Commitment, input: CreateCommitmentInput): boolean {
  return (
    existing.debtorActorId === input.debtorActorId &&
    existing.creditorActorId === (input.creditorActorId ?? null) &&
    existing.creditorExternalRef === (input.creditorExternalRef ?? null) &&
    existing.kind === input.kind &&
    existing.termsDigest === input.termsDigest &&
    existing.termsUri === (input.termsUri ?? null) &&
    existing.sourceEvidenceArtifactId === (input.sourceEvidenceArtifactId ?? null) &&
    existing.externalFramework === (input.externalFramework ?? null) &&
    existing.externalReference === (input.externalReference ?? null)
  );
}

async function assertEvidenceSupportsActor(
  tx: Prisma.TransactionClient,
  actorId: string,
  evidenceArtifactId: string,
): Promise<void> {
  const binding = await tx.actorEvidenceBinding.findFirst({
    where: { actorId, evidenceArtifactId },
    select: { id: true },
  });
  if (!binding) {
    throw new InstitutionalConflictError(
      `Evidence artifact ${evidenceArtifactId} is not bound to actor ${actorId}.`,
    );
  }
}

export async function createCommitment(
  input: CreateCommitmentInput,
  registry: RegistryContext,
): Promise<{ commitment: Commitment; transition: CommitmentTransition; replayed: boolean }> {
  if (!input.creditorActorId && !input.creditorExternalRef) {
    throw new InstitutionalConflictError('A commitment requires an actor or external counterparty.');
  }
  if (input.creditorActorId === input.debtorActorId) {
    throw new InstitutionalConflictError('A commitment cannot name the same actor as debtor and creditor.');
  }

  return db.$transaction(async (tx) => {
    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.debtorActorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Debtor actor not found.'), { statusCode: 404 });
    }

    const existing = await tx.commitment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { transitions: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 1 } },
    });
    if (existing) {
      if (!sameCommitment(existing, input)) {
        throw new InstitutionalConflictError(
          `Commitment idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      const transition = existing.transitions[0];
      if (!transition) {
        throw new InstitutionalConflictError('Existing commitment is missing its opening transition.');
      }
      return { commitment: existing, transition, replayed: true };
    }

    if (input.creditorActorId) {
      const creditor = await tx.actor.findUnique({
        where: { id: input.creditorActorId },
        select: { id: true },
      });
      if (!creditor) {
        throw Object.assign(new Error('Creditor actor not found.'), { statusCode: 404 });
      }
    }

    if (input.sourceEvidenceArtifactId) {
      await assertEvidenceSupportsActor(tx, input.debtorActorId, input.sourceEvidenceArtifactId);
    }

    const now = input.now ?? new Date();
    const commitment = await tx.commitment.create({
      data: {
        id: `cmt_${randomUUID()}`,
        debtorActorId: input.debtorActorId,
        creditorActorId: input.creditorActorId ?? null,
        creditorExternalRef: input.creditorExternalRef ?? null,
        kind: input.kind,
        status: 'OPEN',
        termsDigest: input.termsDigest,
        termsUri: input.termsUri ?? null,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
        externalFramework: input.externalFramework ?? null,
        externalReference: input.externalReference ?? null,
        dueAt: input.dueAt ?? null,
        openedAt: now,
        createdByType: input.principal.type,
        createdById: input.principal.id ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
    });

    const transition = await tx.commitmentTransition.create({
      data: {
        id: `cmtx_${randomUUID()}`,
        commitmentId: commitment.id,
        fromStatus: null,
        toStatus: 'OPEN',
        evidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
        reason: 'commitment opened',
        decidedByType: input.principal.type,
        decidedById: input.principal.id ?? null,
        idempotencyKey: `${input.idempotencyKey}:open`,
        occurredAt: now,
        metadata: {},
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: commitment.debtorActorId,
        type: 'actor.commitment.opened',
        sourceKey: `institutional:commitment:${commitment.id}:opened`,
        occurredAt: now,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          commitmentId: commitment.id,
          kind: commitment.kind,
          creditorActorId: commitment.creditorActorId,
          creditorExternalRef: commitment.creditorExternalRef,
          termsDigest: commitment.termsDigest,
          sourceEvidenceArtifactId: commitment.sourceEvidenceArtifactId,
          externalFramework: commitment.externalFramework,
          externalReference: commitment.externalReference,
          dueAt: commitment.dueAt?.toISOString() ?? null,
        },
      },
      registry.signingSecret,
    );

    return { commitment, transition, replayed: false };
  });
}

export async function transitionCommitment(
  input: TransitionCommitmentInput,
  registry: RegistryContext,
): Promise<{ commitment: Commitment; transition: CommitmentTransition; replayed: boolean }> {
  return db.$transaction(async (tx) => {
    const initial = await tx.commitment.findUnique({
      where: { id: input.commitmentId },
      select: { debtorActorId: true },
    });
    if (!initial) {
      throw Object.assign(new Error('Commitment not found.'), { statusCode: 404 });
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${initial.debtorActorId} FOR UPDATE
    `;
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Commitment" WHERE "id" = ${input.commitmentId} FOR UPDATE
    `;

    const commitment = await tx.commitment.findUniqueOrThrow({ where: { id: input.commitmentId } });
    const existingTransition = await tx.commitmentTransition.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existingTransition) {
      if (
        existingTransition.commitmentId !== commitment.id ||
        existingTransition.toStatus !== input.toStatus ||
        existingTransition.evidenceArtifactId !== (input.evidenceArtifactId ?? null)
      ) {
        throw new InstitutionalConflictError(
          `Commitment transition idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      return { commitment, transition: existingTransition, replayed: true };
    }

    if (!isCommitmentTransitionAllowed(commitment.status, input.toStatus)) {
      throw new InstitutionalConflictError(
        `Commitment cannot transition from ${commitment.status} to ${input.toStatus}.`,
      );
    }

    if (input.evidenceArtifactId) {
      await assertEvidenceSupportsActor(tx, commitment.debtorActorId, input.evidenceArtifactId);
    }

    const now = input.now ?? new Date();
    const nextClosedAt = terminalStatuses.has(input.toStatus) ? now : null;
    const updated = await tx.commitment.update({
      where: { id: commitment.id },
      data: {
        status: input.toStatus,
        closedAt: nextClosedAt,
      },
    });

    const transition = await tx.commitmentTransition.create({
      data: {
        id: `cmtx_${randomUUID()}`,
        commitmentId: commitment.id,
        fromStatus: commitment.status,
        toStatus: input.toStatus,
        evidenceArtifactId: input.evidenceArtifactId ?? null,
        reason: input.reason ?? null,
        decidedByType: input.principal.type,
        decidedById: input.principal.id ?? null,
        idempotencyKey: input.idempotencyKey,
        occurredAt: now,
        metadata: input.metadata ?? {},
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: commitment.debtorActorId,
        type: 'actor.commitment.transitioned',
        sourceKey: `institutional:commitment:${commitment.id}:transition:${transition.id}`,
        occurredAt: now,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          commitmentId: commitment.id,
          transitionId: transition.id,
          fromStatus: commitment.status.toLowerCase(),
          toStatus: input.toStatus.toLowerCase(),
          evidenceArtifactId: input.evidenceArtifactId ?? null,
          reason: input.reason ?? null,
        },
      },
      registry.signingSecret,
    );

    return { commitment: updated, transition, replayed: false };
  });
}

export type InstitutionalVerification = {
  version: 'noeone.institutional-verification.v1';
  actorId: string;
  valid: boolean;
  evidenceArtifactCount: number;
  evidenceValidationCount: number;
  commitmentCount: number;
  transitionCount: number;
  errors: string[];
};

export async function verifyInstitutionalState(actorId: string): Promise<InstitutionalVerification> {
  const [actor, evidenceArtifactCount, evidenceValidationCount, commitments] = await Promise.all([
    db.actor.findUnique({ where: { id: actorId }, select: { id: true } }),
    db.evidenceArtifact.count({
      where: { bindings: { some: { actorId } } },
    }),
    db.evidenceValidation.count({
      where: { artifact: { bindings: { some: { actorId } } } },
    }),
    db.commitment.findMany({
      where: { debtorActorId: actorId },
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      include: {
        sourceEvidence: {
          select: {
            id: true,
            bindings: { where: { actorId }, select: { id: true } },
          },
        },
        transitions: {
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          include: {
            evidence: {
              select: {
                id: true,
                bindings: { where: { actorId }, select: { id: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!actor) {
    throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  }

  const errors: string[] = [];
  let transitionCount = 0;

  for (const commitment of commitments) {
    if (commitment.sourceEvidence && commitment.sourceEvidence.bindings.length === 0) {
      errors.push(`${commitment.id}: source evidence is not bound to the debtor actor`);
    }

    const transitions = commitment.transitions;
    transitionCount += transitions.length;
    if (transitions.length === 0) {
      errors.push(`${commitment.id}: missing opening transition`);
      continue;
    }

    const opening = transitions[0]!;
    if (opening.fromStatus !== null || opening.toStatus !== 'OPEN') {
      errors.push(`${commitment.id}: invalid opening transition`);
    }

    let projected: CommitmentStatus = 'OPEN';
    for (const transition of transitions.slice(1)) {
      if (transition.evidence && transition.evidence.bindings.length === 0) {
        errors.push(`${commitment.id}: transition evidence is not bound to the debtor actor`);
      }
      if (transition.fromStatus !== projected) {
        errors.push(
          `${commitment.id}: transition ${transition.id} expected from ${projected}, recorded ${transition.fromStatus}`,
        );
        projected = transition.toStatus;
        continue;
      }
      if (!isCommitmentTransitionAllowed(projected, transition.toStatus)) {
        errors.push(`${commitment.id}: illegal transition ${projected} -> ${transition.toStatus}`);
      }
      projected = transition.toStatus;
    }

    if (projected !== commitment.status) {
      errors.push(
        `${commitment.id}: projected status ${projected} does not match stored status ${commitment.status}`,
      );
    }

    const shouldBeClosed = terminalStatuses.has(commitment.status);
    if (shouldBeClosed !== Boolean(commitment.closedAt)) {
      errors.push(`${commitment.id}: closedAt is inconsistent with status ${commitment.status}`);
    }
  }

  return {
    version: 'noeone.institutional-verification.v1',
    actorId,
    valid: errors.length === 0,
    evidenceArtifactCount,
    evidenceValidationCount,
    commitmentCount: commitments.length,
    transitionCount,
    errors,
  };
}
