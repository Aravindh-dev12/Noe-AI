import type { FastifyInstance } from 'fastify';
import {
  assessRelianceChange,
  captureRelianceBasis,
  getRelianceAssessments,
  getRelianceHistory,
  verifyRelianceProvenance,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';
import { jsonMetadataSchema } from '../lib/json.js';

const boundedId = z.string().min(1).max(240);
const boundedText = z.string().min(1).max(800);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });

const captureSchema = z
  .object({
    actorId: boundedId,
    counterpartyType: z.string().min(1).max(120),
    counterpartyRef: boundedText,
    relationKind: z.enum([
      'authorize',
      'transact',
      'insure',
      'hire',
      'follow',
      'host',
      'certify',
      'delegate',
      'other',
    ]),
    reliedAt: timestamp,
    validUntil: timestamp.nullish(),
    expectedLineageId: boundedId,
    expectedExecutionId: boundedId,
    disclosureBundleDigest: digest,
    capabilitySnapshotDigest: digest.nullish(),
    authoritySnapshotDigest: digest.nullish(),
    controlSnapshotDigest: digest.nullish(),
    correctiveStateDigest: digest.nullish(),
    dependencySnapshotDigest: digest.nullish(),
    basisEvidenceArtifactId: boundedId,
    supersedesRelianceId: boundedId.nullish(),
    idempotencyKey: z.string().min(8).max(500),
    metadata: jsonMetadataSchema,
  })
  .strict();

const assessmentSchema = z
  .object({
    actorId: boundedId,
    expectedSuccessorLineageId: boundedId,
    expectedSuccessorExecutionId: boundedId,
    successorDisclosureBundleDigest: digest,
    successorCapabilitySnapshotDigest: digest.nullish(),
    successorAuthoritySnapshotDigest: digest.nullish(),
    successorControlSnapshotDigest: digest.nullish(),
    successorCorrectiveStateDigest: digest.nullish(),
    successorDependencySnapshotDigest: digest.nullish(),
    disposition: z.enum(['unaffected', 'review-required', 'invalidated', 'disputed']),
    evaluatorType: z.string().min(1).max(120),
    evaluatorRef: boundedText,
    method: z.string().min(1).max(240),
    methodVersion: z.string().min(1).max(120),
    evidenceArtifactId: boundedId,
    assessedAt: timestamp,
    reason: z.string().max(4000).nullish(),
    idempotencyKey: z.string().min(8).max(500),
    metadata: jsonMetadataSchema,
  })
  .strict();

const listSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-reliance-provenance@1.0.0',
    issuer: 'noeone',
  } as const;
}

export async function relianceProvenanceRoutes(app: FastifyInstance) {
  app.post('/v1/reliance-bases', async (request, reply) => {
    assertAdmin(request);
    const input = captureSchema.parse(request.body);
    const result = await captureRelianceBasis(
      {
        actorId: input.actorId,
        counterpartyType: input.counterpartyType,
        counterpartyRef: input.counterpartyRef,
        relationKind: input.relationKind,
        reliedAt: new Date(input.reliedAt),
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        expectedLineageId: input.expectedLineageId,
        expectedExecutionId: input.expectedExecutionId,
        disclosureBundleDigest: input.disclosureBundleDigest,
        capabilitySnapshotDigest: input.capabilitySnapshotDigest ?? null,
        authoritySnapshotDigest: input.authoritySnapshotDigest ?? null,
        controlSnapshotDigest: input.controlSnapshotDigest ?? null,
        correctiveStateDigest: input.correctiveStateDigest ?? null,
        dependencySnapshotDigest: input.dependencySnapshotDigest ?? null,
        basisEvidenceArtifactId: input.basisEvidenceArtifactId,
        supersedesRelianceId: input.supersedesRelianceId ?? null,
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.reliance-basis.persisted.v1',
      replayed: result.replayed,
      basis: result.basis,
    });
  });

  app.post('/v1/reliance-bases/:relianceId/assessments', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ relianceId: boundedId }).parse(request.params);
    const input = assessmentSchema.parse(request.body);
    const result = await assessRelianceChange(
      {
        relianceId: params.relianceId,
        actorId: input.actorId,
        expectedSuccessorLineageId: input.expectedSuccessorLineageId,
        expectedSuccessorExecutionId: input.expectedSuccessorExecutionId,
        successorDisclosureBundleDigest: input.successorDisclosureBundleDigest,
        successorCapabilitySnapshotDigest: input.successorCapabilitySnapshotDigest ?? null,
        successorAuthoritySnapshotDigest: input.successorAuthoritySnapshotDigest ?? null,
        successorControlSnapshotDigest: input.successorControlSnapshotDigest ?? null,
        successorCorrectiveStateDigest: input.successorCorrectiveStateDigest ?? null,
        successorDependencySnapshotDigest: input.successorDependencySnapshotDigest ?? null,
        disposition: input.disposition,
        evaluatorType: input.evaluatorType,
        evaluatorRef: input.evaluatorRef,
        method: input.method,
        methodVersion: input.methodVersion,
        evidenceArtifactId: input.evidenceArtifactId,
        assessedAt: new Date(input.assessedAt),
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      version: 'noeone.reliance-change-assessment.persisted.v1',
      replayed: result.replayed,
      assessment: result.assessment,
      structuralChanges: result.structuralChanges,
    });
  });

  app.get('/v1/actors/:actorId/reliance-bases', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    return {
      version: 'noeone.reliance-basis-list.v1',
      data: await getRelianceHistory(params.actorId, query.limit),
    };
  });

  app.get('/v1/reliance-bases/:relianceId/assessments', async (request) => {
    assertAdmin(request);
    const params = z.object({ relianceId: boundedId }).parse(request.params);
    const query = listSchema.parse(request.query);
    return {
      version: 'noeone.reliance-assessment-list.v1',
      data: await getRelianceAssessments(params.relianceId, query.limit),
    };
  });

  app.get('/v1/actors/:actorId/reliance-provenance/verify', async (request) => {
    assertAdmin(request);
    const params = z.object({ actorId: boundedId }).parse(request.params);
    return verifyRelianceProvenance(params.actorId);
  });
}