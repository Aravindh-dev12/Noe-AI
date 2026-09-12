import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  createCommitment,
  db,
  registerEvidenceReference,
  transitionCommitment,
  verifyInstitutionalState,
  type CommitmentStatus,
  type EvidenceVerificationStatus,
  type Prisma,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const digestSchema = z.string().min(16).max(512);
const idempotencySchema = z.string().min(8).max(240);

const registerEvidenceSchema = z.object({
  actorId: z.string().min(1),
  kind: z.string().min(1).max(120),
  issuer: z.string().min(1).max(240),
  externalId: z.string().max(500).optional(),
  uri: z.string().url().max(2_000).optional(),
  digest: digestSchema,
  digestAlgorithm: z.string().min(1).max(40).default('sha256'),
  verificationStatus: z.enum(['claimed', 'verified', 'rejected', 'revoked']).default('claimed'),
  observedAt: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const createCommitmentSchema = z
  .object({
    debtorActorId: z.string().min(1),
    creditorActorId: z.string().min(1).optional(),
    creditorExternalRef: z.string().min(1).max(500).optional(),
    kind: z.string().min(1).max(120),
    termsDigest: digestSchema,
    termsUri: z.string().url().max(2_000).optional(),
    sourceEvidenceId: z.string().min(1).optional(),
    externalFramework: z.string().max(120).optional(),
    externalReference: z.string().max(500).optional(),
    dueAt: z.coerce.date().optional(),
    idempotencyKey: idempotencySchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((value) => Boolean(value.creditorActorId || value.creditorExternalRef), {
    message: 'An actor or external counterparty is required.',
    path: ['creditorActorId'],
  });

const transitionCommitmentSchema = z.object({
  toStatus: z.enum(['open', 'fulfilled', 'breached', 'cancelled', 'disputed']),
  evidenceRefId: z.string().min(1).optional(),
  reason: z.string().max(1_000).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const evidenceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  verificationStatus: z.enum(['claimed', 'verified', 'rejected', 'revoked']).optional(),
});

const commitmentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['open', 'fulfilled', 'breached', 'cancelled', 'disputed']).optional(),
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-institutional@1.0.0',
    issuer: 'noeone',
  } as const;
}

function evidenceStatus(value: 'claimed' | 'verified' | 'rejected' | 'revoked') {
  return value.toUpperCase() as EvidenceVerificationStatus;
}

function commitmentStatus(value: 'open' | 'fulfilled' | 'breached' | 'cancelled' | 'disputed') {
  return value.toUpperCase() as CommitmentStatus;
}

export async function institutionalRoutes(app: FastifyInstance) {
  // Institutional writes are intentionally admin/research-first. Counterparty
  // consent and legal authority need explicit semantics before public writes.
  app.post('/v1/evidence', async (request, reply) => {
    assertAdmin(request);
    const input = registerEvidenceSchema.parse(request.body);

    const result = await registerEvidenceReference(
      {
        actorId: input.actorId,
        kind: input.kind,
        issuer: input.issuer,
        ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
        ...(input.uri !== undefined ? { uri: input.uri } : {}),
        digest: input.digest,
        digestAlgorithm: input.digestAlgorithm,
        verificationStatus: evidenceStatus(input.verificationStatus),
        ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
        metadata: input.metadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      replayed: result.replayed,
      evidence: result.evidence,
    });
  });

  app.get('/v1/actors/:handle/evidence', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = evidenceQuerySchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true, handle: true, displayName: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    const evidence = await db.evidenceRef.findMany({
      where: {
        actorId: actor.id,
        ...(query.verificationStatus
          ? { verificationStatus: evidenceStatus(query.verificationStatus) }
          : {}),
      },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        kind: true,
        issuer: true,
        externalId: true,
        uri: true,
        digest: true,
        digestAlgorithm: true,
        verificationStatus: true,
        observedAt: true,
        verifiedAt: true,
        metadata: true,
      },
    });

    return { version: 'noeone.evidence.v1', actor, data: evidence };
  });

  app.post('/v1/commitments', async (request, reply) => {
    assertAdmin(request);
    const input = createCommitmentSchema.parse(request.body);

    const result = await createCommitment(
      {
        debtorActorId: input.debtorActorId,
        ...(input.creditorActorId !== undefined ? { creditorActorId: input.creditorActorId } : {}),
        ...(input.creditorExternalRef !== undefined
          ? { creditorExternalRef: input.creditorExternalRef }
          : {}),
        kind: input.kind,
        termsDigest: input.termsDigest,
        ...(input.termsUri !== undefined ? { termsUri: input.termsUri } : {}),
        ...(input.sourceEvidenceId !== undefined
          ? { sourceEvidenceId: input.sourceEvidenceId }
          : {}),
        ...(input.externalFramework !== undefined
          ? { externalFramework: input.externalFramework }
          : {}),
        ...(input.externalReference !== undefined
          ? { externalReference: input.externalReference }
          : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        principal: { type: 'admin' },
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      replayed: result.replayed,
      commitment: result.commitment,
      openingTransition: result.transition,
    });
  });

  app.get('/v1/commitments/:commitmentId', async (request, reply) => {
    const params = z.object({ commitmentId: z.string().min(1) }).parse(request.params);
    const commitment = await db.commitment.findUnique({
      where: { id: params.commitmentId },
      include: {
        debtor: { select: { id: true, handle: true, displayName: true } },
        creditor: { select: { id: true, handle: true, displayName: true } },
        sourceEvidence: true,
        transitions: {
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          include: { evidenceRef: true },
        },
      },
    });
    if (!commitment) return reply.code(404).send({ error: 'commitment_not_found' });
    return commitment;
  });

  app.get('/v1/actors/:handle/commitments', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = commitmentQuerySchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true, handle: true, displayName: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    const commitments = await db.commitment.findMany({
      where: {
        debtorActorId: actor.id,
        ...(query.status ? { status: commitmentStatus(query.status) } : {}),
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      include: {
        creditor: { select: { id: true, handle: true, displayName: true } },
        sourceEvidence: {
          select: {
            id: true,
            kind: true,
            issuer: true,
            digest: true,
            verificationStatus: true,
          },
        },
        transitions: {
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return { version: 'noeone.commitments.v1', actor, data: commitments };
  });

  app.post('/v1/commitments/:commitmentId/transitions', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ commitmentId: z.string().min(1) }).parse(request.params);
    const input = transitionCommitmentSchema.parse(request.body);

    const result = await transitionCommitment(
      {
        commitmentId: params.commitmentId,
        toStatus: commitmentStatus(input.toStatus),
        ...(input.evidenceRefId !== undefined ? { evidenceRefId: input.evidenceRefId } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        principal: { type: 'admin' },
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send({
      replayed: result.replayed,
      commitment: result.commitment,
      transition: result.transition,
    });
  });

  app.get('/v1/actors/:handle/institutional/verify', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return verifyInstitutionalState(actor.id);
  });
}
