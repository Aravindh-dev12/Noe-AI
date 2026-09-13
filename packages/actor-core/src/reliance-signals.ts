import type {
  RelianceBasisRecord,
  RelianceChangeAssessment,
  RelianceChangeDisposition,
  RelianceRelationKind,
  RelianceStructuralChange,
} from './reliance-provenance.js';

export type RelianceSignalTransportProfile =
  | 'internal'
  | 'ssf'
  | 'caep'
  | 'webhook'
  | 'manual'
  | 'other';

export type RelianceSignalReceiptKind =
  | 'delivered'
  | 'delivery-failed'
  | 'acknowledged'
  | 'review-started'
  | 'reliance-renewed'
  | 'reliance-rejected'
  | 'expired';

export type RelianceSignal = {
  version: 'noeone.reliance-signal.v1';
  id: string;
  actorId: string;
  relianceId: string;
  assessmentId: string;
  counterpartyType: string;
  counterpartyRef: string;
  relationKind: RelianceRelationKind;
  originalActorStateDigest: string;
  successorStateDigest: string;
  successorLineageId: string;
  successorExecutionId: string;
  successorEventSequence: number;
  structuralChanges: readonly RelianceStructuralChange[];
  disposition: RelianceChangeDisposition;
  transportProfile: RelianceSignalTransportProfile;
  transportRef?: string;
  emittedAt: string;
  signalDigest: string;
};

export type RelianceSignalReceipt = {
  version: 'noeone.reliance-signal-receipt.v1';
  id: string;
  signalId: string;
  actorId: string;
  relianceId: string;
  kind: RelianceSignalReceiptKind;
  partyType: string;
  partyRef: string;
  evidenceArtifactId?: string;
  successorRelianceId?: string;
  detailDigest?: string;
  observedAt: string;
  receiptDigest: string;
};

export type RelianceSignalProjection = {
  delivered: boolean;
  acknowledged: boolean;
  reviewStarted: boolean;
  renewed: boolean;
  rejected: boolean;
  expired: boolean;
  deliveryFailures: number;
  terminal: 'renewed' | 'rejected' | 'expired' | null;
  conflictingTerminalReceipts: boolean;
  lastObservedAt: string | null;
};

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const COUNTERPARTY_RESPONSE_KINDS = new Set<RelianceSignalReceiptKind>([
  'acknowledged',
  'review-started',
  'reliance-renewed',
  'reliance-rejected',
]);

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function assertSha256(value: string, field: string): void {
  if (!SHA256_PATTERN.test(value)) throw new Error(`${field} must be a sha256 digest.`);
}

function assertOptionalSha256(value: string | undefined, field: string): void {
  if (value !== undefined) assertSha256(value, field);
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp.`);
  return parsed;
}

function assertSequence(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const l = [...left].sort();
  const r = [...right].sort();
  return l.every((value, index) => value === r[index]);
}

export function assertValidRelianceSignal(
  signal: RelianceSignal,
  basis: RelianceBasisRecord,
  assessment: RelianceChangeAssessment,
): void {
  if (signal.version !== 'noeone.reliance-signal.v1') {
    throw new Error('Unsupported reliance signal version.');
  }

  assertNonEmpty(signal.id, 'signal.id');
  assertNonEmpty(signal.actorId, 'signal.actorId');
  assertNonEmpty(signal.relianceId, 'signal.relianceId');
  assertNonEmpty(signal.assessmentId, 'signal.assessmentId');
  assertNonEmpty(signal.counterpartyType, 'signal.counterpartyType');
  assertNonEmpty(signal.counterpartyRef, 'signal.counterpartyRef');
  assertNonEmpty(signal.successorLineageId, 'signal.successorLineageId');
  assertNonEmpty(signal.successorExecutionId, 'signal.successorExecutionId');
  assertSha256(signal.originalActorStateDigest, 'signal.originalActorStateDigest');
  assertSha256(signal.successorStateDigest, 'signal.successorStateDigest');
  assertSha256(signal.signalDigest, 'signal.signalDigest');
  assertSequence(signal.successorEventSequence, 'signal.successorEventSequence');

  if (signal.transportRef !== undefined) {
    assertNonEmpty(signal.transportRef, 'signal.transportRef');
  }

  if (signal.relianceId !== basis.id || signal.actorId !== basis.actorId) {
    throw new Error('Reliance signal does not match the reliance basis.');
  }
  if (signal.assessmentId !== assessment.id) {
    throw new Error('Reliance signal assessmentId does not match the change assessment.');
  }
  if (assessment.relianceId !== basis.id || assessment.actorId !== basis.actorId) {
    throw new Error('Reliance change assessment does not match the reliance basis.');
  }
  if (
    signal.counterpartyType !== basis.counterpartyType ||
    signal.counterpartyRef !== basis.counterpartyRef ||
    signal.relationKind !== basis.relationKind
  ) {
    throw new Error('Reliance signal counterparty semantics do not match the reliance basis.');
  }
  if (signal.originalActorStateDigest !== basis.actorStateDigest) {
    throw new Error('Reliance signal original state digest does not match the reliance basis.');
  }
  if (
    signal.successorStateDigest !== assessment.successorStateDigest ||
    signal.successorLineageId !== assessment.successorLineageId ||
    signal.successorExecutionId !== assessment.successorExecutionId ||
    signal.successorEventSequence !== assessment.successorEventSequence
  ) {
    throw new Error('Reliance signal successor state does not match the change assessment.');
  }
  if (signal.disposition !== assessment.disposition) {
    throw new Error('Reliance signal disposition does not match the change assessment.');
  }
  if (!equalStringSets(signal.structuralChanges, assessment.structuralChanges)) {
    throw new Error('Reliance signal structural changes do not match the change assessment.');
  }
  if (
    timestamp(signal.emittedAt, 'signal.emittedAt') <
    timestamp(assessment.assessedAt, 'assessment.assessedAt')
  ) {
    throw new Error('Reliance signal cannot be emitted before the source assessment.');
  }
}

export function assertValidRelianceSignalReceipt(
  receipt: RelianceSignalReceipt,
  signal: RelianceSignal,
): void {
  if (receipt.version !== 'noeone.reliance-signal-receipt.v1') {
    throw new Error('Unsupported reliance signal receipt version.');
  }

  assertNonEmpty(receipt.id, 'receipt.id');
  assertNonEmpty(receipt.signalId, 'receipt.signalId');
  assertNonEmpty(receipt.actorId, 'receipt.actorId');
  assertNonEmpty(receipt.relianceId, 'receipt.relianceId');
  assertNonEmpty(receipt.partyType, 'receipt.partyType');
  assertNonEmpty(receipt.partyRef, 'receipt.partyRef');
  assertSha256(receipt.receiptDigest, 'receipt.receiptDigest');
  assertOptionalSha256(receipt.detailDigest, 'receipt.detailDigest');

  if (receipt.evidenceArtifactId !== undefined) {
    assertNonEmpty(receipt.evidenceArtifactId, 'receipt.evidenceArtifactId');
  }
  if (receipt.successorRelianceId !== undefined) {
    assertNonEmpty(receipt.successorRelianceId, 'receipt.successorRelianceId');
  }

  if (
    receipt.signalId !== signal.id ||
    receipt.actorId !== signal.actorId ||
    receipt.relianceId !== signal.relianceId
  ) {
    throw new Error('Reliance signal receipt does not match the source signal.');
  }
  if (
    timestamp(receipt.observedAt, 'receipt.observedAt') <
    timestamp(signal.emittedAt, 'signal.emittedAt')
  ) {
    throw new Error('Reliance signal receipt cannot precede signal emission.');
  }

  if (COUNTERPARTY_RESPONSE_KINDS.has(receipt.kind)) {
    if (
      receipt.partyType !== signal.counterpartyType ||
      receipt.partyRef !== signal.counterpartyRef
    ) {
      throw new Error(
        `${receipt.kind} receipt must be attributable to the original relying counterparty.`,
      );
    }
  }

  if (receipt.kind === 'reliance-renewed') {
    if (receipt.successorRelianceId === undefined) {
      throw new Error('A reliance-renewed receipt requires successorRelianceId.');
    }
  } else if (receipt.successorRelianceId !== undefined) {
    throw new Error('Only reliance-renewed receipts may reference successorRelianceId.');
  }

  if (receipt.kind !== 'expired' && receipt.evidenceArtifactId === undefined) {
    throw new Error(`${receipt.kind} receipt requires evidenceArtifactId.`);
  }
}

export function assertValidRelianceRenewalReceipt(
  receipt: RelianceSignalReceipt,
  signal: RelianceSignal,
  originalBasis: RelianceBasisRecord,
  successorBasis: RelianceBasisRecord,
): void {
  assertValidRelianceSignalReceipt(receipt, signal);
  if (receipt.kind !== 'reliance-renewed') {
    throw new Error('Expected a reliance-renewed receipt.');
  }
  if (receipt.successorRelianceId !== successorBasis.id) {
    throw new Error('Renewal receipt successorRelianceId does not match the successor basis.');
  }
  if (successorBasis.supersedesRelianceId !== originalBasis.id) {
    throw new Error('Successor reliance basis must explicitly supersede the original reliance.');
  }
  if (
    successorBasis.actorId !== originalBasis.actorId ||
    successorBasis.actorId !== signal.actorId
  ) {
    throw new Error('Renewal reliance basis must concern the same actor.');
  }
  if (
    successorBasis.counterpartyType !== originalBasis.counterpartyType ||
    successorBasis.counterpartyRef !== originalBasis.counterpartyRef ||
    successorBasis.relationKind !== originalBasis.relationKind
  ) {
    throw new Error('Renewal reliance basis must preserve counterparty and relation semantics.');
  }
  if (
    timestamp(successorBasis.capturedAt, 'successorBasis.capturedAt') <
    timestamp(signal.emittedAt, 'signal.emittedAt')
  ) {
    throw new Error('Successor reliance basis cannot predate the reliance signal.');
  }
  if (
    timestamp(receipt.observedAt, 'receipt.observedAt') <
    timestamp(successorBasis.capturedAt, 'successorBasis.capturedAt')
  ) {
    throw new Error('Renewal receipt cannot predate the successor reliance basis.');
  }
}

export function deriveRelianceSignalProjection(
  receipts: readonly RelianceSignalReceipt[],
): RelianceSignalProjection {
  const ordered = [...receipts].sort((left, right) => {
    const byTime =
      timestamp(left.observedAt, 'receipt.observedAt') -
      timestamp(right.observedAt, 'receipt.observedAt');
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
  });

  let terminal: RelianceSignalProjection['terminal'] = null;
  const terminalKinds = new Set<'renewed' | 'rejected' | 'expired'>();
  let delivered = false;
  let acknowledged = false;
  let reviewStarted = false;
  let renewed = false;
  let rejected = false;
  let expired = false;
  let deliveryFailures = 0;

  for (const receipt of ordered) {
    switch (receipt.kind) {
      case 'delivered':
        delivered = true;
        break;
      case 'delivery-failed':
        deliveryFailures += 1;
        break;
      case 'acknowledged':
        acknowledged = true;
        break;
      case 'review-started':
        reviewStarted = true;
        break;
      case 'reliance-renewed':
        renewed = true;
        terminal = 'renewed';
        terminalKinds.add('renewed');
        break;
      case 'reliance-rejected':
        rejected = true;
        terminal = 'rejected';
        terminalKinds.add('rejected');
        break;
      case 'expired':
        expired = true;
        terminal = 'expired';
        terminalKinds.add('expired');
        break;
    }
  }

  return {
    delivered,
    acknowledged,
    reviewStarted,
    renewed,
    rejected,
    expired,
    deliveryFailures,
    terminal,
    conflictingTerminalReceipts: terminalKinds.size > 1,
    lastObservedAt: ordered.at(-1)?.observedAt ?? null,
  };
}
