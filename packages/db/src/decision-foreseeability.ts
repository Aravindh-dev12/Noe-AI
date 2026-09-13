import { createHash } from 'node:crypto';
import type { ActorEvent as DbActorEvent, Prisma } from '@prisma/client';
import {
  assertForecastMatchesDecisionFrontierCandidate,
  assertValidDecisionFrontierRecord,
  assertValidForeseeabilityAssessment,
  assertValidOutcomeForecastRecord,
  type DecisionFrontierRecord,
  type ForeseeabilityAssessment,
  type OutcomeForecastRecord,
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

const FRONTIER_EVENT_TYPE = 'decision.frontier.recorded';
const FORECAST_EVENT_TYPE = 'decision.outcome-forecast.recorded';
const ASSESSMENT_EVENT_TYPE = 'decision.foreseeability.assessed';
const FRONTIER_PREFIX = 'decision-frontier:';
const FORECAST_PREFIX = 'outcome-forecast:';
const ASSESSMENT_PREFIX = 'foreseeability-assessment:';

export class DecisionForeseeabilityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'DecisionForeseeabilityConflictError';
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

function forecastKey(id: string): string {
  return `${FORECAST_PREFIX}${id}`;
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
    throw new DecisionForeseeabilityConflictError(
      `Execution ${executionId} does not belong to actor ${actorId}.`,
    );
  }

  const timestamp = Date.parse(at);
  if (execution.startedAt.getTime() > timestamp) {
    throw new DecisionForeseeabilityConflictError('Execution had not started at the historical decision time.');
  }
  if (execution.endedAt && execution.endedAt.getTime() <= timestamp) {
    throw new DecisionForeseeabilityConflictError('Execution had ended before the historical decision time.');
  }
}

function readFrontier(event: DbActorEvent): { record: DecisionFrontierRecord; recordDigest: string } {
  const payload = event.payload as Record<string, unknown>;
  const record = payload.record as DecisionFrontierRecord | undefined;
  const recordDigest = payload.recordDigest;
  if (!record || typeof recordDigest !== 'string') {
    throw new DecisionForeseeabilityConflictError(`Frontier event ${event.id} has invalid payload.`);
  }
  assertValidDecisionFrontierRecord(record);
  return { record, recordDigest };
}

function readForecast(event: DbActorEvent): {
  record: OutcomeForecastRecord;
  recordDigest: string;
  frontierDigest: string;
} {
  const payload = event.payload as Record<string, unknown>;
  const record = payload.record as OutcomeForecastRecord | undefined;
  const recordDigest = payload.recordDigest;
  const frontierDigest = payload.frontierDigest;
  if (!record || typeof recordDigest !== 'string' || typeof frontierDigest !== 'string') {
    throw new DecisionForeseeabilityConflictError(`Forecast event ${event.id} has invalid payload.`);
  }
  assertValidOutcomeForecastRecord(record);
  return { record, recordDigest, frontierDigest };
}

function readAssessment(event: DbActorEvent): {
  assessment: ForeseeabilityAssessment;
  assessmentDigest: string;
} {
  const payload = event.payload as Record<string, unknown>;
  const assessment = payload.assessment as ForeseeabilityAssessment | undefined;
  const assessmentDigest = payload.assessmentDigest;
  if (!assessment || typeof assessmentDigest !== 'string') {
    throw new DecisionForeseeabilityConflictError(`Assessment event ${event.id} has invalid payload.`);
  }
  return { assessment, assessmentDigest };
}

export async function recordDecisionFrontier(
  input: DecisionFrontierRecord,
  context: RegistryContext,
): Promise<{ event: DbActorEvent; record: DecisionFrontierRecord; recordDigest: string; replayed: boolean }> {
  const record = jsonValue(input);
  assertValidDecisionFrontierRecord(record);
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
        canonicalJson(persisted.record) !== canonicalJson(record)
      ) {
        throw new DecisionForeseeabilityConflictError(`Decision frontier ${record.id} conflicts with canonical history.`);
      }
      return { event: existing, record: persisted.record, recordDigest: digest, replayed: true };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: record.actorId,
        ...(record.executionId ? { executionId: record.executionId } : {}),
        type: FRONTIER_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(record.decisionAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({ record, recordDigest: digest }),
      },
      context.signingSecret,
    );
    return { event, record, recordDigest: digest, replayed: false };
  });
}

export async function getDecisionFrontier(id: string) {
  const event = await db.actorEvent.findUnique({ where: { sourceKey: frontierKey(id) } });
  if (!event || event.type !== FRONTIER_EVENT_TYPE) return null;
  return { event, ...readFrontier(event) };
}

export async function recordOutcomeForecast(
  input: OutcomeForecastRecord,
  context: RegistryContext,
): Promise<{
  event: DbActorEvent;
  record: OutcomeForecastRecord;
  recordDigest: string;
  frontierDigest: string;
  replayed: boolean;
}> {
  const record = jsonValue(input);
  assertValidOutcomeForecastRecord(record);
  const frontier = await getDecisionFrontier(record.frontierRecordId);
  if (!frontier) throw Object.assign(new Error('Decision frontier not found.'), { statusCode: 404 });
  assertForecastMatchesDecisionFrontierCandidate(record, frontier.record);

  const digest = sha256Canonical(record);
  const sourceKey = forecastKey(record.id);
  return db.$transaction(async (tx) => {
    await assertActorExecutionAt(tx, record.actorId, record.executionId, record.decisionAt);
    const existing = await tx.actorEvent.findUnique({ where: { sourceKey } });
    if (existing) {
      const persisted = readForecast(existing);
      if (
        existing.type !== FORECAST_EVENT_TYPE ||
        existing.actorId !== record.actorId ||
        persisted.recordDigest !== digest ||
        persisted.frontierDigest !== frontier.recordDigest ||
        canonicalJson(persisted.record) !== canonicalJson(record)
      ) {
        throw new DecisionForeseeabilityConflictError(`Outcome forecast ${record.id} conflicts with canonical history.`);
      }
      return { event: existing, ...persisted, replayed: true };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: record.actorId,
        ...(record.executionId ? { executionId: record.executionId } : {}),
        type: FORECAST_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(record.forecastAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({ record, recordDigest: digest, frontierDigest: frontier.recordDigest }),
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

export async function getOutcomeForecast(id: string) {
  const event = await db.actorEvent.findUnique({ where: { sourceKey: forecastKey(id) } });
  if (!event || event.type !== FORECAST_EVENT_TYPE) return null;
  return { event, ...readForecast(event) };
}

export async function listDecisionOutcomeForecasts(frontierRecordId: string, limit = 100) {
  const frontier = await getDecisionFrontier(frontierRecordId);
  if (!frontier) return null;

  const events = await db.actorEvent.findMany({
    where: { actorId: frontier.record.actorId, type: FORECAST_EVENT_TYPE },
    orderBy: [{ occurredAt: 'asc' }, { sequence: 'asc' }],
    take: Math.max(1, Math.min(limit * 4, 500)),
  });
  return events
    .map((event) => ({ event, ...readForecast(event) }))
    .filter((item) => item.record.frontierRecordId === frontierRecordId)
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function recordForeseeabilityAssessment(
  input: ForeseeabilityAssessment,
  context: RegistryContext,
): Promise<{ event: DbActorEvent; assessment: ForeseeabilityAssessment; assessmentDigest: string; replayed: boolean }> {
  const assessment = jsonValue(input);
  const frontier = await getDecisionFrontier(assessment.decisionFrontierRef);
  if (!frontier) throw Object.assign(new Error('Decision frontier not found.'), { statusCode: 404 });
  if (frontier.record.actorId !== assessment.actorId || frontier.record.decisionId !== assessment.decisionId) {
    throw new DecisionForeseeabilityConflictError('Assessment actor/decision does not match referenced frontier.');
  }
  assertValidForeseeabilityAssessment(assessment, frontier.record.decisionAt);

  const consequence = await db.consequenceObservation.findUnique({
    where: { id: assessment.consequenceObservationRef },
    select: { id: true, occurredAt: true },
  });
  if (!consequence) {
    throw Object.assign(new Error('Consequence observation not found.'), { statusCode: 404 });
  }
  if (Date.parse(assessment.assessedAt) < consequence.occurredAt.getTime()) {
    throw new DecisionForeseeabilityConflictError(
      'Foreseeability assessment cannot predate the consequence it evaluates.',
    );
  }

  for (const forecastRef of assessment.forecastRecordRefs) {
    const forecast = await getOutcomeForecast(forecastRef);
    if (!forecast) throw Object.assign(new Error(`Outcome forecast ${forecastRef} not found.`), { statusCode: 404 });
    if (
      forecast.record.actorId !== assessment.actorId ||
      forecast.record.decisionId !== assessment.decisionId ||
      forecast.record.frontierRecordId !== frontier.record.id
    ) {
      throw new DecisionForeseeabilityConflictError(
        `Outcome forecast ${forecastRef} is outside the assessed historical decision.`,
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
        canonicalJson(persisted.assessment) !== canonicalJson(assessment)
      ) {
        throw new DecisionForeseeabilityConflictError(
          `Foreseeability assessment ${assessment.id} conflicts with canonical history.`,
        );
      }
      return { event: existing, assessment: persisted.assessment, assessmentDigest: digest, replayed: true };
    }

    const event = await appendCanonicalActorEvent(
      tx,
      {
        actorId: assessment.actorId,
        type: ASSESSMENT_EVENT_TYPE,
        sourceKey,
        occurredAt: new Date(assessment.assessedAt),
        hostId: context.hostId,
        environmentVersion: context.environmentVersion,
        issuer: context.issuer,
        payload: jsonValue({ assessment, assessmentDigest: digest }),
      },
      context.signingSecret,
    );
    return { event, assessment, assessmentDigest: digest, replayed: false };
  });
}

export async function getForeseeabilityAssessment(id: string) {
  const event = await db.actorEvent.findUnique({ where: { sourceKey: assessmentKey(id) } });
  if (!event || event.type !== ASSESSMENT_EVENT_TYPE) return null;
  return { event, ...readAssessment(event) };
}

export async function listDecisionForeseeabilityAssessments(frontierRecordId: string, limit = 100) {
  const frontier = await getDecisionFrontier(frontierRecordId);
  if (!frontier) return null;

  const events = await db.actorEvent.findMany({
    where: { actorId: frontier.record.actorId, type: ASSESSMENT_EVENT_TYPE },
    orderBy: [{ occurredAt: 'asc' }, { sequence: 'asc' }],
    take: Math.max(1, Math.min(limit * 4, 500)),
  });
  return events
    .map((event) => ({ event, ...readAssessment(event) }))
    .filter((item) => item.assessment.decisionFrontierRef === frontierRecordId)
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

export async function verifyDecisionForeseeabilityRecord(
  kind: 'frontier' | 'forecast' | 'assessment',
  id: string,
  signingSecret: string,
): Promise<{ exists: boolean; eventValid: boolean; payloadValid: boolean }> {
  const sourceKey =
    kind === 'frontier' ? frontierKey(id) : kind === 'forecast' ? forecastKey(id) : assessmentKey(id);
  const event = await db.actorEvent.findUnique({ where: { sourceKey } });
  if (!event) return { exists: false, eventValid: false, payloadValid: false };

  let payloadValid = false;
  try {
    if (kind === 'frontier') {
      const persisted = readFrontier(event);
      payloadValid = persisted.recordDigest === sha256Canonical(persisted.record);
    } else if (kind === 'forecast') {
      const persisted = readForecast(event);
      const frontier = await getDecisionFrontier(persisted.record.frontierRecordId);
      payloadValid =
        persisted.recordDigest === sha256Canonical(persisted.record) &&
        frontier !== null &&
        persisted.frontierDigest === frontier.recordDigest;
      if (frontier) assertForecastMatchesDecisionFrontierCandidate(persisted.record, frontier.record);
    } else {
      const persisted = readAssessment(event);
      const frontier = await getDecisionFrontier(persisted.assessment.decisionFrontierRef);
      payloadValid =
        persisted.assessmentDigest === sha256Canonical(persisted.assessment) && frontier !== null;
      if (frontier) {
        assertValidForeseeabilityAssessment(persisted.assessment, frontier.record.decisionAt);
      }
    }
  } catch {
    payloadValid = false;
  }

  return { exists: true, eventValid: await verifyStoredEvent(event, signingSecret), payloadValid };
}
