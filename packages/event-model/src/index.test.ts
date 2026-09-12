import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  HOST_RECEIPT_VERSION,
  assertEventChain,
  canonicalJson,
  createActorEvent,
  hashHostReceipt,
  signHostReceipt,
  verifyEventHash,
  verifyHostReceiptSignature,
  type HostReceipt,
} from './index.js';

const base = {
  actorId: 'act_demo',
  type: 'competition.result',
  occurredAt: '2026-01-01T00:00:00.000Z',
  observedAt: '2026-01-01T00:00:01.000Z',
  hostId: 'host_demo',
  environmentVersion: 'triad@1.0.0',
  payload: { result: 'win' },
  provenance: { issuer: 'host_demo' },
  canonicalStatus: 'accepted' as const,
};

const hostReceipt: HostReceipt = {
  version: HOST_RECEIPT_VERSION,
  receiptId: 'receipt_demo_001',
  hostId: 'host_external',
  keyId: 'key_2026_01',
  actorId: 'act_demo',
  executionId: 'exec_demo',
  environmentId: 'env_external_1',
  environmentVersion: 'arena@1.2.0',
  type: 'competition.result',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { result: 'win', opponentActorId: 'act_other' },
};

describe('canonical JSON', () => {
  it('sorts raw property names by RFC 8785 UTF-16 code-unit order on the wire', () => {
    const value = {
      '\u20ac': 'Euro Sign',
      '\r': 'Carriage Return',
      '\ufb33': 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      '\ud83d\ude00': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      '\u00f6': 'Latin Small Letter O With Diaeresis',
    };

    // This is the ordering vector from RFC 8785 section 3.2.3. We assert
    // serialized bytes directly: Object.keys(JSON.parse(...)) is invalid for
    // this test because ECMAScript enumerates integer-index keys such as "1"
    // ahead of ordinary string keys regardless of their source JSON position.
    expect(canonicalJson(value)).toBe(
      '{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it('sorts objects recursively without changing array order', () => {
    expect(
      canonicalJson({
        z: [{ '2': 'two', '\n': 'newline' }, { z: 1, a: 2 }],
        a: { z: true, a: false },
      }),
    ).toBe(
      '{"a":{"a":false,"z":true},"z":[{"\\n":"newline","2":"two"},{"a":2,"z":1}]}',
    );
  });

  it('rejects values outside interoperable canonical JSON', () => {
    expect(() => canonicalJson({ bad: Number.NaN })).toThrow(/NaN or Infinity/);
    expect(() => canonicalJson({ bad: Number.POSITIVE_INFINITY })).toThrow(/NaN or Infinity/);
    expect(() => canonicalJson({ bad: 1n })).toThrow(/not valid canonical JSON/);
    expect(() => canonicalJson({ bad: '\ud800' })).toThrow(/lone Unicode surrogates/);
    expect(() => canonicalJson({ '\udc00': 'bad key' })).toThrow(/lone Unicode surrogates/);
  });
});

describe('canonical events', () => {
  it('hashes deterministically', () => {
    const event = createActorEvent({ id: 'evt_1', ...base });
    expect(verifyEventHash(event)).toBe(true);

    const reordered = createActorEvent({ id: 'evt_1', ...base, payload: { z: 1, a: 2 } });
    const reorderedAgain = createActorEvent({ id: 'evt_1', ...base, payload: { a: 2, z: 1 } });
    expect(reordered.hash).toBe(reorderedAgain.hash);
  });

  it('does not let integer-like payload keys bypass canonical ordering', () => {
    const first = createActorEvent({
      id: 'evt_numeric_keys',
      ...base,
      payload: { '1': 'one', '\r': 'carriage-return' },
    });
    const second = createActorEvent({
      id: 'evt_numeric_keys',
      ...base,
      payload: { '\r': 'carriage-return', '1': 'one' },
    });

    expect(first.hash).toBe(second.hash);
    expect(verifyEventHash(first)).toBe(true);
  });

  it('binds the semantic source key into the event hash', () => {
    const first = createActorEvent({
      id: 'evt_source',
      ...base,
      sourceKey: 'match:1:actor:a:result',
    });
    const second = createActorEvent({
      id: 'evt_source',
      ...base,
      sourceKey: 'match:2:actor:a:result',
    });

    expect(first.hash).not.toBe(second.hash);
    expect(verifyEventHash(first)).toBe(true);
    expect(verifyEventHash(second)).toBe(true);
  });

  it('validates a linked event chain', () => {
    const first = createActorEvent({ id: 'evt_1', ...base });
    const second = createActorEvent({
      id: 'evt_2',
      ...base,
      type: 'actor.execution.migrated',
      provenance: { issuer: 'host_demo', previousEventHash: first.hash },
    });

    expect(() => assertEventChain([first, second])).not.toThrow();
  });
});

describe('NOEONE host receipts', () => {
  it('hashes a receipt canonically', () => {
    const first = hashHostReceipt(hostReceipt);
    const second = hashHostReceipt({
      ...hostReceipt,
      payload: { opponentActorId: 'act_other', result: 'win' },
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('signs and verifies Ed25519 host statements', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const signature = signHostReceipt(hostReceipt, privateKeyPem);
    expect(signature).toMatch(/^ed25519:/);
    expect(verifyHostReceiptSignature(hostReceipt, signature, publicKeyPem)).toBe(true);
    expect(
      verifyHostReceiptSignature(
        { ...hostReceipt, payload: { ...hostReceipt.payload, result: 'loss' } },
        signature,
        publicKeyPem,
      ),
    ).toBe(false);
  });

  it('rejects a signature from another host key', () => {
    const signer = generateKeyPairSync('ed25519');
    const other = generateKeyPairSync('ed25519');
    const signature = signHostReceipt(
      hostReceipt,
      signer.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );

    expect(
      verifyHostReceiptSignature(
        hostReceipt,
        signature,
        other.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ),
    ).toBe(false);
  });
});