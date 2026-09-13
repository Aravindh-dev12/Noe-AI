export type LifecycleClosureKind =
  | 'retirement'
  | 'revocation'
  | 'decommission'
  | 'lost-control'
  | 'owner-cessation';

export type LifecycleContinuationPolicy =
  | 'prohibited'
  | 'review-required'
  | 'preauthorized-recovery';

export type ResurrectionClaimType =
  | 'same-actor-recovery'
  | 'restore-from-checkpoint'
  | 'key-recovery'
  | 'host-recovery'
  | 'disaster-recovery';

export type ResurrectionDisposition =
  | 'accept-same-actor'
  | 'reject-distinct-actor'
  | 'require-additional-review';

export type ActorLifecycleClosure = {
  version: 'noeone.lifecycle-closure.v1';
  id: string;
  actorId: string;
  executionId?: string;
  kind: LifecycleClosureKind;
  effectiveAt: string;
  capturedAt: string;
  sourceEvidenceArtifactId: string;
  externalLifecycleRef?: string;
  proofOfDecommissionRef?: string;
  reasonCode?: string;
  issuedByType: string;
  issuedByRef: string;
  authorityEvidenceArtifactId: string;
  continuationPolicy: LifecycleContinuationPolicy;
  recoveryPolicyDigest?: string;
  basisDigest: string;
};

export type ResurrectionClaim = {
  version: 'noeone.resurrection-claim.v1';
  id: string;
  actorId: string;
  closureId: string;
  candidateExecutionId: string;
  claimType: ResurrectionClaimType;
  sourceSnapshotDigest?: string;
  sourceLineageNodeId: string;
  continuationAuthorityRef: string;
  recoveryEvidenceArtifactId: string;
  credentialEvidenceArtifactId?: string;
  stateCommitmentDigest?: string;
  claimedAt: string;
  basisDigest: string;
};

export type ResurrectionDecision = {
  version: 'noeone.resurrection-decision.v1';
  id: string;
  claimId: string;
  actorId: string;
  disposition: ResurrectionDisposition;
  decidedAt: string;
  decidedByType: string;
  decidedByRef: string;
  authorityEvidenceArtifactId: string;
  evidenceArtifactId: string;
  basisDigest: string;
};

export type LifecycleFinalityState = 'closed' | 'recovery-pending' | 'active';

export type LifecycleFinalityProjection = {
  actorId: string;
  closureId: string;
  state: LifecycleFinalityState;
  effectiveAt: string;
  acceptedClaimId: string | null;
  acceptedExecutionId: string | null;
  reopenedAt: string | null;
  pendingClaimIds: readonly string[];
  rejectedClaimIds: readonly string[];
};

export type LifecycleActivityClassification =
  | 'pre-closure'
  | 'closed-interval'
  | 'post-recovery';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/i;

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function assertSha256(value: string, field: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${field} must be a sha256 digest.`);
  }
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp.`);
  return parsed;
}

export function assertValidActorLifecycleClosure(record: ActorLifecycleClosure): void {
  if (record.version !== 'noeone.lifecycle-closure.v1') {
    throw new Error('Unsupported lifecycle closure version.');
  }

  assertNonEmpty(record.id, 'id');
  assertNonEmpty(record.actorId, 'actorId');
  if (record.executionId !== undefined) assertNonEmpty(record.executionId, 'executionId');
  assertNonEmpty(record.sourceEvidenceArtifactId, 'sourceEvidenceArtifactId');
  assertNonEmpty(record.issuedByType, 'issuedByType');
  assertNonEmpty(record.issuedByRef, 'issuedByRef');
  assertNonEmpty(record.authorityEvidenceArtifactId, 'authorityEvidenceArtifactId');
  assertSha256(record.basisDigest, 'basisDigest');

  const effectiveAt = timestamp(record.effectiveAt, 'effectiveAt');
  const capturedAt = timestamp(record.capturedAt, 'capturedAt');
  if (capturedAt < effectiveAt) {
    throw new Error('capturedAt cannot precede effectiveAt.');
  }

  if (record.recoveryPolicyDigest !== undefined) {
    assertSha256(record.recoveryPolicyDigest, 'recoveryPolicyDigest');
  }

  if (
    record.continuationPolicy === 'preauthorized-recovery' &&
    record.recoveryPolicyDigest === undefined
  ) {
    throw new Error('Preauthorized recovery requires recoveryPolicyDigest.');
  }

  if (record.continuationPolicy === 'prohibited' && record.recoveryPolicyDigest !== undefined) {
    throw new Error('A prohibited-continuation closure cannot define a recovery policy.');
  }
}

export function assertValidResurrectionClaim(
  claim: ResurrectionClaim,
  closure: ActorLifecycleClosure,
): void {
  assertValidActorLifecycleClosure(closure);

  if (claim.version !== 'noeone.resurrection-claim.v1') {
    throw new Error('Unsupported resurrection claim version.');
  }

  assertNonEmpty(claim.id, 'claim.id');
  assertNonEmpty(claim.actorId, 'claim.actorId');
  assertNonEmpty(claim.closureId, 'claim.closureId');
  assertNonEmpty(claim.candidateExecutionId, 'claim.candidateExecutionId');
  assertNonEmpty(claim.sourceLineageNodeId, 'claim.sourceLineageNodeId');
  assertNonEmpty(claim.continuationAuthorityRef, 'claim.continuationAuthorityRef');
  assertNonEmpty(claim.recoveryEvidenceArtifactId, 'claim.recoveryEvidenceArtifactId');
  assertSha256(claim.basisDigest, 'claim.basisDigest');

  if (claim.sourceSnapshotDigest !== undefined) {
    assertSha256(claim.sourceSnapshotDigest, 'claim.sourceSnapshotDigest');
  }
  if (claim.stateCommitmentDigest !== undefined) {
    assertSha256(claim.stateCommitmentDigest, 'claim.stateCommitmentDigest');
  }

  if (claim.actorId !== closure.actorId) {
    throw new Error('Resurrection claim actorId does not match lifecycle closure actorId.');
  }
  if (claim.closureId !== closure.id) {
    throw new Error('Resurrection claim closureId does not match lifecycle closure.');
  }

  const claimedAt = timestamp(claim.claimedAt, 'claim.claimedAt');
  if (claimedAt < timestamp(closure.effectiveAt, 'closure.effectiveAt')) {
    throw new Error('A resurrection claim cannot predate lifecycle closure.');
  }
}

export function assertValidResurrectionDecision(
  decision: ResurrectionDecision,
  claim: ResurrectionClaim,
  closure: ActorLifecycleClosure,
): void {
  assertValidResurrectionClaim(claim, closure);

  if (decision.version !== 'noeone.resurrection-decision.v1') {
    throw new Error('Unsupported resurrection decision version.');
  }

  assertNonEmpty(decision.id, 'decision.id');
  assertNonEmpty(decision.claimId, 'decision.claimId');
  assertNonEmpty(decision.actorId, 'decision.actorId');
  assertNonEmpty(decision.decidedByType, 'decision.decidedByType');
  assertNonEmpty(decision.decidedByRef, 'decision.decidedByRef');
  assertNonEmpty(decision.authorityEvidenceArtifactId, 'decision.authorityEvidenceArtifactId');
  assertNonEmpty(decision.evidenceArtifactId, 'decision.evidenceArtifactId');
  assertSha256(decision.basisDigest, 'decision.basisDigest');

  if (decision.claimId !== claim.id) {
    throw new Error('Resurrection decision claimId does not match claim.');
  }
  if (decision.actorId !== claim.actorId) {
    throw new Error('Resurrection decision actorId does not match claim.');
  }

  if (timestamp(decision.decidedAt, 'decision.decidedAt') < timestamp(claim.claimedAt, 'claim.claimedAt')) {
    throw new Error('A resurrection decision cannot predate its claim.');
  }

  if (
    decision.disposition === 'accept-same-actor' &&
    closure.continuationPolicy === 'prohibited'
  ) {
    throw new Error('This lifecycle closure prohibits same-actor continuation.');
  }
}

type ClaimDecisionState = {
  terminal: 'accepted' | 'rejected' | null;
  terminalDecision: ResurrectionDecision | null;
  pending: boolean;
};

function projectClaimDecisionState(
  claim: ResurrectionClaim,
  decisions: readonly ResurrectionDecision[],
  closure: ActorLifecycleClosure,
  atMs: number,
): ClaimDecisionState {
  const applicable = decisions
    .filter(
      (decision) =>
        decision.claimId === claim.id &&
        timestamp(decision.decidedAt, 'decision.decidedAt') <= atMs,
    )
    .sort(
      (a, b) =>
        timestamp(a.decidedAt, 'decision.decidedAt') -
          timestamp(b.decidedAt, 'decision.decidedAt') ||
        a.id.localeCompare(b.id),
    );

  let terminal: 'accepted' | 'rejected' | null = null;
  let terminalDecision: ResurrectionDecision | null = null;
  let pending = true;

  for (const decision of applicable) {
    assertValidResurrectionDecision(decision, claim, closure);
    if (terminal !== null) {
      throw new Error(
        `Resurrection claim ${claim.id} has a decision after terminal disposition ${terminal}.`,
      );
    }

    if (decision.disposition === 'accept-same-actor') {
      terminal = 'accepted';
      terminalDecision = decision;
      pending = false;
    } else if (decision.disposition === 'reject-distinct-actor') {
      terminal = 'rejected';
      terminalDecision = decision;
      pending = false;
    } else {
      pending = true;
    }
  }

  return { terminal, terminalDecision, pending };
}

export function projectLifecycleFinality(
  closure: ActorLifecycleClosure,
  claims: readonly ResurrectionClaim[],
  decisions: readonly ResurrectionDecision[],
  at: string,
): LifecycleFinalityProjection {
  assertValidActorLifecycleClosure(closure);
  const atMs = timestamp(at, 'at');
  const effectiveAt = timestamp(closure.effectiveAt, 'closure.effectiveAt');

  if (atMs < effectiveAt) {
    throw new Error('Lifecycle finality projection time cannot precede closure effectiveAt.');
  }

  const applicableClaims = claims
    .filter((claim) => timestamp(claim.claimedAt, 'claim.claimedAt') <= atMs)
    .sort(
      (a, b) =>
        timestamp(a.claimedAt, 'claim.claimedAt') - timestamp(b.claimedAt, 'claim.claimedAt') ||
        a.id.localeCompare(b.id),
    );

  const accepted: Array<{ claim: ResurrectionClaim; decision: ResurrectionDecision }> = [];
  const pendingClaimIds: string[] = [];
  const rejectedClaimIds: string[] = [];

  for (const claim of applicableClaims) {
    assertValidResurrectionClaim(claim, closure);
    const projected = projectClaimDecisionState(claim, decisions, closure, atMs);
    if (projected.terminal === 'accepted' && projected.terminalDecision) {
      accepted.push({ claim, decision: projected.terminalDecision });
    } else if (projected.terminal === 'rejected') {
      rejectedClaimIds.push(claim.id);
    } else if (projected.pending) {
      pendingClaimIds.push(claim.id);
    }
  }

  if (accepted.length > 1) {
    throw new Error('V1 permits at most one accepted same-actor continuation per lifecycle closure.');
  }

  const acceptedContinuation = accepted[0] ?? null;
  if (acceptedContinuation) {
    const reopenedAt = acceptedContinuation.decision.decidedAt;
    const postAcceptanceClaim = applicableClaims.find(
      (claim) => timestamp(claim.claimedAt, 'claim.claimedAt') > timestamp(reopenedAt, 'reopenedAt'),
    );
    if (postAcceptanceClaim) {
      throw new Error(
        `Claim ${postAcceptanceClaim.id} was filed after this closure had already been crossed by an accepted continuation.`,
      );
    }

    return {
      actorId: closure.actorId,
      closureId: closure.id,
      state: 'active',
      effectiveAt: closure.effectiveAt,
      acceptedClaimId: acceptedContinuation.claim.id,
      acceptedExecutionId: acceptedContinuation.claim.candidateExecutionId,
      reopenedAt,
      pendingClaimIds,
      rejectedClaimIds,
    };
  }

  return {
    actorId: closure.actorId,
    closureId: closure.id,
    state: pendingClaimIds.length > 0 ? 'recovery-pending' : 'closed',
    effectiveAt: closure.effectiveAt,
    acceptedClaimId: null,
    acceptedExecutionId: null,
    reopenedAt: null,
    pendingClaimIds,
    rejectedClaimIds,
  };
}

export function classifyActivityAgainstLifecycle(
  projection: LifecycleFinalityProjection,
  occurredAt: string,
): LifecycleActivityClassification {
  const eventAt = timestamp(occurredAt, 'occurredAt');
  const closedAt = timestamp(projection.effectiveAt, 'projection.effectiveAt');

  if (eventAt < closedAt) return 'pre-closure';
  if (projection.reopenedAt === null) return 'closed-interval';

  return eventAt < timestamp(projection.reopenedAt, 'projection.reopenedAt')
    ? 'closed-interval'
    : 'post-recovery';
}
