import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  createAuthorityGrant,
  db,
  evaluateActorAuthority,
  evaluateAuthorityGrant,
  revokeAuthorityGrant,
  verifyAuthorityState,
  type Prisma,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const idempotencySchema = z.string().min(8).max(240);
const moneySchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(80);

const createGrantSchema = z.object({
  subjectActorId: z.string().min(1),
  parentGrantId: z.string().min(1).optional(),
  grantor: z
    .object({
      type: z.enum(['user', 'actor', 'external', 'admin', 'system']),
      ref: z.string().min(1).max(500),
    })
    .optional(),
  actions: z.array(z.string().min(1).max(240)).min(1).max(64),
  resources: z.array(z.string().min(1).max(240)).min(1).max(128),
  canRedelegate: z.boolean().default(false),
  remainingDelegationDepth: z.number().int().min(0).max(32).default(0),
  maxAmountMinor: moneySchema.optional(),
  currency: z.string().length(3).optional(),
  notBefore: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  externalFramework: z.string().min(1).max(120).optional(),
  externalReference: z.string().min(1).max(500).optional(),
  sourceEvidenceArtifactId: z.string().min(1).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const revokeGrantSchema = z.object({
  reason: z.string().max(1_000).optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const evaluateSchema = z.object({
  actorId: z.string().min(1),
  grantId: z.string().min(1).optional(),
  action: z.string().min(1).max(240),
  resource: z.string().min(1).max(240),
  amountMinor: moneySchema.optional(),
  currency: z.string().length(3).optional(),
  at: z.coerce.date().optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noeone-authority@1.0.0',
    issuer: 'noeone',
  } as const;
}

export async function authorityRoutes(app: FastifyInstance) {
  // Authority writes stay privileged until NOEONE supports counterparty-scoped
  // consent and external credential verification policies. NOEONE records
  // references to external credentials; it never accepts bearer secrets here.
  app.post('/v1/authority/grants', async (request, reply) => {
    assertAdmin(request);
    const input = createGrantSchema.parse(request.body);
    const result = await createAuthorityGrant(
      {
        subjectActorId: input.subjectActorId,
        ...(input.parentGrantId !== undefined ? { parentGrantId: input.parentGrantId } : {}),
        ...(input.grantor !== undefined ? { grantor: input.grantor } : {}),
        actions: input.actions,
        resources: input.resources,
        canRedelegate: input.canRedelegate,
        remainingDelegationDepth: input.remainingDelegationDepth,
        ...(input.maxAmountMinor !== undefined ? { maxAmountMinor: input.maxAmountMinor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.notBefore !== undefined ? { notBefore: input.notBefore } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.externalFramework !== undefined
          ? { externalFramework: input.externalFramework }
          : {}),
        ...(input.externalReference !== undefined
          ? { externalReference: input.externalReference }
          : {}),
        ...(input.sourceEvidenceArtifactId !== undefined
          ? { sourceEvidenceArtifactId: input.sourceEvidenceArtifactId }
          : {}),
        principal: { type: 'admin' },
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );

    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/authority/grants/:grantId/revoke', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ grantId: z.string().min(1) }).parse(request.params);
    const input = revokeGrantSchema.parse(request.body);
    const result = await revokeAuthorityGrant(
      {
        grantId: params.grantId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        principal: { type: 'admin' },
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonObject,
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/authority/evaluate', async (request) => {
    assertAdmin(request);
    const input = evaluateSchema.parse(request.body);
    const authorityRequest = {
      action: input.action,
      resource: input.resource,
      ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
      ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
      ...(input.at !== undefined ? { at: input.at } : {}),
    };

    if (input.grantId) {
      const evaluation = await evaluateAuthorityGrant(input.grantId, authorityRequest);
      if (evaluation.subjectActorId !== input.actorId) {
        throw Object.assign(new Error('Grant does not belong to the requested actor.'), {
          statusCode: 409,
        });
      }
      return { version: 'noeone.authority.decision.v1', ...evaluation };
    }

    return {
      version: 'noeone.authority.decision.v1',
      ...(await evaluateActorAuthority(input.actorId, authorityRequest)),
    };
  });

  app.get('/v1/authority/grants/:grantId', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ grantId: z.string().min(1) }).parse(request.params);
    const grant = await db.authorityGrant.findUnique({
      where: { id: params.grantId },
      include: {
        parent: {
          select: { id: true, subjectActorId: true, status: true, expiresAt: true },
        },
        subject: { select: { id: true, handle: true, displayName: true } },
        sourceEvidence: {
          select: { id: true, kind: true, issuer: true, digest: true, digestAlgorithm: true },
        },
        transitions: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!grant) return reply.code(404).send({ error: 'authority_grant_not_found' });
    return grant;
  });

  app.get('/v1/actors/:handle/authority', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const query = listSchema.parse(request.query);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true, handle: true, displayName: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });

    const grants = await db.authorityGrant.findMany({
      where: { subjectActorId: actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        parentGrantId: true,
        status: true,
        actions: true,
        resources: true,
        canRedelegate: true,
        remainingDelegationDepth: true,
        notBefore: true,
        expiresAt: true,
        externalFramework: true,
        createdAt: true,
      },
    });

    return {
      version: 'noeone.authority.public.v1',
      actor,
      data: grants.map((grant) => ({
        id: grant.id,
        parentGrantId: grant.parentGrantId,
        status: grant.status.toLowerCase(),
        actionCount: grant.actions.length,
        resourceCount: grant.resources.length,
        canRedelegate: grant.canRedelegate,
        remainingDelegationDepth: grant.remainingDelegationDepth,
        notBefore: grant.notBefore,
        expiresAt: grant.expiresAt,
        externalFramework: grant.externalFramework,
        createdAt: grant.createdAt,
      })),
    };
  });

  app.get('/v1/actors/:handle/authority/verify', async (request, reply) => {
    const params = z.object({ handle: z.string().min(1) }).parse(request.params);
    const actor = await db.actor.findUnique({
      where: { handle: normalizeHandle(params.handle) },
      select: { id: true },
    });
    if (!actor) return reply.code(404).send({ error: 'actor_not_found' });
    return verifyAuthorityState(actor.id);
  });
}
