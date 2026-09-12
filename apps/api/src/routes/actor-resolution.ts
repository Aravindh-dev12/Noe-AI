import type { FastifyInstance } from 'fastify';
import {
  ACTOR_RESOLUTION_DISPOSITIONS,
  ACTOR_RESOLUTION_TRIGGERS,
  closeActorResolutionCaseAtomic,
  confirmActorResolutionItemAction,
  discoverActorResolutionInventory,
  freezeActorResolutionCaseAtomic,
  getActorResolutionCase,
  getActorResolutionSummary,
  openActorResolutionCase,
  recordActorResolutionDecisionSafely,
  requestActorResolutionItemAction,
  verifyActorResolutionCase,
  verifyActorResolutionConfirmations,
} from '@onbae/db';
import { z } from 'zod';

import { assertAdmin } from '../lib/auth.js';

const caseIdParams = z.object({ caseId: z.string().min(1).max(160) });
const actorIdParams = z.object({ actorId: z.string().min(1).max(160) });
const itemIdParams = z.object({ itemId: z.string().min(1).max(160) });

const openCaseSchema = z.object({
  primaryTrigger: z.enum(ACTOR_RESOLUTION_TRIGGERS),
  resolutionContext: z.string().min(1).max(1000),
  openedByType: z.string().min(1).max(240),
  openedByRef: z.string().min(1).max(500).optional(),
  sourceEvidenceArtifactId: z.string().min(1).max(200).optional(),
  freezePolicyVersion: z.string().min(1).max(120),
  openedAt: z.coerce.date().optional(),
  idempotencyKey: z.string().min(8).max(240),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const freezeSchema = z.object({
  reason: z.string().max(1000).optional(),
  evidenceArtifactId: z.string().min(1).max(200).optional(),
  decidedByType: z.string().min(1).max(240),
  decidedByRef: z.string().min(1).max(500).optional(),
  idempotencyKey: z.string().min(8).max(240),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const actionRequestSchema = z.object({
  requestedByType: z.string().min(1).max(240),
  requestedByRef: z.string().min(1).max(500).optional(),
  reason: z.string().max(1000).optional(),
});

const decisionSchema = z.object({
  disposition: z.enum(ACTOR_RESOLUTION_DISPOSITIONS),
  successorActorId: z.string().min(1).max(160).optional(),
  evidenceArtifactId: z.string().min(1).max(200).optional(),
  externalPrincipalType: z.string().min(1).max(240).optional(),
  externalPrincipalRef: z.string().min(1).max(500).optional(),
  decidedByType: z.string().min(1).max(240),
  decidedByRef: z.string().min(1).max(500).optional(),
  reason: z.string().max(1000).optional(),
  occurredAt: z.coerce.date().optional(),
  idempotencyKey: z.string().min(8).max(240),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const confirmationSchema = z.object({
  decisionId: z.string().min(1).max(160),
  evidenceArtifactId: z.string().min(1).max(200),
  confirmerType: z.string().min(1).max(240),
  confirmerRef: z.string().min(1).max(500).optional(),
  externalFramework: z.string().min(1).max(240).optional(),
  externalReference: z.string().min(1).max(500).optional(),
  confirmedAt: z.coerce.date().optional(),
  idempotencyKey: z.string().min(8).max(240),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const closeSchema = z.object({
  finalDisposition: z.string().min(1).max(240),
  decidedByType: z.string().min(1).max(240),
  decidedByRef: z.string().min(1).max(500).optional(),
  evidenceArtifactId: z.string().min(1).max(200).optional(),
  reason: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(240),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function actorResolutionRoutes(app: FastifyInstance) {
  // Resolution data can disclose authority, claims, dependencies and external
  // counterparties. Keep the full operational surface privileged until NOEONE
  // has an explicit per-field disclosure policy for public passports.
  app.post('/v1/actors/:actorId/resolutions', async (request, reply) => {
    assertAdmin(request);
    const params = actorIdParams.parse(request.params);
    const input = openCaseSchema.parse(request.body);
    const result = await openActorResolutionCase({
      actorId: params.actorId,
      primaryTrigger: input.primaryTrigger,
      resolutionContext: input.resolutionContext,
      openedByType: input.openedByType,
      freezePolicyVersion: input.freezePolicyVersion,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      ...(input.openedByRef !== undefined ? { openedByRef: input.openedByRef } : {}),
      ...(input.sourceEvidenceArtifactId !== undefined
        ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
        : {}),
      ...(input.openedAt !== undefined ? { openedAt: input.openedAt } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/actors/:actorId/resolution', async (request) => {
    assertAdmin(request);
    const params = actorIdParams.parse(request.params);
    return getActorResolutionSummary(params.actorId);
  });

  app.get('/v1/resolutions/:caseId', async (request) => {
    assertAdmin(request);
    const params = caseIdParams.parse(request.params);
    return getActorResolutionCase(params.caseId);
  });

  app.get('/v1/resolutions/:caseId/verify', async (request) => {
    assertAdmin(request);
    const params = caseIdParams.parse(request.params);
    const [core, confirmations] = await Promise.all([
      verifyActorResolutionCase(params.caseId),
      verifyActorResolutionConfirmations(params.caseId),
    ]);
    return {
      version: 'noeone.actor-resolution-verification.v2',
      caseId: params.caseId,
      verified: core.verified && confirmations.verified,
      core,
      confirmations,
    };
  });

  app.post('/v1/resolutions/:caseId/discover', async (request) => {
    assertAdmin(request);
    const params = caseIdParams.parse(request.params);
    return discoverActorResolutionInventory(params.caseId);
  });

  app.post('/v1/resolutions/:caseId/freeze', async (request) => {
    assertAdmin(request);
    const params = caseIdParams.parse(request.params);
    const input = freezeSchema.parse(request.body);
    return freezeActorResolutionCaseAtomic({
      caseId: params.caseId,
      decidedByType: input.decidedByType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.evidenceArtifactId !== undefined
        ? { evidenceArtifactId: input.evidenceArtifactId }
        : {}),
      ...(input.decidedByRef !== undefined ? { decidedByRef: input.decidedByRef } : {}),
    });
  });

  app.post('/v1/resolution-items/:itemId/request-action', async (request) => {
    assertAdmin(request);
    const params = itemIdParams.parse(request.params);
    const input = actionRequestSchema.parse(request.body);
    return requestActorResolutionItemAction({
      itemId: params.itemId,
      requestedByType: input.requestedByType,
      ...(input.requestedByRef !== undefined ? { requestedByRef: input.requestedByRef } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
  });

  app.post('/v1/resolution-items/:itemId/decisions', async (request, reply) => {
    assertAdmin(request);
    const params = itemIdParams.parse(request.params);
    const input = decisionSchema.parse(request.body);
    const result = await recordActorResolutionDecisionSafely({
      itemId: params.itemId,
      disposition: input.disposition,
      decidedByType: input.decidedByType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      ...(input.successorActorId !== undefined ? { successorActorId: input.successorActorId } : {}),
      ...(input.evidenceArtifactId !== undefined
        ? { evidenceArtifactId: input.evidenceArtifactId }
        : {}),
      ...(input.externalPrincipalType !== undefined
        ? { externalPrincipalType: input.externalPrincipalType }
        : {}),
      ...(input.externalPrincipalRef !== undefined
        ? { externalPrincipalRef: input.externalPrincipalRef }
        : {}),
      ...(input.decidedByRef !== undefined ? { decidedByRef: input.decidedByRef } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/resolution-items/:itemId/confirmations', async (request, reply) => {
    assertAdmin(request);
    const params = itemIdParams.parse(request.params);
    const input = confirmationSchema.parse(request.body);
    const result = await confirmActorResolutionItemAction({
      itemId: params.itemId,
      decisionId: input.decisionId,
      evidenceArtifactId: input.evidenceArtifactId,
      confirmerType: input.confirmerType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      ...(input.confirmerRef !== undefined ? { confirmerRef: input.confirmerRef } : {}),
      ...(input.externalFramework !== undefined
        ? { externalFramework: input.externalFramework }
        : {}),
      ...(input.externalReference !== undefined
        ? { externalReference: input.externalReference }
        : {}),
      ...(input.confirmedAt !== undefined ? { confirmedAt: input.confirmedAt } : {}),
    });
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/resolutions/:caseId/close', async (request) => {
    assertAdmin(request);
    const params = caseIdParams.parse(request.params);
    const input = closeSchema.parse(request.body);
    return closeActorResolutionCaseAtomic({
      caseId: params.caseId,
      finalDisposition: input.finalDisposition,
      decidedByType: input.decidedByType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      ...(input.decidedByRef !== undefined ? { decidedByRef: input.decidedByRef } : {}),
      ...(input.evidenceArtifactId !== undefined
        ? { evidenceArtifactId: input.evidenceArtifactId }
        : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
  });
}
