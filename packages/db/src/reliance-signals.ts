import { createHash, randomUUID } from 'node:crypto';
import type {
  Prisma,
  RelianceBasis,
  RelianceChangeAssessment as RelianceChangeAssessmentRow,
  RelianceSignal as RelianceSignalRow,
  RelianceSignalReceipt as RelianceSignalReceiptRow,
} from '@prisma/client';
import {
  assertValidRelianceBasisRecord,
  assertValidRelianceChangeAssessment,
  assertValidRelianceRenewalReceipt,
  assertValidRelianceSignal,
  assertValidRelianceSignalReceipt,
  deriveRelianceSignalProjection,
  type RelianceBasisRecord,
  type RelianceChangeAssessment,
  type RelianceChangeDisposition,
  type RelianceRelationKind,
  type RelianceSignal,
  type RelianceSignalProjection,
  type RelianceSignalReceipt,
  type RelianceSignalReceiptKind,
  type RelianceSignalTransportProfile,
  type RelianceStructuralChange,
} from '@onbae/actor-core';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type EmitRelianceSignalInput = {
  assessmentId: string;
  emittedAt?: Date;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export type RecordRelianceSignalReceiptInput = {
  signalId: string;
  kind: RelianceSignalReceiptKind;
  partyType: string;
  partyRef: string;
  transportProfile?: RelianceSignalTransportProfile | null;
  transportRef?: string | null;
  evidenceArtifactId?: string | null;
  successorRelianceId?: string | null;
  detailDigest?: string | null;
  observedAt: Date;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export class RelianceSignalConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'RelianceSignalConflictError';
  }
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RELATION_KINDS: readonly RelianceRelationKind[] = [
  'authorize',
  'transact',
  'insure',
  'hire',
  'follow',
  'host',
  'certify',
  'delegate',
  'other',
];
const DISPOSITIONS: readonly RelianceChangeDisposition[] = [
  'unaffected',
  'review-required',
  'invalidated',
  'disputed',
];
const STRUCTURAL_CHANGES: readonly RelianceStructuralChange[] = [
  'lineage',
  'execution',
  'provider',
  'model',
  'runtime',
  'owner',
  'history',
  'disclosure',
  'capability',
  'authority',
  'control',
  'corrective-state',
  'dependency',
  'snapshot-unavailable',
];
const TRANSPORT_PROFILES: readonly RelianceSignalTransportProfile[] = [
  'internal',
  'ssf',
  'caep',
  'webhook',
  'manual',
  'other',
];
const RECEIPT_KINDS: readonly RelianceSignalReceiptKind[] = [
  'delivered',
  'delivery-failed',
  'acknowledged',
  'review-started',
  'reliance-renewed',
  'reliance-rejected',
  'expired',
];

function text(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
  }
  return normalized;
}

function idempotencyKey(value: string): string {
  const normalized = text(value, 'idempotencyKey');
  if (normalized.length < 8 || normalized.length > 500) {
    throw Object.assign(new Error('idempotencyKey must contain 8 to 500 characters.'), {
      statusCode: 400,
    });
  }
  return normalized;
}

function digest(value: string, field: string): string {
  const normalized = text(value, field).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw Object.assign(new Error(`${field} must be sha256:<64 lowercase hex>.`), {
      statusCode: 400,
    });
  }
  return normalized;
}

function optionalDigest(value: string | null | undefined, field: string): string | null {
  return value == null ? null : digest(value, field);
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function counterpartyDigest(type: string, ref: string): string {
  return sha256({ schema: 'noeone.counterparty-ref.v1', type, ref });
}

function relationToDb(value: RelianceRelationKind): string {
  return value.toUpperCase();
}

function relationFromDb(value: string): RelianceRelationKind {
  const normalized = value.toLowerCase() as RelianceRelationKind;
  if (!RELATION_KINDS.includes(normalized)) {
    throw new RelianceSignalConflictError(`Unknown reliance relation kind ${value}.`);
  }
  return normalized;
}

function dispositionToDb(value: RelianceChangeDisposition): string {
  return value.replace('-', '_').toUpperCase();
}

function dispositionFromDb(value: string): RelianceChangeDisposition {
  const normalized = value.toLowerCase().replaceAll('_', '-') as RelianceChangeDisposition;
  if (!DISPOSITIONS.includes(normalized)) {
    throw new RelianceSignalConflictError(`Unknown reliance disposition ${value}.`);
  }
  return normalized;
}

function transportToDb(value: RelianceSignalTransportProfile): string {
  return value.toUpperCase();
}

function transportFromDb(value: string): RelianceSignalTransportProfile {
  const normalized = value.toLowerCase() as RelianceSignalTransportProfile;
  if (!TRANSPORT_PROFILES.includes(normalized)) {
    throw new RelianceSignalConflictError(`Unknown reliance signal transport ${value}.`);
  }
  return normalized;
}

function receiptKindToDb(value: RelianceSignalReceiptKind): string {
  return value.replaceAll('-', '_').toUpperCase();
}

function receiptKindFromDb(value: string): RelianceSignalReceiptKind {
  const normalized = value.toLowerCase().replaceAll('_', '-') as RelianceSignalReceiptKind;
  if (!RECEIPT_KINDS.includes(normalized)) {
    throw new RelianceSignalConflictError(`Unknown reliance signal receipt kind ${value}.`);
  }
  return normalized;
}

function parseStructuralChanges(value: Prisma.JsonValue): RelianceStructuralChange[] {
  if (!Array.isArray(value)) {
    throw new RelianceSignalConflictError('Stored structuralChanges is not an array.');
  }
  const result: RelianceStructuralChange[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      !STRUCTURAL_CHANGES.includes(item as RelianceStructuralChange)
    ) {
      const itemLabel = typeof item === 'string' ? item : canonicalJson(item);
      throw new RelianceSignalConflictError(`Stored structural change ${itemLabel} is invalid.`);
    }
    if (seen.has(item)) {
      throw new RelianceSignalConflictError(`Stored structural change ${item} is duplicated.`);
    }
    seen.add(item);
    result.push(item as RelianceStructuralChange);
  }
  return result;
}

function toCoreBasis(row: RelianceBasis): RelianceBasisRecord {
  return {
    version: 'noeone.reliance-basis.v1',
    id: row.id,
    actorId: row.actorId,
    counterpartyType: row.counterpartyType,
    counterpartyRef: row.counterpartyRef,
    relationKind: relationFromDb(row.relationKind),
    reliedAt: row.reliedAt.toISOString(),
    ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
    lineageId: row.lineageId,
    executionId: row.executionId,
    executionConfigHash: row.executionConfigHash,
    ...(row.actorOwnerId ? { actorOwnerId: row.actorOwnerId } : {}),
    observedEventSequence: row.observedEventSequence,
    disclosureBundleDigest: row.disclosureBundleDigest,
    ...(row.capabilitySnapshotDigest
      ? { capabilitySnapshotDigest: row.capabilitySnapshotDigest }
      : {}),
    ...(row.authoritySnapshotDigest
      ? { authoritySnapshotDigest: row.authoritySnapshotDigest }
      : {}),
    ...(row.controlSnapshotDigest ? { controlSnapshotDigest: row.controlSnapshotDigest } : {}),
    ...(row.correctiveStateDigest
      ? { correctiveStateDigest: row.correctiveStateDigest }
      : {}),
    ...(row.dependencySnapshotDigest
      ? { dependencySnapshotDigest: row.dependencySnapshotDigest }
      : {}),
    basisEvidenceArtifactId: row.basisEvidenceArtifactId,
    actorStateDigest: row.actorStateDigest,
    basisDigest: row.basisDigest,
    capturedAt: row.capturedAt.toISOString(),
    ...(row.supersedesRelianceId ? { supersedesRelianceId: row.supersedesRelianceId } : {}),
  };
}

function toCoreAssessment(row: RelianceChangeAssessmentRow): RelianceChangeAssessment {
  return {
    version: 'noeone.reliance-change-assessment.v1',
    id: row.id,
    relianceId: row.relianceId,
    actorId: row.actorId,
    successorLineageId: row.successorLineageId,
    successorExecutionId: row.successorExecutionId,
    successorExecutionConfigHash: row.successorExecutionConfigHash,
    ...(row.successorActorOwnerId ? { successorActorOwnerId: row.successorActorOwnerId } : {}),
    successorEventSequence: row.successorEventSequence,
    successorDisclosureBundleDigest: row.successorDisclosureBundleDigest,
    ...(row.successorCapabilitySnapshotDigest
      ? { successorCapabilitySnapshotDigest: row.successorCapabilitySnapshotDigest }
      : {}),
    ...(row.successorAuthoritySnapshotDigest
      ? { successorAuthoritySnapshotDigest: row.successorAuthoritySnapshotDigest }
      : {}),
    ...(row.successorControlSnapshotDigest
      ? { successorControlSnapshotDigest: row.successorControlSnapshotDigest }
      : {}),
    ...(row.successorCorrectiveStateDigest
      ? { successorCorrectiveStateDigest: row.successorCorrectiveStateDigest }
      : {}),
    ...(row.successorDependencySnapshotDigest
      ? { successorDependencySnapshotDigest: row.successorDependencySnapshotDigest }
      : {}),
    successorStateDigest: row.successorStateDigest,
    structuralChanges: parseStructuralChanges(row.structuralChanges),
    disposition: dispositionFromDb(row.disposition),
    evaluatorType: row.evaluatorType,
    evaluatorRef: row.evaluatorRef,
    method: row.method,
    methodVersion: row.methodVersion,
    evidenceArtifactId: row.evidenceArtifactId,
    assessedAt: row.assessedAt.toISOString(),
    ...(row.reason ? { reason: row.reason } : {}),
    basisDigest: row.basisDigest,
  };
}

function toCoreSignal(row: RelianceSignalRow): RelianceSignal {
  return {
    version: 'noeone.reliance-signal.v1',
    id: row.id,
    actorId: row.actorId,
    relianceId: row.relianceId,
    assessmentId: row.assessmentId,
    counterpartyType: row.counterpartyType,
    counterpartyRef: row.counterpartyRef,
    relationKind: relationFromDb(row.relationKind),
    originalActorStateDigest: row.originalActorStateDigest,
    successorStateDigest: row.successorStateDigest,
    successorLineageId: row.successorLineageId,
    successorExecutionId: row.successorExecutionId,
    successorEventSequence: row.successorEventSequence,
    structuralChanges: parseStructuralChanges(row.structuralChanges),
    disposition: dispositionFromDb(row.disposition),
    emittedAt: row.emittedAt.toISOString(),
    signalDigest: row.signalDigest,
  };
}

function toCoreReceipt(row: RelianceSignalReceiptRow): RelianceSignalReceipt {
  return {
    version: 'noeone.reliance-signal-receipt.v1',
    id: row.id,
    signalId: row.signalId,
    actorId: row.actorId,
    relianceId: row.relianceId,
    kind: receiptKindFromDb(row.kind),
    partyType: row.partyType,
    partyRef: row.partyRef,
    ...(row.transportProfile
      ? { transportProfile: transportFromDb(row.transportProfile) }
      : {}),
    ...(row.transportRef ? { transportRef: row.transportRef } : {}),
    ...(row.evidenceArtifactId ? { evidenceArtifactId: row.evidenceArtifactId } : {}),
    ...(row.successorRelianceId ? { successorRelianceId: row.successorRelianceId } : {}),
    ...(row.detailDigest ? { detailDigest: row.detailDigest } : {}),
    observedAt: row.observedAt.toISOString(),
    receiptDigest: row.receiptDigest,
  };
}

function signalSemanticDigest(input: Omit<RelianceSignal, 'id' | 'signalDigest'>): string {
  return sha256({ schema: 'noeone.reliance-signal.semantic.v1', record: input });
}

function receiptSemanticDigest(
  input: Omit<RelianceSignalReceipt, 'id' | 'receiptDigest'>,
): string {
  return sha256({ schema: 'noeone.reliance-signal-receipt.semantic.v1', record: input });
}

async function assertEvidenceExists(
  tx: Prisma.TransactionClient,
  evidenceArtifactId: string,
): Promise<void> {
  const found = await tx.evidenceArtifact.findUnique({
    where: { id: evidenceArtifactId },
    select: { id: true },
  });
  if (!found) {
    throw Object.assign(new Error(`Evidence artifact ${evidenceArtifactId} was not found.`), {
      statusCode: 404,
    });
  }
}

function assertSignalReplayCompatible(
  existing: RelianceSignalRow,
  input: EmitRelianceSignalInput,
): void {
  const same =
    existing.assessmentId === input.assessmentId.trim() &&
    (input.emittedAt === undefined || existing.emittedAt.getTime() === input.emittedAt.getTime());
  if (!same) {
    throw new RelianceSignalConflictError(
      `Reliance signal idempotency key ${existing.idempotencyKey} was reused with conflicting data.`,
    );
  }
}

function assertReceiptReplayCompatible(
  existing: RelianceSignalReceiptRow,
  input: RecordRelianceSignalReceiptInput,
): void {
  const same =
    existing.signalId === input.signalId.trim() &&
    existing.kind === receiptKindToDb(input.kind) &&
    existing.partyType === input.partyType.trim() &&
    existing.partyRef === input.partyRef.trim() &&
    existing.transportProfile ===
      (input.transportProfile ? transportToDb(input.transportProfile) : null) &&
    existing.transportRef === (input.transportRef?.trim() || null) &&
    existing.evidenceArtifactId === (input.evidenceArtifactId?.trim() || null) &&
    existing.successorRelianceId === (input.successorRelianceId?.trim() || null) &&
    existing.detailDigest === (input.detailDigest?.toLowerCase() ?? null) &&
    existing.observedAt.getTime() === input.observedAt.getTime();
  if (!same) {
    throw new RelianceSignalConflictError(
      `Reliance signal receipt idempotency key ${existing.idempotencyKey} was reused with conflicting data.`,
    );
  }
}

export async function emitRelianceSignal(
  input: EmitRelianceSignalInput,
  registry: RegistryContext,
): Promise<{ replayed: boolean; signal: RelianceSignalRow }> {
  const normalized = {
    assessmentId: text(input.assessmentId, 'assessmentId'),
    emittedAt: input.emittedAt ?? new Date(),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    metadata: input.metadata ?? {},
  };

  return db.$transaction(async (tx) => {
    const existingByKey = await tx.relianceSignal.findUnique({
      where: { idempotencyKey: normalized.idempotencyKey },
    });
    if (existingByKey) {
      assertSignalReplayCompatible(existingByKey, input);
      return { replayed: true, signal: existingByKey };
    }

    const existingByAssessment = await tx.relianceSignal.findUnique({
      where: { assessmentId: normalized.assessmentId },
    });
    if (existingByAssessment) {
      throw new RelianceSignalConflictError(
        `Reliance assessment ${normalized.assessmentId} already has signal ${existingByAssessment.id}.`,
      );
    }

    const assessmentRow = await tx.relianceChangeAssessment.findUnique({
      where: { id: normalized.assessmentId },
    });
    if (!assessmentRow) {
      throw Object.assign(new Error('Reliance change assessment not found.'), { statusCode: 404 });
    }
    const basisRow = await tx.relianceBasis.findUnique({
      where: { id: assessmentRow.relianceId },
    });
    if (!basisRow) {
      throw new RelianceSignalConflictError('Reliance assessment source basis is missing.');
    }

    const basis = toCoreBasis(basisRow);
    const assessment = toCoreAssessment(assessmentRow);
    assertValidRelianceBasisRecord(basis);
    assertValidRelianceChangeAssessment(assessment, basis);

    const withoutDigest: Omit<RelianceSignal, 'id' | 'signalDigest'> = {
      version: 'noeone.reliance-signal.v1',
      actorId: basis.actorId,
      relianceId: basis.id,
      assessmentId: assessment.id,
      counterpartyType: basis.counterpartyType,
      counterpartyRef: basis.counterpartyRef,
      relationKind: basis.relationKind,
      originalActorStateDigest: basis.actorStateDigest,
      successorStateDigest: assessment.successorStateDigest,
      successorLineageId: assessment.successorLineageId,
      successorExecutionId: assessment.successorExecutionId,
      successorEventSequence: assessment.successorEventSequence,
      structuralChanges: assessment.structuralChanges,
      disposition: assessment.disposition,
      emittedAt: normalized.emittedAt.toISOString(),
    };
    const core: RelianceSignal = {
      ...withoutDigest,
      id: `rls_${randomUUID()}`,
      signalDigest: signalSemanticDigest(withoutDigest),
    };
    assertValidRelianceSignal(core, basis, assessment);

    const created = await tx.relianceSignal.create({
      data: {
        id: core.id,
        actorId: core.actorId,
        relianceId: core.relianceId,
        assessmentId: core.assessmentId,
        counterpartyType: core.counterpartyType,
        counterpartyRef: core.counterpartyRef,
        relationKind: relationToDb(core.relationKind),
        originalActorStateDigest: core.originalActorStateDigest,
        successorStateDigest: core.successorStateDigest,
        successorLineageId: core.successorLineageId,
        successorExecutionId: core.successorExecutionId,
        successorEventSequence: core.successorEventSequence,
        structuralChanges: core.structuralChanges,
        disposition: dispositionToDb(core.disposition),
        emittedAt: new Date(core.emittedAt),
        signalDigest: core.signalDigest,
        idempotencyKey: normalized.idempotencyKey,
        metadata: normalized.metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: core.actorId,
        executionId: core.successorExecutionId,
        type: 'actor.reliance.signal.emitted',
        sourceKey: `reliance-signal:${normalized.idempotencyKey}`,
        occurredAt: normalized.emittedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          signalId: core.id,
          relianceId: core.relianceId,
          assessmentId: core.assessmentId,
          relationKind: core.relationKind,
          disposition: core.disposition,
          structuralChanges: core.structuralChanges,
          successorStateDigest: core.successorStateDigest,
          signalDigest: core.signalDigest,
          counterpartyType: core.counterpartyType,
          counterpartyDigest: counterpartyDigest(core.counterpartyType, core.counterpartyRef),
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, signal: created };
  });
}

export async function recordRelianceSignalReceipt(
  input: RecordRelianceSignalReceiptInput,
  registry: RegistryContext,
): Promise<{ replayed: boolean; receipt: RelianceSignalReceiptRow }> {
  const normalized = {
    signalId: text(input.signalId, 'signalId'),
    kind: input.kind,
    partyType: text(input.partyType, 'partyType'),
    partyRef: text(input.partyRef, 'partyRef'),
    transportProfile: input.transportProfile ?? null,
    transportRef: input.transportRef?.trim() || null,
    evidenceArtifactId: input.evidenceArtifactId
      ? text(input.evidenceArtifactId, 'evidenceArtifactId')
      : null,
    successorRelianceId: input.successorRelianceId
      ? text(input.successorRelianceId, 'successorRelianceId')
      : null,
    detailDigest: optionalDigest(input.detailDigest, 'detailDigest'),
    observedAt: input.observedAt,
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    metadata: input.metadata ?? {},
  };

  return db.$transaction(async (tx) => {
    const existing = await tx.relianceSignalReceipt.findUnique({
      where: { idempotencyKey: normalized.idempotencyKey },
    });
    if (existing) {
      assertReceiptReplayCompatible(existing, input);
      return { replayed: true, receipt: existing };
    }

    const signalRow = await tx.relianceSignal.findUnique({ where: { id: normalized.signalId } });
    if (!signalRow) {
      throw Object.assign(new Error('Reliance signal not found.'), { statusCode: 404 });
    }
    const signal = toCoreSignal(signalRow);

    const basisRow = await tx.relianceBasis.findUnique({ where: { id: signal.relianceId } });
    const assessmentRow = await tx.relianceChangeAssessment.findUnique({
      where: { id: signal.assessmentId },
    });
    if (!basisRow || !assessmentRow) {
      throw new RelianceSignalConflictError('Reliance signal source provenance is incomplete.');
    }
    const basis = toCoreBasis(basisRow);
    const assessment = toCoreAssessment(assessmentRow);
    assertValidRelianceSignal(signal, basis, assessment);

    if (normalized.kind !== 'expired') {
      if (!normalized.evidenceArtifactId) {
        throw Object.assign(new Error(`${normalized.kind} receipt requires evidenceArtifactId.`), {
          statusCode: 400,
        });
      }
      await assertEvidenceExists(tx, normalized.evidenceArtifactId);
    } else if (normalized.evidenceArtifactId) {
      await assertEvidenceExists(tx, normalized.evidenceArtifactId);
    }

    const withoutDigest: Omit<RelianceSignalReceipt, 'id' | 'receiptDigest'> = {
      version: 'noeone.reliance-signal-receipt.v1',
      signalId: signal.id,
      actorId: signal.actorId,
      relianceId: signal.relianceId,
      kind: normalized.kind,
      partyType: normalized.partyType,
      partyRef: normalized.partyRef,
      ...(normalized.transportProfile
        ? { transportProfile: normalized.transportProfile }
        : {}),
      ...(normalized.transportRef ? { transportRef: normalized.transportRef } : {}),
      ...(normalized.evidenceArtifactId
        ? { evidenceArtifactId: normalized.evidenceArtifactId }
        : {}),
      ...(normalized.successorRelianceId
        ? { successorRelianceId: normalized.successorRelianceId }
        : {}),
      ...(normalized.detailDigest ? { detailDigest: normalized.detailDigest } : {}),
      observedAt: normalized.observedAt.toISOString(),
    };
    const core: RelianceSignalReceipt = {
      ...withoutDigest,
      id: `rlr_${randomUUID()}`,
      receiptDigest: receiptSemanticDigest(withoutDigest),
    };
    assertValidRelianceSignalReceipt(core, signal);

    if (core.kind === 'reliance-renewed') {
      const successorRow = await tx.relianceBasis.findUnique({
        where: { id: core.successorRelianceId! },
      });
      if (!successorRow) {
        throw Object.assign(new Error('Successor reliance basis not found.'), { statusCode: 404 });
      }
      assertValidRelianceRenewalReceipt(core, signal, basis, toCoreBasis(successorRow));
    }

    const created = await tx.relianceSignalReceipt.create({
      data: {
        id: core.id,
        signalId: core.signalId,
        actorId: core.actorId,
        relianceId: core.relianceId,
        kind: receiptKindToDb(core.kind),
        partyType: core.partyType,
        partyRef: core.partyRef,
        transportProfile: core.transportProfile ? transportToDb(core.transportProfile) : null,
        transportRef: core.transportRef ?? null,
        evidenceArtifactId: core.evidenceArtifactId ?? null,
        successorRelianceId: core.successorRelianceId ?? null,
        detailDigest: core.detailDigest ?? null,
        observedAt: new Date(core.observedAt),
        receiptDigest: core.receiptDigest,
        idempotencyKey: normalized.idempotencyKey,
        metadata: normalized.metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: signal.actorId,
        executionId: signal.successorExecutionId,
        type: 'actor.reliance.signal.receipt.recorded',
        sourceKey: `reliance-signal-receipt:${normalized.idempotencyKey}`,
        occurredAt: normalized.observedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          signalId: signal.id,
          receiptId: core.id,
          relianceId: signal.relianceId,
          kind: core.kind,
          receiptDigest: core.receiptDigest,
          partyType: core.partyType,
          partyDigest: counterpartyDigest(core.partyType, core.partyRef),
          ...(core.transportProfile ? { transportProfile: core.transportProfile } : {}),
          ...(core.evidenceArtifactId ? { evidenceArtifactId: core.evidenceArtifactId } : {}),
          ...(core.successorRelianceId ? { successorRelianceId: core.successorRelianceId } : {}),
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, receipt: created };
  });
}

async function projectSignalRows(
  rows: RelianceSignalRow[],
): Promise<Array<{ signal: RelianceSignal; projection: RelianceSignalProjection }>> {
  if (rows.length === 0) return [];
  const receipts = await db.relianceSignalReceipt.findMany({
    where: { signalId: { in: rows.map((row) => row.id) } },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
  });
  const bySignal = new Map<string, RelianceSignalReceipt[]>();
  for (const row of receipts) {
    const list = bySignal.get(row.signalId) ?? [];
    list.push(toCoreReceipt(row));
    bySignal.set(row.signalId, list);
  }
  return rows.map((row) => ({
    signal: toCoreSignal(row),
    projection: deriveRelianceSignalProjection(bySignal.get(row.id) ?? []),
  }));
}

export async function getRelianceSignals(
  actorId: string,
  limit = 100,
): Promise<Array<{ signal: RelianceSignal; projection: RelianceSignalProjection }>> {
  const normalizedActorId = text(actorId, 'actorId');
  const rows = await db.relianceSignal.findMany({
    where: { actorId: normalizedActorId },
    orderBy: [{ emittedAt: 'desc' }, { id: 'desc' }],
    take: Math.max(1, Math.min(limit, 500)),
  });
  return projectSignalRows(rows);
}

export async function getRelianceSignalReceipts(
  signalId: string,
  limit = 100,
): Promise<RelianceSignalReceipt[]> {
  const normalizedSignalId = text(signalId, 'signalId');
  const rows = await db.relianceSignalReceipt.findMany({
    where: { signalId: normalizedSignalId },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(limit, 500)),
  });
  return rows.map(toCoreReceipt);
}

export async function getActorRelianceBlastRadius(actorId: string): Promise<{
  version: 'noeone.reliance-blast-radius.v1';
  actorId: string;
  signalCount: number;
  dispositions: {
    unaffected: number;
    reviewRequired: number;
    invalidated: number;
    disputed: number;
  };
  propagation: {
    delivered: number;
    acknowledged: number;
    reviewStarted: number;
    renewed: number;
    rejected: number;
    expired: number;
    unresolved: number;
    deliveryFailures: number;
    conflictingTerminalReceipts: number;
  };
  data: Array<{
    signalId: string;
    relianceId: string;
    assessmentId: string;
    relationKind: RelianceRelationKind;
    disposition: RelianceChangeDisposition;
    emittedAt: string;
    counterpartyType: string;
    counterpartyDigest: string;
    projection: RelianceSignalProjection;
  }>;
}> {
  const normalizedActorId = text(actorId, 'actorId');
  const rows = await db.relianceSignal.findMany({
    where: { actorId: normalizedActorId },
    orderBy: [{ emittedAt: 'desc' }, { id: 'desc' }],
  });
  const signals = await projectSignalRows(rows);
  const dispositions = { unaffected: 0, reviewRequired: 0, invalidated: 0, disputed: 0 };
  const propagation = {
    delivered: 0,
    acknowledged: 0,
    reviewStarted: 0,
    renewed: 0,
    rejected: 0,
    expired: 0,
    unresolved: 0,
    deliveryFailures: 0,
    conflictingTerminalReceipts: 0,
  };

  const data = signals.map(({ signal, projection }) => {
    switch (signal.disposition) {
      case 'unaffected':
        dispositions.unaffected += 1;
        break;
      case 'review-required':
        dispositions.reviewRequired += 1;
        break;
      case 'invalidated':
        dispositions.invalidated += 1;
        break;
      case 'disputed':
        dispositions.disputed += 1;
        break;
    }
    if (projection.delivered) propagation.delivered += 1;
    if (projection.acknowledged) propagation.acknowledged += 1;
    if (projection.reviewStarted) propagation.reviewStarted += 1;
    if (projection.renewed) propagation.renewed += 1;
    if (projection.rejected) propagation.rejected += 1;
    if (projection.expired) propagation.expired += 1;
    if (projection.conflictingTerminalReceipts) propagation.conflictingTerminalReceipts += 1;
    propagation.deliveryFailures += projection.deliveryFailures;
    if (signal.disposition !== 'unaffected' && projection.terminal === null) {
      propagation.unresolved += 1;
    }

    return {
      signalId: signal.id,
      relianceId: signal.relianceId,
      assessmentId: signal.assessmentId,
      relationKind: signal.relationKind,
      disposition: signal.disposition,
      emittedAt: signal.emittedAt,
      counterpartyType: signal.counterpartyType,
      counterpartyDigest: counterpartyDigest(signal.counterpartyType, signal.counterpartyRef),
      projection,
    };
  });

  return {
    version: 'noeone.reliance-blast-radius.v1',
    actorId: normalizedActorId,
    signalCount: signals.length,
    dispositions,
    propagation,
    data,
  };
}

export async function verifyRelianceSignalProvenance(actorId: string): Promise<{
  version: 'noeone.reliance-signal-verification.v1';
  actorId: string;
  valid: boolean;
  signalCount: number;
  receiptCount: number;
  issues: string[];
}> {
  const normalizedActorId = text(actorId, 'actorId');
  const [signals, receipts] = await Promise.all([
    db.relianceSignal.findMany({
      where: { actorId: normalizedActorId },
      orderBy: [{ emittedAt: 'asc' }, { id: 'asc' }],
    }),
    db.relianceSignalReceipt.findMany({
      where: { actorId: normalizedActorId },
      orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const issues: string[] = [];
  const signalById = new Map<string, RelianceSignal>();
  const basisById = new Map<string, RelianceBasisRecord>();

  for (const row of signals) {
    try {
      const [basisRow, assessmentRow] = await Promise.all([
        db.relianceBasis.findUnique({ where: { id: row.relianceId } }),
        db.relianceChangeAssessment.findUnique({ where: { id: row.assessmentId } }),
      ]);
      if (!basisRow || !assessmentRow) throw new Error('signal source provenance is missing');
      const basis = toCoreBasis(basisRow);
      const assessment = toCoreAssessment(assessmentRow);
      const signal = toCoreSignal(row);
      assertValidRelianceBasisRecord(basis);
      assertValidRelianceChangeAssessment(assessment, basis);
      assertValidRelianceSignal(signal, basis, assessment);

      const withoutDigest: Omit<RelianceSignal, 'id' | 'signalDigest'> = {
        version: signal.version,
        actorId: signal.actorId,
        relianceId: signal.relianceId,
        assessmentId: signal.assessmentId,
        counterpartyType: signal.counterpartyType,
        counterpartyRef: signal.counterpartyRef,
        relationKind: signal.relationKind,
        originalActorStateDigest: signal.originalActorStateDigest,
        successorStateDigest: signal.successorStateDigest,
        successorLineageId: signal.successorLineageId,
        successorExecutionId: signal.successorExecutionId,
        successorEventSequence: signal.successorEventSequence,
        structuralChanges: signal.structuralChanges,
        disposition: signal.disposition,
        emittedAt: signal.emittedAt,
      };
      if (signalSemanticDigest(withoutDigest) !== signal.signalDigest) {
        throw new Error('signal semantic digest mismatch');
      }

      signalById.set(signal.id, signal);
      basisById.set(basis.id, basis);
    } catch (error) {
      issues.push(
        `signal:${row.id}:${error instanceof Error ? error.message : 'unknown verification error'}`,
      );
    }
  }

  const receiptsBySignal = new Map<string, RelianceSignalReceipt[]>();
  for (const row of receipts) {
    try {
      const signal = signalById.get(row.signalId);
      if (!signal) throw new Error('source signal is missing or invalid');
      const receipt = toCoreReceipt(row);
      assertValidRelianceSignalReceipt(receipt, signal);

      const withoutDigest: Omit<RelianceSignalReceipt, 'id' | 'receiptDigest'> = {
        version: receipt.version,
        signalId: receipt.signalId,
        actorId: receipt.actorId,
        relianceId: receipt.relianceId,
        kind: receipt.kind,
        partyType: receipt.partyType,
        partyRef: receipt.partyRef,
        ...(receipt.transportProfile ? { transportProfile: receipt.transportProfile } : {}),
        ...(receipt.transportRef ? { transportRef: receipt.transportRef } : {}),
        ...(receipt.evidenceArtifactId ? { evidenceArtifactId: receipt.evidenceArtifactId } : {}),
        ...(receipt.successorRelianceId
          ? { successorRelianceId: receipt.successorRelianceId }
          : {}),
        ...(receipt.detailDigest ? { detailDigest: receipt.detailDigest } : {}),
        observedAt: receipt.observedAt,
      };
      if (receiptSemanticDigest(withoutDigest) !== receipt.receiptDigest) {
        throw new Error('receipt semantic digest mismatch');
      }

      if (receipt.evidenceArtifactId) {
        const evidence = await db.evidenceArtifact.findUnique({
          where: { id: receipt.evidenceArtifactId },
          select: { id: true },
        });
        if (!evidence) throw new Error('receipt evidence artifact missing');
      }

      if (receipt.kind === 'reliance-renewed') {
        const originalBasis = basisById.get(receipt.relianceId);
        const successorRow = receipt.successorRelianceId
          ? await db.relianceBasis.findUnique({ where: { id: receipt.successorRelianceId } })
          : null;
        if (!originalBasis || !successorRow) throw new Error('renewal reliance provenance missing');
        assertValidRelianceRenewalReceipt(
          receipt,
          signal,
          originalBasis,
          toCoreBasis(successorRow),
        );
      }

      const list = receiptsBySignal.get(receipt.signalId) ?? [];
      list.push(receipt);
      receiptsBySignal.set(receipt.signalId, list);
    } catch (error) {
      issues.push(
        `receipt:${row.id}:${error instanceof Error ? error.message : 'unknown verification error'}`,
      );
    }
  }

  for (const [signalId, signalReceipts] of receiptsBySignal) {
    const projection = deriveRelianceSignalProjection(signalReceipts);
    if (projection.conflictingTerminalReceipts) {
      issues.push(`signal:${signalId}:conflicting terminal reliance receipts`);
    }
  }

  return {
    version: 'noeone.reliance-signal-verification.v1',
    actorId: normalizedActorId,
    valid: issues.length === 0,
    signalCount: signals.length,
    receiptCount: receipts.length,
    issues,
  };
}
