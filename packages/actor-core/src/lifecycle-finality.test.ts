import { describe, expect, it } from 'vitest';

import {
  assertValidActorLifecycleClosure,
  assertValidResurrectionClaim,
  assertValidResurrectionDecision,
  classifyActivityAgainstLifecycle,
  projectLifecycleFinality,
  type ActorLifecycleClosure,
  type ResurrectionClaim,
  type ResurrectionDecision,
} from './lifecycle-finality.js';

function closure(overrides: Partial<ActorLifecycleClosure> = {}): ActorLifecycleClosure {
  return {
    version: 'noeone.lifecycle-closure.v1',
    id: 'life_1',
    actorId: 'act_1',
    executionId: 'exec_old',
    kind: 'decommission',
    effectiveAt: '2026-09-13T10:00:00.000Z',
    capturedAt: '2026-09-13T10:00:01.000Z',
    sourceEvidenceArtifactId: 'evi_decommission',
    externalLifecycleRef: 'epitaph:pod:123',
    proofOfDecommissionRef: 'pod:123',
    issuedByType: 'organization',
    issuedByRef: 'ops-board:1',
    authorityEvidenceArtifactId: 'evi_ops_authority',
    continuationPolicy: 'review-required',
    basisDigest: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  };
}

function claim(overrides: Partial<ResurrectionClaim> = {}): ResurrectionClaim {
  return {
    version: 'noeone.resurrection-claim.v1',
    id: 'res_1',
    actorId: 'act_1',
    closureId: 'life_1',
    candidateExecutionId: 'exec_new',
    claimType: 'disaster-recovery',
    sourceSnapshotDigest: `sha256:${'b'.repeat(64)}`,
    sourceLineageNodeId: 'lin_7',
    continuationAuthorityRef: 'recovery-policy:7',
    recoveryEvidenceArtifactId: 'evi_recovery',
    credentialEvidenceArtifactId: 'evi_current_credential',
    stateCommitmentDigest: `sha256:${'c'.repeat(64)}`,
    claimedAt: '2026-09-13T10:10:00.000Z',
    basisDigest: `sha256:${'d'.repeat(64)}`,
    ...overrides,
  };
}

function decision(overrides: Partial<ResurrectionDecision> = {}): ResurrectionDecision {
  return {
    version: 'noeone.resurrection-decision.v1',
    id: 'resd_1',
    claimId: 'res_1',
    actorId: 'act_1',
    disposition: 'accept-same-actor',
    decidedAt: '2026-09-13T10:20:00.000Z',
    decidedByType: 'organization',
    decidedByRef: 'ops-board:1',
    authorityEvidenceArtifactId: 'evi_ops_authority',
    evidenceArtifactId: 'evi_review',
    basisDigest: `sha256:${'e'.repeat(64)}`,
    ...overrides,
  };
}

describe('Lifecycle Finality', () => {
  it('accepts an externally evidenced actor-level closure', () => {
    expect(() => assertValidActorLifecycleClosure(closure())).not.toThrow();
  });

  it('requires a recovery policy digest for preauthorized recovery', () => {
    expect(() =>
      assertValidActorLifecycleClosure(
        closure({ continuationPolicy: 'preauthorized-recovery' }),
      ),
    ).toThrow(/recoveryPolicyDigest/);

    expect(() =>
      assertValidActorLifecycleClosure(
        closure({
          continuationPolicy: 'preauthorized-recovery',
          recoveryPolicyDigest: `sha256:${'f'.repeat(64)}`,
        }),
      ),
    ).not.toThrow();
  });

  it('does not allow prohibited continuation to smuggle in a recovery policy', () => {
    expect(() =>
      assertValidActorLifecycleClosure(
        closure({
          continuationPolicy: 'prohibited',
          recoveryPolicyDigest: `sha256:${'f'.repeat(64)}`,
        }),
      ),
    ).toThrow(/cannot define a recovery policy/);
  });

  it('binds a resurrection claim to the exact actor and closure', () => {
    expect(() => assertValidResurrectionClaim(claim(), closure())).not.toThrow();
    expect(() =>
      assertValidResurrectionClaim(claim({ actorId: 'act_clone' }), closure()),
    ).toThrow(/actorId/);
    expect(() =>
      assertValidResurrectionClaim(claim({ closureId: 'life_other' }), closure()),
    ).toThrow(/closureId/);
  });

  it('rejects a resurrection claim that predates closure', () => {
    expect(() =>
      assertValidResurrectionClaim(
        claim({ claimedAt: '2026-09-13T09:59:59.000Z' }),
        closure(),
      ),
    ).toThrow(/cannot predate/);
  });

  it('treats possession of a candidate execution as a claim rather than automatic continuation', () => {
    const projected = projectLifecycleFinality(
      closure(),
      [claim()],
      [],
      '2026-09-13T10:15:00.000Z',
    );
    expect(projected).toMatchObject({
      state: 'recovery-pending',
      acceptedExecutionId: null,
      pendingClaimIds: ['res_1'],
    });
  });

  it('requires an authorized decision before same-actor recovery becomes active', () => {
    expect(() =>
      assertValidResurrectionDecision(decision(), claim(), closure()),
    ).not.toThrow();

    const projected = projectLifecycleFinality(
      closure(),
      [claim()],
      [decision()],
      '2026-09-13T10:21:00.000Z',
    );

    expect(projected).toMatchObject({
      state: 'active',
      acceptedClaimId: 'res_1',
      acceptedExecutionId: 'exec_new',
      reopenedAt: '2026-09-13T10:20:00.000Z',
    });
  });

  it('prevents same-actor acceptance when continuation is prohibited', () => {
    expect(() =>
      assertValidResurrectionDecision(
        decision(),
        claim(),
        closure({ continuationPolicy: 'prohibited' }),
      ),
    ).toThrow(/prohibits same-actor continuation/);
  });

  it('allows a claim to be rejected as a distinct actor without reopening the source actor', () => {
    const projected = projectLifecycleFinality(
      closure(),
      [claim()],
      [decision({ disposition: 'reject-distinct-actor' })],
      '2026-09-13T10:21:00.000Z',
    );

    expect(projected).toMatchObject({
      state: 'closed',
      acceptedClaimId: null,
      rejectedClaimIds: ['res_1'],
    });
  });

  it('supports additional review without prematurely accepting identity continuity', () => {
    const projected = projectLifecycleFinality(
      closure(),
      [claim()],
      [decision({ disposition: 'require-additional-review' })],
      '2026-09-13T10:21:00.000Z',
    );
    expect(projected.state).toBe('recovery-pending');
  });

  it('permits additional review followed by a later terminal decision', () => {
    const review = decision({
      id: 'resd_review',
      disposition: 'require-additional-review',
      decidedAt: '2026-09-13T10:20:00.000Z',
    });
    const accept = decision({
      id: 'resd_accept',
      decidedAt: '2026-09-13T10:30:00.000Z',
    });

    const projected = projectLifecycleFinality(
      closure(),
      [claim()],
      [review, accept],
      '2026-09-13T10:31:00.000Z',
    );
    expect(projected.state).toBe('active');
    expect(projected.reopenedAt).toBe('2026-09-13T10:30:00.000Z');
  });

  it('rejects attempts to rewrite a terminal resurrection disposition', () => {
    const accept = decision({ decidedAt: '2026-09-13T10:20:00.000Z' });
    const laterReject = decision({
      id: 'resd_2',
      disposition: 'reject-distinct-actor',
      decidedAt: '2026-09-13T10:30:00.000Z',
    });

    expect(() =>
      projectLifecycleFinality(
        closure(),
        [claim()],
        [accept, laterReject],
        '2026-09-13T10:31:00.000Z',
      ),
    ).toThrow(/after terminal disposition/);
  });

  it('rejects two candidates being accepted as the same actor for one closure', () => {
    const secondClaim = claim({
      id: 'res_2',
      candidateExecutionId: 'exec_clone',
      claimedAt: '2026-09-13T10:11:00.000Z',
    });
    const secondDecision = decision({
      id: 'resd_2',
      claimId: 'res_2',
      decidedAt: '2026-09-13T10:19:00.000Z',
    });

    expect(() =>
      projectLifecycleFinality(
        closure(),
        [claim(), secondClaim],
        [decision(), secondDecision],
        '2026-09-13T10:21:00.000Z',
      ),
    ).toThrow(/at most one accepted/);
  });

  it('rejects new resurrection claims filed after the closure was already crossed', () => {
    const laterClaim = claim({
      id: 'res_late',
      candidateExecutionId: 'exec_late',
      claimedAt: '2026-09-13T10:25:00.000Z',
    });

    expect(() =>
      projectLifecycleFinality(
        closure(),
        [claim(), laterClaim],
        [decision()],
        '2026-09-13T10:26:00.000Z',
      ),
    ).toThrow(/already been crossed/);
  });

  it('classifies post-closure/pre-recovery activity as lifecycle-inconsistent interval activity', () => {
    const closed = projectLifecycleFinality(
      closure(),
      [],
      [],
      '2026-09-13T10:10:00.000Z',
    );
    expect(
      classifyActivityAgainstLifecycle(closed, '2026-09-13T10:05:00.000Z'),
    ).toBe('closed-interval');

    const recovered = projectLifecycleFinality(
      closure(),
      [claim()],
      [decision()],
      '2026-09-13T10:30:00.000Z',
    );
    expect(
      classifyActivityAgainstLifecycle(recovered, '2026-09-13T10:05:00.000Z'),
    ).toBe('closed-interval');
    expect(
      classifyActivityAgainstLifecycle(recovered, '2026-09-13T10:25:00.000Z'),
    ).toBe('post-recovery');
  });
});
