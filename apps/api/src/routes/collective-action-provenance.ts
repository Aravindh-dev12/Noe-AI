import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  bindCollectiveAction,
  db,
  getCollectiveActionProvenanceSummary,
  ratifyCollectiveAction,
  recordCollectiveCapacityAssessment,
  recordCollectiveDecision,
  verifyCollectiveActionProvenance,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const idempotencySchema = z.string().min(8).max(500);
const metadataSchema = z.record(z.string(), z.unknown()).optional();
const handleParams = z.object({ handle: z.string().min(1) });
const bindingParams = z.object({ bindingId: z.string().min(1) });

const participantSchema = z.object({
  memberActorId: z.string().min(1),
  position: z.string().min(1).max(160).nullable().optional(),
  evidenceArtifactId: z.string().min(1).nullable().optional(),
});

const decisionSchema = z.object({
  collectiveActorId: z.string().min(1),
  epochId: z.string().min(1),
  decisionType: z.string().min(1).max(160),
  proposalDigest: digestSchema,
  method: z.string().min(1).max(240),
  methodVersion: z.string().min(1).max(120).nullable().optional(),
  outcomeDigest: digestSchema,
  quorumBps: z.number().int().min(0).max(10_000).nullable().optional(),
  decidedAt: z.coerce.date(),
  evidenceArtifactId: z.string().min(1),
  participants: z.array(participantSchema).max(1_000).default([]),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const actionSchema = z.object({
  collectiveActorId: z.string().min(1),
  epochId: z.string().min(1),
  capacity: z.enum([
    'COLLECTIVE_DIRECT',
    'MEMBER_ON_BEHALF',
    'MEMBER_PERSONAL',
    'UNAUTHORIZED_COLLECTIVE_CLAIM',
  ]),
  actedAt: z.coerce.date(),
  sourceKind: z.enum(['AUTHORITY_EXERCISE', 'ACTOR_EVENT', 'EVIDENCE_ARTIFACT']),
  sourceRef: z.string().min(1),
  memberActorId: z.string().min(1).nullable().optional(),
  decisionId: z.string().min(1).nullable().optional(),
  claimedAt: z.coerce.date(),
  bindingEvidenceArtifactId: z.string().min(1),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const ratificationSchema = z.object({
  decisionId: z.string().min(1),
  ratifiedAt: z.coerce.date(),
  evidenceArtifactId: z.string().min(1),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

const assessmentSchema = z.object({
  evaluatorRef: z.string().min(1).max(240),
  method: z.string().min(1).max(240),
  methodVersion: z.string().min(1).max(120),
  disposition: z.enum([
    'SUPPORTED',
    'NOT_SUPPORTED',
    'PARTIALLY_SUPPORTED',
    'INDETERMINATE',
    'DISPUTED',
  ]),
  evidenceArtifactId: z.string().min(1),
  assessedAt: z.coerce.date(),
  idempotencyKey: idempotencySchema,
  metadata: metadataSchema,
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noe.collective-action-provenance@2.0.0',
    issuer: 'noe',
  } as const;
}

async function actorIdForHandle(handleValue: string): Promise<string | null> {
  const actor = await db.actor.findUnique({
    where: { handle: normalizeHandle(handleValue) },
    select: { id: true },
  });
  return actor?.id ?? null;
}

function publicSummary(summary: NonNullable<Awaited<ReturnType<typeof getCollectiveActionProvenanceSummary>>>) {
  const participantsByDecision = new Map<string, typeof summary.participations>();
  for (const participant of summary.participations) {
    const items = participantsByDecision.get(participant.decisionId) ?? [];
    items.push(participant);
    participantsByDecision.set(participant.decisionId, items);
  }

  return {
    collectiveActorId: summary.profile.actorId,
    decisions: summary.decisions.map((decision) => ({
      id: decision.id,
      epochId: decision.epochId,
      decisionType: decision.decisionType,
      method: decision.method,
      methodVersion: decision.methodVersion,
      proposalDigest: decision.proposalDigest,
      outcomeDigest: decision.outcomeDigest,
      quorumBps: decision.quorumBps,
      decidedAt: decision.decidedAt,
      decisionPolicyDigest: decision.decisionPolicyDigest,
      constitutionDigest: decision.constitutionDigest,
      basisDigest: decision.basisDigest,
      participants: (participantsByDecision.get(decision.id) ?? []).map((participant) => ({
        memberActorId: participant.memberActorId,
        membershipId: participant.membershipId,
        role: participant.role,
        weightBps: participant.weightBps,
      })),
    })),
    actions: summary.bindings.map((binding) => ({
      id: binding.id,
      epochId: binding.epochId,
      memberActorId: binding.memberActorId,
      membershipId: binding.membershipId,
      capacity: binding.capacity,
      actedAt: binding.actedAt,
      sourceKind: binding.sourceKind,
      decisionId: binding.decisionId,
      claimedAt: binding.claimedAt,
      basisDigest: binding.basisDigest,
    })),
    ratifications: summary.ratifications.map((ratification) => ({
      id: ratification.id,
      actionBindingId: ratification.actionBindingId,
      decisionId: ratification.decisionId,
      ratifiedAt: ratification.ratifiedAt,
      basisDigest: ratification.basisDigest,
    })),
    assessments: summary.assessments.map((assessment) => ({
      id: assessment.id,
      actionBindingId: assessment.actionBindingId,
      evaluatorRef: assessment.evaluatorRef,
      method: assessment.method,
      methodVersion: assessment.methodVersion,
      disposition: assessment.disposition,
      assessedAt: assessment.assessedAt,
      basisDigest: assessment.basisDigest,
    })),
  };
}

export async function collectiveActionProvenanceRoutes(app: FastifyInstance) {
  app.post('/v1/collective-decisions', async (request, reply) => {
    assertAdmin(request);
    const input = decisionSchema.parse(request.body);
    const result = await recordCollectiveDecision(
      {
        collectiveActorId: input.collectiveActorId,
        epochId: input.epochId,
        decisionType: input.decisionType,
        proposalDigest: input.proposalDigest,
        method: input.method,
        outcomeDigest: input.outcomeDigest,
        decidedAt: input.decidedAt,
        evidenceArtifactId: input.evidenceArtifactId,
        participants: input.participants.map((participant) => ({
          memberActorId: participant.memberActorId,
          ...(participant.position !== undefined ? { position: participant.position } : {}),
          ...(participant.evidenceArtifactId !== undefined
            ? { evidenceArtifactId: participant.evidenceArtifactId }
            : {}),
        })),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
        ...(input.methodVersion !== undefined ? { methodVersion: input.methodVersion } : {}),
        ...(input.quorumBps !== undefined ? { quorumBps: input.quorumBps } : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/collective-actions', async (request, reply) => {
    assertAdmin(request);
    const input = actionSchema.parse(request.body);
    const result = await bindCollectiveAction(
      {
        collectiveActorId: input.collectiveActorId,
        epochId: input.epochId,
        capacity: input.capacity,
        actedAt: input.actedAt,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef,
        claimedAt: input.claimedAt,
        bindingEvidenceArtifactId: input.bindingEvidenceArtifactId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
        ...(input.memberActorId !== undefined ? { memberActorId: input.memberActorId } : {}),
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/collective-actions/:bindingId/ratifications', async (request, reply) => {
    assertAdmin(request);
    const params = bindingParams.parse(request.params);
    const input = ratificationSchema.parse(request.body);
    const result = await ratifyCollectiveAction(
      {
        actionBindingId: params.bindingId,
        decisionId: input.decisionId,
        ratifiedAt: input.ratifiedAt,
        evidenceArtifactId: input.evidenceArtifactId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/collective-actions/:bindingId/assessments', async (request, reply) => {
    assertAdmin(request);
    const params = bindingParams.parse(request.params);
    const input = assessmentSchema.parse(request.body);
    const result = await recordCollectiveCapacityAssessment(
      {
        actionBindingId: params.bindingId,
        evaluatorRef: input.evaluatorRef,
        method: input.method,
        methodVersion: input.methodVersion,
        disposition: input.disposition,
        evidenceArtifactId: input.evidenceArtifactId,
        assessedAt: input.assessedAt,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/collectives/:handle/action-provenance/verify', async (request, reply) => {
    const params = handleParams.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });
    const verification = await verifyCollectiveActionProvenance(actorId);
    return reply.code(verification.verified ? 200 : 409).send(verification);
  });

  app.get('/v1/collectives/:handle/action-provenance', async (request, reply) => {
    const params = handleParams.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });
    const summary = await getCollectiveActionProvenanceSummary(actorId);
    if (!summary) return reply.code(404).send({ error: 'collective_not_found' });
    return publicSummary(summary);
  });
}
