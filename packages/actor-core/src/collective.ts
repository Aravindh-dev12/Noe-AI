import { createHash, randomUUID } from 'node:crypto';

export type CollectiveTransitionKind =
  | 'formation'
  | 'roster_change'
  | 'role_change'
  | 'topology_change'
  | 'constitution_change'
  | 'control_change'
  | 'restore'
  | 'merge'
  | 'split'
  | 'dissolution';

export type CollectiveActionCapacity =
  | 'collective_direct'
  | 'member_on_behalf'
  | 'member_personal'
  | 'disputed';

export type CollectiveMemberSpec = {
  memberActorId: string;
  role: string;
  weightBps?: number | null;
};

export type CollectiveEpoch = {
  id: string;
  collectiveActorId: string;
  sequence: number;
  predecessorEpochId: string | null;
  transitionKind: CollectiveTransitionKind;
  constitutionDigest: string;
  topologyDigest: string;
  decisionPolicyDigest: string;
  rosterDigest: string;
  transitionEvidenceArtifactId: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type CollectiveMembership = {
  id: string;
  collectiveActorId: string;
  memberActorId: string;
  role: string;
  weightBps: number | null;
  joinedAt: string;
  leftAt: string | null;
  joinEpochId: string;
  leaveEpochId: string | null;
};

export type CollectiveEpochMembership = {
  epochId: string;
  membershipId: string;
  memberActorId: string;
  role: string;
  weightBps: number | null;
};

export type CollectiveDecision = {
  id: string;
  collectiveActorId: string;
  epochId: string;
  decisionType: string;
  proposalDigest: string;
  method: string;
  outcomeDigest: string;
  quorumBps: number | null;
  evidenceArtifactId: string;
  decidedAt: string;
};

export type CollectiveDecisionParticipation = {
  decisionId: string;
  memberActorId: string;
  role: string;
  position: string | null;
  weightBps: number | null;
  evidenceArtifactId: string | null;
};

export type CollectiveActionBinding = {
  collectiveActorId: string;
  epochId: string;
  capacity: CollectiveActionCapacity;
  memberActorId: string | null;
  sourceEvidenceArtifactId: string;
};

export type CollectiveAggregate = {
  collectiveActorId: string;
  epochs: readonly CollectiveEpoch[];
  memberships: readonly CollectiveMembership[];
  epochMemberships: readonly CollectiveEpochMembership[];
};

export type CreateCollectiveInput = {
  collectiveActorId: string;
  constitutionDigest: string;
  topologyDigest: string;
  decisionPolicyDigest: string;
  roster: readonly CollectiveMemberSpec[];
  formationEvidenceArtifactId?: string | null;
  now?: string;
};

export type TransitionCollectiveInput = {
  predecessorEpochId: string;
  kind: Exclude<CollectiveTransitionKind, 'formation'>;
  roster?: readonly CollectiveMemberSpec[];
  constitutionDigest?: string;
  topologyDigest?: string;
  decisionPolicyDigest?: string;
  transitionEvidenceArtifactId: string;
  now?: string;
};

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function digestValue(value: string, name: string): string {
  const normalized = value.trim().toLowerCase();
  if (!DIGEST_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a sha256:<64 lowercase hex> digest.`);
  }
  return normalized;
}

function validWeight(weightBps: number | null): void {
  if (weightBps === null) return;
  if (!Number.isInteger(weightBps) || weightBps < 0 || weightBps > 10_000) {
    throw new Error('Member weightBps must be an integer between 0 and 10000.');
  }
}

function normalizeRoster(
  collectiveActorId: string,
  roster: readonly CollectiveMemberSpec[],
): Array<{ memberActorId: string; role: string; weightBps: number | null }> {
  if (roster.length === 0) throw new Error('A collective epoch must contain at least one member.');

  const seen = new Set<string>();
  const normalized = roster.map((entry) => {
    const memberActorId = nonEmpty(entry.memberActorId, 'memberActorId');
    if (memberActorId === collectiveActorId) {
      throw new Error('A collective actor cannot be a member of itself.');
    }
    if (seen.has(memberActorId)) throw new Error(`Duplicate collective member: ${memberActorId}.`);
    seen.add(memberActorId);

    const weightBps = entry.weightBps ?? null;
    validWeight(weightBps);
    return {
      memberActorId,
      role: nonEmpty(entry.role, 'member role'),
      weightBps,
    };
  });

  return normalized.sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
}

export function digestCollectiveRoster(roster: readonly CollectiveMemberSpec[]): string {
  const normalized = roster
    .map((entry) => ({
      memberActorId: entry.memberActorId.trim(),
      role: entry.role.trim(),
      weightBps: entry.weightBps ?? null,
    }))
    .sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));

  return `sha256:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
}

export function createCollective(input: CreateCollectiveInput): CollectiveAggregate {
  const collectiveActorId = nonEmpty(input.collectiveActorId, 'collectiveActorId');
  const now = input.now ?? new Date().toISOString();
  const roster = normalizeRoster(collectiveActorId, input.roster);
  const epochId = `cepoch_${randomUUID()}`;

  const memberships: CollectiveMembership[] = roster.map((member) => ({
    id: `cmem_${randomUUID()}`,
    collectiveActorId,
    memberActorId: member.memberActorId,
    role: member.role,
    weightBps: member.weightBps,
    joinedAt: now,
    leftAt: null,
    joinEpochId: epochId,
    leaveEpochId: null,
  }));
  const byActor = new Map(memberships.map((membership) => [membership.memberActorId, membership]));

  const aggregate: CollectiveAggregate = {
    collectiveActorId,
    epochs: [
      {
        id: epochId,
        collectiveActorId,
        sequence: 1,
        predecessorEpochId: null,
        transitionKind: 'formation',
        constitutionDigest: digestValue(input.constitutionDigest, 'constitutionDigest'),
        topologyDigest: digestValue(input.topologyDigest, 'topologyDigest'),
        decisionPolicyDigest: digestValue(input.decisionPolicyDigest, 'decisionPolicyDigest'),
        rosterDigest: digestCollectiveRoster(roster),
        transitionEvidenceArtifactId: input.formationEvidenceArtifactId ?? null,
        startedAt: now,
        endedAt: null,
      },
    ],
    memberships,
    epochMemberships: roster.map((member) => {
      const membership = byActor.get(member.memberActorId);
      if (!membership) throw new Error('Collective membership construction failed.');
      return {
        epochId,
        membershipId: membership.id,
        memberActorId: member.memberActorId,
        role: member.role,
        weightBps: member.weightBps,
      };
    }),
  };

  validateCollectiveAggregate(aggregate);
  return aggregate;
}

export function getActiveCollectiveEpoch(aggregate: CollectiveAggregate): CollectiveEpoch {
  const active = aggregate.epochs.filter((epoch) => epoch.endedAt === null);
  if (active.length !== 1) {
    throw new Error(`Expected exactly one active collective epoch, found ${active.length}.`);
  }
  const epoch = active[0];
  if (!epoch) throw new Error('Active collective epoch not found.');
  return epoch;
}

export function getEpochRoster(
  aggregate: CollectiveAggregate,
  epochId: string,
): readonly CollectiveEpochMembership[] {
  if (!aggregate.epochs.some((epoch) => epoch.id === epochId)) {
    throw new Error(`Unknown collective epoch: ${epochId}.`);
  }
  return aggregate.epochMemberships
    .filter((entry) => entry.epochId === epochId)
    .slice()
    .sort((a, b) => a.memberActorId.localeCompare(b.memberActorId));
}

function assertOrdinaryTransition(kind: Exclude<CollectiveTransitionKind, 'formation'>): void {
  if (kind === 'merge' || kind === 'split' || kind === 'dissolution') {
    throw new Error(
      `${kind} is not an ordinary collective continuation; use ancestry/resolution semantics instead.`,
    );
  }
}

export function transitionCollective(
  aggregate: CollectiveAggregate,
  input: TransitionCollectiveInput,
): CollectiveAggregate {
  validateCollectiveAggregate(aggregate);
  assertOrdinaryTransition(input.kind);

  const active = getActiveCollectiveEpoch(aggregate);
  if (input.predecessorEpochId !== active.id) {
    throw new Error('Collective transition predecessor must equal the active epoch.');
  }

  const now = input.now ?? new Date().toISOString();
  const currentRoster = getEpochRoster(aggregate, active.id).map((member) => ({
    memberActorId: member.memberActorId,
    role: member.role,
    weightBps: member.weightBps,
  }));
  const nextRoster = normalizeRoster(aggregate.collectiveActorId, input.roster ?? currentRoster);
  const constitutionDigest = digestValue(
    input.constitutionDigest ?? active.constitutionDigest,
    'constitutionDigest',
  );
  const topologyDigest = digestValue(input.topologyDigest ?? active.topologyDigest, 'topologyDigest');
  const decisionPolicyDigest = digestValue(
    input.decisionPolicyDigest ?? active.decisionPolicyDigest,
    'decisionPolicyDigest',
  );
  const rosterDigest = digestCollectiveRoster(nextRoster);

  if (input.kind === 'roster_change' && rosterDigest === active.rosterDigest) {
    throw new Error('roster_change requires a changed roster.');
  }
  if (input.kind === 'role_change' && rosterDigest === active.rosterDigest) {
    throw new Error('role_change requires changed role or weight membership state.');
  }
  if (input.kind === 'topology_change' && topologyDigest === active.topologyDigest) {
    throw new Error('topology_change requires a changed topology digest.');
  }
  if (input.kind === 'constitution_change' && constitutionDigest === active.constitutionDigest) {
    throw new Error('constitution_change requires a changed constitution digest.');
  }

  const nextEpochId = `cepoch_${randomUUID()}`;
  const nextByActor = new Map(nextRoster.map((member) => [member.memberActorId, member]));
  const memberships: CollectiveMembership[] = aggregate.memberships.map((membership) => {
    if (membership.leftAt !== null) return membership;
    const next = nextByActor.get(membership.memberActorId);
    if (!next || next.role !== membership.role || next.weightBps !== membership.weightBps) {
      return { ...membership, leftAt: now, leaveEpochId: nextEpochId };
    }
    return membership;
  });

  const activeMembershipByActor = new Map(
    memberships
      .filter((membership) => membership.leftAt === null)
      .map((membership) => [membership.memberActorId, membership]),
  );

  for (const member of nextRoster) {
    if (activeMembershipByActor.has(member.memberActorId)) continue;
    const membership: CollectiveMembership = {
      id: `cmem_${randomUUID()}`,
      collectiveActorId: aggregate.collectiveActorId,
      memberActorId: member.memberActorId,
      role: member.role,
      weightBps: member.weightBps,
      joinedAt: now,
      leftAt: null,
      joinEpochId: nextEpochId,
      leaveEpochId: null,
    };
    memberships.push(membership);
    activeMembershipByActor.set(member.memberActorId, membership);
  }

  const next: CollectiveAggregate = {
    collectiveActorId: aggregate.collectiveActorId,
    epochs: [
      ...aggregate.epochs.map((epoch) =>
        epoch.id === active.id ? { ...epoch, endedAt: now } : epoch,
      ),
      {
        id: nextEpochId,
        collectiveActorId: aggregate.collectiveActorId,
        sequence: active.sequence + 1,
        predecessorEpochId: active.id,
        transitionKind: input.kind,
        constitutionDigest,
        topologyDigest,
        decisionPolicyDigest,
        rosterDigest,
        transitionEvidenceArtifactId: nonEmpty(
          input.transitionEvidenceArtifactId,
          'transitionEvidenceArtifactId',
        ),
        startedAt: now,
        endedAt: null,
      },
    ],
    memberships,
    epochMemberships: [
      ...aggregate.epochMemberships,
      ...nextRoster.map((member) => {
        const membership = activeMembershipByActor.get(member.memberActorId);
        if (!membership) throw new Error('Failed to resolve active membership for next epoch.');
        return {
          epochId: nextEpochId,
          membershipId: membership.id,
          memberActorId: member.memberActorId,
          role: member.role,
          weightBps: member.weightBps,
        } satisfies CollectiveEpochMembership;
      }),
    ],
  };

  validateCollectiveAggregate(next);
  return next;
}

export function bindCollectiveAction(
  aggregate: CollectiveAggregate,
  input: {
    epochId: string;
    capacity: CollectiveActionCapacity;
    memberActorId?: string | null;
    sourceEvidenceArtifactId: string;
  },
): CollectiveActionBinding {
  if (!aggregate.epochs.some((epoch) => epoch.id === input.epochId)) {
    throw new Error(`Unknown collective epoch: ${input.epochId}.`);
  }

  const memberActorId = input.memberActorId ?? null;
  const member = memberActorId
    ? getEpochRoster(aggregate, input.epochId).find((entry) => entry.memberActorId === memberActorId)
    : undefined;

  if (input.capacity === 'member_on_behalf' || input.capacity === 'member_personal') {
    if (!memberActorId || !member) {
      throw new Error(`${input.capacity} requires a member present in the exact collective epoch.`);
    }
  }
  if (input.capacity === 'collective_direct' && memberActorId !== null) {
    throw new Error('collective_direct must not masquerade a member action as a direct collective action.');
  }

  return {
    collectiveActorId: aggregate.collectiveActorId,
    epochId: input.epochId,
    capacity: input.capacity,
    memberActorId,
    sourceEvidenceArtifactId: nonEmpty(input.sourceEvidenceArtifactId, 'sourceEvidenceArtifactId'),
  };
}

export function recordCollectiveDecision(
  aggregate: CollectiveAggregate,
  input: {
    epochId: string;
    decisionType: string;
    proposalDigest: string;
    method: string;
    outcomeDigest: string;
    quorumBps?: number | null;
    evidenceArtifactId: string;
    participants: ReadonlyArray<{
      memberActorId: string;
      position?: string | null;
      evidenceArtifactId?: string | null;
    }>;
    decidedAt?: string;
  },
): { decision: CollectiveDecision; participation: readonly CollectiveDecisionParticipation[] } {
  const roster = getEpochRoster(aggregate, input.epochId);
  const rosterByActor = new Map(roster.map((entry) => [entry.memberActorId, entry]));
  const quorumBps = input.quorumBps ?? null;
  if (quorumBps !== null && (!Number.isInteger(quorumBps) || quorumBps < 0 || quorumBps > 10_000)) {
    throw new Error('quorumBps must be an integer between 0 and 10000.');
  }

  const decisionId = `cdec_${randomUUID()}`;
  const seen = new Set<string>();
  const participation = input.participants.map((participant) => {
    if (seen.has(participant.memberActorId)) {
      throw new Error(`Duplicate decision participant: ${participant.memberActorId}.`);
    }
    seen.add(participant.memberActorId);
    const member = rosterByActor.get(participant.memberActorId);
    if (!member) {
      throw new Error(
        `Decision participant ${participant.memberActorId} was not a member of epoch ${input.epochId}.`,
      );
    }
    return {
      decisionId,
      memberActorId: participant.memberActorId,
      role: member.role,
      position: participant.position ?? null,
      weightBps: member.weightBps,
      evidenceArtifactId: participant.evidenceArtifactId ?? null,
    } satisfies CollectiveDecisionParticipation;
  });

  if (participation.length === 0) {
    throw new Error('A collective decision must identify at least one participating member.');
  }

  return {
    decision: {
      id: decisionId,
      collectiveActorId: aggregate.collectiveActorId,
      epochId: input.epochId,
      decisionType: nonEmpty(input.decisionType, 'decisionType'),
      proposalDigest: digestValue(input.proposalDigest, 'proposalDigest'),
      method: nonEmpty(input.method, 'decision method'),
      outcomeDigest: digestValue(input.outcomeDigest, 'outcomeDigest'),
      quorumBps,
      evidenceArtifactId: nonEmpty(input.evidenceArtifactId, 'evidenceArtifactId'),
      decidedAt: input.decidedAt ?? new Date().toISOString(),
    },
    participation,
  };
}

export function validateCollectiveAggregate(aggregate: CollectiveAggregate): void {
  nonEmpty(aggregate.collectiveActorId, 'collectiveActorId');
  if (aggregate.epochs.length === 0) throw new Error('Collective must contain at least one epoch.');

  const epochs = aggregate.epochs.slice().sort((a, b) => a.sequence - b.sequence);
  const ids = new Set<string>();
  let activeCount = 0;

  for (let index = 0; index < epochs.length; index += 1) {
    const epoch = epochs[index];
    if (!epoch) throw new Error('Collective epoch sequence contains a gap.');
    if (epoch.collectiveActorId !== aggregate.collectiveActorId) {
      throw new Error('Collective epoch belongs to a different actor.');
    }
    if (ids.has(epoch.id)) throw new Error(`Duplicate collective epoch id: ${epoch.id}.`);
    ids.add(epoch.id);

    const expectedSequence = index + 1;
    if (epoch.sequence !== expectedSequence) {
      throw new Error(`Collective epoch sequence must be contiguous; expected ${expectedSequence}.`);
    }
    if (expectedSequence === 1) {
      if (epoch.predecessorEpochId !== null || epoch.transitionKind !== 'formation') {
        throw new Error('First collective epoch must be a formation with no predecessor.');
      }
    } else {
      const predecessor = epochs[index - 1];
      if (!predecessor || epoch.predecessorEpochId !== predecessor.id) {
        throw new Error('Collective epoch predecessor chain is invalid.');
      }
    }

    if (epoch.endedAt === null) activeCount += 1;
    digestValue(epoch.constitutionDigest, 'constitutionDigest');
    digestValue(epoch.topologyDigest, 'topologyDigest');
    digestValue(epoch.decisionPolicyDigest, 'decisionPolicyDigest');
    digestValue(epoch.rosterDigest, 'rosterDigest');

    const roster = aggregate.epochMemberships.filter((entry) => entry.epochId === epoch.id);
    if (roster.length === 0) throw new Error(`Collective epoch ${epoch.id} has an empty roster.`);
    const memberIds = new Set<string>();
    for (const entry of roster) {
      if (entry.memberActorId === aggregate.collectiveActorId) {
        throw new Error('A collective actor cannot be a member of itself.');
      }
      if (memberIds.has(entry.memberActorId)) {
        throw new Error(`Duplicate member in epoch ${epoch.id}: ${entry.memberActorId}.`);
      }
      memberIds.add(entry.memberActorId);
      const membership = aggregate.memberships.find((candidate) => candidate.id === entry.membershipId);
      if (!membership) throw new Error(`Missing membership ${entry.membershipId}.`);
      if (
        membership.collectiveActorId !== aggregate.collectiveActorId ||
        membership.memberActorId !== entry.memberActorId ||
        membership.role !== entry.role ||
        membership.weightBps !== entry.weightBps
      ) {
        throw new Error(`Epoch membership ${entry.membershipId} does not match its tenure record.`);
      }
    }

    if (digestCollectiveRoster(roster) !== epoch.rosterDigest) {
      throw new Error(`Collective epoch ${epoch.id} roster digest does not match its members.`);
    }
  }

  if (activeCount !== 1) {
    throw new Error(`Expected exactly one active collective epoch, found ${activeCount}.`);
  }

  const activeMemberships = aggregate.memberships.filter((membership) => membership.leftAt === null);
  const activeIds = new Set<string>();
  for (const membership of activeMemberships) {
    if (membership.collectiveActorId !== aggregate.collectiveActorId) {
      throw new Error('Membership belongs to a different collective actor.');
    }
    if (activeIds.has(membership.memberActorId)) {
      throw new Error(`Duplicate active membership for ${membership.memberActorId}.`);
    }
    activeIds.add(membership.memberActorId);
  }

  const activeEpoch = epochs.at(-1);
  if (!activeEpoch || activeEpoch.endedAt !== null) {
    throw new Error('The terminal collective epoch must be active.');
  }
  const epochActiveIds = new Set(
    aggregate.epochMemberships
      .filter((entry) => entry.epochId === activeEpoch.id)
      .map((entry) => entry.memberActorId),
  );
  if (epochActiveIds.size !== activeIds.size) {
    throw new Error('Active membership tenures do not match the active epoch roster.');
  }
  for (const memberActorId of epochActiveIds) {
    if (!activeIds.has(memberActorId)) {
      throw new Error('Active epoch contains a member without an active membership tenure.');
    }
  }
}
