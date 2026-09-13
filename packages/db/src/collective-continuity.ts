import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export type CollectiveTransitionKind =
  | 'roster_change'
  | 'role_change'
  | 'topology_change'
  | 'constitution_change'
  | 'control_change'
  | 'restore';

export type CollectiveRegistryContext = {
  signingSecret: string;
  hostId: string;
  environmentVersion: string;
  issuer: string;
};

export type CollectiveMemberInput = {
  memberActorId: string;
  role: string;
  weightBps?: number | null;
  joinEvidenceArtifactId?: string | null;
};

export type FormCollectiveInput = {
  collectiveActorId: string;
  governanceMethod: string;
  constitutionDigest: string;
  topologyDigest: string;
  decisionPolicyDigest: string;
  formationEvidenceArtifactId: string;
  roster: CollectiveMemberInput[];
  formedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type TransitionCollectiveInput = {
  collectiveActorId: string;
  predecessorEpochId: string;
  transitionKind: CollectiveTransitionKind;
  transitionEvidenceArtifactId: string;
  roster: CollectiveMemberInput[];
  constitutionDigest?: string;
  topologyDigest?: string;
  decisionPolicyDigest?: string;
  startedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

type NormalizedMember = {
  memberActorId: string;
  role: string;
  weightBps: number | null;
  joinEvidenceArtifactId: string | null;
};

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export class CollectiveContinuityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'CollectiveContinuityConflictError';
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

function normalizeIdempotencyKey(value: string): string {
  const key = requiredText(value, 'idempotencyKey');
  if (key.length < 8 || key.length > 500) {
    throw Object.assign(new Error('idempotencyKey must contain 8 to 500 characters.'), {
      statusCode: 400,
    });
  }
  return key;
}

function normalizeRoster(collectiveActorId: string, roster: CollectiveMemberInput[]): NormalizedMember[] {
  if (roster.length === 0) {
    throw Object.assign(new Error('A collective epoch must contain at least one member.'), {
      statusCode: 400,
    });
  }
  if (roster.length > 1_000) {
    throw Object.assign(new Error('A collective epoch cannot exceed 1000 members in C1.'), {
      statusCode: 400,
    });
  }

  const seen = new Set<string>();
  const normalized = roster.map((member) => {
    const memberActorId = requiredText(member.memberActorId, 'memberActorId');
    if (memberActorId === collectiveActorId) {
      throw Object.assign(new Error('A collective actor cannot be a member of itself.'), {
        statusCode: 400,
      });
    }
    if (seen.has(memberActorId)) {
      throw Object.assign(new Error(`Duplicate collective member: ${memberActorId}.`), {
        statusCode: 400,
      });
    }
    seen.add(memberActorId);

    const weightBps = member.weightBps ?? null;
    if (weightBps !== null && (!Number.isInteger(weightBps) || weightBps < 0 || weightBps > 10_000)) {
      throw Object.assign(new Error('weightBps must be an integer between 0 and 10000.'), {
        statusCode: 400,
      });
    }

    return {
      memberActorId,
      role: requiredText(member.role, 'member role'),
      weightBps,
      joinEvidenceArtifactId: member.joinEvidenceArtifactId
        ? requiredText(member.joinEvidenceArtifactId, 'joinEvidenceArtifactId')
        : null,
    };
  });

  return normalized.sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
}

function publicRoster(roster: NormalizedMember[]) {
  return roster.map(({ memberActorId, role, weightBps }) => ({ memberActorId, role, weightBps }));
}

function rosterDigest(roster: NormalizedMember[]): string {
  return sha256({ version: 'noe.collective.roster.v1', roster: publicRoster(roster) });
}

function snapshotDigest(input: {
  epochId: string;
  membershipId: string;
  collectiveActorId: string;
  memberActorId: string;
  role: string;
  weightBps: number | null;
}): string {
  return sha256({ version: 'noe.collective.epoch-membership.v1', ...input });
}

function profileDigest(input: {
  actorId: string;
  governanceMethod: string;
  formationEvidenceArtifactId: string;
  formedAt: Date;
}): string {
  return sha256({ version: 'noe.collective.profile.v1', ...input });
}

function epochStateDigest(input: {
  collectiveActorId: string;
  sequence: number;
  predecessorEpochId: string | null;
  transitionKind: string;
  constitutionDigest: string;
  topologyDigest: string;
  decisionPolicyDigest: string;
  rosterDigest: string;
  transitionEvidenceArtifactId: string;
  startedAt: Date;
}): string {
  return sha256({ version: 'noe.collective.epoch.v1', ...input });
}

async function assertEvidenceExists(tx: Prisma.TransactionClient, evidenceArtifactId: string): Promise<void> {
  const evidence = await tx.evidenceArtifact.findUnique({
    where: { id: evidenceArtifactId },
    select: { id: true },
  });
  if (!evidence) {
    throw Object.assign(new Error(`Evidence artifact ${evidenceArtifactId} was not found.`), {
      statusCode: 404,
    });
  }
}

async function assertRosterActors(
  tx: Prisma.TransactionClient,
  collectiveActorId: string,
  roster: NormalizedMember[],
): Promise<void> {
  const ids = roster.map((member) => member.memberActorId);
  const actors = await tx.actor.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });
  const byId = new Map(actors.map((actor) => [actor.id, actor]));
  for (const id of ids) {
    const actor = byId.get(id);
    if (!actor) {
      throw Object.assign(new Error(`Collective member actor ${id} was not found.`), { statusCode: 404 });
    }
    if (actor.status !== 'ACTIVE') {
      throw new CollectiveContinuityConflictError(`Collective member actor ${id} is not active.`);
    }
  }

  const nested = await tx.collectiveProfile.findMany({
    where: { actorId: { in: ids } },
    select: { actorId: true },
  });
  if (nested.length > 0) {
    throw new CollectiveContinuityConflictError(
      `Nested collectives are not supported in C1 (member ${nested[0]?.actorId ?? 'unknown'}).`,
    );
  }

  if (ids.includes(collectiveActorId)) {
    throw Object.assign(new Error('A collective actor cannot be its own member.'), { statusCode: 400 });
  }
}

async function assertOptionalJoinEvidence(
  tx: Prisma.TransactionClient,
  roster: NormalizedMember[],
): Promise<void> {
  const ids = [...new Set(roster.flatMap((member) => (member.joinEvidenceArtifactId ? [member.joinEvidenceArtifactId] : [])))];
  if (ids.length === 0) return;
  const evidence = await tx.evidenceArtifact.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const found = new Set(evidence.map((item) => item.id));
  const missing = ids.find((id) => !found.has(id));
  if (missing) {
    throw Object.assign(new Error(`Join evidence artifact ${missing} was not found.`), { statusCode: 404 });
  }
}

async function lockCollectiveActor(tx: Prisma.TransactionClient, actorId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; actorType: string; status: string }>>`
    SELECT "id", "actorType"::text AS "actorType", "status"::text AS "status"
    FROM "Actor"
    WHERE "id" = ${actorId}
    FOR UPDATE
  `;
  const actor = rows[0];
  if (!actor) {
    throw Object.assign(new Error(`Collective actor ${actorId} was not found.`), { statusCode: 404 });
  }
  if (actor.actorType !== 'ORGANIZATION') {
    throw Object.assign(new Error('C1 collective profiles require an ORGANIZATION actor.'), {
      statusCode: 400,
    });
  }
  if (actor.status !== 'ACTIVE') {
    throw new CollectiveContinuityConflictError('Collective actor is not active.');
  }
  return actor;
}

async function summaryTx(tx: Prisma.TransactionClient, collectiveActorId: string) {
  const [actor, profile, epochs, memberships, snapshots] = await Promise.all([
    tx.actor.findUnique({
      where: { id: collectiveActorId },
      select: { id: true, handle: true, displayName: true, actorType: true, status: true },
    }),
    tx.collectiveProfile.findUnique({ where: { actorId: collectiveActorId } }),
    tx.collectiveEpoch.findMany({
      where: { collectiveActorId },
      orderBy: { sequence: 'asc' },
    }),
    tx.collectiveMembership.findMany({
      where: { collectiveActorId },
      orderBy: [{ joinedAt: 'asc' }, { memberActorId: 'asc' }],
    }),
    tx.collectiveEpochMembership.findMany({
      where: { collectiveActorId },
      orderBy: [{ createdAt: 'asc' }, { memberActorId: 'asc' }],
    }),
  ]);

  if (!actor || !profile) return null;
  const byEpoch = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const list = byEpoch.get(snapshot.epochId) ?? [];
    list.push(snapshot);
    byEpoch.set(snapshot.epochId, list);
  }

  return {
    actor,
    profile,
    epochs: epochs.map((epoch) => ({ ...epoch, roster: byEpoch.get(epoch.id) ?? [] })),
    memberships,
  };
}

export async function getCollectiveContinuitySummary(collectiveActorId: string) {
  return db.$transaction((tx) => summaryTx(tx, collectiveActorId));
}

export async function formCollective(
  input: FormCollectiveInput,
  registry: CollectiveRegistryContext,
) {
  const collectiveActorId = requiredText(input.collectiveActorId, 'collectiveActorId');
  const governanceMethod = requiredText(input.governanceMethod, 'governanceMethod');
  const formationEvidenceArtifactId = requiredText(
    input.formationEvidenceArtifactId,
    'formationEvidenceArtifactId',
  );
  const constitutionDigest = requiredDigest(input.constitutionDigest, 'constitutionDigest');
  const topologyDigest = requiredDigest(input.topologyDigest, 'topologyDigest');
  const decisionPolicyDigest = requiredDigest(input.decisionPolicyDigest, 'decisionPolicyDigest');
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const roster = normalizeRoster(collectiveActorId, input.roster);
  const requestBasisDigest = sha256({
    version: 'noe.collective.formation-request.v1',
    collectiveActorId,
    governanceMethod,
    formationEvidenceArtifactId,
    constitutionDigest,
    topologyDigest,
    decisionPolicyDigest,
    roster: publicRoster(roster),
    formedAt: input.formedAt?.toISOString() ?? null,
    metadata: input.metadata ?? {},
  });

  return db.$transaction(
    async (tx) => {
      const replay = await tx.collectiveProfile.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.actorId !== collectiveActorId || replay.basisDigest !== requestBasisDigest) {
          throw new CollectiveContinuityConflictError(
            'Collective formation idempotency key was reused with different input.',
          );
        }
        return { replayed: true, summary: await summaryTx(tx, collectiveActorId) };
      }

      await lockCollectiveActor(tx, collectiveActorId);
      const existingProfile = await tx.collectiveProfile.findUnique({ where: { actorId: collectiveActorId } });
      if (existingProfile) {
        throw new CollectiveContinuityConflictError('Collective actor is already formed.');
      }

      await assertEvidenceExists(tx, formationEvidenceArtifactId);
      await assertRosterActors(tx, collectiveActorId, roster);
      await assertOptionalJoinEvidence(tx, roster);

      const formedAt = input.formedAt ?? new Date();
      const epochId = `cepoch_${randomUUID()}`;
      const resolvedRosterDigest = rosterDigest(roster);
      const stateDigest = epochStateDigest({
        collectiveActorId,
        sequence: 1,
        predecessorEpochId: null,
        transitionKind: 'formation',
        constitutionDigest,
        topologyDigest,
        decisionPolicyDigest,
        rosterDigest: resolvedRosterDigest,
        transitionEvidenceArtifactId: formationEvidenceArtifactId,
        startedAt: formedAt,
      });

      await tx.collectiveProfile.create({
        data: {
          actorId: collectiveActorId,
          governanceMethod,
          formationEvidenceArtifactId,
          formedAt,
          profileDigest: profileDigest({
            actorId: collectiveActorId,
            governanceMethod,
            formationEvidenceArtifactId,
            formedAt,
          }),
          basisDigest: requestBasisDigest,
          idempotencyKey,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      await tx.collectiveEpoch.create({
        data: {
          id: epochId,
          collectiveActorId,
          sequence: 1,
          predecessorEpochId: null,
          transitionKind: 'formation',
          constitutionDigest,
          topologyDigest,
          decisionPolicyDigest,
          rosterDigest: resolvedRosterDigest,
          stateDigest,
          transitionEvidenceArtifactId: formationEvidenceArtifactId,
          basisDigest: requestBasisDigest,
          idempotencyKey: `formation:${idempotencyKey}`,
          startedAt: formedAt,
          endedAt: null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      for (const member of roster) {
        const membershipId = `cmem_${randomUUID()}`;
        await tx.collectiveMembership.create({
          data: {
            id: membershipId,
            collectiveActorId,
            memberActorId: member.memberActorId,
            role: member.role,
            weightBps: member.weightBps,
            joinedAt: formedAt,
            leftAt: null,
            joinEpochId: epochId,
            leaveEpochId: null,
            joinEvidenceArtifactId: member.joinEvidenceArtifactId ?? formationEvidenceArtifactId,
            leaveEvidenceArtifactId: null,
            metadata: {},
          },
        });
        await tx.collectiveEpochMembership.create({
          data: {
            epochId,
            membershipId,
            collectiveActorId,
            memberActorId: member.memberActorId,
            role: member.role,
            weightBps: member.weightBps,
            snapshotDigest: snapshotDigest({
              epochId,
              membershipId,
              collectiveActorId,
              memberActorId: member.memberActorId,
              role: member.role,
              weightBps: member.weightBps,
            }),
          },
        });
      }

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: collectiveActorId,
          type: 'collective.formed',
          sourceKey: `collective:formation:${idempotencyKey}`,
          occurredAt: formedAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            epochId,
            sequence: 1,
            governanceMethod,
            constitutionDigest,
            topologyDigest,
            decisionPolicyDigest,
            rosterDigest: resolvedRosterDigest,
            stateDigest,
            memberCount: roster.length,
            formationEvidenceArtifactId,
          },
        },
        registry.signingSecret,
      );

      return { replayed: false, summary: await summaryTx(tx, collectiveActorId) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function sameMemberSet(
  current: Array<{ memberActorId: string }>,
  next: Array<{ memberActorId: string }>,
): boolean {
  if (current.length !== next.length) return false;
  return current.every((member, index) => member.memberActorId === next[index]?.memberActorId);
}

export async function transitionCollective(
  input: TransitionCollectiveInput,
  registry: CollectiveRegistryContext,
) {
  const collectiveActorId = requiredText(input.collectiveActorId, 'collectiveActorId');
  const predecessorEpochId = requiredText(input.predecessorEpochId, 'predecessorEpochId');
  const transitionEvidenceArtifactId = requiredText(
    input.transitionEvidenceArtifactId,
    'transitionEvidenceArtifactId',
  );
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const roster = normalizeRoster(collectiveActorId, input.roster);
  const requestedConstitutionDigest = input.constitutionDigest
    ? requiredDigest(input.constitutionDigest, 'constitutionDigest')
    : null;
  const requestedTopologyDigest = input.topologyDigest
    ? requiredDigest(input.topologyDigest, 'topologyDigest')
    : null;
  const requestedDecisionPolicyDigest = input.decisionPolicyDigest
    ? requiredDigest(input.decisionPolicyDigest, 'decisionPolicyDigest')
    : null;
  const requestBasisDigest = sha256({
    version: 'noe.collective.transition-request.v1',
    collectiveActorId,
    predecessorEpochId,
    transitionKind: input.transitionKind,
    transitionEvidenceArtifactId,
    roster: publicRoster(roster),
    constitutionDigest: requestedConstitutionDigest,
    topologyDigest: requestedTopologyDigest,
    decisionPolicyDigest: requestedDecisionPolicyDigest,
    startedAt: input.startedAt?.toISOString() ?? null,
    metadata: input.metadata ?? {},
  });

  return db.$transaction(
    async (tx) => {
      const replay = await tx.collectiveEpoch.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.collectiveActorId !== collectiveActorId || replay.basisDigest !== requestBasisDigest) {
          throw new CollectiveContinuityConflictError(
            'Collective transition idempotency key was reused with different input.',
          );
        }
        return { replayed: true, summary: await summaryTx(tx, collectiveActorId) };
      }

      await lockCollectiveActor(tx, collectiveActorId);
      const profile = await tx.collectiveProfile.findUnique({ where: { actorId: collectiveActorId } });
      if (!profile) {
        throw Object.assign(new Error('Collective profile was not found.'), { statusCode: 404 });
      }

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "CollectiveEpoch"
        WHERE "id" = ${predecessorEpochId}
          AND "collectiveActorId" = ${collectiveActorId}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw Object.assign(new Error('Predecessor collective epoch was not found.'), { statusCode: 404 });
      }
      const predecessor = await tx.collectiveEpoch.findUnique({ where: { id: predecessorEpochId } });
      if (!predecessor) {
        throw Object.assign(new Error('Predecessor collective epoch was not found.'), { statusCode: 404 });
      }
      if (predecessor.endedAt !== null) {
        throw new CollectiveContinuityConflictError(
          'Collective transition predecessor must be the currently active epoch.',
        );
      }

      await assertEvidenceExists(tx, transitionEvidenceArtifactId);
      await assertRosterActors(tx, collectiveActorId, roster);
      await assertOptionalJoinEvidence(tx, roster);

      const currentSnapshot = await tx.collectiveEpochMembership.findMany({
        where: { epochId: predecessor.id },
        orderBy: { memberActorId: 'asc' },
      });
      if (currentSnapshot.length === 0) {
        throw new CollectiveContinuityConflictError('Active collective epoch has no persisted roster.');
      }

      const currentPublic = currentSnapshot.map((member) => ({
        memberActorId: member.memberActorId,
        role: member.role,
        weightBps: member.weightBps,
      }));
      const nextPublic = publicRoster(roster);
      const nextRosterDigest = rosterDigest(roster);
      const constitutionDigest = requestedConstitutionDigest ?? predecessor.constitutionDigest;
      const topologyDigest = requestedTopologyDigest ?? predecessor.topologyDigest;
      const decisionPolicyDigest = requestedDecisionPolicyDigest ?? predecessor.decisionPolicyDigest;
      const memberSetChanged = !sameMemberSet(currentPublic, nextPublic);
      const membershipStateChanged = nextRosterDigest !== predecessor.rosterDigest;

      if (input.transitionKind === 'roster_change' && !memberSetChanged) {
        throw Object.assign(new Error('roster_change requires at least one member addition/removal.'), {
          statusCode: 400,
        });
      }
      if (input.transitionKind === 'role_change' && (memberSetChanged || !membershipStateChanged)) {
        throw Object.assign(
          new Error('role_change requires the same members with at least one changed role or weight.'),
          { statusCode: 400 },
        );
      }
      if (input.transitionKind === 'topology_change' && topologyDigest === predecessor.topologyDigest) {
        throw Object.assign(new Error('topology_change requires a changed topology digest.'), {
          statusCode: 400,
        });
      }
      if (
        input.transitionKind === 'constitution_change' &&
        constitutionDigest === predecessor.constitutionDigest
      ) {
        throw Object.assign(new Error('constitution_change requires a changed constitution digest.'), {
          statusCode: 400,
        });
      }

      const startedAt = input.startedAt ?? new Date();
      if (startedAt.getTime() <= predecessor.startedAt.getTime()) {
        throw Object.assign(new Error('Next collective epoch must start after its predecessor.'), {
          statusCode: 400,
        });
      }

      const nextEpochId = `cepoch_${randomUUID()}`;
      const nextSequence = predecessor.sequence + 1;
      const stateDigest = epochStateDigest({
        collectiveActorId,
        sequence: nextSequence,
        predecessorEpochId: predecessor.id,
        transitionKind: input.transitionKind,
        constitutionDigest,
        topologyDigest,
        decisionPolicyDigest,
        rosterDigest: nextRosterDigest,
        transitionEvidenceArtifactId,
        startedAt,
      });

      const activeMemberships = await tx.collectiveMembership.findMany({
        where: { collectiveActorId, leftAt: null },
        orderBy: { memberActorId: 'asc' },
      });
      const activeByActor = new Map(activeMemberships.map((membership) => [membership.memberActorId, membership]));
      const nextByActor = new Map(roster.map((member) => [member.memberActorId, member]));

      await tx.collectiveEpoch.update({
        where: { id: predecessor.id },
        data: { endedAt: startedAt },
      });
      await tx.collectiveEpoch.create({
        data: {
          id: nextEpochId,
          collectiveActorId,
          sequence: nextSequence,
          predecessorEpochId: predecessor.id,
          transitionKind: input.transitionKind,
          constitutionDigest,
          topologyDigest,
          decisionPolicyDigest,
          rosterDigest: nextRosterDigest,
          stateDigest,
          transitionEvidenceArtifactId,
          basisDigest: requestBasisDigest,
          idempotencyKey,
          startedAt,
          endedAt: null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      for (const membership of activeMemberships) {
        const next = nextByActor.get(membership.memberActorId);
        const changed = !next || next.role !== membership.role || next.weightBps !== membership.weightBps;
        if (!changed) continue;
        await tx.collectiveMembership.update({
          where: { id: membership.id },
          data: {
            leftAt: startedAt,
            leaveEpochId: nextEpochId,
            leaveEvidenceArtifactId: transitionEvidenceArtifactId,
          },
        });
        activeByActor.delete(membership.memberActorId);
      }

      for (const member of roster) {
        if (activeByActor.has(member.memberActorId)) continue;
        const membership = await tx.collectiveMembership.create({
          data: {
            id: `cmem_${randomUUID()}`,
            collectiveActorId,
            memberActorId: member.memberActorId,
            role: member.role,
            weightBps: member.weightBps,
            joinedAt: startedAt,
            leftAt: null,
            joinEpochId: nextEpochId,
            leaveEpochId: null,
            joinEvidenceArtifactId: member.joinEvidenceArtifactId ?? transitionEvidenceArtifactId,
            leaveEvidenceArtifactId: null,
            metadata: {},
          },
        });
        activeByActor.set(member.memberActorId, membership);
      }

      for (const member of roster) {
        const membership = activeByActor.get(member.memberActorId);
        if (!membership) {
          throw new Error(`Active membership resolution failed for ${member.memberActorId}.`);
        }
        await tx.collectiveEpochMembership.create({
          data: {
            epochId: nextEpochId,
            membershipId: membership.id,
            collectiveActorId,
            memberActorId: member.memberActorId,
            role: member.role,
            weightBps: member.weightBps,
            snapshotDigest: snapshotDigest({
              epochId: nextEpochId,
              membershipId: membership.id,
              collectiveActorId,
              memberActorId: member.memberActorId,
              role: member.role,
              weightBps: member.weightBps,
            }),
          },
        });
      }

      await appendCanonicalActorEvent(
        tx,
        {
          actorId: collectiveActorId,
          type: 'collective.epoch.transitioned',
          sourceKey: `collective:epoch:${idempotencyKey}`,
          occurredAt: startedAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            epochId: nextEpochId,
            sequence: nextSequence,
            predecessorEpochId: predecessor.id,
            transitionKind: input.transitionKind,
            constitutionDigest,
            topologyDigest,
            decisionPolicyDigest,
            rosterDigest: nextRosterDigest,
            stateDigest,
            memberCount: roster.length,
            transitionEvidenceArtifactId,
          },
        },
        registry.signingSecret,
      );

      return { replayed: false, summary: await summaryTx(tx, collectiveActorId) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function verifyCollectiveContinuity(collectiveActorId: string) {
  const summary = await getCollectiveContinuitySummary(collectiveActorId);
  if (!summary) {
    return { verified: false, actorId: collectiveActorId, issues: ['collective_profile_missing'], epochs: [] };
  }

  const issues: string[] = [];
  const { actor, profile, epochs, memberships } = summary;
  if (actor.actorType !== 'ORGANIZATION') issues.push('collective_actor_not_organization');
  if (actor.status === 'RETIRED') issues.push('collective_actor_retired');

  const expectedProfileDigest = profileDigest({
    actorId: profile.actorId,
    governanceMethod: profile.governanceMethod,
    formationEvidenceArtifactId: profile.formationEvidenceArtifactId,
    formedAt: profile.formedAt,
  });
  if (expectedProfileDigest !== profile.profileDigest) issues.push('profile_digest_mismatch');

  if (epochs.length === 0) issues.push('epoch_history_empty');
  const epochResults: Array<{
    epochId: string;
    sequence: number;
    rosterVerified: boolean;
    stateVerified: boolean;
    snapshotCount: number;
  }> = [];

  for (let index = 0; index < epochs.length; index += 1) {
    const epoch = epochs[index]!;
    const previous = index > 0 ? epochs[index - 1]! : null;
    if (epoch.sequence !== index + 1) issues.push(`epoch_sequence_gap:${epoch.id}`);
    if (index === 0) {
      if (epoch.predecessorEpochId !== null || epoch.transitionKind !== 'formation') {
        issues.push(`invalid_formation_epoch:${epoch.id}`);
      }
    } else if (
      !previous ||
      epoch.predecessorEpochId !== previous.id ||
      previous.endedAt?.getTime() !== epoch.startedAt.getTime()
    ) {
      issues.push(`epoch_predecessor_mismatch:${epoch.id}`);
    }
    const isLast = index === epochs.length - 1;
    if (isLast && epoch.endedAt !== null) issues.push(`latest_epoch_not_active:${epoch.id}`);
    if (!isLast && epoch.endedAt === null) issues.push(`historical_epoch_still_active:${epoch.id}`);

    const normalizedRoster = epoch.roster
      .map((member) => ({
        memberActorId: member.memberActorId,
        role: member.role,
        weightBps: member.weightBps,
        joinEvidenceArtifactId: null,
      }))
      .sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
    const expectedRosterDigest = rosterDigest(normalizedRoster);
    const rosterVerified = expectedRosterDigest === epoch.rosterDigest && epoch.roster.length > 0;
    if (!rosterVerified) issues.push(`epoch_roster_digest_mismatch:${epoch.id}`);

    let snapshotsVerified = true;
    for (const member of epoch.roster) {
      const expected = snapshotDigest({
        epochId: epoch.id,
        membershipId: member.membershipId,
        collectiveActorId: member.collectiveActorId,
        memberActorId: member.memberActorId,
        role: member.role,
        weightBps: member.weightBps,
      });
      if (expected !== member.snapshotDigest) {
        snapshotsVerified = false;
        issues.push(`epoch_snapshot_digest_mismatch:${epoch.id}:${member.memberActorId}`);
      }
    }

    const expectedStateDigest = epochStateDigest({
      collectiveActorId: epoch.collectiveActorId,
      sequence: epoch.sequence,
      predecessorEpochId: epoch.predecessorEpochId,
      transitionKind: epoch.transitionKind,
      constitutionDigest: epoch.constitutionDigest,
      topologyDigest: epoch.topologyDigest,
      decisionPolicyDigest: epoch.decisionPolicyDigest,
      rosterDigest: epoch.rosterDigest,
      transitionEvidenceArtifactId: epoch.transitionEvidenceArtifactId,
      startedAt: epoch.startedAt,
    });
    const stateVerified = expectedStateDigest === epoch.stateDigest;
    if (!stateVerified) issues.push(`epoch_state_digest_mismatch:${epoch.id}`);

    epochResults.push({
      epochId: epoch.id,
      sequence: epoch.sequence,
      rosterVerified: rosterVerified && snapshotsVerified,
      stateVerified,
      snapshotCount: epoch.roster.length,
    });
  }

  const latest = epochs.at(-1);
  if (latest) {
    const activeMemberships = memberships
      .filter((membership) => membership.leftAt === null)
      .map((membership) => ({
        memberActorId: membership.memberActorId,
        role: membership.role,
        weightBps: membership.weightBps,
      }))
      .sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
    const latestRoster = latest.roster
      .map((member) => ({
        memberActorId: member.memberActorId,
        role: member.role,
        weightBps: member.weightBps,
      }))
      .sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
    if (JSON.stringify(activeMemberships) !== JSON.stringify(latestRoster)) {
      issues.push('active_membership_latest_roster_mismatch');
    }
  }

  const tenuresByMember = new Map<string, typeof memberships>();
  for (const membership of memberships) {
    const list = tenuresByMember.get(membership.memberActorId) ?? [];
    list.push(membership);
    tenuresByMember.set(membership.memberActorId, list);
  }
  for (const [memberActorId, tenures] of tenuresByMember) {
    tenures.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    for (let index = 1; index < tenures.length; index += 1) {
      const previous = tenures[index - 1]!;
      const current = tenures[index]!;
      if (previous.leftAt === null || previous.leftAt.getTime() > current.joinedAt.getTime()) {
        issues.push(`membership_tenure_overlap:${memberActorId}`);
      }
    }
  }

  const memberIds = [...new Set(memberships.map((membership) => membership.memberActorId))];
  if (memberIds.length > 0) {
    const nested = await db.collectiveProfile.findMany({
      where: { actorId: { in: memberIds } },
      select: { actorId: true },
    });
    for (const item of nested) issues.push(`nested_collective_member:${item.actorId}`);
  }

  return {
    verified: issues.length === 0,
    actorId: collectiveActorId,
    profileDigest: profile.profileDigest,
    activeEpochId: latest?.id ?? null,
    issues,
    epochs: epochResults,
  };
}
