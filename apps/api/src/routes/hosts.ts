import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db, ingestHostReceipt } from '@onbae/db';
import {
  assertEd25519PublicKey,
  hostReceiptSchema,
  hostReceiptSignatureSchema,
} from '@onbae/event-model';
import { z } from 'zod';

import { env } from '../env.js';
import { assertAdmin } from '../lib/auth.js';

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const createHostSchema = z.object({
  slug: slugSchema,
  displayName: z.string().min(1).max(120),
  keyId: z.string().min(3).max(160).optional(),
  publicKeyPem: z.string().min(40).max(8_000),
});

const addHostKeySchema = z.object({
  keyId: z.string().min(3).max(160).optional(),
  publicKeyPem: z.string().min(40).max(8_000),
  retireKeyId: z.string().min(3).max(160).optional(),
});

const createEnvironmentSchema = z.object({
  id: z.string().min(3).max(160).optional(),
  slug: slugSchema,
  displayName: z.string().min(1).max(120),
  version: z.string().min(1).max(160),
  config: z.record(z.string(), z.unknown()).default({}),
});

const submitReceiptSchema = z.object({
  receipt: hostReceiptSchema,
  signature: hostReceiptSignatureSchema,
});

export async function hostRoutes(app: FastifyInstance) {
  app.get('/v1/hosts', async () => {
    const hosts = await db.host.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        displayName: true,
        status: true,
        createdAt: true,
        keys: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            algorithm: true,
            publicKeyPem: true,
            status: true,
            createdAt: true,
            retiredAt: true,
          },
        },
        environments: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            slug: true,
            displayName: true,
            version: true,
          },
        },
      },
    });

    return { data: hosts };
  });

  app.post('/v1/hosts', async (request, reply) => {
    assertAdmin(request);
    const input = createHostSchema.parse(request.body);
    assertEd25519PublicKey(input.publicKeyPem);

    const existing = await db.host.findUnique({ where: { slug: input.slug } });
    if (existing) {
      return reply.code(409).send({ error: 'host_slug_already_exists' });
    }

    const hostId = `host_${randomUUID()}`;
    const keyId = input.keyId ?? `hkey_${randomUUID()}`;
    const host = await db.$transaction(async (tx) => {
      const created = await tx.host.create({
        data: {
          id: hostId,
          slug: input.slug,
          displayName: input.displayName,
          status: 'active',
        },
      });
      const key = await tx.hostKey.create({
        data: {
          id: keyId,
          hostId,
          algorithm: 'ed25519',
          publicKeyPem: input.publicKeyPem,
          status: 'active',
        },
      });
      return { ...created, key };
    });

    return reply.code(201).send(host);
  });

  app.post('/v1/hosts/:hostId/keys', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ hostId: z.string().min(1) }).parse(request.params);
    const input = addHostKeySchema.parse(request.body);
    assertEd25519PublicKey(input.publicKeyPem);
    const keyId = input.keyId ?? `hkey_${randomUUID()}`;

    const result = await db.$transaction(async (tx) => {
      const host = await tx.host.findUnique({ where: { id: params.hostId } });
      if (!host) {
        throw Object.assign(new Error('Host not found.'), { statusCode: 404 });
      }

      if (input.retireKeyId) {
        const retired = await tx.hostKey.updateMany({
          where: {
            id: input.retireKeyId,
            hostId: host.id,
            status: 'active',
          },
          data: {
            status: 'retired',
            retiredAt: new Date(),
          },
        });
        if (retired.count !== 1) {
          throw Object.assign(new Error('Key to retire was not active for this host.'), {
            statusCode: 409,
          });
        }
      }

      return tx.hostKey.create({
        data: {
          id: keyId,
          hostId: host.id,
          algorithm: 'ed25519',
          publicKeyPem: input.publicKeyPem,
          status: 'active',
        },
      });
    });

    return reply.code(201).send(result);
  });

  app.post('/v1/hosts/:hostId/environments', async (request, reply) => {
    assertAdmin(request);
    const params = z.object({ hostId: z.string().min(1) }).parse(request.params);
    const input = createEnvironmentSchema.parse(request.body);
    const host = await db.host.findUnique({ where: { id: params.hostId } });
    if (!host) {
      return reply.code(404).send({ error: 'host_not_found' });
    }
    if (host.status !== 'active') {
      return reply.code(409).send({ error: 'host_not_active' });
    }

    const environment = await db.environment.create({
      data: {
        id: input.id ?? `env_${randomUUID()}`,
        hostId: host.id,
        slug: input.slug,
        displayName: input.displayName,
        version: input.version,
        status: 'ACTIVE',
        config: input.config,
      },
    });

    return reply.code(201).send(environment);
  });

  app.post(
    '/v1/host-receipts',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const input = submitReceiptSchema.parse(request.body);
      const result = await ingestHostReceipt({
        receipt: input.receipt,
        signature: input.signature,
        registrySigningSecret: env.EVENT_SIGNING_SECRET,
      });

      return reply.code(result.replayed ? 200 : 201).send({
        replayed: result.replayed,
        receipt: result.receipt,
        canonicalEvent: {
          id: result.event.id,
          actorId: result.event.actorId,
          sequence: result.event.sequence,
          hash: result.event.hash,
          canonicalStatus: result.event.canonicalStatus.toLowerCase(),
        },
      });
    },
  );

  app.get('/v1/host-receipts/:hostId/:receiptId', async (request, reply) => {
    const params = z
      .object({ hostId: z.string().min(1), receiptId: z.string().min(1) })
      .parse(request.params);

    const receipt = await db.hostReceipt.findUnique({
      where: {
        hostId_receiptId: {
          hostId: params.hostId,
          receiptId: params.receiptId,
        },
      },
      include: {
        host: { select: { id: true, slug: true, displayName: true } },
        hostKey: {
          select: { id: true, algorithm: true, publicKeyPem: true, status: true, retiredAt: true },
        },
        actor: { select: { id: true, handle: true, displayName: true } },
        environment: { select: { id: true, slug: true, displayName: true, version: true } },
        actorEvent: {
          select: { id: true, sequence: true, hash: true, canonicalStatus: true },
        },
      },
    });

    if (!receipt) {
      return reply.code(404).send({ error: 'host_receipt_not_found' });
    }

    return receipt;
  });
}
