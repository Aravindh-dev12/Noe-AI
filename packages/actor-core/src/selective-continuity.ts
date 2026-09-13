export type ContinuityClaimKind =
  | 'same_canonical_actor'
  | 'canonical_since'
  | 'verified_event_count'
  | 'recognized_by_host'
  | 'authority_scope'
  | 'commitment_status'
  | 'no_critical_incident_in_window';

export type ContinuityClaimSemantics = 'positive' | 'negative-over-committed-set';

export type ContinuityProofFamily =
  | 'sd-jwt'
  | 'bbs'
  | 'zk-predicate'
  | 'committed-set-non-membership'
  | 'external-attestation';

export type PairwiseActorSubject = {
  /**
   * Verifier-scoped pseudonymous subject. It MUST NOT be the global actor ID.
   * Generation is delegated to the identity/proof adapter because the exact
   * construction depends on the selected federation/credential protocol.
   */
  subject: string;
  audience: string;
  scheme: 'pairwise-v1';
};

export type ContinuityClaimRequest = {
  id: string;
  kind: ContinuityClaimKind;
  required: boolean;
  parameters: Readonly<Record<string, unknown>>;
  /** Maximum acceptable age of the supporting evidence/checkpoint. */
  maxEvidenceAgeSeconds?: number;
};

export type ContinuityPresentationRequest = {
  version: 'noeone.continuity-presentation-request.v1';
  requestId: string;
  verifierId: string;
  audience: string;
  nonce: string;
  requestedAt: string;
  expiresAt: string;
  claims: readonly ContinuityClaimRequest[];
};

export type ContinuityClaimPlan = {
  claim: ContinuityClaimRequest;
  semantics: ContinuityClaimSemantics;
  acceptableProofFamilies: readonly ContinuityProofFamily[];
  /**
   * True when selective disclosure of one credential is not sufficient to
   * establish the claim because the verifier needs completeness/non-omission
   * assurance over a committed longitudinal dataset.
   */
  requiresCommittedDataset: boolean;
};

export type ContinuityPresentationPlan = {
  request: ContinuityPresentationRequest;
  claims: readonly ContinuityClaimPlan[];
};

export type ContinuityPresentationEnvelope = {
  version: 'noeone.continuity-presentation.v1';
  requestId: string;
  audience: string;
  nonce: string;
  subject: PairwiseActorSubject;
  issuedAt: string;
  expiresAt: string;
  claims: readonly {
    requestClaimId: string;
    kind: ContinuityClaimKind;
    proofFamily: ContinuityProofFamily;
    proof: unknown;
  }[];
};

export type ContinuityProofAdapter = {
  readonly id: string;
  readonly proofFamilies: readonly ContinuityProofFamily[];
  supports(plan: ContinuityClaimPlan): boolean;
  /**
   * The core package deliberately does not define cryptographic proof bytes.
   * Adapters can wrap standards such as SD-JWT, W3C BBS Data Integrity,
   * ZK predicate systems, transparency checkpoints, or future mechanisms.
   */
  derive(input: {
    request: ContinuityPresentationRequest;
    subject: PairwiseActorSubject;
    claimPlan: ContinuityClaimPlan;
    evidence: unknown;
  }): Promise<unknown>;
};

const POSITIVE_CLAIMS = new Set<ContinuityClaimKind>([
  'same_canonical_actor',
  'canonical_since',
  'verified_event_count',
  'recognized_by_host',
  'authority_scope',
  'commitment_status',
]);

export function claimSemantics(kind: ContinuityClaimKind): ContinuityClaimSemantics {
  return POSITIVE_CLAIMS.has(kind) ? 'positive' : 'negative-over-committed-set';
}

export function planContinuityClaim(claim: ContinuityClaimRequest): ContinuityClaimPlan {
  switch (claim.kind) {
    case 'no_critical_incident_in_window':
      return {
        claim,
        semantics: 'negative-over-committed-set',
        acceptableProofFamilies: ['committed-set-non-membership', 'zk-predicate'],
        requiresCommittedDataset: true,
      };
    case 'same_canonical_actor':
    case 'canonical_since':
      return {
        claim,
        semantics: 'positive',
        acceptableProofFamilies: ['sd-jwt', 'bbs', 'zk-predicate', 'external-attestation'],
        requiresCommittedDataset: false,
      };
    case 'verified_event_count':
      return {
        claim,
        semantics: 'positive',
        acceptableProofFamilies: ['zk-predicate', 'external-attestation'],
        requiresCommittedDataset: false,
      };
    case 'recognized_by_host':
    case 'authority_scope':
    case 'commitment_status':
      return {
        claim,
        semantics: 'positive',
        acceptableProofFamilies: ['sd-jwt', 'bbs', 'zk-predicate', 'external-attestation'],
        requiresCommittedDataset: false,
      };
    default: {
      const exhaustive: never = claim.kind;
      throw new Error(`Unsupported continuity claim: ${String(exhaustive)}`);
    }
  }
}

export function assertValidContinuityPresentationRequest(
  request: ContinuityPresentationRequest,
  now = new Date(),
): void {
  if (request.version !== 'noeone.continuity-presentation-request.v1') {
    throw new Error('Unsupported continuity presentation request version.');
  }
  if (!request.requestId.trim() || !request.verifierId.trim() || !request.audience.trim()) {
    throw new Error('requestId, verifierId, and audience are required.');
  }
  if (request.nonce.length < 16) {
    throw new Error('Presentation nonce must contain at least 16 characters.');
  }
  if (request.claims.length === 0) {
    throw new Error('At least one continuity claim is required.');
  }

  const requestedAt = Date.parse(request.requestedAt);
  const expiresAt = Date.parse(request.expiresAt);
  if (!Number.isFinite(requestedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('requestedAt and expiresAt must be valid timestamps.');
  }
  if (expiresAt <= requestedAt) {
    throw new Error('expiresAt must be later than requestedAt.');
  }
  if (expiresAt <= now.getTime()) {
    throw new Error('Continuity presentation request has expired.');
  }

  const ids = new Set<string>();
  for (const claim of request.claims) {
    if (!claim.id.trim()) {
      throw new Error('Every continuity claim needs an id.');
    }
    if (ids.has(claim.id)) {
      throw new Error(`Duplicate continuity claim id: ${claim.id}`);
    }
    ids.add(claim.id);

    if (
      claim.maxEvidenceAgeSeconds !== undefined &&
      (!Number.isInteger(claim.maxEvidenceAgeSeconds) || claim.maxEvidenceAgeSeconds <= 0)
    ) {
      throw new Error(`Invalid maxEvidenceAgeSeconds for claim ${claim.id}.`);
    }
  }
}

export function planContinuityPresentation(
  request: ContinuityPresentationRequest,
  now = new Date(),
): ContinuityPresentationPlan {
  assertValidContinuityPresentationRequest(request, now);
  return {
    request,
    claims: request.claims.map(planContinuityClaim),
  };
}

export function assertPresentationBoundToRequest(
  presentation: ContinuityPresentationEnvelope,
  request: ContinuityPresentationRequest,
  now = new Date(),
): void {
  if (presentation.version !== 'noeone.continuity-presentation.v1') {
    throw new Error('Unsupported continuity presentation version.');
  }
  if (presentation.requestId !== request.requestId) {
    throw new Error('Presentation requestId does not match the verifier request.');
  }
  if (presentation.audience !== request.audience || presentation.subject.audience !== request.audience) {
    throw new Error('Presentation audience does not match the verifier request.');
  }
  if (presentation.nonce !== request.nonce) {
    throw new Error('Presentation nonce does not match the verifier request.');
  }

  const expiresAt = Date.parse(presentation.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new Error('Continuity presentation has expired.');
  }

  const requestClaims = new Map(request.claims.map((claim) => [claim.id, claim]));
  const presentedIds = new Set<string>();

  for (const claim of presentation.claims) {
    const requested = requestClaims.get(claim.requestClaimId);
    if (!requested) {
      throw new Error(`Presentation contains unrequested claim ${claim.requestClaimId}.`);
    }
    if (requested.kind !== claim.kind) {
      throw new Error(`Presentation claim kind mismatch for ${claim.requestClaimId}.`);
    }
    if (presentedIds.has(claim.requestClaimId)) {
      throw new Error(`Presentation duplicates claim ${claim.requestClaimId}.`);
    }
    presentedIds.add(claim.requestClaimId);

    const plan = planContinuityClaim(requested);
    if (!plan.acceptableProofFamilies.includes(claim.proofFamily)) {
      throw new Error(
        `Proof family ${claim.proofFamily} is not acceptable for claim ${claim.requestClaimId}.`,
      );
    }
  }

  for (const claim of request.claims) {
    if (claim.required && !presentedIds.has(claim.id)) {
      throw new Error(`Required continuity claim ${claim.id} is missing.`);
    }
  }
}
