import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const canonicalStatusSchema = z.enum(['accepted', 'disputed', 'superseded']);

export const eventProvenanceSchema = z.object({
  issuer: z.string().min(1),
  signature: z.string().optional(),
  previousEventHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
});

export const unsignedActorEventSchema = z.object({
  id: z.string().min(1),
  actorId: z.string().min(1),
  type: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
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

export type UnsignedActorEvent = z.infer<typeof unsignedActorEventSchema>;
export type ActorEvent = z.infer<typeof actorEventSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashUnsignedEvent(event: UnsignedActorEvent): string {
  const parsed = unsignedActorEventSchema.parse(event);
  const digest = createHash('sha256').update(canonicalJson(parsed)).digest('hex');
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

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
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
