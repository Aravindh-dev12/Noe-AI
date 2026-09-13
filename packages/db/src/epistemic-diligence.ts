import { createHash } from 'node:crypto';
import type { ActorEvent as DbActorEvent, Prisma } from '@prisma/client';
import {
  assertValidDecisionInquiryRecord,
  assertValidEpistemicDiligenceAssessment,
  deriveDecisionInquiryCoverage,
  type DecisionInquiryCoverage,
  type DecisionInquiryRecord,
  type EpistemicDiligenceAssessment,
} from '@onbae/actor-core';
import {
  canonicalJson,
  verifyEventHash,
  verifyEventSignature,
  type ActorEvent as CanonicalActorEvent,
} from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

const INQUIRY_EVENT_TYPE = 'epistemic.inquiry.recorded';
const ASSESSMENT_EVENT_TYPE = 'epistemic.diligence.assessed';
const INQUIRY_SOURCE_PREFIX = 'epistemic-inquiry:';
const ASSESSMENT_SOURCE_PREFIX = 'epistemic-assessment:';

export class EpistemicDiligenceConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'EpistemicDiligenceConflictError';
  }
}

function jsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256Canonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function inquirySourceKey(recordId: string): string {
  return `${INQUIRY_SOURCE_PREFIX}${recordId}`;
}

function assessmentSourceKey(recordId: string, assessmentId: string): string {
  return `${ASSESSMENT_SOURCE_PREFIX}${recordId}:${assessmentId}`;
}

function canonicalStatus(status: DbActorEvent['canonicalStatus']): 'accepted' | 'disputed' | 'superseded' {
  switch (status) {
    case 'ACCEPTED':
      return 'accepted';
    case 'DISPUTED':
      return 'disputed';
    case 'SUPERSEDED':
      return 'superseded';
  }
}

function toCanonicalActorEvent(event: DbActorEvent): CanonicalActorEvent {
  return {
    id: event.id,
    actorId: event.actorId,
    type: event.type,
    ...(event.sourceKey ? { sourceKey: event.sourceKey } : {}),
    occurredAt: event.occurredAt.toISOString(),
    observedAt: event.observedAt.toISOString(),
    hostId: event.hostId,
    environmentVersion: event.environmentVersion,
    ...(event.executionId ? { executionId: event.executionId } : {}),
    payload: event.payload as Record<string, unknown>,
    provenance: {
      issuer: event.issuer,
      ...(event.signature ? { signature: event.signature } : {}),
      ...(event.previousEventHash ? { previousEventHash: event.previousEventHash } : {}),
    },
    canonicalStatus: canonicalStatus(event.canonicalStatus),
    hash: event.hash,
  };
}

function readInquiryPayload(event: DbActorEvent): {
  record: DecisionInquiryRecord;
  coverage: DecisionInquiryCoverage;
  recordDigest: string;
} {
  const payload = event.payload as Record<string, unknown>;
  const record = payload.record as DecisionInquiryRecord | undefined;
  const coverage = payload.coverage as DecisionInquiryCoverage | undefined;
  const recordDigest = payload.recordDigest;

  if (!record || !coverage || typeof recordDigest !== 'string') {
    throw new EpistemicDiligenceConflictError(
      `Inquiry event ${event.id} does not contain a valid persisted inquiry payload.`,
    );
  }
  assertValidDecisionInquiryRecord(record);
  return { record, coverage, recordDigest };
}

function sameCoverage(a: DecisionInquiryCoverage, b: DecisionInquiryCoverage): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

async function assertActorAndExecution(
  tx: Prisma.TransactionClient,
  record: DecisionInquiryRecord,
): Promise<void> {
  const actor = await tx.actor.findUnique({
    where: { id: record.actorId },
    select: { id: true },
  });
  if (!actor) {
    throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  }

  if (!record.executionId) return;
  const execution = await tx.actorExecution.findUnique({
    where: { id: record.executionId },
    select: { actorId: true, startedAt: true, endedAt: true },
  });
  if (!execution || execution.actorId !== record.actorId) {
    throw new EpistemicDiligenceConflictError(
      `Execution ${record.executionId} does not belong to actor ${record.actorId}.`,
    );
  }

  const decisionAt = Date.parse(record.decisionAt);
  if (execution.startedAt.getTime() > decisionAt) {
    throw new EpistemicDiligenceConflictError('Execution had not started at decision time.');
  }
  if (execution.endedAt && execution.endedAt.getTime() <= decisionAt) {
    throw new EpistemicDiligenceConflictError('Execution had already ended at decision time.');
  }
}

export async function recordDecisionInquiry(
  input: DecisionInquiryRecord,
  context: RegistryContext,
): Promise<{
  event: DbActorEvent;
  record: DecisionInquiryRecord;
  coverage: DecisionInquiryCoverage;
  recordDigest: string;
  replayed: boolean;
}> {
  const record = jsonValue(input);
  assertValidDecisionInquiryRecord(record);

  const now = Date.now();
  if (Date.parse(record.recordedAt) > now + 5 * 60 * 1000) {
    throw new EpistemicDiligenceConflictError(
      'recordedAt is too far in the future for a contemporaneous inquiry record.',
    );
  }

  const coverage = deriveDecisionInquiryCoverage(record);
  const recordDigest = sha256Canonical(record);
  const sourceKey = inquirySourceKey(record.id);

  return db.$transaction(async (tx) => {
    await assertActorAndExecution(tx, record);

    const existing = await tx.actorEvent.findUnique({ where: { sourceKey } });
    if (existing) {
      if (existing.type !== INQUIRY_EVENT_TYPE || existing.actorId !== record.actorId) {
        throw new EpistemicDiligenceConflictError(
          `Inquiry id ${record.id} is already bound to different canonical data.`,
        );
      }
      const persisted = readInquiryPayload(existing);
      if (
        persisted.recordDigest !== recordDigest ||
        canonicalJson(persisted.record) !== canonicalJson(record) ||
        !sameCoverage(persisted.coverage, coverage)
      ) {
        throw new EpistemicDiligenceConflictError(
          `Inquiry id ${record.id} was replayed with conflicting content.`,
        );
      }
      return {
        event: existing,
        record: persisted.record,
        coverage: persisted.coverage,
        recordDigest: persisted.recordDigest,
        replayed: true,
      };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: record.actorId,
        ...(record.executionId ? { executionId: record.executionId } : {}),
        type: INQUIRY_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(record.decisionAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({ record, coverage, recordDigest }),
      },
      context.signingSecret,
    );

    return { event, record, coverage, recordDigest, replayed: false };
  });
}

export async function getDecisionInquiry(recordId: string): Promise<{
  event: DbActorEvent;
  record: DecisionInquiryRecord;
  coverage: DecisionInquiryCoverage;
  recordDigest: string;
} | null> {
  const event = await db.actorEvent.findUnique({
    where: { sourceKey: inquirySourceKey(recordId) },
  });
  if (!event || event.type !== INQUIRY_EVENT_TYPE) return null;
  const persisted = readInquiryPayload(event);
  return { event, ...persisted };
}

export async function listActorDecisionInquiries(
  actorId: string,
  limit = 50,
): Promise<Array<{
  event: DbActorEvent;
  record: DecisionInquiryRecord;
  coverage: DecisionInquiryCoverage;
  recordDigest: string;
}>> {
  const events = await db.actorEvent.findMany({
    where: { actorId, type: INQUIRY_EVENT_TYPE },
    orderBy: [{ occurredAt: 'desc' }, { sequence: 'desc' }],
    take: Math.max(1, Math.min(limit, 100)),
  });
  return events.map((event) => ({ event, ...readInquiryPayload(event) }));
}

export async function recordEpistemicDiligenceAssessment(
  input: EpistemicDiligenceAssessment,
  context: RegistryContext,
): Promise<{
  event: DbActorEvent;
  assessment: EpistemicDiligenceAssessment;
  assessmentDigest: string;
  inquiryRecordDigest: string;
  replayed: boolean;
}> {
  const assessment = jsonValue(input);
  const inquiry = await getDecisionInquiry(assessment.decisionInquiryRecordId);
  if (!inquiry) {
    throw Object.assign(new Error('Decision inquiry record not found.'), { statusCode: 404 });
  }
  assertValidEpistemicDiligenceAssessment(assessment, inquiry.record);

  if (Date.parse(assessment.assessedAt) < Date.parse(inquiry.record.decisionAt)) {
    throw new EpistemicDiligenceConflictError('Assessment cannot precede the decision it evaluates.');
  }

  const assessmentDigest = sha256Canonical(assessment);
  const sourceKey = assessmentSourceKey(inquiry.record.id, assessment.id);

  return db.$transaction(async (tx) => {
    const existing = await tx.actorEvent.findUnique({ where: { sourceKey } });
    if (existing) {
      const payload = existing.payload as Record<string, unknown>;
      if (
        existing.type !== ASSESSMENT_EVENT_TYPE ||
        existing.actorId !== inquiry.record.actorId ||
        payload.assessmentDigest !== assessmentDigest ||
        canonicalJson(payload.assessment) !== canonicalJson(assessment) ||
        payload.inquiryRecordDigest !== inquiry.recordDigest
      ) {
        throw new EpistemicDiligenceConflictError(
          `Assessment ${assessment.id} was replayed with conflicting content.`,
        );
      }
      return {
        event: existing,
        assessment,
        assessmentDigest,
        inquiryRecordDigest: inquiry.recordDigest,
        replayed: true,
      };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: inquiry.record.actorId,
        type: ASSESSMENT_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(assessment.assessedAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({
          assessment,
          assessmentDigest,
          inquiryRecordDigest: inquiry.recordDigest,
        }),
      },
      context.signingSecret,
    );

    return {
      event,
      assessment,
      assessmentDigest,
      inquiryRecordDigest: inquiry.recordDigest,
      replayed: false,
    };
  });
}

export async function listEpistemicDiligenceAssessments(recordId: string, limit = 100) {
  const inquiry = await getDecisionInquiry(recordId);
  if (!inquiry) return null;

  const events = await db.actorEvent.findMany({
    where: {
      actorId: inquiry.record.actorId,
      type: ASSESSMENT_EVENT_TYPE,
      sourceKey: { startsWith: `${ASSESSMENT_SOURCE_PREFIX}${recordId}:` },
    },
    orderBy: [{ occurredAt: 'asc' }, { sequence: 'asc' }],
    take: Math.max(1, Math.min(limit, 100)),
  });

  return events.map((event) => {
    const payload = event.payload as Record<string, unknown>;
    return {
      event,
      assessment: payload.assessment as EpistemicDiligenceAssessment,
      assessmentDigest: payload.assessmentDigest as string,
      inquiryRecordDigest: payload.inquiryRecordDigest as string,
    };
  });
}

export async function verifyDecisionInquiry(
  recordId: string,
  signingSecret: string,
): Promise<{ valid: boolean; issues: string[]; recordDigest?: string }> {
  const inquiry = await getDecisionInquiry(recordId);
  if (!inquiry) return { valid: false, issues: ['inquiry_not_found'] };

  const issues: string[] = [];
  const event = toCanonicalActorEvent(inquiry.event);
  if (!verifyEventHash(event)) issues.push('event_hash_invalid');
  if (!inquiry.event.signature || !verifyEventSignature(inquiry.event.hash, inquiry.event.signature, signingSecret)) {
    issues.push('event_signature_invalid');
  }

  const recomputedRecordDigest = sha256Canonical(inquiry.record);
  if (recomputedRecordDigest !== inquiry.recordDigest) issues.push('record_digest_invalid');

  const recomputedCoverage = deriveDecisionInquiryCoverage(inquiry.record);
  if (!sameCoverage(recomputedCoverage, inquiry.coverage)) issues.push('coverage_mismatch');

  if (inquiry.event.actorId !== inquiry.record.actorId) issues.push('actor_binding_mismatch');
  if ((inquiry.event.executionId ?? undefined) !== inquiry.record.executionId) {
    issues.push('execution_binding_mismatch');
  }
  if (inquiry.event.occurredAt.toISOString() !== new Date(inquiry.record.decisionAt).toISOString()) {
    issues.push('decision_time_binding_mismatch');
  }

  const previous = inquiry.event.sequence > 1
    ? await db.actorEvent.findUnique({
        where: {
          actorId_sequence: {
            actorId: inquiry.event.actorId,
            sequence: inquiry.event.sequence - 1,
          },
        },
        select: { hash: true },
      })
    : null;
  if (inquiry.event.sequence === 1) {
    if (inquiry.event.previousEventHash !== null) issues.push('unexpected_previous_event_hash');
  } else if (!previous || inquiry.event.previousEventHash !== previous.hash) {
    issues.push('previous_event_link_invalid');
  }

  const next = await db.actorEvent.findUnique({
    where: {
      actorId_sequence: {
        actorId: inquiry.event.actorId,
        sequence: inquiry.event.sequence + 1,
      },
    },
    select: { previousEventHash: true },
  });
  if (next && next.previousEventHash !== inquiry.event.hash) issues.push('next_event_link_invalid');

  return {
    valid: issues.length === 0,
    issues,
    recordDigest: inquiry.recordDigest,
  };
}
