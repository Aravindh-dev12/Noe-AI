import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  bindCollectiveAction,
  createCollective,
  getActiveCollectiveEpoch,
  getEpochRoster,
  recordCollectiveDecision,
  transitionCollective,
  validateCollectiveAggregate,
} from './collective.js';

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const base = () =>
  createCollective({
    collectiveActorId: 'act_team_north',
    constitutionDigest: digest('constitution-v1'),
    topologyDigest: digest('flat-v1'),
    decisionPolicyDigest: digest('majority-v1'),
    roster: [
      { memberActorId: 'act_alpha', role: 'strategist', weightBps: 5_000 },
      { memberActorId: 'act_beta', role: 'builder', weightBps: 5_000 },
    ],
    formationEvidenceArtifactId: 'evidence_formation',
    now: '2026-01-01T00:00:00.000Z',
  });

describe('collective actor continuity', () => {
  it('preserves collective actor identity while replacing the entire roster', () => {
    const original = base();
    const predecessor = getActiveCollectiveEpoch(original);

    const migrated = transitionCollective(original, {
      predecessorEpochId: predecessor.id,
      kind: 'roster_change',
      roster: [
        { memberActorId: 'act_gamma', role: 'strategist', weightBps: 4_000 },
        { memberActorId: 'act_delta', role: 'builder', weightBps: 6_000 },
      ],
      transitionEvidenceArtifactId: 'evidence_roster_2',
      now: '2026-02-01T00:00:00.000Z',
    });

    expect(migrated.collectiveActorId).toBe(original.collectiveActorId);
    expect(getActiveCollectiveEpoch(migrated).id).not.toBe(predecessor.id);
    expect(getEpochRoster(migrated, predecessor.id).map((member) => member.memberActorId)).toEqual([
      'act_alpha',
      'act_beta',
    ]);
    expect(
      getEpochRoster(migrated, getActiveCollectiveEpoch(migrated).id).map(
        (member) => member.memberActorId,
      ),
    ).toEqual(['act_delta', 'act_gamma']);

    validateCollectiveAggregate(migrated);
  });

  it('closes a historical membership instead of mutating it when a role changes', () => {
    const original = base();
    const predecessor = getActiveCollectiveEpoch(original);
    const alphaBefore = original.memberships.find(
      (membership) => membership.memberActorId === 'act_alpha',
    );
    expect(alphaBefore).toBeDefined();

    const changed = transitionCollective(original, {
      predecessorEpochId: predecessor.id,
      kind: 'role_change',
      roster: [
        { memberActorId: 'act_alpha', role: 'lead', weightBps: 5_000 },
        { memberActorId: 'act_beta', role: 'builder', weightBps: 5_000 },
      ],
      transitionEvidenceArtifactId: 'evidence_role_change',
      now: '2026-03-01T00:00:00.000Z',
    });

    const alphaPeriods = changed.memberships.filter(
      (membership) => membership.memberActorId === 'act_alpha',
    );
    expect(alphaPeriods).toHaveLength(2);
    expect(alphaPeriods.find((period) => period.id === alphaBefore?.id)?.role).toBe('strategist');
    expect(alphaPeriods.find((period) => period.id === alphaBefore?.id)?.leftAt).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect(alphaPeriods.find((period) => period.leftAt === null)?.role).toBe('lead');
  });

  it('rejects self-membership and duplicate members', () => {
    expect(() =>
      createCollective({
        collectiveActorId: 'act_team',
        constitutionDigest: digest('c'),
        topologyDigest: digest('t'),
        decisionPolicyDigest: digest('d'),
        roster: [{ memberActorId: 'act_team', role: 'member' }],
      }),
    ).toThrow('cannot be a member of itself');

    expect(() =>
      createCollective({
        collectiveActorId: 'act_team',
        constitutionDigest: digest('c'),
        topologyDigest: digest('t'),
        decisionPolicyDigest: digest('d'),
        roster: [
          { memberActorId: 'act_a', role: 'one' },
          { memberActorId: 'act_a', role: 'two' },
        ],
      }),
    ).toThrow('Duplicate collective member');
  });

  it('rejects stale predecessor epochs', () => {
    const original = base();
    expect(() =>
      transitionCollective(original, {
        predecessorEpochId: 'cepoch_stale',
        kind: 'roster_change',
        roster: [{ memberActorId: 'act_gamma', role: 'member' }],
        transitionEvidenceArtifactId: 'evidence_change',
      }),
    ).toThrow('predecessor must equal the active epoch');
  });

  it('refuses to disguise merger, split, or dissolution as ordinary continuation', () => {
    const original = base();
    const epoch = getActiveCollectiveEpoch(original);

    for (const kind of ['merge', 'split', 'dissolution'] as const) {
      expect(() =>
        transitionCollective(original, {
          predecessorEpochId: epoch.id,
          kind,
          transitionEvidenceArtifactId: 'evidence_terminal',
        }),
      ).toThrow('not an ordinary collective continuation');
    }
  });

  it('binds member actions only to members present in the exact epoch', () => {
    const original = base();
    const firstEpoch = getActiveCollectiveEpoch(original);
    const changed = transitionCollective(original, {
      predecessorEpochId: firstEpoch.id,
      kind: 'roster_change',
      roster: [{ memberActorId: 'act_gamma', role: 'operator' }],
      transitionEvidenceArtifactId: 'evidence_roster_2',
      now: '2026-04-01T00:00:00.000Z',
    });
    const secondEpoch = getActiveCollectiveEpoch(changed);

    expect(
      bindCollectiveAction(changed, {
        epochId: firstEpoch.id,
        capacity: 'member_on_behalf',
        memberActorId: 'act_alpha',
        sourceEvidenceArtifactId: 'evidence_action_1',
      }).memberActorId,
    ).toBe('act_alpha');

    expect(() =>
      bindCollectiveAction(changed, {
        epochId: secondEpoch.id,
        capacity: 'member_on_behalf',
        memberActorId: 'act_alpha',
        sourceEvidenceArtifactId: 'evidence_action_2',
      }),
    ).toThrow('requires a member present in the exact collective epoch');
  });

  it('requires collective decisions to name participants from the exact epoch', () => {
    const aggregate = base();
    const epoch = getActiveCollectiveEpoch(aggregate);

    const recorded = recordCollectiveDecision(aggregate, {
      epochId: epoch.id,
      decisionType: 'strategy.approve',
      proposalDigest: digest('proposal'),
      method: 'weighted-majority',
      outcomeDigest: digest('approved'),
      quorumBps: 7_500,
      evidenceArtifactId: 'evidence_decision',
      participants: [
        { memberActorId: 'act_alpha', position: 'approve' },
        { memberActorId: 'act_beta', position: 'approve' },
      ],
      decidedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(recorded.decision.collectiveActorId).toBe('act_team_north');
    expect(recorded.participation).toHaveLength(2);
    expect(recorded.participation[0]?.role).toBe('strategist');

    expect(() =>
      recordCollectiveDecision(aggregate, {
        epochId: epoch.id,
        decisionType: 'strategy.approve',
        proposalDigest: digest('proposal-2'),
        method: 'weighted-majority',
        outcomeDigest: digest('approved-2'),
        evidenceArtifactId: 'evidence_decision_2',
        participants: [{ memberActorId: 'act_outsider', position: 'approve' }],
      }),
    ).toThrow('was not a member of epoch');
  });

  it('rejects semantic no-op transition labels', () => {
    const aggregate = base();
    const epoch = getActiveCollectiveEpoch(aggregate);

    expect(() =>
      transitionCollective(aggregate, {
        predecessorEpochId: epoch.id,
        kind: 'topology_change',
        topologyDigest: epoch.topologyDigest,
        transitionEvidenceArtifactId: 'evidence_noop',
      }),
    ).toThrow('requires a changed topology digest');
  });
});
