import { createHash } from 'node:crypto';
import type { ActorEvent as DbActorEvent, Prisma } from '@prisma/client';
import {
  assertInterventionFrontierMatchesDecisionFrontier,
  assertValidInterventionAttemptRecord,
  assertValidInterventionFrontierRecord,
  assertValidOversightEffectivenessAssessment,
  type InterventionAttemptRecord,
  type InterventionFrontierRecord,
  type OversightEffectivenessAssessment,
} from '@onbae/actor-core';
import {
  canonicalJson,
  verifyEventHash,
  verifyEventSignature,
  type ActorEvent as CanonicalActorEvent,
} from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { getDecisionFrontier, getOutcomeForecast } from './decision-foreseeability.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

const FRONTIER_EVENT_TYPE = 'decision.intervention-frontier.recorded';
const ATTEMPT_EVENT_TYPE = 'decision.intervention-attempt.recorded';
const ASSESSMENT_EVENT_TYPE = 'decision.oversight.assessed';
const FRONTIER_PREFIX = 'intervention-frontier:';
const ATTEMPT_PREFIX = 'intervention-attempt:';
const ASSESSMENT_PREFIX = 'oversight-assessment:';

export class OversightOpportunityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'OversightOpportunityConflictError';
  }
}

function jsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256Canonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function frontierKey(id: string): string {
  return `${FRONTIER_PREFIX}${id}`;
}

function attemptKey(id: string): string {
  return `${ATTEMPT_PREFIX}${id}`;
}

function assessmentKey(id: string): string {
  return `${ASSESSMENT_PREFIX}${id}`;
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

async function assertActorExecutionAt(
  tx: Prisma.TransactionClient,
  actorId: string,
  executionId: string | undefined,
  at: string,
): Promise<void> {
  const actor = await tx.actor.findUnique({ where: { id: actorId }, select: { id: true } });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  if (!executionId) return;

  const execution = await tx.actorExecution.findUnique({
    where: { id: executionId },
    select: { actorId: true, startedAt: true, endedAt: true },
  });
  if (!execution || execution.actorId !== actorId) {
    throw new OversightOpportunityConflictError(
      `Execution ${executionId} does not belong to actor ${actorId}.`,
    );
  }

  const timestamp = Date.parse(at);
  if (execution.startedAt.getTime() > timestamp) {
    throw new OversightOpportunityConflictError(
      'Execution had not started at the historical decision time.',
    );
  }
  if (execution.endedAt && execution.endedAt.getTime() <= timestamp) {
    throw new OversightOpportunityConflictError(
      'Execution had ended before the historical decision time.',
    );
  }
}

function readFrontier(event: DbActorEvent): {
  record: InterventionFrontierRecord;
  recordDigest: string;
  decisionFrontierDigest: string;
} {
  const payload = event.payload as Record<string, unknown>;
  const record = payload.record as InterventionFrontierRecord | undefined;
  const recordDigest = payload.recordDigest;
  const decisionFrontierDigest = payload.decisionFrontierDigest;
  if (
    !record ||
    typeof recordDigest !== 'string' ||
    typeof decisionFrontierDigest !== 'string'
  ) {
    throw new OversightOpportunityConflictError(
      `Intervention Frontier event ${event.id} has invalid payload.`,
    );
  }
  assertValidInterventionFrontierRecord(record);
  return { record, recordDigest, decisionFrontierDigest };
}

function readAttempt(event: DbActorEvent): {
  record: InterventionAttemptRecord;
  recordDigest: string;
  frontierDigest: string;
} {
  const payload = event.payload as Record<string, unknown>;
  const record = payload.record as InterventionAttemptRecord | undefined;
  const recordDigest = payload.recordDigest;
  const frontierDigest = payload.frontierDigest;
  if (!record || typeof recordDigest !== 'string' || typeof frontierDigest !== 'string') {
    throw new OversightOpportunityConflictError(
      `Intervention attempt event ${event.id} has invalid payload.`,
    );
  }
  return { record, recordDigest, frontierDigest };
}

function readAssessment(event: DbActorEvent): {
  assessment: OversightEffectivenessAssessment;
  assessmentDigest: string;
  frontierDigest: string;
} {
  const payload = event.payload as Record<string, unknown>;
  const assessment = payload.assessment as OversightEffectivenessAssessment | undefined;
  const assessmentDigest = payload.assessmentDigest;
  const frontierDigest = payload.frontierDigest;
  if (
    !assessment ||
    typeof assessmentDigest !== 'string' ||
    typeof frontierDigest !== 'string'
  ) {
    throw new OversightOpportunityConflictError(
      `Oversight assessment event ${event.id} has invalid payload.`,
    );
  }
  return { assessment, assessmentDigest, frontierDigest };
}

async function assertReferencedForecasts(
  record: InterventionFrontierRecord,
  decisionId: string,
): Promise<void> {
  for (const forecastRef of record.information.forecastRefs) {
    const forecast = await getOutcomeForecast(forecastRef);
    if (!forecast) {
      throw Object.assign(new Error(`Outcome forecast ${forecastRef} not found.`), { statusCode: 404 });
    }
    if (
      forecast.record.actorId !== record.actorId ||
      forecast.record.decisionId !== decisionId ||
      forecast.record.frontierRecordId !== record.decisionFrontierRef
    ) {
      throw new OversightOpportunityConflictError(
        `Outcome forecast ${forecastRef} is outside the Intervention Frontier's historical decision.`,
      );
    }
    if (Date.parse(forecast.record.forecastAt) > Date.parse(record.interventionDeadlineAt)) {
      throw new OversightOpportunityConflictError(
        `Outcome forecast ${forecastRef} was not available before the intervention deadline.`,
      );
    }
  }
}

export async function recordInterventionFrontier(
  input: InterventionFrontierRecord,
  context: RegistryContext,
): Promise<{
  event: DbActorEvent;
  record: InterventionFrontierRecord;
  recordDigest: string;
  decisionFrontierDigest: string;
  replayed: boolean;
}> {
  const record = jsonValue(input);
  assertValidInterventionFrontierRecord(record);

  const decisionFrontier = await getDecisionFrontier(record.decisionFrontierRef);
  if (!decisionFrontier) {
    throw Object.assign(new Error('Decision Frontier not found.'), { statusCode: 404 });
  }
  assertInterventionFrontierMatchesDecisionFrontier(record, decisionFrontier.record);
  await assertReferencedForecasts(record, decisionFrontier.record.decisionId);

  const digest = sha256Canonical(record);
  const sourceKey = frontierKey(record.id);
  return db.$transaction(async (tx) => {
    await assertActorExecutionAt(tx, record.actorId, record.executionId, record.decisionAt);
    const existing = await tx.actorEvent.findUnique({ where: { sourceKey } });
    if (existing) {
      const persisted = readFrontier(existing);
      if (
        existing.type !== FRONTIER_EVENT_TYPE ||
        existing.actorId !== record.actorId ||
        persisted.recordDigest !== digest ||
        persisted.decisionFrontierDigest !== decisionFrontier.recordDigest ||
        canonicalJson(persisted.record) !== canonicalJson(record)
      ) {
        throw new OversightOpportunityConflictError(
          `Intervention Frontier ${record.id} conflicts with canonical history.`,
        );
      }
      return { event: existing, ...persisted, replayed: true };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: record.actorId,
        ...(record.executionId ? { executionId: record.executionId } : {}),
        type: FRONTIER_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(record.capturedAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({
          record,
          recordDigest: digest,
          decisionFrontierDigest: decisionFrontier.recordDigest,
        }),
      },
      context.signingSecret,
    );
    return {
      event,
      record,
      recordDigest: digest,
      decisionFrontierDigest: decisionFrontier.recordDigest,
      replayed: false,
    };
  });
}

export async function getInterventionFrontier(id: string) {
  const event = await db.actorEvent.findUnique({ where: { sourceKey: frontierKey(id) } });
  if (!event || event.type !== FRONTIER_EVENT_TYPE) return null;
  return { event, ...readFrontier(event) };
}

export async function listDecisionInterventionFrontiers(
  decisionFrontierRef: string,
  limit = 100,
) {
  const decisionFrontier = await getDecisionFrontier(decisionFrontierRef);
  if (!decisionFrontier) return null;

  const events = await db.actorEvent.findMany({
    where: { actorId: decisionFrontier.record.actorId, type: FRONTIER_EVENT_TYPE },
    orderBy: [{ occurredAt: 'asc' }, { sequence: 'asc' }],
    take: Math.max(1, Math.min(limit * 4, 500)),
  });
  return events
    .map((event) => ({ event, ...readFrontier(event) }))
    .filter((item) => item.record.decisionFrontierRef === decisionFrontierRef)
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function recordInterventionAttempt(
  input: InterventionAttemptRecord,
  context: RegistryContext,
): Promise<{
  event: DbActorEvent;
  record: InterventionAttemptRecord;
  recordDigest: string;
  frontierDigest: string;
  replayed: boolean;
}> {
  const record = jsonValue(input);
  const frontier = await getInterventionFrontier(record.frontierId);
  if (!frontier) {
    throw Object.assign(new Error('Intervention Frontier not found.'), { statusCode: 404 });
  }
  assertValidInterventionAttemptRecord(record, frontier.record);

  const digest = sha256Canonical(record);
  const sourceKey = attemptKey(record.id);
  return db.$transaction(async (tx) => {
    const existing = await tx.actorEvent.findUnique({ where: { sourceKey } });
    if (existing) {
      const persisted = readAttempt(existing);
      if (
        existing.type !== ATTEMPT_EVENT_TYPE ||
        existing.actorId !== record.actorId ||
        persisted.recordDigest !== digest ||
        persisted.frontierDigest !== frontier.recordDigest ||
        canonicalJson(persisted.record) !== canonicalJson(record)
      ) {
        throw new OversightOpportunityConflictError(
          `Intervention attempt ${record.id} conflicts with canonical history.`,
        );
      }
      return { event: existing, ...persisted, replayed: true };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: record.actorId,
        ...(frontier.record.executionId ? { executionId: frontier.record.executionId } : {}),
        type: ATTEMPT_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(record.attemptedAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({
          record,
          recordDigest: digest,
          frontierDigest: frontier.recordDigest,
        }),
      },
      context.signingSecret,
    );
    return {
      event,
      record,
      recordDigest: digest,
      frontierDigest: frontier.recordDigest,
      replayed: false,
    };
  });
}

export async function getInterventionAttempt(id: string) {
  const event = await db.actorEvent.findUnique({ where: { sourceKey: attemptKey(id) } });
  if (!event || event.type !== ATTEMPT_EVENT_TYPE) return null;
  return { event, ...readAttempt(event) };
}

export async function listInterventionAttempts(frontierId: string, limit = 100) {
  const frontier = await getInterventionFrontier(frontierId);
  if (!frontier) return null;
  const events = await db.actorEvent.findMany({
    where: { actorId: frontier.record.actorId, type: ATTEMPT_EVENT_TYPE },
    orderBy: [{ occurredAt: 'asc' }, { sequence: 'asc' }],
    take: Math.max(1, Math.min(limit * 4, 500)),
  });
  return events
    .map((event) => ({ event, ...readAttempt(event) }))
    .filter((item) => item.record.frontierId === frontierId)
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function recordOversightEffectivenessAssessment(
  input: OversightEffectivenessAssessment,
  context: RegistryContext,
): Promise<{
  event: DbActorEvent;
  assessment: OversightEffectivenessAssessment;
  assessmentDigest: string;
  frontierDigest: string;
  replayed: boolean;
}> {
  const assessment = jsonValue(input);
  const frontier = await getInterventionFrontier(assessment.frontierId);
  if (!frontier) {
    throw Object.assign(new Error('Intervention Frontier not found.'), { statusCode: 404 });
  }
  assertValidOversightEffectivenessAssessment(assessment, frontier.record);

  for (const attemptRef of assessment.attemptRefs) {
    const attempt = await getInterventionAttempt(attemptRef);
    if (!attempt) {
      throw Object.assign(new Error(`Intervention attempt ${attemptRef} not found.`), { statusCode: 404 });
    }
    if (attempt.record.frontierId !== frontier.record.id) {
      throw new OversightOpportunityConflictError(
        `Intervention attempt ${attemptRef} is outside the assessed Intervention Frontier.`,
      );
    }
  }

  for (const consequenceRef of assessment.consequenceObservationRefs) {
    const consequence = await db.consequenceObservation.findUnique({
      where: { id: consequenceRef },
      select: { id: true, occurredAt: true },
    });
    if (!consequence) {
      throw Object.assign(new Error(`Consequence observation ${consequenceRef} not found.`), {
        statusCode: 404,
      });
    }
    if (Date.parse(assessment.assessedAt) < consequence.occurredAt.getTime()) {
      throw new OversightOpportunityConflictError(
        `Oversight assessment cannot reference consequence ${consequenceRef} before it occurred.`,
      );
    }
  }

  const digest = sha256Canonical(assessment);
  const sourceKey = assessmentKey(assessment.id);
  return db.$transaction(async (tx) => {
    const existing = await tx.actorEvent.findUnique({ where: { sourceKey } });
    if (existing) {
      const persisted = readAssessment(existing);
      if (
        existing.type !== ASSESSMENT_EVENT_TYPE ||
        existing.actorId !== assessment.actorId ||
        persisted.assessmentDigest !== digest ||
        persisted.frontierDigest !== frontier.recordDigest ||
        canonicalJson(persisted.assessment) !== canonicalJson(assessment)
      ) {
        throw new OversightOpportunityConflictError(
          `Oversight assessment ${assessment.id} conflicts with canonical history.`,
        );
      }
      return { event: existing, ...persisted, replayed: true };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: assessment.actorId,
        ...(frontier.record.executionId ? { executionId: frontier.record.executionId } : {}),
        type: ASSESSMENT_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(assessment.assessedAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({
          assessment,
          assessmentDigest: digest,
          frontierDigest: frontier.recordDigest,
        }),
      },
      context.signingSecret,
    );
    return {
      event,
      assessment,
      assessmentDigest: digest,
      frontierDigest: frontier.recordDigest,
      replayed: false,
    };
  });
}

export async function getOversightEffectivenessAssessment(id: string) {
  const event = await db.actorEvent.findUnique({ where: { sourceKey: assessmentKey(id) } });
  if (!event || event.type !== ASSESSMENT_EVENT_TYPE) return null;
  return { event, ...readAssessment(event) };
}

export async function listOversightEffectivenessAssessments(frontierId: string, limit = 100) {
  const frontier = await getInterventionFrontier(frontierId);
  if (!frontier) return null;
  const events = await db.actorEvent.findMany({
    where: { actorId: frontier.record.actorId, type: ASSESSMENT_EVENT_TYPE },
    orderBy: [{ occurredAt: 'asc' }, { sequence: 'asc' }],
    take: Math.max(1, Math.min(limit * 4, 500)),
  });
  return events
    .map((event) => ({ event, ...readAssessment(event) }))
    .filter((item) => item.assessment.frontierId === frontierId)
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

async function verifyStoredEvent(event: DbActorEvent, signingSecret: string): Promise<boolean> {
  const canonical = toCanonicalActorEvent(event);
  const signature = canonical.provenance.signature;
  return (
    verifyEventHash(canonical) &&
    typeof signature === 'string' &&
    verifyEventSignature(canonical.hash, signature, signingSecret)
  );
}

export async function verifyOversightOpportunityRecord(
  kind: 'frontier' | 'attempt' | 'assessment',
  id: string,
  signingSecret: string,
): Promise<{ exists: boolean; eventValid: boolean; payloadValid: boolean }> {
  const sourceKey =
    kind === 'frontier' ? frontierKey(id) : kind === 'attempt' ? attemptKey(id) : assessmentKey(id);
  const event = await db.actorEvent.findUnique({ where: { sourceKey } });
  if (!event) return { exists: false, eventValid: false, payloadValid: false };

  let payloadValid = false;
  try {
    if (kind === 'frontier') {
      const persisted = readFrontier(event);
      const decisionFrontier = await getDecisionFrontier(persisted.record.decisionFrontierRef);
      payloadValid =
        persisted.recordDigest === sha256Canonical(persisted.record) &&
        decisionFrontier !== null &&
        persisted.decisionFrontierDigest === decisionFrontier.recordDigest;
      if (decisionFrontier) {
        assertInterventionFrontierMatchesDecisionFrontier(
          persisted.record,
          decisionFrontier.record,
        );
        await assertReferencedForecasts(persisted.record, decisionFrontier.record.decisionId);
      }
    } else if (kind === 'attempt') {
      const persisted = readAttempt(event);
      const frontier = await getInterventionFrontier(persisted.record.frontierId);
      payloadValid =
        persisted.recordDigest === sha256Canonical(persisted.record) &&
        frontier !== null &&
        persisted.frontierDigest === frontier.recordDigest;
      if (frontier) assertValidInterventionAttemptRecord(persisted.record, frontier.record);
    } else {
      const persisted = readAssessment(event);
      const frontier = await getInterventionFrontier(persisted.assessment.frontierId);
      payloadValid =
        persisted.assessmentDigest === sha256Canonical(persisted.assessment) &&
        frontier !== null &&
        persisted.frontierDigest === frontier.recordDigest;
      if (frontier) {
        assertValidOversightEffectivenessAssessment(persisted.assessment, frontier.record);
      }
    }
  } catch {
    payloadValid = false;
  }

  return { exists: true, eventValid: await verifyStoredEvent(event, signingSecret), payloadValid };
}