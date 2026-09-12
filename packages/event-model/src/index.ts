import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as signDetached,
  timingSafeEqual,
  verify as verifyDetached,
} from 'node:crypto';
import { z } from 'zod';

const eventTypePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const canonicalStatusSchema = z.enum(['accepted', 'disputed', 'superseded']);

export const eventProvenanceSchema = z.object({
  issuer: z.string().min(1),
  signature: z.string().optional(),
  previousEventHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
});

export const unsignedActorEventSchema = z.object({
  id: z.string().min(1),
  actorId: z.string().min(1),
  type: z.string().regex(eventTypePattern),
  sourceKey: z.string().min(1).max(240).optional(),
  occurredAt: z.string().datetime(),
  observedAt: z.string().datetime(),
  hostId: z.string().min(1),
  environmentVersion: z.string().min(1),
  executionId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
  provenance: eventProvenanceSchema,
  canonicalStatus: canonicalStatusSchema.default('accepted'),
});

export const actorEventSchema = unsignedActorEventSchema.extend({
  hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const HOST_RECEIPT_VERSION = 'noeone.host-receipt.v1' as const;

export const hostReceiptSchema = z.object({
  version: z.literal(HOST_RECEIPT_VERSION),
  receiptId: z.string().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
  hostId: z.string().min(1).max(160),
  keyId: z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/),
  actorId: z.string().min(1).max(200),
  executionId: z.string().min(1).max(200).optional(),
  environmentId: z.string().min(1).max(200),
  environmentVersion: z.string().min(1).max(160),
  type: z.string().regex(eventTypePattern),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export const hostReceiptSignatureSchema = z.string().regex(/^ed25519:[A-Za-z0-9_-]+$/);

export type UnsignedActorEvent = z.infer<typeof unsignedActorEventSchema>;
export type ActorEvent = z.infer<typeof actorEventSchema>;
export type HostReceipt = z.infer<typeof hostReceiptSchema>;

function compareUtf16(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Canonicalize I-JSON using the RFC 8785/JCS ordering model. JSON.stringify in
 * Node/V8 supplies the ECMAScript primitive serialization required by JCS; this
 * function adds recursive raw UTF-16 property ordering and rejects values that
 * cannot be represented as interoperable JSON.
 */
function canonicalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not permit NaN or Infinity.');
    }
    return value;
  }

  if (
    typeof value === 'undefined' ||
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    throw new TypeError(`Value of type ${typeof value} is not valid canonical JSON.`);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError('Canonical JSON does not permit cyclic values.');
    seen.add(value);
    const result = value.map((child) => canonicalize(child, seen));
    seen.delete(value);
    return result;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Canonical JSON does not permit cyclic values.');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON only accepts plain JSON objects.');
    }

    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      compareUtf16(a, b),
    );
    const result = Object.fromEntries(
      entries.map(([key, child]) => [key, canonicalize(child, seen)]),
    );
    seen.delete(value);
    return result;
  }

  throw new TypeError('Unsupported canonical JSON value.');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()));
}

function hashingView(event: UnsignedActorEvent): UnsignedActorEvent {
  const { signature, ...provenance } = event.provenance;
  void signature;
  return {
    ...event,
    provenance,
  };
}

export function hashUnsignedEvent(event: UnsignedActorEvent): string {
  const parsed = unsignedActorEventSchema.parse(event);
  const digest = createHash('sha256')
    .update(canonicalJson(hashingView(parsed)))
    .digest('hex');
  return `sha256:${digest}`;
}

export function createActorEvent(input: UnsignedActorEvent): ActorEvent {
  const parsed = unsignedActorEventSchema.parse(input);
  return actorEventSchema.parse({
    ...parsed,
    hash: hashUnsignedEvent(parsed),
  });
}

export function verifyEventHash(event: ActorEvent): boolean {
  const parsed = actorEventSchema.parse(event);
  const { hash: expected, ...unsigned } = parsed;
  return hashUnsignedEvent(unsigned) === expected;
}

export function signEventHash(hash: string, secret: string): string {
  return createHmac('sha256', secret).update(hash).digest('hex');
}

export function verifyEventSignature(hash: string, signature: string, secret: string): boolean {
  const expected = signEventHash(hash, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashHostReceipt(receipt: HostReceipt): string {
  const parsed = hostReceiptSchema.parse(receipt);
  const digest = createHash('sha256').update(canonicalJson(parsed)).digest('hex');
  return `sha256:${digest}`;
}

export function assertEd25519PublicKey(publicKeyPem: string): void {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`Host key must be Ed25519, received ${key.asymmetricKeyType ?? 'unknown'}.`);
  }
}

export function signHostReceipt(receipt: HostReceipt, privateKeyPem: string): string {
  const parsed = hostReceiptSchema.parse(receipt);
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`Host private key must be Ed25519, received ${key.asymmetricKeyType ?? 'unknown'}.`);
  }

  const signature = signDetached(null, Buffer.from(canonicalJson(parsed)), key).toString('base64url');
  return `ed25519:${signature}`;
}

export function verifyHostReceiptSignature(
  receipt: HostReceipt,
  signature: string,
  publicKeyPem: string,
): boolean {
  const parsed = hostReceiptSchema.parse(receipt);
  const parsedSignature = hostReceiptSignatureSchema.safeParse(signature);
  if (!parsedSignature.success) return false;

  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') return false;
    const encoded = parsedSignature.data.slice('ed25519:'.length);
    return verifyDetached(
      null,
      Buffer.from(canonicalJson(parsed)),
      key,
      Buffer.from(encoded, 'base64url'),
    );
  } catch {
    return false;
  }
}

export function assertEventChain(events: readonly ActorEvent[]): void {
  let previousHash: string | undefined;

  for (const event of events) {
    if (!verifyEventHash(event)) {
      throw new Error(`Invalid event hash for ${event.id}.`);
    }

    const declaredPrevious = event.provenance.previousEventHash;
    if (previousHash !== undefined && declaredPrevious !== previousHash) {
      throw new Error(
        `Broken event chain at ${event.id}: expected previous hash ${previousHash}, received ${declaredPrevious ?? 'none'}.`,
      );
    }

    previousHash = event.hash;
  }
}
