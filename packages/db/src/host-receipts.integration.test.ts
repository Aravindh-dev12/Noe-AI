import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HOST_RECEIPT_VERSION, signHostReceipt, type HostReceipt } from '@onbae/event-model';

import { ingestHostReceipt } from './host-receipts.js';
import { db } from './index.js';

const REGISTRY_SECRET = 'test-registry-signing-secret-that-is-long-enough';
const suffix = randomUUID();
const hostId = `host_receipt_${suffix}`;
const keyId = `key_receipt_${suffix}`;
const environmentId = `env_receipt_${suffix}`;
const actorId = `act_receipt_${suffix}`;
const executionId = `exec_receipt_${suffix}`;
const lineageId = `lin_receipt_${suffix}`;

const keys = generateKeyPairSync('ed25519');
const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function receipt(overrides: Partial<HostReceipt> = {}): HostReceipt {
  return {
    version: HOST_RECEIPT_VERSION,
    receiptId: `receipt_${suffix}`,
    hostId,
    keyId,
    actorId,
    executionId,
    environmentId,
    environmentVersion: 'test-world@1.0.0',
    type: 'competition.result',
    occurredAt: new Date().toISOString(),
    payload: { result: 'win', score: 3 },
    ...overrides,
  };
}

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `receipt-test-${suffix}`,
      displayName: 'Receipt Test Host',
      status: 'active',
    },
  });
  await db.hostKey.create({
    data: {
      id: keyId,
      hostId,
      algorithm: 'ed25519',
      publicKeyPem,
      status: 'active',
    },
  });
  await db.environment.create({
    data: {
      id: environmentId,
      hostId,
      slug: `receipt-world-${suffix}`,
      displayName: 'Receipt World',
      version: 'test-world@1.0.0',
      status: 'ACTIVE',
    },
  });
  await db.actor.create({
    data: {
      id: actorId,
      handle: `receipt-${suffix}`,
      displayName: 'Receipt Actor',
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: new Date(),
    },
  });
  await db.actorExecution.create({
    data: {
      id: executionId,
      actorId,
      provider: 'mock',
      model: 'receipt-test-model',
      configHash: `receipt:${suffix}`,
      startedAt: new Date(),
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: new Date(),
    },
  });
});

afterAll(async () => {
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.environment.deleteMany({ where: { id: environmentId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('external host receipt ingestion', () => {
  it('verifies a host claim and anchors it into the canonical actor career', async () => {
    const signedReceipt = receipt();
    const signature = signHostReceipt(signedReceipt, privateKeyPem);

    const first = await ingestHostReceipt({
      receipt: signedReceipt,
      signature,
      registrySigningSecret: REGISTRY_SECRET,
    });

    expect(first.replayed).toBe(false);
    expect(first.receipt.actorId).toBe(actorId);
    expect(first.receipt.actorEventId).toBe(first.event.id);
    expect(first.event.actorId).toBe(actorId);
    expect(first.event.issuer).toBe('noeone.registry');
    expect(first.event.sourceKey).toBe(`host-receipt:${first.receipt.contentHash}`);

    const replay = await ingestHostReceipt({
      receipt: signedReceipt,
      signature,
      registrySigningSecret: REGISTRY_SECRET,
    });

    expect(replay.replayed).toBe(true);
    expect(replay.receipt.id).toBe(first.receipt.id);
    expect(replay.event.id).toBe(first.event.id);
    expect(await db.hostReceipt.count({ where: { actorId } })).toBe(1);
  });

  it('rejects conflicting reuse of a host receipt id', async () => {
    const original = receipt();
    const altered = receipt({ payload: { result: 'loss', score: 0 } });
    const signature = signHostReceipt(altered, privateKeyPem);

    await expect(
      ingestHostReceipt({
        receipt: altered,
        signature,
        registrySigningSecret: REGISTRY_SECRET,
      }),
    ).rejects.toThrow(/reused with conflicting signed content/);

    expect(original.receiptId).toBe(altered.receiptId);
  });

  it('rejects a tampered or mismatched host signature', async () => {
    const claimed = receipt({ receiptId: `receipt_bad_signature_${suffix}` });
    const different = { ...claimed, payload: { result: 'loss' } } satisfies HostReceipt;
    const wrongSignature = signHostReceipt(different, privateKeyPem);

    await expect(
      ingestHostReceipt({
        receipt: claimed,
        signature: wrongSignature,
        registrySigningSecret: REGISTRY_SECRET,
      }),
    ).rejects.toThrow(/signature is invalid/);
  });
});
