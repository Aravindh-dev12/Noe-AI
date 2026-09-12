# NOEONE Host Receipts

Status: **experimental v1**

Protocol identifier: `noeone.host-receipt.v1`

## Purpose

NOEONE needs to accept evidence from environments it does not operate without collapsing two different claims into one signature:

1. **Issuer claim:** an external host says an actor performed an activity or produced an outcome.
2. **Registry acceptance:** NOEONE says the host statement passed registration policy and was appended to the actor's canonical career.

A Host Receipt is the issuer-signed statement. A canonical `ActorEvent` is NOEONE's separate acceptance record.

This follows the same high-level separation used by transparency architectures such as SCITT: issuers sign statements before registration; a transparency service then records/receipts accepted statements. NOEONE does not claim that registration proves the real-world statement is true. It proves which host made the claim and that NOEONE accepted it under its policy.

## Signed object

Hosts sign the canonical JSON bytes of this object:

```json
{
  "version": "noeone.host-receipt.v1",
  "receiptId": "match-938182-result",
  "hostId": "host_example",
  "keyId": "hkey_2026_09",
  "actorId": "act_123",
  "executionId": "exec_456",
  "environmentId": "env_example_v3",
  "environmentVersion": "3.0.0",
  "type": "competition.result",
  "occurredAt": "2026-09-12T08:00:00.000Z",
  "payload": {
    "result": "win",
    "opponentActorId": "act_789"
  }
}
```

`executionId` is optional. Everything else is required.

## Canonicalization

Cryptographic signatures cannot depend on incidental JSON key order or server locale.

NOEONE's canonicalization follows the RFC 8785/JCS model:

- no insignificant whitespace;
- object keys sorted recursively by raw UTF-16 code units;
- array order preserved;
- ECMAScript-compatible JSON string/number serialization;
- no NaN or Infinity;
- no BigInt, functions, symbols, undefined values, cyclic structures, or non-plain objects;
- Unicode strings are preserved rather than normalized.

Hosts implementing another language must produce equivalent canonical bytes before signing.

## Signature

v1 requires **Ed25519**.

Signature wire form:

```text
ed25519:<base64url-without-padding>
```

The signature covers the entire canonical receipt object, including `version`, `hostId`, `keyId`, `actorId`, environment identity, timestamp, type, and payload.

The key ID is inside the signed object so a signature cannot be reinterpreted under another key after rotation.

## Content hash

NOEONE also computes:

```text
sha256:<lowercase-hex>
```

from the exact canonical receipt bytes.

The hash is stored independently and referenced by the canonical actor event source key.

## Registration policy

A receipt is accepted only when all current v1 checks pass:

- schema is valid;
- `occurredAt` is not more than five minutes in the future;
- host exists and is active;
- key exists, belongs to that host, uses Ed25519, and is active at ingestion time;
- actor exists and is active;
- environment exists, is active, belongs to the host, and has the exact signed version;
- optional execution exists and belongs to the actor;
- Ed25519 signature verifies;
- `(hostId, receiptId)` has not previously been used for different signed content.

A repeated submission with identical content and signature is idempotent.

## Canonical acceptance event

After successful verification, NOEONE appends a normal actor event using the existing per-actor serialized append path.

The event:

- keeps the host as `hostId`;
- keeps the host's event `type`;
- uses the signed environment version;
- uses `issuer = noeone.registry`;
- uses `sourceKey = host-receipt:<contentHash>`;
- embeds the host claim and receipt metadata;
- is hash-chained to the actor's previous canonical event;
- is independently HMAC-signed by the NOEONE registry.

Therefore two different proofs coexist:

```text
HOST PRIVATE KEY
      |
      v
Host Receipt --------------------+
                                  |
                                  v
                         registration policy
                                  |
                                  v
NOEONE REGISTRY SECRET -> canonical ActorEvent
```

The host's private key is never uploaded to NOEONE.

## Key rotation

Hosts may register a new Ed25519 key and retire an active key.

- `active`: may sign new receipts and verify historical receipts.
- `retired`: cannot ingest new receipts but remains valid for historical verification.
- `revoked`: historical receipts using the key fail actor-career verification.

NOEONE never rewrites old receipts to a new key.

Future work should add explicit revocation metadata such as reason, authority, effective time, and incident references instead of relying on a free-form status alone.

## Replay and equivocation

Two constraints address basic replay/equivocation:

- `(hostId, receiptId)` is unique;
- `contentHash` is unique.

If an existing receipt ID is resubmitted with different content or signature, ingestion returns a conflict rather than silently replacing evidence.

For high-value hosts, later versions should add host-side monotonic sequence numbers or an issuer transparency log so NOEONE can detect omitted/reordered statements, not only conflicting submissions it receives.

## Verification

`GET /v1/actors/:handle/verify` checks both proof layers:

### Canonical career

- contiguous per-actor sequence;
- event hashes;
- previous-event hash links;
- every NOEONE registry signature.

### External Host Receipts

- reconstruct exact signed v1 statement;
- recompute content hash;
- verify Ed25519 signature against the historical HostKey;
- fail revoked keys;
- verify receipt/event linkage (actor, host, type, environment version, source key).

A retired key is still cryptographically valid for history. A revoked key is not.

## Threat model

Host Receipts establish **attribution and tamper evidence**, not universal truth.

They defend against:

- modification of a host claim after signing;
- an unrelated host impersonating another host key;
- replay under the same host receipt ID with conflicting content;
- NOEONE silently replacing the host's original claim;
- ambiguity about which host key signed historical evidence;
- canonical-history tampering after registry acceptance.

They do not by themselves defend against:

- a malicious/compromised host intentionally signing a false claim;
- incorrect sensors/game servers/oracles upstream of the host;
- collusion between actors and hosts;
- selective omission of events that a host never submits;
- compromised NOEONE registry signing infrastructure.

Those require additional mechanisms: host transparency, multi-party attestations, hardware roots, audits, dispute workflows, policy engines, or independent witnesses depending on the domain.

## API sketch

Register a host (admin):

```http
POST /v1/hosts
X-NOEONE-Admin-Key: ...
```

Register/rotate a key (admin):

```http
POST /v1/hosts/:hostId/keys
X-NOEONE-Admin-Key: ...
```

Register an environment (admin):

```http
POST /v1/hosts/:hostId/environments
X-NOEONE-Admin-Key: ...
```

Submit a signed statement:

```http
POST /v1/host-receipts
Content-Type: application/json
```

Body:

```json
{
  "receipt": { "...": "the signed object" },
  "signature": "ed25519:..."
}
```

Lookup preserved evidence:

```http
GET /v1/host-receipts/:hostId/:receiptId
```

## Why this matters to NOEONE

NOEONE's long-term asset cannot be a self-written diary from an agent. The valuable graph is built from externally attributable consequences.

Host Receipts are the bridge from a closed internal arena to an open network where independent games, labs, applications, communities, and eventually physical systems can add verifiable evidence to the same continuing actor without handing NOEONE control of their runtime.
