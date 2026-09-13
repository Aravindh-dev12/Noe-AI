export type RelianceRelationKind =
  | 'authorize'
  | 'transact'
  | 'insure'
  | 'hire'
  | 'follow'
  | 'host'
  | 'certify'
  | 'delegate'
  | 'other';

export type RelianceChangeDisposition =
  | 'unaffected'
  | 'review-required'
  | 'invalidated'
  | 'disputed';

export type RelianceStructuralChange =
  | 'lineage'
  | 'execution'
  | 'provider'
  | 'model'
  | 'runtime'
  | 'owner'
  | 'disclosure'
  | 'capability'
  | 'authority'
  | 'control'
  | 'corrective-state'
  | 'dependency'
  | 'snapshot-unavailable';

export type RelianceBasisRecord = {
  version: 'noeone.reliance-basis.v1';
  id: string;
  actorId: string;
  counterpartyType: string;
  counterpartyRef: string;
  relationKind: RelianceRelationKind;
  reliedAt: string;
  validUntil?: string;
  lineageId: string;
  executionId: string;
  executionConfigHash: string;
  actorOwnerId?: string;
  observedEventSequence: number;
  disclosureBundleDigest: string;
  capabilitySnapshotDigest?: string;
  authoritySnapshotDigest?: string;
  controlSnapshotDigest?: string;
  correctiveStateDigest?: string;
  dependencySnapshotDigest?: string;
  basisEvidenceArtifactId: string;
  actorStateDigest: string;
  basisDigest: string;
  capturedAt: string;
  supersedesRelianceId?: string;
};

export type RelianceChangeAssessment = {
  version: 'noeone.reliance-change-assessment.v1';
  id: string;
  relianceId: string;
  actorId: string;
  successorLineageId: string;
  successorExecutionId: string;
  successorStateDigest: string;
  structuralChanges: readonly RelianceStructuralChange[];
  disposition: RelianceChangeDisposition;
  evaluatorType: string;
  evaluatorRef: string;
  method: string;
  methodVersion: string;
  evidenceArtifactId: string;
  assessedAt: string;
  reason?: string;
  basisDigest: string;
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

function assertOptionalDigest(value: string | undefined, field: string): void {
  if (value !== undefined) assertSha256(value, field);
}

function assertUniqueChanges(changes: readonly RelianceStructuralChange[]): void {
  const seen = new Set<RelianceStructuralChange>();
  for (const change of changes) {
    if (seen.has(change)) throw new Error(`structuralChanges contains duplicate ${change}.`);
    seen.add(change);
  }
}

export function assertValidRelianceBasisRecord(record: RelianceBasisRecord): void {
  if (record.version !== 'noeone.reliance-basis.v1') {
    throw new Error('Unsupported reliance basis version.');
  }

  assertNonEmpty(record.id, 'id');
  assertNonEmpty(record.actorId, 'actorId');
  assertNonEmpty(record.counterpartyType, 'counterpartyType');
  assertNonEmpty(record.counterpartyRef, 'counterpartyRef');
  assertNonEmpty(record.lineageId, 'lineageId');
  assertNonEmpty(record.executionId, 'executionId');
  assertNonEmpty(record.basisEvidenceArtifactId, 'basisEvidenceArtifactId');
  assertSha256(record.executionConfigHash, 'executionConfigHash');
  assertSha256(record.disclosureBundleDigest, 'disclosureBundleDigest');
  assertSha256(record.actorStateDigest, 'actorStateDigest');
  assertSha256(record.basisDigest, 'basisDigest');
  assertOptionalDigest(record.capabilitySnapshotDigest, 'capabilitySnapshotDigest');
  assertOptionalDigest(record.authoritySnapshotDigest, 'authoritySnapshotDigest');
  assertOptionalDigest(record.controlSnapshotDigest, 'controlSnapshotDigest');
  assertOptionalDigest(record.correctiveStateDigest, 'correctiveStateDigest');
  assertOptionalDigest(record.dependencySnapshotDigest, 'dependencySnapshotDigest');

  if (!Number.isSafeInteger(record.observedEventSequence) || record.observedEventSequence < 0) {
    throw new Error('observedEventSequence must be a non-negative safe integer.');
  }

  const reliedAt = timestamp(record.reliedAt, 'reliedAt');
  const capturedAt = timestamp(record.capturedAt, 'capturedAt');
  if (reliedAt > capturedAt) {
    throw new Error('reliedAt cannot be after capturedAt.');
  }
  if (record.validUntil !== undefined && timestamp(record.validUntil, 'validUntil') <= reliedAt) {
    throw new Error('validUntil must be after reliedAt.');
  }
  if (record.supersedesRelianceId !== undefined) {
    assertNonEmpty(record.supersedesRelianceId, 'supersedesRelianceId');
    if (record.supersedesRelianceId === record.id) {
      throw new Error('A reliance record cannot supersede itself.');
    }
  }
}

export function assertValidRelianceChangeAssessment(
  assessment: RelianceChangeAssessment,
  basis: RelianceBasisRecord,
): void {
  if (assessment.version !== 'noeone.reliance-change-assessment.v1') {
    throw new Error('Unsupported reliance change assessment version.');
  }
  assertNonEmpty(assessment.id, 'assessment.id');
  assertNonEmpty(assessment.successorLineageId, 'successorLineageId');
  assertNonEmpty(assessment.successorExecutionId, 'successorExecutionId');
  assertNonEmpty(assessment.evaluatorType, 'evaluatorType');
  assertNonEmpty(assessment.evaluatorRef, 'evaluatorRef');
  assertNonEmpty(assessment.method, 'method');
  assertNonEmpty(assessment.methodVersion, 'methodVersion');
  assertNonEmpty(assessment.evidenceArtifactId, 'evidenceArtifactId');
  assertSha256(assessment.successorStateDigest, 'successorStateDigest');
  assertSha256(assessment.basisDigest, 'assessment.basisDigest');
  assertUniqueChanges(assessment.structuralChanges);

  if (assessment.relianceId !== basis.id) {
    throw new Error('Assessment relianceId does not match the reliance basis.');
  }
  if (assessment.actorId !== basis.actorId) {
    throw new Error('Assessment actorId does not match the reliance basis actor.');
  }
  if (timestamp(assessment.assessedAt, 'assessedAt') < timestamp(basis.capturedAt, 'capturedAt')) {
    throw new Error('Assessment cannot precede reliance capture.');
  }

  const changedState = assessment.successorStateDigest !== basis.actorStateDigest;
  if (!changedState && assessment.structuralChanges.length > 0) {
    throw new Error('Structural changes cannot be asserted when the state digest is unchanged.');
  }
  if (changedState && assessment.structuralChanges.length === 0) {
    throw new Error('Changed successor state requires at least one structural change classification.');
  }
}

export function relianceTemporallyActive(record: RelianceBasisRecord, at: string): boolean {
  assertValidRelianceBasisRecord(record);
  const atMs = timestamp(at, 'at');
  if (atMs < timestamp(record.reliedAt, 'reliedAt')) return false;
  return record.validUntil === undefined || atMs < timestamp(record.validUntil, 'validUntil');
}

export function deriveRelianceStructuralChanges(input: {
  basis: RelianceBasisRecord;
  successor: {
    lineageId: string;
    executionId: string;
    executionConfigHash: string;
    provider: string;
    model: string;
    runtime: string | null;
    ownerId: string | null;
  };
  basisExecution: {
    provider: string;
    model: string;
    runtime: string | null;
  };
  disclosureBundleDigest: string;
  capabilitySnapshotDigest?: string;
  authoritySnapshotDigest?: string;
  controlSnapshotDigest?: string;
  correctiveStateDigest?: string;
  dependencySnapshotDigest?: string;
}): RelianceStructuralChange[] {
  const changes = new Set<RelianceStructuralChange>();
  const { basis, successor, basisExecution } = input;

  if (successor.lineageId !== basis.lineageId) changes.add('lineage');
  if (successor.executionId !== basis.executionId) changes.add('execution');
  if (successor.provider !== basisExecution.provider) changes.add('provider');
  if (successor.model !== basisExecution.model) changes.add('model');
  if (successor.runtime !== basisExecution.runtime) changes.add('runtime');
  if ((successor.ownerId ?? undefined) !== basis.actorOwnerId) changes.add('owner');
  if (input.disclosureBundleDigest !== basis.disclosureBundleDigest) changes.add('disclosure');

  const compareSnapshot = (
    key:
      | 'capabilitySnapshotDigest'
      | 'authoritySnapshotDigest'
      | 'controlSnapshotDigest'
      | 'correctiveStateDigest'
      | 'dependencySnapshotDigest',
    change: RelianceStructuralChange,
  ) => {
    const previous = basis[key];
    const next = input[key];
    if (previous !== undefined && next === undefined) {
      changes.add('snapshot-unavailable');
      return;
    }
    if (previous !== next) changes.add(change);
  };

  compareSnapshot('capabilitySnapshotDigest', 'capability');
  compareSnapshot('authoritySnapshotDigest', 'authority');
  compareSnapshot('controlSnapshotDigest', 'control');
  compareSnapshot('correctiveStateDigest', 'corrective-state');
  compareSnapshot('dependencySnapshotDigest', 'dependency');

  return [...changes].sort();
}