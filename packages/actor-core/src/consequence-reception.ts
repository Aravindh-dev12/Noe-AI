export type ConsequenceReceptionKind =
  | 'restriction'
  | 'remediation'
  | 'probation'
  | 'suspension'
  | 'disclosure';

export type ConsequenceReceptionStatus = 'active' | 'satisfied' | 'lifted' | 'superseded';

export type ConsequenceReceptionScope = {
  global: boolean;
  actions: readonly string[];
  resources: readonly string[];
  capabilities: readonly string[];
  environmentRefs: readonly string[];
};

export type ConsequenceReceptionRecord = {
  version: 'noeone.consequence-reception.v1';
  id: string;
  actorId: string;
  sourceConsequenceId?: string;
  sourceAttributionId?: string;
  sourceClaimId?: string;
  sourceRemedyId?: string;
  sourceEvidenceArtifactId: string;
  kind: ConsequenceReceptionKind;
  status: ConsequenceReceptionStatus;
  scope: ConsequenceReceptionScope;
  termsDigest: string;
  restorationCriteriaDigest?: string;
  effectiveAt: string;
  reviewAt?: string;
  expiresAt?: string;
  issuedByType: string;
  issuedByRef: string;
  authorityEvidenceRef: string;
  migrationPolicy: 'carry-with-actor';
  forkPolicy: 'do-not-inherit';
  capturedAt: string;
  basisDigest: string;
};

export type ConsequenceReceptionTransition = {
  version: 'noeone.consequence-reception-transition.v1';
  id: string;
  receptionId: string;
  actorId: string;
  fromStatus: ConsequenceReceptionStatus;
  toStatus: Exclude<ConsequenceReceptionStatus, 'active'>;
  evidenceArtifactId: string;
  decidedByType: string;
  decidedByRef: string;
  occurredAt: string;
  reason?: string;
  basisDigest: string;
};

export type ConsequenceReceptionProjection = {
  receptionId: string;
  actorId: string;
  status: ConsequenceReceptionStatus;
  active: boolean;
  effectiveAt: string;
  expiresAt: string | null;
  terminalTransitionId: string | null;
};

export type CorrectiveActionRequest = {
  action?: string;
  resource?: string;
  capability?: string;
  environmentRef?: string;
};

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

function assertUniqueNonEmpty(values: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value, field);
    if (seen.has(value)) throw new Error(`${field} contains duplicate value ${value}.`);
    seen.add(value);
  }
}

function hasSource(record: ConsequenceReceptionRecord): boolean {
  return Boolean(
    record.sourceConsequenceId ||
      record.sourceAttributionId ||
      record.sourceClaimId ||
      record.sourceRemedyId,
  );
}

export function assertValidConsequenceReceptionRecord(record: ConsequenceReceptionRecord): void {
  if (record.version !== 'noeone.consequence-reception.v1') {
    throw new Error('Unsupported consequence reception version.');
  }
  assertNonEmpty(record.id, 'id');
  assertNonEmpty(record.actorId, 'actorId');
  assertNonEmpty(record.sourceEvidenceArtifactId, 'sourceEvidenceArtifactId');
  assertNonEmpty(record.issuedByType, 'issuedByType');
  assertNonEmpty(record.issuedByRef, 'issuedByRef');
  assertNonEmpty(record.authorityEvidenceRef, 'authorityEvidenceRef');
  assertSha256(record.termsDigest, 'termsDigest');
  assertSha256(record.basisDigest, 'basisDigest');
  if (record.restorationCriteriaDigest !== undefined) {
    assertSha256(record.restorationCriteriaDigest, 'restorationCriteriaDigest');
  }

  if (!hasSource(record)) {
    throw new Error(
      'A consequence reception record must reference a consequence, attribution, claim, or remedy source.',
    );
  }
  if (record.status !== 'active') {
    throw new Error('A newly issued consequence reception record must start active.');
  }
  if (record.migrationPolicy !== 'carry-with-actor') {
    throw new Error('Consequence reception must carry with the continuing actor.');
  }
  if (record.forkPolicy !== 'do-not-inherit') {
    throw new Error('Consequence reception must not silently inherit across forks.');
  }

  const effectiveAt = timestamp(record.effectiveAt, 'effectiveAt');
  const capturedAt = timestamp(record.capturedAt, 'capturedAt');
  if (capturedAt < effectiveAt) {
    throw new Error('capturedAt cannot precede effectiveAt.');
  }
  if (record.reviewAt !== undefined && timestamp(record.reviewAt, 'reviewAt') < effectiveAt) {
    throw new Error('reviewAt cannot precede effectiveAt.');
  }
  if (record.expiresAt !== undefined && timestamp(record.expiresAt, 'expiresAt') <= effectiveAt) {
    throw new Error('expiresAt must be after effectiveAt.');
  }

  assertUniqueNonEmpty(record.scope.actions, 'scope.actions');
  assertUniqueNonEmpty(record.scope.resources, 'scope.resources');
  assertUniqueNonEmpty(record.scope.capabilities, 'scope.capabilities');
  assertUniqueNonEmpty(record.scope.environmentRefs, 'scope.environmentRefs');

  const scoped =
    record.scope.actions.length > 0 ||
    record.scope.resources.length > 0 ||
    record.scope.capabilities.length > 0 ||
    record.scope.environmentRefs.length > 0;
  if (!record.scope.global && !scoped) {
    throw new Error('A non-global consequence reception must define at least one scope selector.');
  }
  if (record.kind === 'suspension' && !record.scope.global) {
    throw new Error('A suspension must be global; use restriction for scoped controls.');
  }
}

export function assertValidConsequenceReceptionTransition(
  transition: ConsequenceReceptionTransition,
  record: ConsequenceReceptionRecord,
): void {
  if (transition.version !== 'noeone.consequence-reception-transition.v1') {
    throw new Error('Unsupported consequence reception transition version.');
  }
  assertNonEmpty(transition.id, 'transition.id');
  assertNonEmpty(transition.evidenceArtifactId, 'transition.evidenceArtifactId');
  assertNonEmpty(transition.decidedByType, 'transition.decidedByType');
  assertNonEmpty(transition.decidedByRef, 'transition.decidedByRef');
  assertSha256(transition.basisDigest, 'transition.basisDigest');

  if (transition.receptionId !== record.id) {
    throw new Error('Transition receptionId does not match the corrective record.');
  }
  if (transition.actorId !== record.actorId) {
    throw new Error('Transition actorId does not match the corrective record.');
  }
  if (transition.fromStatus !== 'active') {
    throw new Error('V1 only permits transitions from active corrective state.');
  }
  if (transition.toStatus === 'active') {
    throw new Error('Transition must move to a terminal corrective state.');
  }

  const occurredAt = timestamp(transition.occurredAt, 'transition.occurredAt');
  if (occurredAt < timestamp(record.effectiveAt, 'effectiveAt')) {
    throw new Error('Transition cannot precede corrective-state effectiveness.');
  }

  if (
    (transition.toStatus === 'satisfied' || transition.toStatus === 'lifted') &&
    !transition.evidenceArtifactId.trim()
  ) {
    throw new Error('Restoration transitions require evidence.');
  }
}

export function projectConsequenceReceptionState(
  record: ConsequenceReceptionRecord,
  transitions: readonly ConsequenceReceptionTransition[],
  at: string,
): ConsequenceReceptionProjection {
  assertValidConsequenceReceptionRecord(record);
  const atMs = timestamp(at, 'at');
  const effectiveAt = timestamp(record.effectiveAt, 'effectiveAt');

  const applicable = transitions
    .filter((transition) => timestamp(transition.occurredAt, 'transition.occurredAt') <= atMs)
    .sort(
      (a, b) =>
        timestamp(a.occurredAt, 'transition.occurredAt') -
          timestamp(b.occurredAt, 'transition.occurredAt') ||
        a.id.localeCompare(b.id),
    );

  let status: ConsequenceReceptionStatus = 'active';
  let terminalTransitionId: string | null = null;
  for (const transition of applicable) {
    assertValidConsequenceReceptionTransition(transition, record);
    if (status !== transition.fromStatus) {
      throw new Error(
        `Transition ${transition.id} expects ${transition.fromStatus} but projected status is ${status}.`,
      );
    }
    status = transition.toStatus;
    terminalTransitionId = transition.id;
  }

  const notExpired =
    record.expiresAt === undefined || atMs < timestamp(record.expiresAt, 'expiresAt');
  return {
    receptionId: record.id,
    actorId: record.actorId,
    status,
    active: atMs >= effectiveAt && status === 'active' && notExpired,
    effectiveAt: record.effectiveAt,
    expiresAt: record.expiresAt ?? null,
    terminalTransitionId,
  };
}

export function correctiveScopeMatches(
  record: Pick<ConsequenceReceptionRecord, 'scope'>,
  request: CorrectiveActionRequest,
): boolean {
  if (record.scope.global) return true;
  const matches = (values: readonly string[], candidate: string | undefined) =>
    candidate !== undefined && values.includes(candidate);

  return (
    matches(record.scope.actions, request.action) ||
    matches(record.scope.resources, request.resource) ||
    matches(record.scope.capabilities, request.capability) ||
    matches(record.scope.environmentRefs, request.environmentRef)
  );
}
