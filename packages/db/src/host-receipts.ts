import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  hashHostReceipt,
  hostReceiptSchema,
  hostReceiptSignatureSchema,
  verifyHostReceiptSignature,
  type HostReceipt,
} from '@onbae/event-model';

import { db } from './index.js';
import { appendCanonicalActorEvent } from './events.js';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export class HostReceiptIngestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'HostReceiptIngestError';
    this.statusCode = statusCode;
  }
}

export type IngestHostReceiptInput = {
  receipt: unknown;
  signature: string;
  registrySigningSecret: string;
};

function assertReceiptTime(receipt: HostReceipt): void {
  const occurredAt = new Date(receipt.occurredAt).getTime();
  if (occurredAt > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw new HostReceiptIngestError('Host receipt occurredAt is too far in the future.', 400);
  }
}

export async function ingestHostReceipt(input: IngestHostReceiptInput) {
  const receipt = hostReceiptSchema.parse(input.receipt);
  const signature = hostReceiptSignatureSchema.parse(input.signature);
  assertReceiptTime(receipt);
  const contentHash = hashHostReceipt(receipt);

  return db.$transaction(async (tx) => {
    const existing = await tx.hostReceipt.findUnique({
      where: {
        hostId_receiptId: {
          hostId: receipt.hostId,
          receiptId: receipt.receiptId,
        },
      },
      include: { actorEvent: true },
    });

    if (existing) {
      if (
        existing.version !== receipt.version ||
        existing.contentHash !== contentHash ||
        existing.signature !== signature
      ) {
        throw new HostReceiptIngestError(
          `Host receipt ${receipt.hostId}/${receipt.receiptId} was reused with conflicting signed content.`,
          409,
        );
      }

      return { receipt: existing, event: existing.actorEvent, replayed: true } as const;
    }

    const [host, key, actor, environment] = await Promise.all([
      tx.host.findUnique({ where: { id: receipt.hostId } }),
      tx.hostKey.findUnique({ where: { id: receipt.keyId } }),
      tx.actor.findUnique({ where: { id: receipt.actorId } }),
      tx.environment.findUnique({ where: { id: receipt.environmentId } }),
    ]);

    if (!host) throw new HostReceiptIngestError(`Host ${receipt.hostId} does not exist.`, 404);
    if (host.status !== 'active') {
      throw new HostReceiptIngestError(`Host ${receipt.hostId} is unavailable.`, 403);
    }
    if (!key) throw new HostReceiptIngestError(`Host key ${receipt.keyId} does not exist.`, 404);
    if (key.hostId !== receipt.hostId || key.status !== 'active') {
      throw new HostReceiptIngestError(
        `Host key ${receipt.keyId} is not active for host ${receipt.hostId}.`,
        403,
      );
    }
    if (key.algorithm !== 'ed25519') {
      throw new HostReceiptIngestError(`Unsupported host key algorithm ${key.algorithm}.`, 400);
    }
    if (!actor) throw new HostReceiptIngestError(`Actor ${receipt.actorId} does not exist.`, 404);
    if (actor.status !== 'ACTIVE') {
      throw new HostReceiptIngestError(`Actor ${receipt.actorId} is unavailable.`, 409);
    }
    if (!environment) {
      throw new HostReceiptIngestError(`Environment ${receipt.environmentId} does not exist.`, 404);
    }
    if (
      environment.status !== 'ACTIVE' ||
      environment.hostId !== receipt.hostId ||
      environment.version !== receipt.environmentVersion
    ) {
      throw new HostReceiptIngestError(
        `Environment ${receipt.environmentId}@${receipt.environmentVersion} is not active for host ${receipt.hostId}.`,
        409,
      );
    }

    if (receipt.executionId) {
      const execution = await tx.actorExecution.findUnique({
        where: { id: receipt.executionId },
        select: { actorId: true },
      });
      if (!execution) {
        throw new HostReceiptIngestError(`Execution ${receipt.executionId} does not exist.`, 404);
      }
      if (execution.actorId !== receipt.actorId) {
        throw new HostReceiptIngestError(
          `Execution ${receipt.executionId} does not belong to actor ${receipt.actorId}.`,
          409,
        );
      }
    }

    if (!verifyHostReceiptSignature(receipt, signature, key.publicKeyPem)) {
      throw new HostReceiptIngestError('Host receipt signature is invalid.', 401);
    }

    const actorEvent = await appendCanonicalActorEvent(
      tx,
      {
        actorId: receipt.actorId,
        ...(receipt.executionId ? { executionId: receipt.executionId } : {}),
        type: receipt.type,
        sourceKey: `host-receipt:${contentHash}`,
        occurredAt: new Date(receipt.occurredAt),
        hostId: receipt.hostId,
        environmentVersion: receipt.environmentVersion,
        issuer: 'noeone.registry',
        payload: {
          claim: receipt.payload,
          hostReceipt: {
            version: receipt.version,
            receiptId: receipt.receiptId,
            keyId: receipt.keyId,
            environmentId: receipt.environmentId,
            contentHash,
            signatureScheme: 'ed25519',
          },
        },
      },
      input.registrySigningSecret,
    );

    const storedReceipt = await tx.hostReceipt.create({
      data: {
        id: `hr_${randomUUID()}`,
        version: receipt.version,
        receiptId: receipt.receiptId,
        hostId: receipt.hostId,
        keyId: receipt.keyId,
        actorId: receipt.actorId,
        ...(receipt.executionId ? { executionId: receipt.executionId } : {}),
        environmentId: receipt.environmentId,
        actorEventId: actorEvent.id,
        type: receipt.type,
        occurredAt: new Date(receipt.occurredAt),
        environmentVersion: receipt.environmentVersion,
        payload: receipt.payload as Prisma.InputJsonValue,
        signature,
        contentHash,
      },
    });

    return { receipt: storedReceipt, event: actorEvent, replayed: false } as const;
  });
}
