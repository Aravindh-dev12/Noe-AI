import type { FastifyInstance } from 'fastify';
import { normalizeHandle } from '@onbae/actor-core';
import {
  db,
  formCollective,
  getCollectiveContinuitySummary,
  transitionCollective,
  verifyCollectiveContinuity,
} from '@onbae/db';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const idempotencySchema = z.string().min(8).max(500);

const memberSchema = z.object({
  memberActorId: z.string().min(1),
  role: z.string().min(1).max(160),
  weightBps: z.number().int().min(0).max(10_000).nullable().default(null),
  joinEvidenceArtifactId: z.string().min(1).nullable().default(null),
});

const formSchema = z.object({
  collectiveActorId: z.string().min(1),
  governanceMethod: z.string().min(1).max(240),
  constitutionDigest: digestSchema,
  topologyDigest: digestSchema,
  decisionPolicyDigest: digestSchema,
  formationEvidenceArtifactId: z.string().min(1),
  roster: z.array(memberSchema).min(1).max(1_000),
  formedAt: z.coerce.date().optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const transitionSchema = z.object({
  predecessorEpochId: z.string().min(1),
  transitionKind: z.enum([
    'roster_change',
    'role_change',
    'topology_change',
    'constitution_change',
    'control_change',
    'restore',
  ]),
  transitionEvidenceArtifactId: z.string().min(1),
  roster: z.array(memberSchema).min(1).max(1_000),
  constitutionDigest: digestSchema.optional(),
  topologyDigest: digestSchema.optional(),
  decisionPolicyDigest: digestSchema.optional(),
  startedAt: z.coerce.date().optional(),
  idempotencyKey: idempotencySchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const actorParams = z.object({ actorId: z.string().min(1) });
const handleParams = z.object({ handle: z.string().min(1) });

function registryContext() {
  return {
    signingSecret: env.EVENT_SIGNING_SECRET,
    hostId: 'host_noeone',
    environmentVersion: 'noe.collective-continuity@1.0.0',
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

export async function collectiveRoutes(app: FastifyInstance) {
  app.post('/v1/collectives', async (request, reply) => {
    assertAdmin(request);
    const input = formSchema.parse(request.body);
    const result = await formCollective(
      {
        collectiveActorId: input.collectiveActorId,
        governanceMethod: input.governanceMethod,
        constitutionDigest: input.constitutionDigest,
        topologyDigest: input.topologyDigest,
        decisionPolicyDigest: input.decisionPolicyDigest,
        formationEvidenceArtifactId: input.formationEvidenceArtifactId,
        roster: input.roster,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
        ...(input.formedAt ? { formedAt: input.formedAt } : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.post('/v1/collectives/:actorId/epochs', async (request, reply) => {
    assertAdmin(request);
    const params = actorParams.parse(request.params);
    const input = transitionSchema.parse(request.body);
    const result = await transitionCollective(
      {
        collectiveActorId: params.actorId,
        predecessorEpochId: input.predecessorEpochId,
        transitionKind: input.transitionKind,
        transitionEvidenceArtifactId: input.transitionEvidenceArtifactId,
        roster: input.roster,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
        ...(input.constitutionDigest ? { constitutionDigest: input.constitutionDigest } : {}),
        ...(input.topologyDigest ? { topologyDigest: input.topologyDigest } : {}),
        ...(input.decisionPolicyDigest
          ? { decisionPolicyDigest: input.decisionPolicyDigest }
          : {}),
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      },
      registryContext(),
    );
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get('/v1/collectives/:handle/verify', async (request, reply) => {
    const params = handleParams.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });
    const verification = await verifyCollectiveContinuity(actorId);
    return reply.code(verification.verified ? 200 : 409).send(verification);
  });

  app.get('/v1/collectives/:handle', async (request, reply) => {
    const params = handleParams.parse(request.params);
    const actorId = await actorIdForHandle(params.handle);
    if (!actorId) return reply.code(404).send({ error: 'actor_not_found' });
    const summary = await getCollectiveContinuitySummary(actorId);
    if (!summary) return reply.code(404).send({ error: 'collective_not_found' });
    return summary;
  });
}
