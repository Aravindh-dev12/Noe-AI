import type { FastifyInstance } from 'fastify';
import {
  activeConsequenceReceptionsAt,
  db,
  issueConsequenceReception,
  transitionConsequenceReception,
  verifyConsequenceReceptionState,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const boundedId = z.string().min(1).max(240);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

const scopeSchema = z
  .object({
    global: z.boolean(),
    actions: z.array(z.string().min(1).max(300)).max(128).default([]),
    resources: z.array(z.string().min(1).max(500)).max(128).default([]),
    capabilities: z.array(z.string().min(1).max(500)).max(128).default([]),
    environmentRefs: z.array(z.string().min(1).max(500)).max(128).default([]),
  })
  .strict();

const issueSchema = z
  .object({
    actorId: boundedId,
    sourceConsequenceId: boundedId.nullish(),
    sourceAttributionId: boundedId.nullish(),
    sourceClaimId: boundedId.nullish(),
    sourceRemedyId: boundedId.nullish(),
    sourceEvidenceArtifactId: boundedId,
    kind: z.enum(['restriction', 'remediation', 'probation', 'suspension', 'disclosure']),
    scope: scopeSchema,
    termsDigest: digest,
    restorationCriteriaDigest: digest.nullish(),
    effectiveAt: timestamp,
    reviewAt: timestamp.nullish(),
    expiresAt: timestamp.nullish(),
    issuedByType: z.string().min(1).max(120),
    issuedByRef: z.string().min(1).max(800),
    authorityEvidenceArtifactId: boundedId,
    idempotencyKey: z.string().min(8).max(500),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const transitionSchema = z
  .object({
    actorId: boundedId,
    toStatus: z.enum(['satisfied', 'lifted', 'superseded']),
    evidenceArtifactId: boundedId,
    decidedByType: z.string().min(1).max(120),
    decidedByRef: z.string().min(1).max(800),
    occurredAt: timestamp,
    reason: z.string().max(2000).nullish(),
    idempotencyKey: z.string().min(8).max(500),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const listSchema = z
  .object({
    at: timestamp.optional(),
    activeOnly: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-consequence-reception@1.0.0',
    issuer: 'noeone',
  } as const;
}

export async function consequenceReceptionRoutes(app: FastifyInstance) {
  app.post('/v1/consequence-receptions', async (request, reply) => {
    assertAdmin(request);
    const input = issueSchema.parse(request.body);
    const result = await issueConsequenceReception(
      {
        actorId: input.actorId,
        sourceConsequenceId: input.sourceConsequenceId ?? null,
        sourceAttributionId: input.sourceAttributionId ?? null,
        sourceClaimId: input.sourceClaimId ?? null,
        sourceRemedyId: input.sourceRemedyId ?? null,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
        kind: input.kind,
        scope: input.scope,
        termsDigest: input.termsDigest,
        restorationCriteriaDigest: input.restorationCriteriaDigest ?? null,
        effectiveAt: new Date(input.effectiveAt),
        reviewAt: input.reviewAt ? new Date(input.reviewAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        issuedByType: input.issuedByType,
        issuedByRef: input.issuedByRef,
        authorityEvidenceArtifactId: input.authorityEvidenceArtifactId,
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.consequence-reception.persisted.v1',
      replayed: result.replayed,
      reception: result.reception,
    });
  });

  app.post('/v1/consequence-receptions/:receptionId/transitions', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ receptionId: boundedId }).parse(request.params);
    const input = transitionSchema.parse(request.body);
    const result = await transitionConsequenceReception(
      {
        receptionId: params.receptionId,
        actorId: input.actorId,
        toStatus: input.toStatus,
        evidenceArtifactId: input.evidenceArtifactId,
        decidedByType: input.decidedByType,
        decidedByRef: input.decidedByRef,
        occurredAt: new Date(input.occurredAt),
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.consequence-reception-transition.persisted.v1',
      replayed: result.replayed,
      transition: result.transition,
      reception: result.reception,
    });
  });

  app.get('/v1/actors/:actorId/consequence-receptions', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    const actor = await db.actor.findUnique({ where: { id: params.actorId }, select: { id: true } });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    if (query.activeOnly) {
      const at = query.at ? new Date(query.at) : new Date();
      const data = await activeConsequenceReceptionsAt(params.actorId, at);
      return { version: 'noeone.consequence-reception-list.v1', at, data: data.slice(0, query.limit) };
    }

    const data = await db.consequenceReception.findMany({
      where: { actorId: params.actorId },
      take: query.limit,
      orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
    });
    return { version: 'noeone.consequence-reception-list.v1', data };
  });

  app.get('/v1/actors/:actorId/consequence-receptions/verify', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    return verifyConsequenceReceptionState(params.actorId);
  });
}
