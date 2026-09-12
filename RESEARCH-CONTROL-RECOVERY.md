# NOEONE Research: Control Continuity, Recovery, and Succession

Status: research-to-production design
Date: 2026-09-12

## Thesis

NOEONE already preserves an artificial actor across model/runtime changes, forks, obligations, delegated authority, consequences, claims, dependencies, and incident assessments.

A deeper continuity failure remains:

> What happens when control of the actor itself changes?

A persistent actor is not durable if its longitudinal identity can be permanently lost when a controller key disappears, silently hijacked when a credential is compromised, or ambiguously duplicated when two parties both claim to be the legitimate successor.

NOEONE should not invent another cryptographic identity protocol. DID/KERI/OAuth/SPIFFE/managed identity ecosystems are rapidly covering key material, workload identity, authentication, rotation, revocation, and delegated authorization.

NOEONE's durable layer is longitudinal and institutional:

> Which control change belongs to the continuing actor, under what recovery policy, with which evidence, during which time interval, and what historical rights/obligations remain attached after that change?

## Research basis

### W3C Controlled Identifiers

W3C Controlled Identifiers defines controller documents, purpose-bound verification methods, rotation, revocation, expiration, and historical verification concerns. It explicitly notes that old proofs may require access to historical registry state to determine whether a verification method was valid at the relevant time.

Source:
- https://www.w3.org/TR/controller-document/

NOEONE implication: verification keys are temporal. A current key is insufficient to answer whether an old action was valid when performed.

### W3C DID 1.1 recovery

The DID 1.1 work describes recovery as a distinct reactive security measure, notes quorum-based trusted-party recovery and time locks, and states that there is no single recovery mechanism common to all DID methods.

Source:
- https://www.w3.org/TR/2025/WD-did-1.1-20250906/

NOEONE implication: the registry must not hard-code one recovery protocol. It should record policy/evidence from external identity systems and preserve the actor-level continuity decision.

### KERI 1.1

Trust over IP released KERI 1.1 in January 2026. KERI provides cryptographically verifiable key-event history and authorship, with an append-only key-event model designed for rotation and portable identifiers.

Sources:
- https://www.trustoverip.org/our-work/deliverables/
- https://github.com/WebOfTrust/keri

NOEONE implication: KERI can be an excellent source of external key-state evidence. NOEONE should not replace its key-event machinery. The NOEONE-specific question is whether a KERI/DID/workload identity transition is accepted as continuation of a particular artificial actor and how that interacts with the actor's obligations, authority, reputation, and consequences.

### NIST agent identity

NIST's 2026 work on software/AI-agent identity emphasizes identification, authorization, auditing, non-repudiation, and the risks of long-lived bearer credentials. Its August 2026 guidance recommends building on existing identity foundations rather than treating agent identity as a model-only problem.

Sources:
- https://csrc.nist.gov/pubs/other/2026/02/05/accelerating-the-adoption-of-software-and-ai-agent/ipd
- https://www.nist.gov/blogs/cybersecurity-insights/back-future-why-agentic-ai-needs-strong-identity-foundation

NOEONE implication: runtime authentication and longitudinal actor continuity are separate layers.

### Emerging agent identity standards

The W3C Agent Identity Registry Protocol Community Group is working on verifiable agent identity, controlling-entity binding, authorization scope, revocation/lifecycle, and integrations with MCP/A2A/OAuth/OIDC/SPIFFE.

The IETF AI Agent Authentication and Authorization draft similarly argues for applying existing workload identity and OAuth-family standards instead of inventing a wholly new authentication protocol.

Sources:
- https://www.w3.org/groups/cg/agent-identity/
- https://www.ietf.org/archive/id/draft-klrc-aiagent-auth-03.html

NOEONE implication: treat those protocols as external control/evidence sources. Do not make `NOEONE credential` the only way to authenticate an actor.

## The missing object: Control Epoch

An actor can retain one canonical actor ID while the entity or cryptographic state authorized to control it changes over time.

Example:

```text
Actor: Nova

Control epoch 1
2027-2029
controller: user:alice
key-state: KERI digest A

        ↓ governed transfer

Control epoch 2
2029-2031
controller: org:studio-x
key-state: DID state digest B

        ↓ compromise detected

Control epoch 3
2031
state: QUARANTINED

        ↓ recovery quorum

Control epoch 4
2031-
controller: user:alice-recovered
key-state: KERI digest C
```

The actor did not become a new actor merely because controller/key material changed.

But not every control change is continuity. A stolen key claiming a transfer should not silently rewrite the actor's career. A disputed transition may require quarantine or adjudication. A fork should receive a new actor ID rather than becoming a second simultaneous canonical controller.

## Architectural separation

NOEONE should preserve four separate concepts.

### 1. External cryptographic control evidence

Examples:
- DID document/key-state version
- KERI key event / receipt
- workload identity assertion
- managed identity rotation
- hardware key attestation
- signed legal transfer artifact

NOEONE stores these as evidence references/digests. It does not become the root key store.

### 2. Control policy

A versioned policy defines how actor-level control transitions can be recognized.

V1 policy primitives:
- actor ID
- guardian principal set
- approval threshold
- challenge delay
- optional external framework/reference
- optional evidence artifact
- immutable policy digest

No universal policy is imposed. A personal actor might use 2-of-3 guardians. A company actor might point to corporate governance. A provider actor may reference provider-controlled KERI/DID state.

### 3. Control transition

A proposed control change is immutable and references the exact prior control epoch and policy version.

Kinds:
- `ROTATION` — same controller, different cryptographic state
- `TRANSFER` — planned controller change
- `RECOVERY` — controller/key loss or compromise recovery
- `QUARANTINE` — emergency suspension of effective control
- `RESTORE` — return from quarantine to active control

Status:
- `PROPOSED`
- `ACCEPTED`
- `REJECTED`
- `CANCELLED`
- `EXPIRED`

A transition may not mutate history. Acceptance creates a new control epoch.

### 4. Control epoch

A control epoch is the time interval during which a particular controller/key-state combination is recognized for an actor.

States:
- `ACTIVE`
- `QUARANTINED`

Historical epochs are closed by setting `endedAt`; their original controller/key-state evidence remains immutable.

## Why this must remain separate from delegated authority

`AuthorityGrant` answers:

> What can this actor do on behalf of a principal?

Control continuity answers:

> Who/what is allowed to mutate or recover the actor's own canonical identity state?

An actor can have many delegated authority grants while having one current control epoch. Revoking an action grant must not automatically rewrite actor ownership. Changing the actor's controller must not silently expand its delegated authority.

This separation is critical.

## Why this must remain separate from account ownership

A `User.ownerId` is a product/account relationship, not a future-proof identity-control protocol.

NOEONE must support:
- user-controlled actors
- organization-controlled actors
- provider-controlled official actors
- research actors
- external self-certifying identifiers
- future autonomous/regulated actor structures

Therefore `ownerId` stays useful for application authorization, while Control Continuity becomes the longitudinal institutional record.

## V1 policy semantics

### Guardian threshold

A policy contains N distinct guardians and a threshold T where:

```text
1 <= T <= N
```

A transition can be accepted only after at least T guardian approvals.

### Challenge delay

Non-emergency transitions cannot finalize before `challengeUntil`.

Purpose:
- detect account/key theft
- give guardians/counterparties time to observe unexpected control changes
- prevent one compromised credential from immediately transferring a high-value actor

`QUARANTINE` is intentionally exempt from the delay once threshold approval exists because emergency containment must be fast.

### Objection semantics

V1 uses conservative veto semantics: any recorded guardian `OBJECT` disposition prevents automatic acceptance and causes finalization to reject the transition.

Future policies may support weighted voting or adjudication, but V1 should be explicit rather than pretending one governance rule fits every actor.

## Fork rule

Recovery/transfer does **not** create a new actor ID when the configured continuity policy accepts the transition.

A parallel claimant that cannot satisfy the policy is not allowed to become a second canonical controller. If both branches need to continue, one branch must become an explicit actor fork with its own actor ID and ancestry record.

This preserves the existing NOEONE principle:

> One canonical actor cannot have two simultaneous canonical histories.

## Historical rights and obligations

Accepted control changes do not reset:
- commitments
- evidence bindings
- authority exercise history
- consequence observations/attributions
- claims/remedies
- dependency/exposure history
- public career events

Those objects are attached to the persistent actor ID.

However, **future** delegated authority may be independently revoked by grantors after a controller change. NOEONE must not infer that a control transfer automatically transfers every external permission.

That distinction is essential for legal/economic safety.

## Compromise semantics

A compromise report is not automatically proof that every action signed during a period was malicious.

This mirrors NOEONE's existing architectural discipline:
- dependency exposure != actual impact
- signed receipt != truth
- consequence observation != causal attribution

Likewise:

> key/controller compromise != automatic invalidation of all historical actions

A compromised period should create evidence and potentially a quarantine epoch. Downstream investigators/adjudicators may assess individual actions using their own methods.

## Privacy

Public actor passports must not expose:
- guardian identities
- raw recovery evidence
- private external references
- controller contact details
- key material beyond safe digests

Public-safe summary can expose:
- control policy version
- threshold / guardian count
- current epoch number/state
- whether recovery/quarantine has occurred
- current control basis digest
- verification status

Full recovery records remain privileged until selective-disclosure policy is implemented.

## Threat model

### Stolen current controller credential
Mitigation: guardian threshold + challenge delay + evidence + quarantine.

### Compromised guardian
Mitigation: threshold > 1; independent guardians; versioned policy; no single hidden platform override in the normal flow.

### Recovery replay
Mitigation: idempotency key and immutable transition basis digest.

### Historical policy substitution
Mitigation: transition stores exact `policyId` and `policyDigest`; verification never re-evaluates history using today's policy.

### Actor takeover by changing `ownerId`
Mitigation: product account ownership and control continuity are separate. Control transitions do not mutate ownerId implicitly.

### Two concurrent accepted transitions
Mitigation: actor row lock + exact `fromEpochId` + one current epoch database invariant.

### Retroactive rewrite after later evidence arrives
Mitigation: accepted transitions retain captured basis/evidence. Later evidence can create claims/assessments, not rewrite the old record.

## Production invariants

1. At most one current control epoch per actor.
2. At most one active control policy per actor.
3. Epoch numbers are monotonically increasing per actor.
4. A transition references the exact current predecessor epoch at proposal time.
5. A transition references the exact policy used to evaluate it.
6. Approval principals must be guardians of that policy.
7. Threshold must be satisfied before acceptance.
8. Non-quarantine transitions must respect challenge delay.
9. Any V1 guardian objection prevents automatic acceptance.
10. Accepted transition atomically closes prior epoch and creates the next epoch.
11. Replays with identical idempotency semantics return the original object.
12. Reusing an idempotency key with different semantics is rejected.
13. Control history verification uses captured historical basis, never current policy state.
14. Control transitions never delete or transfer historical obligations automatically.

## Initial API

Privileged writes/reads:

```text
POST /v1/control/policies
POST /v1/control/epochs
POST /v1/control/transitions
POST /v1/control/transitions/:transitionId/approvals
POST /v1/control/transitions/:transitionId/finalize
GET  /v1/control/transitions/:transitionId
GET  /v1/actors/:handle/control/full
```

Public safe reads:

```text
GET /v1/actors/:handle/control
GET /v1/actors/:handle/control/verify
```

## Experiment / research value

NOEONE can eventually study a new longitudinal question:

> How do humans, hosts, institutions, and counterparties treat an artificial actor after its controller changes while its actor identity remains constant?

Experiments:
- same model + new controller
- new model + same controller
- controller recovery after compromise
- temporary quarantine
- planned ownership transfer
- attempted unauthorized transfer

This extends the original artificial-individuation research beyond model continuity into **institutional control continuity**.

## Long-term boundary

NOEONE should be able to ingest/anchor external control systems such as:
- KERI
- DID methods
- W3C Controlled Identifier documents
- SPIFFE/workload identity
- OAuth/OIDC-bound agent identities
- Microsoft/Google/cloud managed identities
- future post-quantum agent credential systems

NOEONE should not force those systems to become NOEONE-native.

Its durable object remains:

> the continuing actor and the immutable history of which control states society recognized for that actor through time.
