import { createHash, randomUUID } from 'node:crypto';
import type {
  Prisma,
  RelianceDependency,
  ReliancePropagationAssessment,
} from '@prisma/client';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type RelianceDependencyKind = 'required' | 'material' | 'informative' | 'fallback';

export type ReliancePropagationDisposition =
  | 'unaffected'
  | 'review-required'
  | 'blocked'
  | 'disputed'
  | 'unknown';

export type RegisterRelianceDependencyInput = {
  actorId: string;
  downstreamRelianceId: string;
  upstreamRelianceId: string;
  dependencyKind: RelianceDependencyKind;
  expectedUpstreamBasisDigest: string;
  expectedDownstreamBasisDigest: string;
  evidenceArtifactId: string;
  createdByType: string;
  createdByRef: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export type AssessReliancePropagationInput = {
  actorId: string;
  dependencyId: string;
  downstreamRelianceId: string;
  triggerRelianceId: string;
  triggerAssessmentId?: string | null;
  expectedTriggerDigest: string;
  expectedDependencyDigest: string;
  expectedDownstreamBasisDigest: string;
  disposition: ReliancePropagationDisposition;
  evaluatorType: string;
  evaluatorRef: string;
  method: string;
  methodVersion: string;
  evidenceArtifactId: string;
  reason?: string | null;
  assessedAt: Date;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
};

export class ReliancePropagationConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ReliancePropagationConflictError';
  }
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

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

function kindToDb(value: RelianceDependencyKind): string {
  switch (value) {
    case 'required':
      return 'REQUIRED';
    case 'material':
      return 'MATERIAL';
    case 'informative':
      return 'INFORMATIVE';
    case 'fallback':
      return 'FALLBACK';
  }
}

function kindFromDb(value: string): RelianceDependencyKind {
  switch (value) {
    case 'REQUIRED':
      return 'required';
    case 'MATERIAL':
      return 'material';
    case 'INFORMATIVE':
      return 'informative';
    case 'FALLBACK':
      return 'fallback';
    default:
      throw new ReliancePropagationConflictError(`Unknown reliance dependency kind ${value}.`);
  }
}

function dispositionToDb(value: ReliancePropagationDisposition): string {
  switch (value) {
    case 'unaffected':
      return 'UNAFFECTED';
    case 'review-required':
      return 'REVIEW_REQUIRED';
    case 'blocked':
      return 'BLOCKED';
    case 'disputed':
      return 'DISPUTED';
    case 'unknown':
      return 'UNKNOWN';
  }
}

function dispositionFromDb(value: string): ReliancePropagationDisposition {
  switch (value) {
    case 'UNAFFECTED':
      return 'unaffected';
    case 'REVIEW_REQUIRED':
      return 'review-required';
    case 'BLOCKED':
      return 'blocked';
    case 'DISPUTED':
      return 'disputed';
    case 'UNKNOWN':
      return 'unknown';
    default:
      throw new ReliancePropagationConflictError(`Unknown propagation disposition ${value}.`);
  }
}

function dependencySemanticRecord(input: {
  actorId: string;
  downstreamRelianceId: string;
  upstreamRelianceId: string;
  dependencyKind: RelianceDependencyKind;
  upstreamBasisDigest: string;
  downstreamBasisDigest: string;
  evidenceArtifactId: string;
  createdByType: string;
  createdByRef: string;
  metadata: Prisma.InputJsonObject | Prisma.JsonValue;
}) {
  return {
    version: 'noeone.reliance-dependency.v1',
    actorId: input.actorId,
    downstreamRelianceId: input.downstreamRelianceId,
    upstreamRelianceId: input.upstreamRelianceId,
    dependencyKind: input.dependencyKind,
    upstreamBasisDigest: input.upstreamBasisDigest,
    downstreamBasisDigest: input.downstreamBasisDigest,
    evidenceArtifactId: input.evidenceArtifactId,
    createdByType: input.createdByType,
    createdByRef: input.createdByRef,
    metadata: input.metadata,
  };
}

function propagationAssessmentSemanticRecord(input: {
  actorId: string;
  dependencyId: string;
  downstreamRelianceId: string;
  triggerRelianceId: string;
  triggerAssessmentId: string | null;
  triggerDigest: string;
  observedDependencyDigest: string;
  observedDownstreamBasisDigest: string;
  disposition: ReliancePropagationDisposition;
  evaluatorType: string;
  evaluatorRef: string;
  method: string;
  methodVersion: string;
  evidenceArtifactId: string;
  reason: string | null;
  assessedAt: Date | string;
  metadata: Prisma.InputJsonObject | Prisma.JsonValue;
}) {
  return {
    version: 'noeone.reliance-propagation-assessment.v1',
    actorId: input.actorId,
    dependencyId: input.dependencyId,
    downstreamRelianceId: input.downstreamRelianceId,
    triggerRelianceId: input.triggerRelianceId,
    triggerAssessmentId: input.triggerAssessmentId,
    triggerDigest: input.triggerDigest,
    observedDependencyDigest: input.observedDependencyDigest,
    observedDownstreamBasisDigest: input.observedDownstreamBasisDigest,
    disposition: input.disposition,
    evaluatorType: input.evaluatorType,
    evaluatorRef: input.evaluatorRef,
    method: input.method,
    methodVersion: input.methodVersion,
    evidenceArtifactId: input.evidenceArtifactId,
    reason: input.reason,
    assessedAt:
      input.assessedAt instanceof Date ? input.assessedAt.toISOString() : input.assessedAt,
    metadata: input.metadata,
  };
}

function sameJson(left: Prisma.JsonValue, right: Prisma.InputJsonObject): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function dependencyReplayMatches(
  existing: RelianceDependency,
  normalized: {
    actorId: string;
    downstreamRelianceId: string;
    upstreamRelianceId: string;
    dependencyKind: RelianceDependencyKind;
    upstreamBasisDigest: string;
    downstreamBasisDigest: string;
    evidenceArtifactId: string;
    createdByType: string;
    createdByRef: string;
    metadata: Prisma.InputJsonObject;
    dependencyDigest: string;
  },
): boolean {
  return (
    existing.actorId === normalized.actorId &&
    existing.downstreamRelianceId === normalized.downstreamRelianceId &&
    existing.upstreamRelianceId === normalized.upstreamRelianceId &&
    kindFromDb(existing.dependencyKind) === normalized.dependencyKind &&
    existing.upstreamBasisDigest === normalized.upstreamBasisDigest &&
    existing.downstreamBasisDigest === normalized.downstreamBasisDigest &&
    existing.evidenceArtifactId === normalized.evidenceArtifactId &&
    existing.createdByType === normalized.createdByType &&
    existing.createdByRef === normalized.createdByRef &&
    existing.dependencyDigest === normalized.dependencyDigest &&
    sameJson(existing.metadata, normalized.metadata)
  );
}

function propagationReplayMatches(
  existing: ReliancePropagationAssessment,
  normalized: {
    actorId: string;
    dependencyId: string;
    downstreamRelianceId: string;
    triggerRelianceId: string;
    triggerAssessmentId: string | null;
    triggerDigest: string;
    observedDependencyDigest: string;
    observedDownstreamBasisDigest: string;
    disposition: ReliancePropagationDisposition;
    evaluatorType: string;
    evaluatorRef: string;
    method: string;
    methodVersion: string;
    evidenceArtifactId: string;
    reason: string | null;
    assessedAt: Date;
    metadata: Prisma.InputJsonObject;
    assessmentDigest: string;
  },
): boolean {
  return (
    existing.actorId === normalized.actorId &&
    existing.dependencyId === normalized.dependencyId &&
    existing.downstreamRelianceId === normalized.downstreamRelianceId &&
    existing.triggerRelianceId === normalized.triggerRelianceId &&
    existing.triggerAssessmentId === normalized.triggerAssessmentId &&
    existing.triggerDigest === normalized.triggerDigest &&
    existing.observedDependencyDigest === normalized.observedDependencyDigest &&
    existing.observedDownstreamBasisDigest === normalized.observedDownstreamBasisDigest &&
    dispositionFromDb(existing.disposition) === normalized.disposition &&
    existing.evaluatorType === normalized.evaluatorType &&
    existing.evaluatorRef === normalized.evaluatorRef &&
    existing.method === normalized.method &&
    existing.methodVersion === normalized.methodVersion &&
    existing.evidenceArtifactId === normalized.evidenceArtifactId &&
    existing.reason === normalized.reason &&
    existing.assessedAt.getTime() === normalized.assessedAt.getTime() &&
    existing.assessmentDigest === normalized.assessmentDigest &&
    sameJson(existing.metadata, normalized.metadata)
  );
}

export async function registerRelianceDependency(
  input: RegisterRelianceDependencyInput,
  registry: RegistryContext,
): Promise<{ dependency: RelianceDependency; replayed: boolean }> {
  const actorId = text(input.actorId, 'actorId');
  const downstreamRelianceId = text(input.downstreamRelianceId, 'downstreamRelianceId');
  const upstreamRelianceId = text(input.upstreamRelianceId, 'upstreamRelianceId');
  const upstreamBasisDigest = digest(input.expectedUpstreamBasisDigest, 'expectedUpstreamBasisDigest');
  const downstreamBasisDigest = digest(
    input.expectedDownstreamBasisDigest,
    'expectedDownstreamBasisDigest',
  );
  const evidenceArtifactId = text(input.evidenceArtifactId, 'evidenceArtifactId');
  const createdByType = text(input.createdByType, 'createdByType');
  const createdByRef = text(input.createdByRef, 'createdByRef');
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = input.metadata ?? {};

  if (upstreamRelianceId === downstreamRelianceId) {
    throw Object.assign(new Error('A reliance record cannot depend on itself.'), { statusCode: 400 });
  }

  const semantic = dependencySemanticRecord({
    actorId,
    downstreamRelianceId,
    upstreamRelianceId,
    dependencyKind: input.dependencyKind,
    upstreamBasisDigest,
    downstreamBasisDigest,
    evidenceArtifactId,
    createdByType,
    createdByRef,
    metadata,
  });
  const dependencyDigest = sha256({ schema: 'noeone.reliance-dependency.semantic.v1', record: semantic });

  const normalized = {
    actorId,
    downstreamRelianceId,
    upstreamRelianceId,
    dependencyKind: input.dependencyKind,
    upstreamBasisDigest,
    downstreamBasisDigest,
    evidenceArtifactId,
    createdByType,
    createdByRef,
    metadata,
    dependencyDigest,
  };

  return db.$transaction(async (tx) => {
    const replay = await tx.relianceDependency.findUnique({ where: { idempotencyKey: key } });
    if (replay) {
      if (!dependencyReplayMatches(replay, normalized)) {
        throw new ReliancePropagationConflictError(
          `Reliance dependency idempotency key ${key} was reused with conflicting data.`,
        );
      }
      return { dependency: replay, replayed: true };
    }

    const [actor, upstream, downstream, evidence] = await Promise.all([
      tx.actor.findUnique({ where: { id: actorId }, select: { id: true } }),
      tx.relianceBasis.findUnique({ where: { id: upstreamRelianceId } }),
      tx.relianceBasis.findUnique({ where: { id: downstreamRelianceId } }),
      tx.evidenceArtifact.findUnique({ where: { id: evidenceArtifactId }, select: { id: true } }),
    ]);

    if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    if (!upstream) {
      throw Object.assign(new Error('Upstream reliance basis not found.'), { statusCode: 404 });
    }
    if (!downstream) {
      throw Object.assign(new Error('Downstream reliance basis not found.'), { statusCode: 404 });
    }
    if (!evidence) {
      throw Object.assign(new Error('Reliance dependency evidence artifact not found.'), {
        statusCode: 404,
      });
    }

    if (upstream.actorId !== actorId || downstream.actorId !== actorId) {
      throw new ReliancePropagationConflictError(
        'Reliance dependency v1 requires both bases to concern the declared actor.',
      );
    }
    if (upstream.reliedAt.getTime() > downstream.reliedAt.getTime()) {
      throw new ReliancePropagationConflictError(
        'Upstream reliance cannot postdate downstream reliance.',
      );
    }
    if (upstream.basisDigest !== upstreamBasisDigest) {
      throw new ReliancePropagationConflictError('Upstream reliance basis digest is stale or incorrect.');
    }
    if (downstream.basisDigest !== downstreamBasisDigest) {
      throw new ReliancePropagationConflictError(
        'Downstream reliance basis digest is stale or incorrect.',
      );
    }

    const existingPair = await tx.relianceDependency.findFirst({
      where: {
        downstreamRelianceId,
        upstreamRelianceId,
        dependencyKind: kindToDb(input.dependencyKind),
      },
    });
    if (existingPair) {
      if (!dependencyReplayMatches(existingPair, normalized)) {
        throw new ReliancePropagationConflictError(
          'This reliance dependency already exists with different evidence or provenance.',
        );
      }
      return { dependency: existingPair, replayed: true };
    }

    const created = await tx.relianceDependency.create({
      data: {
        id: `rld_${randomUUID()}`,
        actorId,
        downstreamRelianceId,
        upstreamRelianceId,
        dependencyKind: kindToDb(input.dependencyKind),
        upstreamBasisDigest,
        downstreamBasisDigest,
        evidenceArtifactId,
        createdByType,
        createdByRef,
        dependencyDigest,
        idempotencyKey: key,
        metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId,
        type: 'actor.reliance.dependency-recorded',
        sourceKey: `reliance-dependency:${key}`,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          dependencyId: created.id,
          downstreamRelianceId,
          upstreamRelianceId,
          dependencyKind: input.dependencyKind,
          upstreamBasisDigest,
          downstreamBasisDigest,
          dependencyDigest,
          evidenceArtifactId,
          createdByType,
          createdByRef,
        },
      },
      registry.signingSecret,
    );

    return { dependency: created, replayed: false };
  });
}

export async function assessReliancePropagation(
  input: AssessReliancePropagationInput,
  registry: RegistryContext,
): Promise<{ assessment: ReliancePropagationAssessment; replayed: boolean }> {
  const actorId = text(input.actorId, 'actorId');
  const dependencyId = text(input.dependencyId, 'dependencyId');
  const downstreamRelianceId = text(input.downstreamRelianceId, 'downstreamRelianceId');
  const triggerRelianceId = text(input.triggerRelianceId, 'triggerRelianceId');
  const triggerAssessmentId = input.triggerAssessmentId
    ? text(input.triggerAssessmentId, 'triggerAssessmentId')
    : null;
  const triggerDigest = digest(input.expectedTriggerDigest, 'expectedTriggerDigest');
  const observedDependencyDigest = digest(
    input.expectedDependencyDigest,
    'expectedDependencyDigest',
  );
  const observedDownstreamBasisDigest = digest(
    input.expectedDownstreamBasisDigest,
    'expectedDownstreamBasisDigest',
  );
  const evaluatorType = text(input.evaluatorType, 'evaluatorType');
  const evaluatorRef = text(input.evaluatorRef, 'evaluatorRef');
  const method = text(input.method, 'method');
  const methodVersion = text(input.methodVersion, 'methodVersion');
  const evidenceArtifactId = text(input.evidenceArtifactId, 'evidenceArtifactId');
  const reason = input.reason?.trim() || null;
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = input.metadata ?? {};

  if (Number.isNaN(input.assessedAt.getTime())) {
    throw Object.assign(new Error('assessedAt must be a valid timestamp.'), { statusCode: 400 });
  }

  const semantic = propagationAssessmentSemanticRecord({
    actorId,
    dependencyId,
    downstreamRelianceId,
    triggerRelianceId,
    triggerAssessmentId,
    triggerDigest,
    observedDependencyDigest,
    observedDownstreamBasisDigest,
    disposition: input.disposition,
    evaluatorType,
    evaluatorRef,
    method,
    methodVersion,
    evidenceArtifactId,
    reason,
    assessedAt: input.assessedAt,
    metadata,
  });
  const assessmentDigest = sha256({
    schema: 'noeone.reliance-propagation-assessment.semantic.v1',
    record: semantic,
  });

  const normalized = {
    actorId,
    dependencyId,
    downstreamRelianceId,
    triggerRelianceId,
    triggerAssessmentId,
    triggerDigest,
    observedDependencyDigest,
    observedDownstreamBasisDigest,
    disposition: input.disposition,
    evaluatorType,
    evaluatorRef,
    method,
    methodVersion,
    evidenceArtifactId,
    reason,
    assessedAt: input.assessedAt,
    metadata,
    assessmentDigest,
  };

  return db.$transaction(async (tx) => {
    const replay = await tx.reliancePropagationAssessment.findUnique({
      where: { idempotencyKey: key },
    });
    if (replay) {
      if (!propagationReplayMatches(replay, normalized)) {
        throw new ReliancePropagationConflictError(
          `Reliance propagation idempotency key ${key} was reused with conflicting data.`,
        );
      }
      return { assessment: replay, replayed: true };
    }

    const [dependency, downstream, triggerBasis, triggerAssessment, evidence] = await Promise.all([
      tx.relianceDependency.findUnique({ where: { id: dependencyId } }),
      tx.relianceBasis.findUnique({ where: { id: downstreamRelianceId } }),
      tx.relianceBasis.findUnique({ where: { id: triggerRelianceId } }),
      triggerAssessmentId
        ? tx.relianceChangeAssessment.findUnique({ where: { id: triggerAssessmentId } })
        : Promise.resolve(null),
      tx.evidenceArtifact.findUnique({ where: { id: evidenceArtifactId }, select: { id: true } }),
    ]);

    if (!dependency) {
      throw Object.assign(new Error('Reliance dependency not found.'), { statusCode: 404 });
    }
    if (!downstream) {
      throw Object.assign(new Error('Downstream reliance basis not found.'), { statusCode: 404 });
    }
    if (!triggerBasis) {
      throw Object.assign(new Error('Trigger reliance basis not found.'), { statusCode: 404 });
    }
    if (triggerAssessmentId && !triggerAssessment) {
      throw Object.assign(new Error('Trigger reliance change assessment not found.'), {
        statusCode: 404,
      });
    }
    if (!evidence) {
      throw Object.assign(new Error('Propagation assessment evidence artifact not found.'), {
        statusCode: 404,
      });
    }

    if (
      dependency.actorId !== actorId ||
      dependency.downstreamRelianceId !== downstreamRelianceId ||
      dependency.upstreamRelianceId !== triggerRelianceId
    ) {
      throw new ReliancePropagationConflictError(
        'Propagation assessment does not match the recorded reliance dependency.',
      );
    }
    if (dependency.dependencyDigest !== observedDependencyDigest) {
      throw new ReliancePropagationConflictError('Observed reliance dependency digest is stale.');
    }
    if (downstream.actorId !== actorId || downstream.basisDigest !== observedDownstreamBasisDigest) {
      throw new ReliancePropagationConflictError('Observed downstream reliance basis is stale or mismatched.');
    }
    if (triggerBasis.actorId !== actorId) {
      throw new ReliancePropagationConflictError('Trigger reliance belongs to another actor.');
    }

    if (triggerAssessment) {
      if (
        triggerAssessment.actorId !== actorId ||
        triggerAssessment.relianceId !== triggerRelianceId ||
        triggerAssessment.basisDigest !== triggerDigest
      ) {
        throw new ReliancePropagationConflictError(
          'Trigger assessment does not match the expected upstream reliance state.',
        );
      }
      if (triggerAssessment.assessedAt.getTime() > input.assessedAt.getTime()) {
        throw new ReliancePropagationConflictError(
          'Propagation assessment cannot predate its trigger assessment.',
        );
      }
    } else if (triggerBasis.basisDigest !== triggerDigest) {
      throw new ReliancePropagationConflictError('Trigger reliance basis digest is stale or incorrect.');
    }

    if (input.assessedAt.getTime() < downstream.capturedAt.getTime()) {
      throw new ReliancePropagationConflictError(
        'Propagation assessment cannot predate downstream reliance capture.',
      );
    }

    const created = await tx.reliancePropagationAssessment.create({
      data: {
        id: `rpa_${randomUUID()}`,
        actorId,
        dependencyId,
        downstreamRelianceId,
        triggerRelianceId,
        triggerAssessmentId,
        triggerDigest,
        observedDependencyDigest,
        observedDownstreamBasisDigest,
        disposition: dispositionToDb(input.disposition),
        evaluatorType,
        evaluatorRef,
        method,
        methodVersion,
        evidenceArtifactId,
        reason,
        assessedAt: input.assessedAt,
        assessmentDigest,
        idempotencyKey: key,
        metadata,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId,
        type: 'actor.reliance.propagation-assessed',
        sourceKey: `reliance-propagation-assessment:${key}`,
        occurredAt: input.assessedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          assessmentId: created.id,
          dependencyId,
          downstreamRelianceId,
          triggerRelianceId,
          ...(triggerAssessmentId ? { triggerAssessmentId } : {}),
          triggerDigest,
          observedDependencyDigest,
          disposition: input.disposition,
          evaluatorType,
          evaluatorRef,
          assessmentDigest,
        },
      },
      registry.signingSecret,
    );

    return { assessment: created, replayed: false };
  });
}

export async function getRelianceDependencies(actorId: string, limit = 100) {
  const normalizedActorId = text(actorId, 'actorId');
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  return db.relianceDependency.findMany({
    where: { actorId: normalizedActorId },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    take: boundedLimit,
  });
}

export async function getReliancePropagationAssessments(dependencyId: string, limit = 100) {
  const normalizedDependencyId = text(dependencyId, 'dependencyId');
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  return db.reliancePropagationAssessment.findMany({
    where: { dependencyId: normalizedDependencyId },
    orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
    take: boundedLimit,
  });
}

export type RelianceExposureItem = {
  relianceId: string;
  depth: number;
  path: string[];
  dependencyPath: string[];
  dependencyKinds: RelianceDependencyKind[];
  latestDisposition?: ReliancePropagationDisposition;
  latestAssessmentId?: string;
};

export async function buildRelianceExposureReport(
  triggerRelianceId: string,
  options: { maxDepth?: number; maxNodes?: number } = {},
) {
  const normalizedTriggerId = text(triggerRelianceId, 'triggerRelianceId');
  const maxDepth = Math.max(1, Math.min(options.maxDepth ?? 12, 32));
  const maxNodes = Math.max(1, Math.min(options.maxNodes ?? 500, 1000));

  const trigger = await db.relianceBasis.findUnique({ where: { id: normalizedTriggerId } });
  if (!trigger) {
    throw Object.assign(new Error('Trigger reliance basis not found.'), { statusCode: 404 });
  }

  type FrontierItem = {
    relianceId: string;
    depth: number;
    path: string[];
    dependencyPath: string[];
    dependencyKinds: RelianceDependencyKind[];
  };

  let frontier: FrontierItem[] = [
    {
      relianceId: trigger.id,
      depth: 0,
      path: [trigger.id],
      dependencyPath: [],
      dependencyKinds: [],
    },
  ];
  const visitedReliances = new Set<string>([trigger.id]);
  const affected: RelianceExposureItem[] = [];
  let truncated = false;

  while (frontier.length > 0) {
    const expandable = frontier.filter((item) => item.depth < maxDepth);
    if (expandable.length === 0) break;

    const frontierIds = expandable.map((item) => item.relianceId);
    const parentById = new Map(expandable.map((item) => [item.relianceId, item]));
    const edges = await db.relianceDependency.findMany({
      where: {
        actorId: trigger.actorId,
        upstreamRelianceId: { in: frontierIds },
      },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    });

    const next: FrontierItem[] = [];
    for (const edge of edges) {
      const parent = parentById.get(edge.upstreamRelianceId);
      if (!parent || visitedReliances.has(edge.downstreamRelianceId)) continue;
      if (affected.length >= maxNodes) {
        truncated = true;
        break;
      }

      const item: FrontierItem = {
        relianceId: edge.downstreamRelianceId,
        depth: parent.depth + 1,
        path: [...parent.path, edge.downstreamRelianceId],
        dependencyPath: [...parent.dependencyPath, edge.id],
        dependencyKinds: [...parent.dependencyKinds, kindFromDb(edge.dependencyKind)],
      };
      visitedReliances.add(edge.downstreamRelianceId);
      next.push(item);
      affected.push(item);
    }

    if (truncated) break;
    frontier = next;
  }

  const terminalDependencyIds = affected
    .map((item) => item.dependencyPath.at(-1))
    .filter((value): value is string => typeof value === 'string');

  const assessments =
    terminalDependencyIds.length === 0
      ? []
      : await db.reliancePropagationAssessment.findMany({
          where: { dependencyId: { in: terminalDependencyIds } },
          orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
        });

  const latestByDependency = new Map<string, ReliancePropagationAssessment>();
  for (const assessment of assessments) {
    if (!latestByDependency.has(assessment.dependencyId)) {
      latestByDependency.set(assessment.dependencyId, assessment);
    }
  }

  const enriched = affected.map((item) => {
    const dependencyId = item.dependencyPath.at(-1);
    const latest = dependencyId ? latestByDependency.get(dependencyId) : undefined;
    return {
      ...item,
      ...(latest
        ? {
            latestDisposition: dispositionFromDb(latest.disposition),
            latestAssessmentId: latest.id,
          }
        : {}),
    };
  });

  return {
    version: 'noeone.reliance-exposure-report.v1',
    actorId: trigger.actorId,
    triggerRelianceId: trigger.id,
    triggerBasisDigest: trigger.basisDigest,
    generatedAt: new Date().toISOString(),
    maxDepth,
    maxNodes,
    affectedCount: enriched.length,
    affected: enriched,
    truncated,
    semantics: {
      graphMeaning: 'decision-dependency',
      trustIsTransitive: false,
      downstreamValidityIsAutomatic: false,
      pathPolicy: 'shortest-observed-path-per-downstream-reliance',
    },
  };
}

export async function verifyReliancePropagation(actorId: string) {
  const normalizedActorId = text(actorId, 'actorId');
  const [dependencies, assessments] = await Promise.all([
    db.relianceDependency.findMany({
      where: { actorId: normalizedActorId },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    }),
    db.reliancePropagationAssessment.findMany({
      where: { actorId: normalizedActorId },
      orderBy: [{ assessedAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const relianceIds = [
    ...new Set(
      dependencies.flatMap((item) => [item.upstreamRelianceId, item.downstreamRelianceId]),
    ),
  ];
  const basisRows =
    relianceIds.length === 0
      ? []
      : await db.relianceBasis.findMany({ where: { id: { in: relianceIds } } });
  const basisById = new Map(basisRows.map((row) => [row.id, row]));

  const triggerAssessmentIds = assessments
    .map((item) => item.triggerAssessmentId)
    .filter((value): value is string => typeof value === 'string');
  const triggerAssessments =
    triggerAssessmentIds.length === 0
      ? []
      : await db.relianceChangeAssessment.findMany({
          where: { id: { in: triggerAssessmentIds } },
        });
  const triggerAssessmentById = new Map(triggerAssessments.map((row) => [row.id, row]));
  const dependencyById = new Map(dependencies.map((row) => [row.id, row]));
  const issues: string[] = [];

  for (const row of dependencies) {
    const upstream = basisById.get(row.upstreamRelianceId);
    const downstream = basisById.get(row.downstreamRelianceId);
    if (!upstream || !downstream) {
      issues.push(`dependency:${row.id}:missing reliance basis`);
      continue;
    }
    if (upstream.actorId !== normalizedActorId || downstream.actorId !== normalizedActorId) {
      issues.push(`dependency:${row.id}:cross-actor reliance dependency`);
    }
    if (upstream.reliedAt.getTime() > downstream.reliedAt.getTime()) {
      issues.push(`dependency:${row.id}:temporal order invalid`);
    }
    if (upstream.basisDigest !== row.upstreamBasisDigest) {
      issues.push(`dependency:${row.id}:upstream basis digest mismatch`);
    }
    if (downstream.basisDigest !== row.downstreamBasisDigest) {
      issues.push(`dependency:${row.id}:downstream basis digest mismatch`);
    }

    const expected = sha256({
      schema: 'noeone.reliance-dependency.semantic.v1',
      record: dependencySemanticRecord({
        actorId: row.actorId,
        downstreamRelianceId: row.downstreamRelianceId,
        upstreamRelianceId: row.upstreamRelianceId,
        dependencyKind: kindFromDb(row.dependencyKind),
        upstreamBasisDigest: row.upstreamBasisDigest,
        downstreamBasisDigest: row.downstreamBasisDigest,
        evidenceArtifactId: row.evidenceArtifactId,
        createdByType: row.createdByType,
        createdByRef: row.createdByRef,
        metadata: row.metadata,
      }),
    });
    if (expected !== row.dependencyDigest) {
      issues.push(`dependency:${row.id}:semantic digest mismatch`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const row of dependencies) {
    const existing = adjacency.get(row.upstreamRelianceId) ?? [];
    existing.push(row.downstreamRelianceId);
    adjacency.set(row.upstreamRelianceId, existing);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycleFound = false;
  const visit = (node: string): void => {
    if (cycleFound || visited.has(node)) return;
    if (visiting.has(node)) {
      cycleFound = true;
      return;
    }
    visiting.add(node);
    for (const child of adjacency.get(node) ?? []) visit(child);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of adjacency.keys()) visit(node);
  if (cycleFound) issues.push('graph:cycle detected');

  for (const row of assessments) {
    const dependency = dependencyById.get(row.dependencyId);
    const downstream = basisById.get(row.downstreamRelianceId);
    const triggerBasis = basisById.get(row.triggerRelianceId);
    if (!dependency || !downstream || !triggerBasis) {
      issues.push(`assessment:${row.id}:missing dependency or reliance basis`);
      continue;
    }
    if (
      dependency.upstreamRelianceId !== row.triggerRelianceId ||
      dependency.downstreamRelianceId !== row.downstreamRelianceId
    ) {
      issues.push(`assessment:${row.id}:dependency linkage mismatch`);
    }
    if (dependency.dependencyDigest !== row.observedDependencyDigest) {
      issues.push(`assessment:${row.id}:dependency digest mismatch`);
    }
    if (downstream.basisDigest !== row.observedDownstreamBasisDigest) {
      issues.push(`assessment:${row.id}:downstream basis digest mismatch`);
    }

    if (row.triggerAssessmentId) {
      const triggerAssessment = triggerAssessmentById.get(row.triggerAssessmentId);
      if (
        !triggerAssessment ||
        triggerAssessment.relianceId !== row.triggerRelianceId ||
        triggerAssessment.basisDigest !== row.triggerDigest
      ) {
        issues.push(`assessment:${row.id}:trigger assessment mismatch`);
      }
    } else if (triggerBasis.basisDigest !== row.triggerDigest) {
      issues.push(`assessment:${row.id}:trigger basis digest mismatch`);
    }

    const expected = sha256({
      schema: 'noeone.reliance-propagation-assessment.semantic.v1',
      record: propagationAssessmentSemanticRecord({
        actorId: row.actorId,
        dependencyId: row.dependencyId,
        downstreamRelianceId: row.downstreamRelianceId,
        triggerRelianceId: row.triggerRelianceId,
        triggerAssessmentId: row.triggerAssessmentId,
        triggerDigest: row.triggerDigest,
        observedDependencyDigest: row.observedDependencyDigest,
        observedDownstreamBasisDigest: row.observedDownstreamBasisDigest,
        disposition: dispositionFromDb(row.disposition),
        evaluatorType: row.evaluatorType,
        evaluatorRef: row.evaluatorRef,
        method: row.method,
        methodVersion: row.methodVersion,
        evidenceArtifactId: row.evidenceArtifactId,
        reason: row.reason,
        assessedAt: row.assessedAt.toISOString(),
        metadata: row.metadata,
      }),
    });
    if (expected !== row.assessmentDigest) {
      issues.push(`assessment:${row.id}:semantic digest mismatch`);
    }
  }

  return {
    version: 'noeone.reliance-propagation-verification.v1',
    actorId: normalizedActorId,
    valid: issues.length === 0,
    dependencyCount: dependencies.length,
    assessmentCount: assessments.length,
    issues,
  };
}
