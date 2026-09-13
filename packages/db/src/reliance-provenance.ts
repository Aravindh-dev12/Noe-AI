import { createHash, randomUUID } from 'node:crypto';
import type {
  ActorExecution,
  Prisma,
  RelianceBasis,
  RelianceChangeAssessment as RelianceChangeAssessmentRow,
} from '@prisma/client';
import {
  assertValidRelianceBasisRecord,
  assertValidRelianceChangeAssessment,
  deriveRelianceStructuralChanges,
  type RelianceBasisRecord,
  type RelianceChangeAssessment,
  type RelianceChangeDisposition,
  type RelianceRelationKind,
  type RelianceStructuralChange,
} from '@onbae/actor-core';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type CaptureRelianceBasisInput = {
  actorId: string;
  counterpartyType: string;
  counterpartyRef: string;
  relationKind: RelianceRelationKind;
  reliedAt: Date;
  validUntil?: Date | null;
  expectedLineageId: string;
  expectedExecutionId: string;
  disclosureBundleDigest: string;
  capabilitySnapshotDigest?: string | null;
  authoritySnapshotDigest?: string | null;
  controlSnapshotDigest?: string | null;
  correctiveStateDigest?: string | null;
  dependencySnapshotDigest?: string | null;
  basisEvidenceArtifactId: string;
  supersedesRelianceId?: string | null;
  idempotencyKey: string;
  capturedAt?: Date;
  metadata?: Prisma.InputJsonObject;
};

export type AssessRelianceChangeInput = {
  relianceId: string;
  actorId: string;
  expectedSuccessorLineageId: string;
  expectedSuccessorExecutionId: string;
  successorDisclosureBundleDigest: string;
  successorCapabilitySnapshotDigest?: string | null;
  successorAuthoritySnapshotDigest?: string | null;
  successorControlSnapshotDigest?: string | null;
  successorCorrectiveStateDigest?: string | null;
  successorDependencySnapshotDigest?: string | null;
  disposition: RelianceChangeDisposition;
  evaluatorType: string;
  evaluatorRef: string;
  method: string;
  methodVersion: string;
  evidenceArtifactId: string;
  assessedAt: Date;
  reason?: string | null;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export class RelianceProvenanceConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'RelianceProvenanceConflictError';
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

function text(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
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

function idempotencyKey(value: string): string {
  const normalized = text(value, 'idempotencyKey');
  if (normalized.length < 8 || normalized.length > 500) {
    throw Object.assign(new Error('idempotencyKey must contain 8 to 500 characters.'), {
      statusCode: 400,
    });
  }
  return normalized;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function relationToDb(value: RelianceRelationKind): string {
  return value.toUpperCase();
}

function relationFromDb(value: string): RelianceRelationKind {
  const normalized = value.toLowerCase() as RelianceRelationKind;
  if (!RELATION_KINDS.includes(normalized)) {
    throw new RelianceProvenanceConflictError(`Unknown reliance relation kind ${value}.`);
  }
  return normalized;
}

function dispositionToDb(value: RelianceChangeDisposition): string {
  return value.replace('-', '_').toUpperCase();
}

function dispositionFromDb(value: string): RelianceChangeDisposition {
  const normalized = value.toLowerCase().replace('_', '-') as RelianceChangeDisposition;
  if (!DISPOSITIONS.includes(normalized)) {
    throw new RelianceProvenanceConflictError(`Unknown reliance disposition ${value}.`);
  }
  return normalized;
}

function parseStructuralChanges(value: Prisma.JsonValue): RelianceStructuralChange[] {
  if (!Array.isArray(value)) {
    throw new RelianceProvenanceConflictError('Stored structuralChanges is not an array.');
  }
  const result: RelianceStructuralChange[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !STRUCTURAL_CHANGES.includes(item as RelianceStructuralChange)) {
      throw new RelianceProvenanceConflictError(`Stored structural change ${String(item)} is invalid.`);
    }
    if (seen.has(item)) {
      throw new RelianceProvenanceConflictError(`Stored structural change ${item} is duplicated.`);
    }
    seen.add(item);
    result.push(item as RelianceStructuralChange);
  }
  return result;
}

function actorStateDigest(input: {
  actorId: string;
  lineageId: string;
  executionId: string;
  executionConfigHash: string;
  provider: string;
  model: string;
  runtime: string | null;
  ownerId: string | null;
  eventSequence: number;
  disclosureBundleDigest: string;
  capabilitySnapshotDigest: string | null;
  authoritySnapshotDigest: string | null;
  controlSnapshotDigest: string | null;
  correctiveStateDigest: string | null;
  dependencySnapshotDigest: string | null;
}): string {
  return sha256({ version: 'noeone.actor-reliance-state.v1', ...input });
}

function basisSemanticDigest(input: Omit<RelianceBasisRecord, 'id' | 'basisDigest'>): string {
  return sha256({ version: 'noeone.reliance-basis.semantic.v1', ...input });
}

function assessmentSemanticDigest(
  input: Omit<RelianceChangeAssessment, 'id' | 'basisDigest'>,
): string {
  return sha256({ version: 'noeone.reliance-assessment.semantic.v1', ...input });
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
    ...(row.authoritySnapshotDigest ? { authoritySnapshotDigest: row.authoritySnapshotDigest } : {}),
    ...(row.controlSnapshotDigest ? { controlSnapshotDigest: row.controlSnapshotDigest } : {}),
    ...(row.correctiveStateDigest ? { correctiveStateDigest: row.correctiveStateDigest } : {}),
    ...(row.dependencySnapshotDigest ? { dependencySnapshotDigest: row.dependencySnapshotDigest } : {}),
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

async function assertEvidenceExists(
  tx: Prisma.TransactionClient,
  evidenceArtifactId: string,
  field: string,
): Promise<void> {
  const found = await tx.evidenceArtifact.findUnique({
    where: { id: evidenceArtifactId },
    select: { id: true },
  });
  if (!found) {
    throw Object.assign(new Error(`${field} ${evidenceArtifactId} was not found.`), {
      statusCode: 404,
    });
  }
}

function datesEqual(left: Date | null, right: Date | null | undefined): boolean {
  return left?.getTime() === right?.getTime();
}

function assertBasisReplayCompatible(existing: RelianceBasis, input: CaptureRelianceBasisInput): void {
  const same =
    existing.actorId === input.actorId &&
    existing.counterpartyType === input.counterpartyType.trim() &&
    existing.counterpartyRef === input.counterpartyRef.trim() &&
    existing.relationKind === relationToDb(input.relationKind) &&
    existing.reliedAt.getTime() === input.reliedAt.getTime() &&
    datesEqual(existing.validUntil, input.validUntil) &&
    existing.lineageId === input.expectedLineageId &&
    existing.executionId === input.expectedExecutionId &&
    existing.disclosureBundleDigest === input.disclosureBundleDigest.toLowerCase() &&
    existing.capabilitySnapshotDigest === (input.capabilitySnapshotDigest?.toLowerCase() ?? null) &&
    existing.authoritySnapshotDigest === (input.authoritySnapshotDigest?.toLowerCase() ?? null) &&
    existing.controlSnapshotDigest === (input.controlSnapshotDigest?.toLowerCase() ?? null) &&
    existing.correctiveStateDigest === (input.correctiveStateDigest?.toLowerCase() ?? null) &&
    existing.dependencySnapshotDigest === (input.dependencySnapshotDigest?.toLowerCase() ?? null) &&
    existing.basisEvidenceArtifactId === input.basisEvidenceArtifactId &&
    existing.supersedesRelianceId === (input.supersedesRelianceId ?? null);
  if (!same) {
    throw new RelianceProvenanceConflictError(
      `Reliance idempotency key ${existing.idempotencyKey} was reused with conflicting data.`,
    );
  }
}

function assertAssessmentReplayCompatible(
  existing: RelianceChangeAssessmentRow,
  input: AssessRelianceChangeInput,
): void {
  const same =
    existing.relianceId === input.relianceId &&
    existing.actorId === input.actorId &&
    existing.successorLineageId === input.expectedSuccessorLineageId &&
    existing.successorExecutionId === input.expectedSuccessorExecutionId &&
    existing.successorDisclosureBundleDigest === input.successorDisclosureBundleDigest.toLowerCase() &&
    existing.successorCapabilitySnapshotDigest ===
      (input.successorCapabilitySnapshotDigest?.toLowerCase() ?? null) &&
    existing.successorAuthoritySnapshotDigest ===
      (input.successorAuthoritySnapshotDigest?.toLowerCase() ?? null) &&
    existing.successorControlSnapshotDigest ===
      (input.successorControlSnapshotDigest?.toLowerCase() ?? null) &&
    existing.successorCorrectiveStateDigest ===
      (input.successorCorrectiveStateDigest?.toLowerCase() ?? null) &&
    existing.successorDependencySnapshotDigest ===
      (input.successorDependencySnapshotDigest?.toLowerCase() ?? null) &&
    existing.disposition === dispositionToDb(input.disposition) &&
    existing.evaluatorType === input.evaluatorType.trim() &&
    existing.evaluatorRef === input.evaluatorRef.trim() &&
    existing.method === input.method.trim() &&
    existing.methodVersion === input.methodVersion.trim() &&
    existing.evidenceArtifactId === input.evidenceArtifactId &&
    existing.assessedAt.getTime() === input.assessedAt.getTime() &&
    existing.reason === (input.reason ?? null);
  if (!same) {
    throw new RelianceProvenanceConflictError(
      `Reliance assessment idempotency key ${existing.idempotencyKey} was reused with conflicting data.`,
    );
  }
}

async function currentEventSequence(tx: Prisma.TransactionClient, actorId: string): Promise<number> {
  const latest = await tx.actorEvent.findFirst({
    where: { actorId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  return latest?.sequence ?? 0;
}

function currentStateMaterial(input: {
  actorId: string;
  lineageId: string;
  execution: ActorExecution;
  ownerId: string | null;
  eventSequence: number;
  disclosureBundleDigest: string;
  capabilitySnapshotDigest: string | null;
  authoritySnapshotDigest: string | null;
  controlSnapshotDigest: string | null;
  correctiveStateDigest: string | null;
  dependencySnapshotDigest: string | null;
}) {
  return {
    actorId: input.actorId,
    lineageId: input.lineageId,
    executionId: input.execution.id,
    executionConfigHash: input.execution.configHash,
    provider: input.execution.provider,
    model: input.execution.model,
    runtime: input.execution.runtime,
    ownerId: input.ownerId,
    eventSequence: input.eventSequence,
    disclosureBundleDigest: input.disclosureBundleDigest,
    capabilitySnapshotDigest: input.capabilitySnapshotDigest,
    authoritySnapshotDigest: input.authoritySnapshotDigest,
    controlSnapshotDigest: input.controlSnapshotDigest,
    correctiveStateDigest: input.correctiveStateDigest,
    dependencySnapshotDigest: input.dependencySnapshotDigest,
  };
}

export async function captureRelianceBasis(
  input: CaptureRelianceBasisInput,
  registry: RegistryContext,
): Promise<{ replayed: boolean; basis: RelianceBasis }> {
  const normalized = {
    actorId: text(input.actorId, 'actorId'),
    counterpartyType: text(input.counterpartyType, 'counterpartyType'),
    counterpartyRef: text(input.counterpartyRef, 'counterpartyRef'),
    relationKind: input.relationKind,
    reliedAt: input.reliedAt,
    validUntil: input.validUntil ?? null,
    expectedLineageId: text(input.expectedLineageId, 'expectedLineageId'),
    expectedExecutionId: text(input.expectedExecutionId, 'expectedExecutionId'),
    disclosureBundleDigest: digest(input.disclosureBundleDigest, 'disclosureBundleDigest'),
    capabilitySnapshotDigest: optionalDigest(input.capabilitySnapshotDigest, 'capabilitySnapshotDigest'),
    authoritySnapshotDigest: optionalDigest(input.authoritySnapshotDigest, 'authoritySnapshotDigest'),
    controlSnapshotDigest: optionalDigest(input.controlSnapshotDigest, 'controlSnapshotDigest'),
    correctiveStateDigest: optionalDigest(input.correctiveStateDigest, 'correctiveStateDigest'),
    dependencySnapshotDigest: optionalDigest(input.dependencySnapshotDigest, 'dependencySnapshotDigest'),
    basisEvidenceArtifactId: text(input.basisEvidenceArtifactId, 'basisEvidenceArtifactId'),
    supersedesRelianceId: input.supersedesRelianceId
      ? text(input.supersedesRelianceId, 'supersedesRelianceId')
      : null,
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    capturedAt: input.capturedAt ?? new Date(),
    metadata: input.metadata ?? {},
  };

  if (normalized.reliedAt.getTime() > normalized.capturedAt.getTime()) {
    throw Object.assign(new Error('reliedAt cannot be after capturedAt.'), { statusCode: 400 });
  }
  if (
    normalized.validUntil &&
    normalized.validUntil.getTime() <= normalized.reliedAt.getTime()
  ) {
    throw Object.assign(new Error('validUntil must be after reliedAt.'), { statusCode: 400 });
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.relianceBasis.findUnique({
      where: { idempotencyKey: normalized.idempotencyKey },
    });
    if (existing) {
      assertBasisReplayCompatible(existing, input);
      return { replayed: true, basis: existing };
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${normalized.actorId} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const actor = await tx.actor.findUniqueOrThrow({ where: { id: normalized.actorId } });
    if (actor.canonicalLineageId !== normalized.expectedLineageId) {
      throw new RelianceProvenanceConflictError('Actor canonical lineage changed before reliance capture.');
    }

    const lineage = await tx.lineageNode.findUnique({
      where: { id: normalized.expectedLineageId },
      select: { id: true, actorId: true, canonical: true },
    });
    if (!lineage || lineage.actorId !== actor.id || lineage.canonical !== true) {
      throw new RelianceProvenanceConflictError('Expected lineage is not the actor canonical head.');
    }

    const execution = await tx.actorExecution.findUnique({
      where: { id: normalized.expectedExecutionId },
    });
    if (!execution || execution.actorId !== actor.id || execution.endedAt !== null) {
      throw new RelianceProvenanceConflictError('Expected execution is not the actor live execution.');
    }

    await assertEvidenceExists(tx, normalized.basisEvidenceArtifactId, 'basisEvidenceArtifactId');

    if (normalized.supersedesRelianceId) {
      const prior = await tx.relianceBasis.findUnique({
        where: { id: normalized.supersedesRelianceId },
      });
      if (!prior) {
        throw Object.assign(new Error('Superseded reliance basis not found.'), { statusCode: 404 });
      }
      if (
        prior.actorId !== actor.id ||
        prior.counterpartyType !== normalized.counterpartyType ||
        prior.counterpartyRef !== normalized.counterpartyRef ||
        prior.relationKind !== relationToDb(normalized.relationKind)
      ) {
        throw new RelianceProvenanceConflictError(
          'A renewal can only supersede the same counterparty relation over the same actor.',
        );
      }
    }

    const eventSequence = await currentEventSequence(tx, actor.id);
    const stateMaterial = currentStateMaterial({
      actorId: actor.id,
      lineageId: lineage.id,
      execution,
      ownerId: actor.ownerId,
      eventSequence,
      disclosureBundleDigest: normalized.disclosureBundleDigest,
      capabilitySnapshotDigest: normalized.capabilitySnapshotDigest,
      authoritySnapshotDigest: normalized.authoritySnapshotDigest,
      controlSnapshotDigest: normalized.controlSnapshotDigest,
      correctiveStateDigest: normalized.correctiveStateDigest,
      dependencySnapshotDigest: normalized.dependencySnapshotDigest,
    });
    const stateDigest = actorStateDigest(stateMaterial);

    const coreWithoutDigest: Omit<RelianceBasisRecord, 'id' | 'basisDigest'> = {
      version: 'noeone.reliance-basis.v1',
      actorId: actor.id,
      counterpartyType: normalized.counterpartyType,
      counterpartyRef: normalized.counterpartyRef,
      relationKind: normalized.relationKind,
      reliedAt: normalized.reliedAt.toISOString(),
      ...(normalized.validUntil ? { validUntil: normalized.validUntil.toISOString() } : {}),
      lineageId: lineage.id,
      executionId: execution.id,
      executionConfigHash: execution.configHash,
      ...(actor.ownerId ? { actorOwnerId: actor.ownerId } : {}),
      observedEventSequence: eventSequence,
      disclosureBundleDigest: normalized.disclosureBundleDigest,
      ...(normalized.capabilitySnapshotDigest
        ? { capabilitySnapshotDigest: normalized.capabilitySnapshotDigest }
        : {}),
      ...(normalized.authoritySnapshotDigest
        ? { authoritySnapshotDigest: normalized.authoritySnapshotDigest }
        : {}),
      ...(normalized.controlSnapshotDigest
        ? { controlSnapshotDigest: normalized.controlSnapshotDigest }
        : {}),
      ...(normalized.correctiveStateDigest
        ? { correctiveStateDigest: normalized.correctiveStateDigest }
        : {}),
      ...(normalized.dependencySnapshotDigest
        ? { dependencySnapshotDigest: normalized.dependencySnapshotDigest }
        : {}),
      basisEvidenceArtifactId: normalized.basisEvidenceArtifactId,
      actorStateDigest: stateDigest,
      capturedAt: normalized.capturedAt.toISOString(),
      ...(normalized.supersedesRelianceId
        ? { supersedesRelianceId: normalized.supersedesRelianceId }
        : {}),
    };
    const semanticDigest = basisSemanticDigest(coreWithoutDigest);
    const core: RelianceBasisRecord = {
      ...coreWithoutDigest,
      id: `rlb_${randomUUID()}`,
      basisDigest: semanticDigest,
    };
    assertValidRelianceBasisRecord(core);

    const created = await tx.relianceBasis.create({
      data: {
        id: core.id,
        actorId: core.actorId,
        counterpartyType: core.counterpartyType,
        counterpartyRef: core.counterpartyRef,
        relationKind: relationToDb(core.relationKind),
        reliedAt: new Date(core.reliedAt),
        validUntil: core.validUntil ? new Date(core.validUntil) : null,
        lineageId: core.lineageId,
        executionId: core.executionId,
        executionConfigHash: core.executionConfigHash,
        actorOwnerId: core.actorOwnerId ?? null,
        observedEventSequence: core.observedEventSequence,
        disclosureBundleDigest: core.disclosureBundleDigest,
        capabilitySnapshotDigest: core.capabilitySnapshotDigest ?? null,
        authoritySnapshotDigest: core.authoritySnapshotDigest ?? null,
        controlSnapshotDigest: core.controlSnapshotDigest ?? null,
        correctiveStateDigest: core.correctiveStateDigest ?? null,
        dependencySnapshotDigest: core.dependencySnapshotDigest ?? null,
        basisEvidenceArtifactId: core.basisEvidenceArtifactId,
        actorStateDigest: core.actorStateDigest,
        basisDigest: core.basisDigest,
        idempotencyKey: normalized.idempotencyKey,
        supersedesRelianceId: core.supersedesRelianceId ?? null,
        capturedAt: new Date(core.capturedAt),
        metadata: normalized.metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: actor.id,
        executionId: execution.id,
        type: 'actor.reliance.captured',
        sourceKey: `reliance-basis:${normalized.idempotencyKey}`,
        occurredAt: normalized.capturedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          relianceId: created.id,
          relationKind: core.relationKind,
          counterpartyType: core.counterpartyType,
          observedEventSequence: core.observedEventSequence,
          actorStateDigest: core.actorStateDigest,
          basisDigest: core.basisDigest,
          ...(core.supersedesRelianceId
            ? { supersedesRelianceId: core.supersedesRelianceId }
            : {}),
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, basis: created };
  });
}

export async function assessRelianceChange(
  input: AssessRelianceChangeInput,
  registry: RegistryContext,
): Promise<{ replayed: boolean; assessment: RelianceChangeAssessmentRow; structuralChanges: RelianceStructuralChange[] }> {
  const normalized = {
    relianceId: text(input.relianceId, 'relianceId'),
    actorId: text(input.actorId, 'actorId'),
    expectedSuccessorLineageId: text(
      input.expectedSuccessorLineageId,
      'expectedSuccessorLineageId',
    ),
    expectedSuccessorExecutionId: text(
      input.expectedSuccessorExecutionId,
      'expectedSuccessorExecutionId',
    ),
    successorDisclosureBundleDigest: digest(
      input.successorDisclosureBundleDigest,
      'successorDisclosureBundleDigest',
    ),
    successorCapabilitySnapshotDigest: optionalDigest(
      input.successorCapabilitySnapshotDigest,
      'successorCapabilitySnapshotDigest',
    ),
    successorAuthoritySnapshotDigest: optionalDigest(
      input.successorAuthoritySnapshotDigest,
      'successorAuthoritySnapshotDigest',
    ),
    successorControlSnapshotDigest: optionalDigest(
      input.successorControlSnapshotDigest,
      'successorControlSnapshotDigest',
    ),
    successorCorrectiveStateDigest: optionalDigest(
      input.successorCorrectiveStateDigest,
      'successorCorrectiveStateDigest',
    ),
    successorDependencySnapshotDigest: optionalDigest(
      input.successorDependencySnapshotDigest,
      'successorDependencySnapshotDigest',
    ),
    disposition: input.disposition,
    evaluatorType: text(input.evaluatorType, 'evaluatorType'),
    evaluatorRef: text(input.evaluatorRef, 'evaluatorRef'),
    method: text(input.method, 'method'),
    methodVersion: text(input.methodVersion, 'methodVersion'),
    evidenceArtifactId: text(input.evidenceArtifactId, 'evidenceArtifactId'),
    assessedAt: input.assessedAt,
    reason: input.reason?.trim() || null,
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    metadata: input.metadata ?? {},
  };

  return db.$transaction(async (tx) => {
    const existing = await tx.relianceChangeAssessment.findUnique({
      where: { idempotencyKey: normalized.idempotencyKey },
    });
    if (existing) {
      assertAssessmentReplayCompatible(existing, input);
      return {
        replayed: true,
        assessment: existing,
        structuralChanges: parseStructuralChanges(existing.structuralChanges),
      };
    }

    const basisRow = await tx.relianceBasis.findUnique({ where: { id: normalized.relianceId } });
    if (!basisRow) {
      throw Object.assign(new Error('Reliance basis not found.'), { statusCode: 404 });
    }
    if (basisRow.actorId !== normalized.actorId) {
      throw new RelianceProvenanceConflictError('Reliance basis belongs to a different actor.');
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${normalized.actorId} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const actor = await tx.actor.findUniqueOrThrow({ where: { id: normalized.actorId } });
    if (actor.canonicalLineageId !== normalized.expectedSuccessorLineageId) {
      throw new RelianceProvenanceConflictError(
        'Actor canonical lineage changed before reliance assessment.',
      );
    }

    const successorLineage = await tx.lineageNode.findUnique({
      where: { id: normalized.expectedSuccessorLineageId },
      select: { id: true, actorId: true, canonical: true },
    });
    if (
      !successorLineage ||
      successorLineage.actorId !== actor.id ||
      successorLineage.canonical !== true
    ) {
      throw new RelianceProvenanceConflictError('Expected successor lineage is not canonical.');
    }

    const successorExecution = await tx.actorExecution.findUnique({
      where: { id: normalized.expectedSuccessorExecutionId },
    });
    if (
      !successorExecution ||
      successorExecution.actorId !== actor.id ||
      successorExecution.endedAt !== null
    ) {
      throw new RelianceProvenanceConflictError(
        'Expected successor execution is not the actor live execution.',
      );
    }

    const basisExecution = await tx.actorExecution.findUnique({
      where: { id: basisRow.executionId },
    });
    if (!basisExecution || basisExecution.actorId !== actor.id) {
      throw new RelianceProvenanceConflictError('Reliance basis execution is inconsistent.');
    }

    await assertEvidenceExists(tx, normalized.evidenceArtifactId, 'evidenceArtifactId');

    const eventSequence = await currentEventSequence(tx, actor.id);
    const basis = toCoreBasis(basisRow);
    assertValidRelianceBasisRecord(basis);

    const structuralChanges = deriveRelianceStructuralChanges({
      basis,
      successor: {
        lineageId: successorLineage.id,
        executionId: successorExecution.id,
        executionConfigHash: successorExecution.configHash,
        provider: successorExecution.provider,
        model: successorExecution.model,
        runtime: successorExecution.runtime,
        ownerId: actor.ownerId,
        eventSequence,
      },
      basisExecution: {
        provider: basisExecution.provider,
        model: basisExecution.model,
        runtime: basisExecution.runtime,
      },
      disclosureBundleDigest: normalized.successorDisclosureBundleDigest,
      ...(normalized.successorCapabilitySnapshotDigest
        ? { capabilitySnapshotDigest: normalized.successorCapabilitySnapshotDigest }
        : {}),
      ...(normalized.successorAuthoritySnapshotDigest
        ? { authoritySnapshotDigest: normalized.successorAuthoritySnapshotDigest }
        : {}),
      ...(normalized.successorControlSnapshotDigest
        ? { controlSnapshotDigest: normalized.successorControlSnapshotDigest }
        : {}),
      ...(normalized.successorCorrectiveStateDigest
        ? { correctiveStateDigest: normalized.successorCorrectiveStateDigest }
        : {}),
      ...(normalized.successorDependencySnapshotDigest
        ? { dependencySnapshotDigest: normalized.successorDependencySnapshotDigest }
        : {}),
    });

    const successorMaterial = currentStateMaterial({
      actorId: actor.id,
      lineageId: successorLineage.id,
      execution: successorExecution,
      ownerId: actor.ownerId,
      eventSequence,
      disclosureBundleDigest: normalized.successorDisclosureBundleDigest,
      capabilitySnapshotDigest: normalized.successorCapabilitySnapshotDigest,
      authoritySnapshotDigest: normalized.successorAuthoritySnapshotDigest,
      controlSnapshotDigest: normalized.successorControlSnapshotDigest,
      correctiveStateDigest: normalized.successorCorrectiveStateDigest,
      dependencySnapshotDigest: normalized.successorDependencySnapshotDigest,
    });
    const successorStateDigest = actorStateDigest(successorMaterial);

    const coreWithoutDigest: Omit<RelianceChangeAssessment, 'id' | 'basisDigest'> = {
      version: 'noeone.reliance-change-assessment.v1',
      relianceId: basis.id,
      actorId: actor.id,
      successorLineageId: successorLineage.id,
      successorExecutionId: successorExecution.id,
      successorExecutionConfigHash: successorExecution.configHash,
      ...(actor.ownerId ? { successorActorOwnerId: actor.ownerId } : {}),
      successorEventSequence: eventSequence,
      successorDisclosureBundleDigest: normalized.successorDisclosureBundleDigest,
      ...(normalized.successorCapabilitySnapshotDigest
        ? { successorCapabilitySnapshotDigest: normalized.successorCapabilitySnapshotDigest }
        : {}),
      ...(normalized.successorAuthoritySnapshotDigest
        ? { successorAuthoritySnapshotDigest: normalized.successorAuthoritySnapshotDigest }
        : {}),
      ...(normalized.successorControlSnapshotDigest
        ? { successorControlSnapshotDigest: normalized.successorControlSnapshotDigest }
        : {}),
      ...(normalized.successorCorrectiveStateDigest
        ? { successorCorrectiveStateDigest: normalized.successorCorrectiveStateDigest }
        : {}),
      ...(normalized.successorDependencySnapshotDigest
        ? { successorDependencySnapshotDigest: normalized.successorDependencySnapshotDigest }
        : {}),
      successorStateDigest,
      structuralChanges,
      disposition: normalized.disposition,
      evaluatorType: normalized.evaluatorType,
      evaluatorRef: normalized.evaluatorRef,
      method: normalized.method,
      methodVersion: normalized.methodVersion,
      evidenceArtifactId: normalized.evidenceArtifactId,
      assessedAt: normalized.assessedAt.toISOString(),
      ...(normalized.reason ? { reason: normalized.reason } : {}),
    };
    const semanticDigest = assessmentSemanticDigest(coreWithoutDigest);
    const core: RelianceChangeAssessment = {
      ...coreWithoutDigest,
      id: `rla_${randomUUID()}`,
      basisDigest: semanticDigest,
    };
    assertValidRelianceChangeAssessment(core, basis);

    const created = await tx.relianceChangeAssessment.create({
      data: {
        id: core.id,
        relianceId: core.relianceId,
        actorId: core.actorId,
        successorLineageId: core.successorLineageId,
        successorExecutionId: core.successorExecutionId,
        successorExecutionConfigHash: core.successorExecutionConfigHash,
        successorActorOwnerId: core.successorActorOwnerId ?? null,
        successorEventSequence: core.successorEventSequence,
        successorDisclosureBundleDigest: core.successorDisclosureBundleDigest,
        successorCapabilitySnapshotDigest: core.successorCapabilitySnapshotDigest ?? null,
        successorAuthoritySnapshotDigest: core.successorAuthoritySnapshotDigest ?? null,
        successorControlSnapshotDigest: core.successorControlSnapshotDigest ?? null,
        successorCorrectiveStateDigest: core.successorCorrectiveStateDigest ?? null,
        successorDependencySnapshotDigest: core.successorDependencySnapshotDigest ?? null,
        successorStateDigest: core.successorStateDigest,
        structuralChanges: core.structuralChanges as Prisma.InputJsonValue,
        disposition: dispositionToDb(core.disposition),
        evaluatorType: core.evaluatorType,
        evaluatorRef: core.evaluatorRef,
        method: core.method,
        methodVersion: core.methodVersion,
        evidenceArtifactId: core.evidenceArtifactId,
        reason: core.reason ?? null,
        assessedAt: new Date(core.assessedAt),
        basisDigest: core.basisDigest,
        idempotencyKey: normalized.idempotencyKey,
        metadata: normalized.metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: actor.id,
        executionId: successorExecution.id,
        type: 'actor.reliance.assessed',
        sourceKey: `reliance-assessment:${normalized.idempotencyKey}`,
        occurredAt: normalized.assessedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          relianceId: basis.id,
          assessmentId: created.id,
          disposition: core.disposition,
          structuralChanges,
          successorStateDigest,
          basisDigest: core.basisDigest,
          evaluatorType: core.evaluatorType,
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, assessment: created, structuralChanges };
  });
}

export async function verifyRelianceProvenance(actorId: string): Promise<{
  version: 'noeone.reliance-provenance-verification.v1';
  actorId: string;
  valid: boolean;
  basisCount: number;
  assessmentCount: number;
  issues: string[];
}> {
  const normalizedActorId = text(actorId, 'actorId');
  const [bases, assessments] = await Promise.all([
    db.relianceBasis.findMany({
      where: { actorId: normalizedActorId },
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
    }),
    db.relianceChangeAssessment.findMany({
      where: { actorId: normalizedActorId },
      orderBy: [{ assessedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const issues: string[] = [];
  const basisById = new Map<string, RelianceBasisRecord>();
  const executionCache = new Map<string, ActorExecution>();

  for (const row of bases) {
    try {
      const core = toCoreBasis(row);
      assertValidRelianceBasisRecord(core);

      const [execution, lineage, evidence] = await Promise.all([
        db.actorExecution.findUnique({ where: { id: row.executionId } }),
        db.lineageNode.findUnique({ where: { id: row.lineageId } }),
        db.evidenceArtifact.findUnique({ where: { id: row.basisEvidenceArtifactId }, select: { id: true } }),
      ]);
      if (!execution || execution.actorId !== row.actorId) {
        throw new Error('basis execution does not belong to actor');
      }
      if (execution.configHash !== row.executionConfigHash) {
        throw new Error('basis execution config hash mismatch');
      }
      if (!lineage || lineage.actorId !== row.actorId) {
        throw new Error('basis lineage does not belong to actor');
      }
      if (!evidence) throw new Error('basis evidence artifact missing');

      if (row.observedEventSequence > 0) {
        const cutoff = await db.actorEvent.findUnique({
          where: {
            actorId_sequence: {
              actorId: row.actorId,
              sequence: row.observedEventSequence,
            },
          },
          select: { observedAt: true },
        });
        if (!cutoff) throw new Error('observed history cutoff event is missing');
        if (cutoff.observedAt.getTime() > row.capturedAt.getTime()) {
          throw new Error('observed history cutoff postdates reliance capture');
        }
      }

      const recomputedState = actorStateDigest(
        currentStateMaterial({
          actorId: row.actorId,
          lineageId: row.lineageId,
          execution,
          ownerId: row.actorOwnerId,
          eventSequence: row.observedEventSequence,
          disclosureBundleDigest: row.disclosureBundleDigest,
          capabilitySnapshotDigest: row.capabilitySnapshotDigest,
          authoritySnapshotDigest: row.authoritySnapshotDigest,
          controlSnapshotDigest: row.controlSnapshotDigest,
          correctiveStateDigest: row.correctiveStateDigest,
          dependencySnapshotDigest: row.dependencySnapshotDigest,
        }),
      );
      if (recomputedState !== row.actorStateDigest) {
        throw new Error('actor state digest does not verify');
      }

      const expectedBasisDigest = basisSemanticDigest((({ id: _id, basisDigest: _digest, ...rest }) => rest)(core));
      if (expectedBasisDigest !== row.basisDigest) {
        throw new Error('basis semantic digest does not verify');
      }

      basisById.set(row.id, core);
      executionCache.set(execution.id, execution);
    } catch (error) {
      issues.push(`basis:${row.id}:${error instanceof Error ? error.message : 'verification failed'}`);
    }
  }

  for (const row of assessments) {
    try {
      const basis = basisById.get(row.relianceId);
      if (!basis) throw new Error('referenced reliance basis did not verify');
      const core = toCoreAssessment(row);
      assertValidRelianceChangeAssessment(core, basis);

      let basisExecution = executionCache.get(basis.executionId);
      if (!basisExecution) {
        const loaded = await db.actorExecution.findUnique({ where: { id: basis.executionId } });
        if (!loaded) throw new Error('basis execution missing');
        basisExecution = loaded;
      }
      const [successorExecution, successorLineage, evidence] = await Promise.all([
        db.actorExecution.findUnique({ where: { id: row.successorExecutionId } }),
        db.lineageNode.findUnique({ where: { id: row.successorLineageId } }),
        db.evidenceArtifact.findUnique({ where: { id: row.evidenceArtifactId }, select: { id: true } }),
      ]);
      if (!successorExecution || successorExecution.actorId !== row.actorId) {
        throw new Error('successor execution does not belong to actor');
      }
      if (successorExecution.configHash !== row.successorExecutionConfigHash) {
        throw new Error('successor execution config hash mismatch');
      }
      if (!successorLineage || successorLineage.actorId !== row.actorId) {
        throw new Error('successor lineage does not belong to actor');
      }
      if (!evidence) throw new Error('assessment evidence artifact missing');

      const recomputedSuccessor = actorStateDigest(
        currentStateMaterial({
          actorId: row.actorId,
          lineageId: row.successorLineageId,
          execution: successorExecution,
          ownerId: row.successorActorOwnerId,
          eventSequence: row.successorEventSequence,
          disclosureBundleDigest: row.successorDisclosureBundleDigest,
          capabilitySnapshotDigest: row.successorCapabilitySnapshotDigest,
          authoritySnapshotDigest: row.successorAuthoritySnapshotDigest,
          controlSnapshotDigest: row.successorControlSnapshotDigest,
          correctiveStateDigest: row.successorCorrectiveStateDigest,
          dependencySnapshotDigest: row.successorDependencySnapshotDigest,
        }),
      );
      if (recomputedSuccessor !== row.successorStateDigest) {
        throw new Error('successor state digest does not verify');
      }

      const expectedChanges = deriveRelianceStructuralChanges({
        basis,
        successor: {
          lineageId: row.successorLineageId,
          executionId: row.successorExecutionId,
          executionConfigHash: row.successorExecutionConfigHash,
          provider: successorExecution.provider,
          model: successorExecution.model,
          runtime: successorExecution.runtime,
          ownerId: row.successorActorOwnerId,
          eventSequence: row.successorEventSequence,
        },
        basisExecution: {
          provider: basisExecution.provider,
          model: basisExecution.model,
          runtime: basisExecution.runtime,
        },
        disclosureBundleDigest: row.successorDisclosureBundleDigest,
        ...(row.successorCapabilitySnapshotDigest
          ? { capabilitySnapshotDigest: row.successorCapabilitySnapshotDigest }
          : {}),
        ...(row.successorAuthoritySnapshotDigest
          ? { authoritySnapshotDigest: row.successorAuthoritySnapshotDigest }
          : {}),
        ...(row.successorControlSnapshotDigest
          ? { controlSnapshotDigest: row.successorControlSnapshotDigest }
          : {}),
        ...(row.successorCorrectiveStateDigest
          ? { correctiveStateDigest: row.successorCorrectiveStateDigest }
          : {}),
        ...(row.successorDependencySnapshotDigest
          ? { dependencySnapshotDigest: row.successorDependencySnapshotDigest }
          : {}),
      });
      const storedChanges = parseStructuralChanges(row.structuralChanges);
      if (canonicalJson(expectedChanges) !== canonicalJson(storedChanges)) {
        throw new Error('stored structural change classification does not verify');
      }

      const expectedAssessmentDigest = assessmentSemanticDigest(
        (({ id: _id, basisDigest: _digest, ...rest }) => rest)(core),
      );
      if (expectedAssessmentDigest !== row.basisDigest) {
        throw new Error('assessment semantic digest does not verify');
      }
    } catch (error) {
      issues.push(
        `assessment:${row.id}:${error instanceof Error ? error.message : 'verification failed'}`,
      );
    }
  }

  return {
    version: 'noeone.reliance-provenance-verification.v1',
    actorId: normalizedActorId,
    valid: issues.length === 0,
    basisCount: bases.length,
    assessmentCount: assessments.length,
    issues,
  };
}

export async function getRelianceHistory(actorId: string, limit = 100) {
  const normalizedActorId = text(actorId, 'actorId');
  return db.relianceBasis.findMany({
    where: { actorId: normalizedActorId },
    take: Math.min(Math.max(limit, 1), 100),
    orderBy: [{ reliedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function getRelianceAssessments(relianceId: string, limit = 100) {
  return db.relianceChangeAssessment.findMany({
    where: { relianceId: text(relianceId, 'relianceId') },
    take: Math.min(Math.max(limit, 1), 100),
    orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
  });
}