import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import type { CollectiveRegistryContext } from './collective-continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

type JsonObject = Record<string, unknown>;
type Tx = Prisma.TransactionClient;

export type CollectiveActionCapacity =
  | 'COLLECTIVE_DIRECT'
  | 'MEMBER_ON_BEHALF'
  | 'MEMBER_PERSONAL'
  | 'UNAUTHORIZED_COLLECTIVE_CLAIM';

export type CollectiveActionSourceKind =
  | 'AUTHORITY_EXERCISE'
  | 'ACTOR_EVENT'
  | 'EVIDENCE_ARTIFACT';

export type CollectiveCapacityDisposition =
  | 'SUPPORTED'
  | 'NOT_SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INDETERMINATE'
  | 'DISPUTED';

export type CollectiveDecisionParticipantInput = {
  memberActorId: string;
  position?: string | null;
  evidenceArtifactId?: string | null;
};

export type RecordCollectiveDecisionInput = {
  collectiveActorId: string;
  epochId: string;
  decisionType: string;
  proposalDigest: string;
  method: string;
  methodVersion?: string | null;
  outcomeDigest: string;
  quorumBps?: number | null;
  decidedAt: Date;
  evidenceArtifactId: string;
  participants?: CollectiveDecisionParticipantInput[];
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type BindCollectiveActionInput = {
  collectiveActorId: string;
  epochId: string;
  capacity: CollectiveActionCapacity;
  actedAt: Date;
  sourceKind: CollectiveActionSourceKind;
  sourceRef: string;
  memberActorId?: string | null;
  decisionId?: string | null;
  claimedAt: Date;
  bindingEvidenceArtifactId: string;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type RatifyCollectiveActionInput = {
  actionBindingId: string;
  decisionId: string;
  ratifiedAt: Date;
  evidenceArtifactId: string;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type RecordCollectiveCapacityAssessmentInput = {
  actionBindingId: string;
  evaluatorRef: string;
  method: string;
  methodVersion: string;
  disposition: CollectiveCapacityDisposition;
  evidenceArtifactId: string;
  assessedAt: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export class CollectiveActionProvenanceConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'CollectiveActionProvenanceConflictError';
  }
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
  }
  return normalized;
}

function requiredDigest(value: string, field: string): string {
  const normalized = requiredText(value, field).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw Object.assign(new Error(`${field} must be a sha256:<64 lowercase hex> digest.`), {
      statusCode: 400,
    });
  }
  return normalized;
}

function idempotencyKey(value: string): string {
  const normalized = requiredText(value, 'idempotencyKey');
  if (normalized.length < 8 || normalized.length > 500) {
    throw Object.assign(new Error('idempotencyKey must contain 8 to 500 characters.'), {
      statusCode: 400,
    });
  }
  return normalized;
}

function optionalText(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value, field);
}

function assertQuorum(value: number | null): void {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 10_000)) {
    throw Object.assign(new Error('quorumBps must be an integer between 0 and 10000.'), {
      statusCode: 400,
    });
  }
}

function assertWithinEpoch(
  timestamp: Date,
  epoch: { startedAt: Date; endedAt: Date | null },
  field: string,
): void {
  if (
    timestamp.getTime() < epoch.startedAt.getTime() ||
    (epoch.endedAt !== null && timestamp.getTime() >= epoch.endedAt.getTime())
  ) {
    throw Object.assign(new Error(`${field} is outside the referenced collective epoch.`), {
      statusCode: 400,
    });
  }
}

async function evidence(tx: Tx, artifactId: string) {
  const artifact = await tx.evidenceArtifact.findUnique({
    where: { id: artifactId },
    select: { id: true, digest: true, issuer: true, kind: true, observedAt: true },
  });
  if (!artifact) {
    throw Object.assign(new Error(`Evidence artifact ${artifactId} was not found.`), {
      statusCode: 404,
    });
  }
  return artifact;
}

async function epochForCollective(tx: Tx, collectiveActorId: string, epochId: string) {
  const epoch = await tx.collectiveEpoch.findUnique({ where: { id: epochId } });
  if (!epoch || epoch.collectiveActorId !== collectiveActorId) {
    throw Object.assign(new Error('Collective epoch was not found for this actor.'), {
      statusCode: 404,
    });
  }
  return epoch;
}

async function membershipSnapshot(tx: Tx, epochId: string, memberActorId: string) {
  const snapshot = await tx.collectiveEpochMembership.findUnique({
    where: { epochId_memberActorId: { epochId, memberActorId } },
  });
  if (!snapshot) {
    throw new CollectiveActionProvenanceConflictError(
      `Actor ${memberActorId} was not a member in collective epoch ${epochId}.`,
    );
  }
  return snapshot;
}

async function sourceSnapshot(tx: Tx, kind: CollectiveActionSourceKind, ref: string) {
  if (kind === 'AUTHORITY_EXERCISE') {
    const item = await tx.authorityExercise.findUnique({
      where: { id: ref },
      select: {
        id: true,
        actorId: true,
        exercisedAt: true,
        coverageStatus: true,
        chainDigest: true,
        requestDigest: true,
        grantId: true,
        evidenceArtifactId: true,
      },
    });
    if (!item) {
      throw Object.assign(new Error(`Authority exercise ${ref} was not found.`), { statusCode: 404 });
    }
    return {
      kind,
      ref,
      actorId: item.actorId,
      occurredAt: item.exercisedAt,
      integrityDigest: sha256({
        version: 'noe.collective.source.authority-exercise.v1',
        id: item.id,
        actorId: item.actorId,
        exercisedAt: item.exercisedAt,
        coverageStatus: item.coverageStatus,
        chainDigest: item.chainDigest,
        requestDigest: item.requestDigest,
        grantId: item.grantId,
        evidenceArtifactId: item.evidenceArtifactId,
      }),
    } as const;
  }

  if (kind === 'ACTOR_EVENT') {
    const item = await tx.actorEvent.findUnique({
      where: { id: ref },
      select: { id: true, actorId: true, occurredAt: true, hash: true, sequence: true, type: true },
    });
    if (!item) {
      throw Object.assign(new Error(`Actor event ${ref} was not found.`), { statusCode: 404 });
    }
    return {
      kind,
      ref,
      actorId: item.actorId,
      occurredAt: item.occurredAt,
      integrityDigest: sha256({
        version: 'noe.collective.source.actor-event.v1',
        id: item.id,
        actorId: item.actorId,
        occurredAt: item.occurredAt,
        hash: item.hash,
        sequence: item.sequence,
        type: item.type,
      }),
    } as const;
  }

  const item = await evidence(tx, ref);
  return {
    kind,
    ref,
    actorId: null,
    occurredAt: null,
    integrityDigest: sha256({
      version: 'noe.collective.source.evidence.v1',
      id: item.id,
      digest: item.digest,
      issuer: item.issuer,
      kind: item.kind,
      observedAt: item.observedAt,
    }),
  } as const;
}

async function decisionParticipantsFromInput(
  tx: Tx,
  epochId: string,
  participants: CollectiveDecisionParticipantInput[],
) {
  const seen = new Set<string>();
  const normalized = [] as Array<{
    memberActorId: string;
    membershipId: string;
    role: string;
    weightBps: number | null;
    position: string | null;
    evidenceArtifactId: string | null;
    evidenceDigest: string | null;
    snapshotDigest: string;
  }>;

  for (const participant of participants) {
    const memberActorId = requiredText(participant.memberActorId, 'participant.memberActorId');
    if (seen.has(memberActorId)) {
      throw Object.assign(new Error(`Duplicate decision participant: ${memberActorId}.`), {
        statusCode: 400,
      });
    }
    seen.add(memberActorId);
    const snapshot = await membershipSnapshot(tx, epochId, memberActorId);
    const evidenceArtifactId = optionalText(
      participant.evidenceArtifactId,
      'participant.evidenceArtifactId',
    );
    const participationEvidence = evidenceArtifactId ? await evidence(tx, evidenceArtifactId) : null;
    normalized.push({
      memberActorId,
      membershipId: snapshot.membershipId,
      role: snapshot.role,
      weightBps: snapshot.weightBps,
      position: optionalText(participant.position, 'participant.position'),
      evidenceArtifactId,
      evidenceDigest: participationEvidence?.digest ?? null,
      snapshotDigest: snapshot.snapshotDigest,
    });
  }

  return normalized.sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
}

function decisionBasis(input: {
  collectiveActorId: string;
  epochId: string;
  epochStateDigest: string;
  decisionType: string;
  proposalDigest: string;
  method: string;
  methodVersion: string | null;
  outcomeDigest: string;
  quorumBps: number | null;
  decidedAt: Date;
  evidenceArtifactId: string;
  evidenceDigest: string;
  decisionPolicyDigest: string;
  constitutionDigest: string;
  participants: Array<{
    memberActorId: string;
    membershipId: string;
    role: string;
    weightBps: number | null;
    position: string | null;
    evidenceArtifactId: string | null;
    evidenceDigest: string | null;
    snapshotDigest: string;
  }>;
  metadata: unknown;
}) {
  return sha256({ version: 'noe.collective.decision.v1', ...input });
}

function participationDigest(input: {
  decisionId: string;
  epochId: string;
  membershipId: string;
  memberActorId: string;
  role: string;
  position: string | null;
  weightBps: number | null;
  evidenceArtifactId: string | null;
  evidenceDigest: string | null;
  snapshotDigest: string;
}) {
  return sha256({ version: 'noe.collective.decision-participation.v1', ...input });
}

export async function recordCollectiveDecision(
  input: RecordCollectiveDecisionInput,
  registry: CollectiveRegistryContext,
) {
  const collectiveActorId = requiredText(input.collectiveActorId, 'collectiveActorId');
  const epochId = requiredText(input.epochId, 'epochId');
  const decisionType = requiredText(input.decisionType, 'decisionType');
  const proposalDigest = requiredDigest(input.proposalDigest, 'proposalDigest');
  const method = requiredText(input.method, 'method');
  const methodVersion = optionalText(input.methodVersion, 'methodVersion');
  const outcomeDigest = requiredDigest(input.outcomeDigest, 'outcomeDigest');
  const quorumBps = input.quorumBps ?? null;
  assertQuorum(quorumBps);
  const evidenceArtifactId = requiredText(input.evidenceArtifactId, 'evidenceArtifactId');
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = input.metadata ?? {};

  return db.$transaction(
    async (tx) => {
      const epoch = await epochForCollective(tx, collectiveActorId, epochId);
      assertWithinEpoch(input.decidedAt, epoch, 'decidedAt');
      const decisionEvidence = await evidence(tx, evidenceArtifactId);
      const participants = await decisionParticipantsFromInput(tx, epochId, input.participants ?? []);
      const basisDigest = decisionBasis({
        collectiveActorId,
        epochId,
        epochStateDigest: epoch.stateDigest,
        decisionType,
        proposalDigest,
        method,
        methodVersion,
        outcomeDigest,
        quorumBps,
        decidedAt: input.decidedAt,
        evidenceArtifactId,
        evidenceDigest: decisionEvidence.digest,
        decisionPolicyDigest: epoch.decisionPolicyDigest,
        constitutionDigest: epoch.constitutionDigest,
        participants,
        metadata,
      });

      const replay = await tx.collectiveDecision.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.collectiveActorId !== collectiveActorId || replay.basisDigest !== basisDigest) {
          throw new CollectiveActionProvenanceConflictError(
            'Collective decision idempotency key was reused with different input.',
          );
        }
        return {
          replayed: true,
          decision: replay,
          participants: await tx.collectiveDecisionParticipation.findMany({
            where: { decisionId: replay.id },
            orderBy: { memberActorId: 'asc' },
          }),
        };
      }

      const id = `cdecision_${randomUUID()}`;
      const decision = await tx.collectiveDecision.create({
        data: {
          id,
          collectiveActorId,
          epochId,
          decisionType,
          proposalDigest,
          method,
          methodVersion,
          outcomeDigest,
          quorumBps,
          decidedAt: input.decidedAt,
          evidenceArtifactId,
          decisionPolicyDigest: epoch.decisionPolicyDigest,
          constitutionDigest: epoch.constitutionDigest,
          basisDigest,
          idempotencyKey: key,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      for (const participant of participants) {
        await tx.collectiveDecisionParticipation.create({
          data: {
            decisionId: id,
            epochId,
            membershipId: participant.membershipId,
            memberActorId: participant.memberActorId,
            role: participant.role,
            position: participant.position,
            weightBps: participant.weightBps,
            evidenceArtifactId: participant.evidenceArtifactId,
            participationDigest: participationDigest({ decisionId: id, epochId, ...participant }),
          },
        });
      }

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: collectiveActorId,
          type: 'collective.decision.recorded',
          sourceKey: `collective:decision:${key}`,
          occurredAt: input.decidedAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            decisionId: id,
            epochId,
            decisionType,
            method,
            methodVersion,
            quorumBps,
            proposalDigest,
            outcomeDigest,
            basisDigest,
            participantCount: participants.length,
            evidenceArtifactId,
          },
        },
        registry.signingSecret,
      );

      return {
        replayed: false,
        decision,
        participants: await tx.collectiveDecisionParticipation.findMany({
          where: { decisionId: id },
          orderBy: { memberActorId: 'asc' },
        }),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function actionBasis(input: {
  collectiveActorId: string;
  epochId: string;
  epochStateDigest: string;
  memberActorId: string | null;
  membershipId: string | null;
  membershipSnapshotDigest: string | null;
  capacity: CollectiveActionCapacity;
  actedAt: Date;
  sourceKind: CollectiveActionSourceKind;
  sourceRef: string;
  sourceIntegrityDigest: string;
  decisionId: string | null;
  decisionBasisDigest: string | null;
  claimedAt: Date;
  bindingEvidenceArtifactId: string;
  bindingEvidenceDigest: string;
  metadata: unknown;
}) {
  return sha256({ version: 'noe.collective.action-binding.v1', ...input });
}

export async function bindCollectiveAction(
  input: BindCollectiveActionInput,
  registry: CollectiveRegistryContext,
) {
  const collectiveActorId = requiredText(input.collectiveActorId, 'collectiveActorId');
  const epochId = requiredText(input.epochId, 'epochId');
  const memberActorId = optionalText(input.memberActorId, 'memberActorId');
  const decisionId = optionalText(input.decisionId, 'decisionId');
  const sourceRef = requiredText(input.sourceRef, 'sourceRef');
  const bindingEvidenceArtifactId = requiredText(
    input.bindingEvidenceArtifactId,
    'bindingEvidenceArtifactId',
  );
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = input.metadata ?? {};
  if (input.claimedAt.getTime() < input.actedAt.getTime()) {
    throw Object.assign(new Error('claimedAt cannot precede actedAt.'), { statusCode: 400 });
  }

  return db.$transaction(
    async (tx) => {
      const epoch = await epochForCollective(tx, collectiveActorId, epochId);
      assertWithinEpoch(input.actedAt, epoch, 'actedAt');
      const snapshot = memberActorId ? await membershipSnapshot(tx, epochId, memberActorId) : null;

      if (input.capacity === 'COLLECTIVE_DIRECT' && snapshot) {
        throw Object.assign(new Error('COLLECTIVE_DIRECT cannot identify a member actor.'), {
          statusCode: 400,
        });
      }
      if (input.capacity !== 'COLLECTIVE_DIRECT' && !snapshot) {
        throw Object.assign(new Error(`${input.capacity} requires a memberActorId from the epoch.`), {
          statusCode: 400,
        });
      }
      if (
        input.capacity === 'MEMBER_ON_BEHALF' &&
        !decisionId &&
        input.sourceKind !== 'AUTHORITY_EXERCISE'
      ) {
        throw Object.assign(
          new Error('MEMBER_ON_BEHALF requires a prior collective decision or authority exercise.'),
          { statusCode: 400 },
        );
      }
      if (
        (input.capacity === 'MEMBER_PERSONAL' || input.capacity === 'UNAUTHORIZED_COLLECTIVE_CLAIM') &&
        decisionId
      ) {
        throw Object.assign(
          new Error('Personal/unauthorized bindings cannot carry a pre-authorizing decision.'),
          { statusCode: 400 },
        );
      }

      const decision = decisionId
        ? await tx.collectiveDecision.findUnique({ where: { id: decisionId } })
        : null;
      if (decisionId && !decision) {
        throw Object.assign(new Error(`Collective decision ${decisionId} was not found.`), {
          statusCode: 404,
        });
      }
      if (
        decision &&
        (decision.collectiveActorId !== collectiveActorId || decision.epochId !== epochId)
      ) {
        throw new CollectiveActionProvenanceConflictError(
          'Pre-authorizing decision must belong to the exact collective action epoch.',
        );
      }
      if (decision && decision.decidedAt.getTime() > input.actedAt.getTime()) {
        throw new CollectiveActionProvenanceConflictError(
          'A future collective decision cannot pre-authorize an earlier action; use ratification instead.',
        );
      }

      const source = await sourceSnapshot(tx, input.sourceKind, sourceRef);
      if (source.occurredAt && source.occurredAt.getTime() !== input.actedAt.getTime()) {
        throw new CollectiveActionProvenanceConflictError(
          'actedAt must equal the time of an authority-exercise or actor-event source.',
        );
      }
      const expectedSourceActor = memberActorId ?? collectiveActorId;
      if (source.actorId && source.actorId !== expectedSourceActor) {
        throw new CollectiveActionProvenanceConflictError(
          'Source action actor does not match the claimed collective/member capacity.',
        );
      }

      const bindingEvidence = await evidence(tx, bindingEvidenceArtifactId);
      const basisDigest = actionBasis({
        collectiveActorId,
        epochId,
        epochStateDigest: epoch.stateDigest,
        memberActorId,
        membershipId: snapshot?.membershipId ?? null,
        membershipSnapshotDigest: snapshot?.snapshotDigest ?? null,
        capacity: input.capacity,
        actedAt: input.actedAt,
        sourceKind: input.sourceKind,
        sourceRef,
        sourceIntegrityDigest: source.integrityDigest,
        decisionId,
        decisionBasisDigest: decision?.basisDigest ?? null,
        claimedAt: input.claimedAt,
        bindingEvidenceArtifactId,
        bindingEvidenceDigest: bindingEvidence.digest,
        metadata,
      });

      const replay = await tx.collectiveActionBinding.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.collectiveActorId !== collectiveActorId || replay.basisDigest !== basisDigest) {
          throw new CollectiveActionProvenanceConflictError(
            'Collective action idempotency key was reused with different input.',
          );
        }
        return { replayed: true, binding: replay };
      }

      const binding = await tx.collectiveActionBinding.create({
        data: {
          id: `caction_${randomUUID()}`,
          collectiveActorId,
          epochId,
          memberActorId,
          membershipId: snapshot?.membershipId ?? null,
          capacity: input.capacity,
          actedAt: input.actedAt,
          sourceKind: input.sourceKind,
          sourceRef,
          decisionId,
          claimedAt: input.claimedAt,
          bindingEvidenceArtifactId,
          basisDigest,
          idempotencyKey: key,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: collectiveActorId,
          type: 'collective.action.bound',
          sourceKey: `collective:action:${key}`,
          occurredAt: input.actedAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            actionBindingId: binding.id,
            epochId,
            capacity: input.capacity,
            memberActorId,
            membershipId: snapshot?.membershipId ?? null,
            sourceKind: input.sourceKind,
            sourceRef,
            decisionId,
            basisDigest,
            bindingEvidenceArtifactId,
          },
        },
        registry.signingSecret,
      );

      return { replayed: false, binding };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function ratificationBasis(input: {
  actionBindingId: string;
  bindingBasisDigest: string;
  collectiveActorId: string;
  decisionId: string;
  decisionBasisDigest: string;
  ratifiedAt: Date;
  evidenceArtifactId: string;
  evidenceDigest: string;
  metadata: unknown;
}) {
  return sha256({ version: 'noe.collective.action-ratification.v1', ...input });
}

export async function ratifyCollectiveAction(
  input: RatifyCollectiveActionInput,
  registry: CollectiveRegistryContext,
) {
  const actionBindingId = requiredText(input.actionBindingId, 'actionBindingId');
  const decisionId = requiredText(input.decisionId, 'decisionId');
  const evidenceArtifactId = requiredText(input.evidenceArtifactId, 'evidenceArtifactId');
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = input.metadata ?? {};

  return db.$transaction(
    async (tx) => {
      const binding = await tx.collectiveActionBinding.findUnique({ where: { id: actionBindingId } });
      if (!binding) {
        throw Object.assign(new Error(`Collective action ${actionBindingId} was not found.`), {
          statusCode: 404,
        });
      }
      const decision = await tx.collectiveDecision.findUnique({ where: { id: decisionId } });
      if (!decision || decision.collectiveActorId !== binding.collectiveActorId) {
        throw new CollectiveActionProvenanceConflictError(
          'Ratification decision must belong to the same collective actor.',
        );
      }
      if (decision.decidedAt.getTime() < binding.actedAt.getTime()) {
        throw new CollectiveActionProvenanceConflictError(
          'Ratification requires a decision at or after the original action.',
        );
      }
      if (input.ratifiedAt.getTime() < decision.decidedAt.getTime()) {
        throw Object.assign(new Error('ratifiedAt cannot precede the ratifying decision.'), {
          statusCode: 400,
        });
      }
      const ratificationEvidence = await evidence(tx, evidenceArtifactId);
      const basisDigest = ratificationBasis({
        actionBindingId,
        bindingBasisDigest: binding.basisDigest,
        collectiveActorId: binding.collectiveActorId,
        decisionId,
        decisionBasisDigest: decision.basisDigest,
        ratifiedAt: input.ratifiedAt,
        evidenceArtifactId,
        evidenceDigest: ratificationEvidence.digest,
        metadata,
      });

      const replay = await tx.collectiveActionRatification.findUnique({
        where: { idempotencyKey: key },
      });
      if (replay) {
        if (replay.actionBindingId !== actionBindingId || replay.basisDigest !== basisDigest) {
          throw new CollectiveActionProvenanceConflictError(
            'Collective ratification idempotency key was reused with different input.',
          );
        }
        return { replayed: true, ratification: replay };
      }

      const ratification = await tx.collectiveActionRatification.create({
        data: {
          id: `cratify_${randomUUID()}`,
          actionBindingId,
          collectiveActorId: binding.collectiveActorId,
          decisionId,
          ratifiedAt: input.ratifiedAt,
          evidenceArtifactId,
          basisDigest,
          idempotencyKey: key,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: binding.collectiveActorId,
          type: 'collective.action.ratified',
          sourceKey: `collective:ratification:${key}`,
          occurredAt: input.ratifiedAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            ratificationId: ratification.id,
            actionBindingId,
            decisionId,
            basisDigest,
            evidenceArtifactId,
          },
        },
        registry.signingSecret,
      );

      return { replayed: false, ratification };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function assessmentBasis(input: {
  actionBindingId: string;
  bindingBasisDigest: string;
  evaluatorRef: string;
  method: string;
  methodVersion: string;
  disposition: CollectiveCapacityDisposition;
  evidenceArtifactId: string;
  evidenceDigest: string;
  assessedAt: Date;
  metadata: unknown;
}) {
  return sha256({ version: 'noe.collective.capacity-assessment.v1', ...input });
}

export async function recordCollectiveCapacityAssessment(
  input: RecordCollectiveCapacityAssessmentInput,
  registry: CollectiveRegistryContext,
) {
  const actionBindingId = requiredText(input.actionBindingId, 'actionBindingId');
  const evaluatorRef = requiredText(input.evaluatorRef, 'evaluatorRef');
  const method = requiredText(input.method, 'method');
  const methodVersion = requiredText(input.methodVersion, 'methodVersion');
  const evidenceArtifactId = requiredText(input.evidenceArtifactId, 'evidenceArtifactId');
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = input.metadata ?? {};

  return db.$transaction(
    async (tx) => {
      const binding = await tx.collectiveActionBinding.findUnique({ where: { id: actionBindingId } });
      if (!binding) {
        throw Object.assign(new Error(`Collective action ${actionBindingId} was not found.`), {
          statusCode: 404,
        });
      }
      if (input.assessedAt.getTime() < binding.claimedAt.getTime()) {
        throw Object.assign(new Error('assessedAt cannot precede the action binding claim.'), {
          statusCode: 400,
        });
      }
      const assessmentEvidence = await evidence(tx, evidenceArtifactId);
      const basisDigest = assessmentBasis({
        actionBindingId,
        bindingBasisDigest: binding.basisDigest,
        evaluatorRef,
        method,
        methodVersion,
        disposition: input.disposition,
        evidenceArtifactId,
        evidenceDigest: assessmentEvidence.digest,
        assessedAt: input.assessedAt,
        metadata,
      });

      const replay = await tx.collectiveCapacityAssessment.findUnique({
        where: { idempotencyKey: key },
      });
      if (replay) {
        if (replay.actionBindingId !== actionBindingId || replay.basisDigest !== basisDigest) {
          throw new CollectiveActionProvenanceConflictError(
            'Collective capacity assessment idempotency key was reused with different input.',
          );
        }
        return { replayed: true, assessment: replay };
      }

      const assessment = await tx.collectiveCapacityAssessment.create({
        data: {
          id: `cassessment_${randomUUID()}`,
          actionBindingId,
          evaluatorRef,
          method,
          methodVersion,
          disposition: input.disposition,
          basisDigest,
          evidenceArtifactId,
          assessedAt: input.assessedAt,
          idempotencyKey: key,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: binding.collectiveActorId,
          type: 'collective.capacity.assessed',
          sourceKey: `collective:capacity-assessment:${key}`,
          occurredAt: input.assessedAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            assessmentId: assessment.id,
            actionBindingId,
            evaluatorRef,
            method,
            methodVersion,
            disposition: input.disposition,
            basisDigest,
            evidenceArtifactId,
          },
        },
        registry.signingSecret,
      );

      return { replayed: false, assessment };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function summaryTx(tx: Tx, collectiveActorId: string) {
  const profile = await tx.collectiveProfile.findUnique({ where: { actorId: collectiveActorId } });
  if (!profile) return null;
  const [decisions, bindings, ratifications, assessments] = await Promise.all([
    tx.collectiveDecision.findMany({
      where: { collectiveActorId },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    }),
    tx.collectiveActionBinding.findMany({
      where: { collectiveActorId },
      orderBy: [{ actedAt: 'asc' }, { id: 'asc' }],
    }),
    tx.collectiveActionRatification.findMany({
      where: { collectiveActorId },
      orderBy: [{ ratifiedAt: 'asc' }, { id: 'asc' }],
    }),
    tx.collectiveCapacityAssessment.findMany({
      where: { actionBindingId: { in: (await tx.collectiveActionBinding.findMany({
        where: { collectiveActorId },
        select: { id: true },
      })).map((item) => item.id) } },
      orderBy: [{ assessedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const decisionIds = decisions.map((item) => item.id);
  const participations = decisionIds.length
    ? await tx.collectiveDecisionParticipation.findMany({
        where: { decisionId: { in: decisionIds } },
        orderBy: [{ decisionId: 'asc' }, { memberActorId: 'asc' }],
      })
    : [];
  return { profile, decisions, participations, bindings, ratifications, assessments };
}

export async function getCollectiveActionProvenanceSummary(collectiveActorId: string) {
  return db.$transaction((tx) => summaryTx(tx, collectiveActorId));
}

export async function verifyCollectiveActionProvenance(collectiveActorId: string) {
  const summary = await getCollectiveActionProvenanceSummary(collectiveActorId);
  if (!summary) {
    return {
      verified: false,
      collectiveActorId,
      issues: ['collective_profile_missing'],
      counts: { decisions: 0, bindings: 0, ratifications: 0, assessments: 0 },
    };
  }

  const issues: string[] = [];
  const participationByDecision = new Map<string, typeof summary.participations>();
  for (const item of summary.participations) {
    const list = participationByDecision.get(item.decisionId) ?? [];
    list.push(item);
    participationByDecision.set(item.decisionId, list);
  }

  for (const decision of summary.decisions) {
    const epoch = await db.collectiveEpoch.findUnique({ where: { id: decision.epochId } });
    const decisionEvidence = await db.evidenceArtifact.findUnique({ where: { id: decision.evidenceArtifactId } });
    if (!epoch || epoch.collectiveActorId !== collectiveActorId) {
      issues.push(`decision_epoch_invalid:${decision.id}`);
      continue;
    }
    if (!decisionEvidence) {
      issues.push(`decision_evidence_missing:${decision.id}`);
      continue;
    }
    const participants = [] as Array<{
      memberActorId: string;
      membershipId: string;
      role: string;
      weightBps: number | null;
      position: string | null;
      evidenceArtifactId: string | null;
      evidenceDigest: string | null;
      snapshotDigest: string;
    }>;
    for (const item of participationByDecision.get(decision.id) ?? []) {
      const snapshot = await db.collectiveEpochMembership.findUnique({
        where: { epochId_memberActorId: { epochId: item.epochId, memberActorId: item.memberActorId } },
      });
      const itemEvidence = item.evidenceArtifactId
        ? await db.evidenceArtifact.findUnique({ where: { id: item.evidenceArtifactId } })
        : null;
      if (!snapshot || snapshot.membershipId !== item.membershipId) {
        issues.push(`decision_participant_snapshot_invalid:${decision.id}:${item.memberActorId}`);
        continue;
      }
      const expectedParticipationDigest = participationDigest({
        decisionId: decision.id,
        epochId: decision.epochId,
        membershipId: item.membershipId,
        memberActorId: item.memberActorId,
        role: item.role,
        position: item.position,
        weightBps: item.weightBps,
        evidenceArtifactId: item.evidenceArtifactId,
        evidenceDigest: itemEvidence?.digest ?? null,
        snapshotDigest: snapshot.snapshotDigest,
      });
      if (expectedParticipationDigest !== item.participationDigest) {
        issues.push(`decision_participation_digest_mismatch:${decision.id}:${item.memberActorId}`);
      }
      participants.push({
        memberActorId: item.memberActorId,
        membershipId: item.membershipId,
        role: item.role,
        weightBps: item.weightBps,
        position: item.position,
        evidenceArtifactId: item.evidenceArtifactId,
        evidenceDigest: itemEvidence?.digest ?? null,
        snapshotDigest: snapshot.snapshotDigest,
      });
    }
    participants.sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
    const expectedBasis = decisionBasis({
      collectiveActorId,
      epochId: decision.epochId,
      epochStateDigest: epoch.stateDigest,
      decisionType: decision.decisionType,
      proposalDigest: decision.proposalDigest,
      method: decision.method,
      methodVersion: decision.methodVersion,
      outcomeDigest: decision.outcomeDigest,
      quorumBps: decision.quorumBps,
      decidedAt: decision.decidedAt,
      evidenceArtifactId: decision.evidenceArtifactId,
      evidenceDigest: decisionEvidence.digest,
      decisionPolicyDigest: decision.decisionPolicyDigest,
      constitutionDigest: decision.constitutionDigest,
      participants,
      metadata: decision.metadata,
    });
    if (expectedBasis !== decision.basisDigest) {
      issues.push(`decision_basis_digest_mismatch:${decision.id}`);
    }
  }

  for (const binding of summary.bindings) {
    const epoch = await db.collectiveEpoch.findUnique({ where: { id: binding.epochId } });
    const bindingEvidence = await db.evidenceArtifact.findUnique({
      where: { id: binding.bindingEvidenceArtifactId },
    });
    if (!epoch || !bindingEvidence) {
      issues.push(`action_binding_basis_missing:${binding.id}`);
      continue;
    }
    const snapshot = binding.memberActorId
      ? await db.collectiveEpochMembership.findUnique({
          where: {
            epochId_memberActorId: {
              epochId: binding.epochId,
              memberActorId: binding.memberActorId,
            },
          },
        })
      : null;
    const decision = binding.decisionId
      ? await db.collectiveDecision.findUnique({ where: { id: binding.decisionId } })
      : null;
    let source;
    try {
      source = await db.$transaction((tx) =>
        sourceSnapshot(tx, binding.sourceKind as CollectiveActionSourceKind, binding.sourceRef),
      );
    } catch {
      issues.push(`action_binding_source_missing:${binding.id}`);
      continue;
    }
    const expectedBasis = actionBasis({
      collectiveActorId,
      epochId: binding.epochId,
      epochStateDigest: epoch.stateDigest,
      memberActorId: binding.memberActorId,
      membershipId: binding.membershipId,
      membershipSnapshotDigest: snapshot?.snapshotDigest ?? null,
      capacity: binding.capacity as CollectiveActionCapacity,
      actedAt: binding.actedAt,
      sourceKind: binding.sourceKind as CollectiveActionSourceKind,
      sourceRef: binding.sourceRef,
      sourceIntegrityDigest: source.integrityDigest,
      decisionId: binding.decisionId,
      decisionBasisDigest: decision?.basisDigest ?? null,
      claimedAt: binding.claimedAt,
      bindingEvidenceArtifactId: binding.bindingEvidenceArtifactId,
      bindingEvidenceDigest: bindingEvidence.digest,
      metadata: binding.metadata,
    });
    if (expectedBasis !== binding.basisDigest) {
      issues.push(`action_binding_basis_digest_mismatch:${binding.id}`);
    }
  }

  const bindingById = new Map(summary.bindings.map((item) => [item.id, item]));
  const decisionById = new Map(summary.decisions.map((item) => [item.id, item]));
  for (const ratification of summary.ratifications) {
    const binding = bindingById.get(ratification.actionBindingId);
    const decision = decisionById.get(ratification.decisionId);
    const ratificationEvidence = await db.evidenceArtifact.findUnique({
      where: { id: ratification.evidenceArtifactId },
    });
    if (!binding || !decision || !ratificationEvidence) {
      issues.push(`ratification_basis_missing:${ratification.id}`);
      continue;
    }
    const expectedBasis = ratificationBasis({
      actionBindingId: binding.id,
      bindingBasisDigest: binding.basisDigest,
      collectiveActorId,
      decisionId: decision.id,
      decisionBasisDigest: decision.basisDigest,
      ratifiedAt: ratification.ratifiedAt,
      evidenceArtifactId: ratification.evidenceArtifactId,
      evidenceDigest: ratificationEvidence.digest,
      metadata: ratification.metadata,
    });
    if (expectedBasis !== ratification.basisDigest) {
      issues.push(`ratification_basis_digest_mismatch:${ratification.id}`);
    }
  }

  for (const assessment of summary.assessments) {
    const binding = bindingById.get(assessment.actionBindingId);
    const assessmentEvidence = await db.evidenceArtifact.findUnique({
      where: { id: assessment.evidenceArtifactId },
    });
    if (!binding || !assessmentEvidence) {
      issues.push(`capacity_assessment_basis_missing:${assessment.id}`);
      continue;
    }
    const expectedBasis = assessmentBasis({
      actionBindingId: binding.id,
      bindingBasisDigest: binding.basisDigest,
      evaluatorRef: assessment.evaluatorRef,
      method: assessment.method,
      methodVersion: assessment.methodVersion,
      disposition: assessment.disposition as CollectiveCapacityDisposition,
      evidenceArtifactId: assessment.evidenceArtifactId,
      evidenceDigest: assessmentEvidence.digest,
      assessedAt: assessment.assessedAt,
      metadata: assessment.metadata,
    });
    if (expectedBasis !== assessment.basisDigest) {
      issues.push(`capacity_assessment_basis_digest_mismatch:${assessment.id}`);
    }
  }

  return {
    verified: issues.length === 0,
    collectiveActorId,
    issues,
    counts: {
      decisions: summary.decisions.length,
      bindings: summary.bindings.length,
      ratifications: summary.ratifications.length,
      assessments: summary.assessments.length,
    },
  };
}
