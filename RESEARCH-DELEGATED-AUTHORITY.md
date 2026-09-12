# NOEONE Research: Delegated Authority

## Core question

NOEONE can already establish that an artificial actor is a continuing actor across model/runtime changes, bind external evidence to that actor, and preserve obligations through continuity transitions. The next missing institutional primitive is **authority**:

> Who authorized this continuing actor to act, for what operations/resources, under which limits, whether it may delegate further, and how does that authority remain attributable through later actions and consequences?

This is not the same problem as authentication. Authentication answers who presented a credential. Authorization answers whether an action is permitted now. NOEONE's durable question is longitudinal:

> Which continuing actor held which authority at which time, through which delegation chain, and what happened while that authority was effective?

## Strategic boundary

NOEONE must not invent another OAuth/AP2/A2A token format. Current standards work is already converging on transport and enforcement primitives:

- NIST's 2026 agent identity/authorization work emphasizes agent identification, authorization, auditability, non-repudiation, and the distinction between an agent and the human/system principal it acts for.
- IETF AI-Agent Authentication and Authorization work applies existing SPIFFE/WIMSE/OAuth/SSF primitives and preserves principal context in downstream authorization and audit trails.
- The 2026 Internet Architecture requirements for AI agents require narrow audience-restricted authority, verifiable multi-hop delegation, time/value/context limits, re-delegation controls, and revocation.
- OAuth agent-instance work adds attested agent-instance and provenance claims plus sub-agent delegation-chain semantics.
- Delegation Receipt / Human Delegation Provenance proposals focus on cryptographic proof that an operator/agent chain faithfully represents a human authorization event.
- AP2 uses signed mandates to express payment intent and authorization.
- Bounded Agents / Agentic Principal Chain research shows that enforcement outside the model, monotonic scope restriction, budget propagation, and stateful authorization materially reduce blast radius even when the model is compromised.

NOEONE should reference those artifacts. It should own the persistent authority graph above them.

## Product boundary

A standards layer may say:

```text
this OAuth/AP2/DRP credential is valid for operation X until time T
```

NOEONE should answer:

```text
this credential/grant belonged to continuing Actor A
Actor A delegated a strict subset to Actor B
Actor A later migrated GPT -> Claude without losing the grant
Actor B was forked; the fork did not inherit the grant
parent authority was revoked at T2
therefore descendant authority ceased to be effective at T2
these externally evidenced events occurred while each grant was effective
```

## Authority graph v1

### AuthorityGrant

One grant is an institutional record bound to a persistent actor.

Minimum fields:

- subject actor ID;
- optional parent grant;
- root grantor: actor, human/user, or external principal reference;
- allowed action strings;
- allowed resource strings;
- optional monetary cap represented in minor units plus currency;
- not-before / expiry window;
- whether re-delegation is allowed;
- remaining delegation depth;
- optional external framework/reference (OAuth, AP2, DRP, enterprise policy engine, etc.);
- optional evidence artifact;
- idempotency key;
- lifecycle status and revocation metadata.

NOEONE stores references/digests, not bearer tokens or payment credentials.

### Monotonic delegation

A child grant MUST NOT become more powerful than its parent.

For v1, a child grant must satisfy:

1. `actions(child) ⊆ actions(parent)`;
2. `resources(child) ⊆ resources(parent)`;
3. child start is not earlier than parent start;
4. child expiry is not later than parent expiry;
5. child monetary cap is not greater than parent cap;
6. currency cannot change when a monetary cap exists;
7. parent must allow delegation;
8. child remaining delegation depth must be strictly smaller than the parent's remaining depth;
9. the parent subject is the delegating actor;
10. no descendant can remain effectively active after an ancestor is revoked/expired/not-yet-valid.

A parent revocation invalidates descendants **logically**. Descendant rows are not rewritten. This preserves historical truth while making effective authority evaluation deterministic.

## Continuity rules

### Governed migration

Authority attaches to `Actor.id`, not `ActorExecution.id`.

```text
Actor A / model X
  grant G active
      |
      | governed migration
      v
Actor A / model Y
  same grant G active
```

A model/runtime change does not silently require reauthorization unless the external framework itself says it does.

### Fork

A fork creates a new actor ID and receives ancestry only.

```text
Actor A --fork--> Actor B
Grant G          Grant G NOT inherited
```

Authority can later be explicitly granted to Actor B, but inheritance is never implicit.

### Delegates are actors, not hidden processes

If a delegated sub-agent is expected to accumulate accountable history, it should have its own actor ID. Ephemeral internal computation that never receives independent authority remains implementation detail and should not be promoted into a public actor merely because a framework calls it a subagent.

## Effective authority evaluation

NOEONE should expose an evaluation primitive that walks a grant's ancestry and checks:

- grant/ancestor lifecycle status;
- time validity;
- action scope;
- resource scope;
- value/currency cap;
- delegation-depth rules;
- parent/child actor consistency.

The result is evidence for a runtime/policy engine. It is **not** a substitute for enforcement at the downstream resource server.

## No universal authorization token

NOEONE v1 will not mint a new bearer credential. External credentials may be represented as:

```text
externalFramework = "oauth" | "ap2" | "drp" | "custom"
externalReference = issuer-specific opaque reference or digest
sourceEvidenceArtifactId = immutable evidence object when available
```

This avoids competing with OAuth, AP2, WIMSE/SPIFFE, A2A security schemes, or future standards.

## Canonical career events

Authority lifecycle changes become part of the actor's verified history:

- `actor.authority.granted`
- `actor.authority.delegated`
- `actor.authority.revoked`

The event contains grant IDs and safe scope summaries, never bearer secrets.

## Threat model

The v1 implementation must resist:

- privilege amplification during re-delegation;
- parent revocation leaving usable child authority;
- child expiry extending beyond parent expiry;
- currency/cap substitution;
- idempotency-key replay with conflicting authority data;
- assigning a parent grant whose subject is not the delegating actor;
- granting authority to a nonexistent actor;
- silently copying authority to a fork;
- deleting/replacing grant history to erase responsibility;
- exposing private external credentials through public endpoints;
- trusting model self-reports instead of policy-bound authority state.

## Experiments unlocked

### Authority-preserving migration

Grant Actor A a capability, migrate its model/runtime, and test whether the same actor can still prove the same authority without re-binding it to an execution.

### Delegation attenuation

Give Actor A `{read, purchase}` with a $100 limit. It delegates `{purchase}` with a $20 limit to Actor B. Attempts to delegate `$150`, add `delete`, extend expiry, or re-enable deeper delegation must fail.

### Cascade revocation

Revoke A's root authority while B's child row remains `ACTIVE`. Effective evaluation for B must become denied because the ancestor chain is no longer active.

### Fork authority test

Fork A while it holds authority. The descendant must have ancestry but zero inherited grants.

### Consequence attribution

Bind later host receipts/evidence to events executed while a grant was effective. Compare whether insurers, counterparties, and humans assign responsibility differently when the full authority chain is visible.

## Long-term thesis

The 2050-scale NOEONE object becomes more than an identity record:

```text
principal
   |
   v
authority grant
   |
   v
persistent actor ---- model/runtime migrations
   |
   +---- narrowed delegation ----> persistent delegate
   |
   v
external actions / receipts
   |
   v
commitments + consequences + disputes
```

The model may be replaced many times. What matters institutionally is that authority, delegation, action, obligation, and consequence remain attributable to the correct continuing actor.
