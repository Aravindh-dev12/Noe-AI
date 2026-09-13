# NOEONE Research: Reliance Signals and Material-Change Propagation

## Research question

NOEONE can now preserve **what a specific counterparty relied upon** when it decided to authorize, host, insure, hire, certify, follow, transact with, or delegate to a persistent artificial actor.

That creates the next institutional problem:

> When the actor later changes, how do all counterparties whose reliance may have become stale learn about that change, and how do we preserve evidence of delivery, acknowledgement, review, rejection, renewal, or failure without pretending NOEONE controls their external systems?

This is not merely notification plumbing.

A persistent actor may have hundreds or millions of active reliance relationships. A model/runtime/controller/capability change can therefore have a **reliance blast radius** even when the actor remains mechanically the same identity.

```text
Actor A
  reliance R1 -> bank
  reliance R2 -> game host
  reliance R3 -> insurer
  reliance R4 -> researcher
        |
        | governed actor change
        v
successor actor state
        |
        v
structural drift / evaluator assessment
        |
        +---- R1 may need review
        +---- R2 may be unaffected
        +---- R3 may be invalidated
        +---- R4 may be disputed
```

The missing object is not a global trust score. It is a **counterparty-specific change signal bound to a historical reliance basis**.

---

## 1. Prior art and falsification pressure

### OpenID Shared Signals and CAEP already solve continuous event transport

The OpenID Shared Signals Framework provides interoperable event sharing between cooperating peers. The Continuous Access Evaluation Profile (CAEP) defines security events that receivers can use to attenuate access, including session revocation, token-claims change, credential change, assurance-level change, and device-compliance change.

Sources:
- https://openid.net/wg/sharedsignals/specifications/
- https://openid.net/specs/openid-caep-1_0-04.html
- https://openid.net/specs/openid-caep-interoperability-profile-1_0.html

NOEONE should **not** build a proprietary replacement for Shared Signals. A future transport adapter may serialize NOEONE reliance signals through SSF/CAEP-compatible infrastructure when appropriate.

### W3C credential status already solves suspension/revocation of credentials

The W3C Bitstring Status List v1.0 provides privacy-preserving publication of credential status, including suspension and revocation.

Source:
- https://www.w3.org/TR/vc-bitstring-status-list/

A credential being revoked is not the same question as whether a counterparty's historical reliance on a persistent actor still applies after the actor changes. NOEONE should reference credential status as evidence, not duplicate it.

### Agent authorization work is moving toward lifecycle-aware revocation

The 2026 IETF Agent Identity Protocol draft includes registry-backed revocation checks, including full, principal, and scope revocation semantics.

Source:
- https://datatracker.ietf.org/doc/draft-singla-agent-identity-protocol/

The AITH research proposal similarly treats delegation as continuously bounded and describes push-based revocation.

Source:
- https://arxiv.org/abs/2604.07695

Again, NOEONE should not claim to invent revocation.

### Enterprise governance already expects change-triggered reassessment

The World Economic Forum's 2026 agent-governance playbook introduces deployment-level capability/authorization profiles and emphasizes lifecycle authorization and monitoring as systems evolve.

Source:
- https://www.weforum.org/publications/ai-agents-in-action-a-playbook-for-trusted-adoption-authorization-and-scaling/

NIST's 2026 agent identity/authorization work similarly emphasizes identification, authorization, auditing, and non-repudiation for software agents.

Sources:
- https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
- https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure

These efforts validate the operational need while narrowing NOEONE's novelty claim.

---

## 2. The gap NOEONE can own

Existing systems can increasingly answer:

- is a credential revoked?;
- is a session still valid?;
- did an assurance level change?;
- did a policy engine revoke a scope?;
- can a signal be delivered between cooperating peers?;
- did an agent identity or key change?;
- was a deployment recertified?;

NOEONE's narrower longitudinal question is:

> **Which counterparties relied on which exact historical state of this continuing actor, which of those reliance edges are exposed to a later actor change, and what evidence exists that each affected counterparty learned about and acted on that change?**

That requires NOEONE's persistent actor graph and Reliance Provenance layer.

Without historical reliance edges, a change-notification system can broadcast events but cannot reconstruct the institutional blast radius of a model/runtime/controller/capability migration.

---

## 3. Do not globalize materiality

NOEONE must preserve the distinction already established by Reliance Provenance:

```text
structural drift = factual
materiality = contextual
```

A model swap may be irrelevant to a fan, review-worthy to a game host, and disqualifying to a certification authority.

Therefore a Reliance Signal should usually be emitted **from a recorded Reliance Change Assessment**, not from a global NOEONE decision that the actor has become unsafe or untrusted.

The assessment supplies:

- the exact original reliance basis;
- the exact successor state;
- structural changes;
- evaluator identity/method;
- evaluator-specific disposition;
- supporting evidence.

The signal transports that already-bounded claim to the counterparty that originally relied on the actor.

---

## 4. Primitive A: Reliance Signal

A `RelianceSignal` is an immutable statement that one recorded reliance relationship has a later change assessment that should be surfaced to its original counterparty.

Suggested V1 shape:

```text
RelianceSignal
  version = noeone.reliance-signal.v1
  id
  actorId
  relianceId
  assessmentId

  counterpartyType
  counterpartyRef
  relationKind

  originalActorStateDigest
  successorStateDigest
  successorLineageId
  successorExecutionId
  successorEventSequence

  structuralChanges[]
  disposition

  transportProfile?
    INTERNAL
    SSF
    CAEP
    WEBHOOK
    MANUAL
    OTHER
  transportRef?

  emittedAt
  signalDigest
  idempotencyKey
```

### Why one signal per reliance edge?

Because privacy and semantics are counterparty-specific. A bank's authorization relationship should not be published merely because another party follows the same actor.

### Why bind to an assessment?

NOEONE should not turn a raw configuration diff into a universal normative judgment. The signal carries the provenance of **who assessed the change and how**.

### Why copy semantic facts into the signal?

The signal should remain independently interpretable even if the source assessment is later queried through another service. Its digest commits to the assessment ID, source basis, successor state, structural changes, disposition, counterparty, and emission time.

---

## 5. Primitive B: Reliance Signal Receipt

Transport success is not the same as institutional response.

A separate append-only `RelianceSignalReceipt` records what happened after emission.

```text
RelianceSignalReceipt
  version = noeone.reliance-signal-receipt.v1
  id
  signalId
  actorId
  relianceId

  kind
    DELIVERED
    DELIVERY_FAILED
    ACKNOWLEDGED
    REVIEW_STARTED
    RELIANCE_RENEWED
    RELIANCE_REJECTED
    EXPIRED

  partyType
  partyRef
  evidenceArtifactId?
  successorRelianceId?
  detailDigest?

  observedAt
  receiptDigest
  idempotencyKey
```

These are evidence records, not universal truth declarations.

For example:

- `DELIVERED` means a transport or operator produced evidence that the signal reached a destination;
- `ACKNOWLEDGED` means the named party produced evidence of acknowledgement;
- `REVIEW_STARTED` does not imply renewal;
- `RELIANCE_RENEWED` must reference a new Reliance Basis that explicitly supersedes the historical reliance;
- `RELIANCE_REJECTED` means that party chose not to continue that reliance relationship;
- `DELIVERY_FAILED` preserves failed propagation rather than hiding it.

---

## 6. Derived lifecycle, not mutable status

NOEONE should avoid a single mutable `signal.status` field as the source of truth.

The authoritative history is append-only:

```text
Signal emitted
      |
      +--> delivered
      |      |
      |      +--> acknowledged
      |              |
      |              +--> review started
      |                       |
      |                       +--> renewed
      |
      +--> delivery failed
```

A read model may derive a current lifecycle state, but the underlying receipts remain immutable.

This preserves disagreement, retries, multiple delivery attempts, and late acknowledgement.

---

## 7. Renewal must close the provenance loop

If a counterparty decides that the successor actor state is acceptable, renewal should not mutate the old reliance basis.

Instead:

```text
Reliance R1
  basis = state A
       |
       v
Change assessment A1
       |
       v
Signal S1
       |
       v
Counterparty review
       |
       v
Reliance R2
  basis = state B
  supersedes = R1
       |
       v
Receipt: RELIANCE_RENEWED -> R2
```

A `RELIANCE_RENEWED` receipt is valid only if:

- R2 exists;
- R2 concerns the same actor;
- R2 explicitly supersedes R1;
- R2 has the same counterparty identity and relation semantics unless an explicit transition policy says otherwise;
- R2 was captured no earlier than the signal/assessment successor state.

This makes recertification/reapproval visible as a new historical decision rather than silent mutation.

---

## 8. Reliance blast radius

Once reliance signals exist, NOEONE can compute a powerful but factual query:

> Which active reliance relationships have later assessments whose change signals have not yet reached a terminal counterparty response?

This is a **reliance blast radius**, not a risk score.

Possible projection:

```text
Actor A migration
  model changed
  runtime changed

Affected reliance edges
  42 total

  19 review-required
   8 invalidated
   3 disputed
  12 unaffected

Propagation
  20 delivered
  11 acknowledged
   4 renewed
   2 rejected
   5 delivery failures
```

The projection should always retain the evaluator-specific basis. NOEONE must not turn counts into a universal claim that the actor is safe or unsafe.

---

## 9. Transport boundary

NOEONE should own the semantic record, not every transport.

V1 can support an internal transport profile and persist external transport references. Later adapters may use:

- OpenID Shared Signals / CAEP;
- enterprise message buses;
- registered webhooks;
- A2A messages;
- email/manual notice evidence;
- future agent-governance protocols.

A transport adapter must never be allowed to rewrite the historical signal payload.

A delivery receipt proves only what that transport evidence supports.

---

## 10. Threat model

Reliance Signals should resist or expose:

- **silent material change** — the actor changes while counterparties continue relying on an old state without notice evidence;
- **broadcast-without-reliance** — a generic notice is presented as proof that a specific relying counterparty was informed;
- **fake acknowledgement** — delivery is represented as counterparty acknowledgement;
- **renewal laundering** — old reliance is silently treated as renewed without a new basis record;
- **fork carryover** — a descendant actor inherits another actor's notices/reliance relationships;
- **signal replay** — the same signal is counted multiple times under different IDs;
- **semantic idempotency mutation** — an idempotency key is reused with altered meaning;
- **assessment substitution** — a signal points to an assessment for another reliance/actor/state;
- **counterparty substitution** — a signal is delivered to a different party but presented as satisfying the original relying party;
- **receipt backdating** — acknowledgement/review is recorded before the signal existed;
- **terminal-state fabrication** — a delivery event is treated as renewal or rejection;
- **transport monopoly** — NOEONE's semantics become dependent on one proprietary delivery network.

---

## 11. Database invariants

V1 should enforce:

1. every signal references an existing Reliance Basis;
2. every signal references an existing Reliance Change Assessment;
3. basis, assessment, signal, and actor IDs must agree;
4. signal counterparty identity is copied from the immutable basis;
5. signal successor state/disposition/structural changes must match the immutable assessment;
6. `emittedAt >= assessment.assessedAt`;
7. signal semantic idempotency prevents replay with altered meaning;
8. signal rows are append-only;
9. every receipt references an existing signal;
10. receipt actor/reliance IDs must match the signal;
11. `observedAt >= signal.emittedAt`;
12. a renewal receipt requires `successorRelianceId`;
13. the successor reliance must explicitly supersede the signal's original reliance;
14. the successor reliance must concern the same actor and counterparty;
15. non-renewal receipts must not smuggle a successor reliance ID;
16. receipt semantic idempotency prevents replay with altered meaning;
17. receipt rows are append-only.

---

## 12. Experiments

### A. Silent-change versus signalled-change

Give participants/hosts an actor with accumulated history, then perform a model/runtime change.

Compare:

1. persistent identity + historical reputation only;
2. historical reliance basis + explicit change signal + successor-state disclosure.

Measure stale overreliance, review behavior, and replacement/renewal choices.

### B. Reliance blast-radius benchmark

Give one actor 100 synthetic counterparties with different relation kinds and evaluator policies. Perform one migration and measure whether the registry can deterministically identify all reliance edges with non-`UNAFFECTED` assessments and preserve propagation state independently for each.

### C. Delivery is not acknowledgement

Simulate successful transport with no counterparty response. Verify that NOEONE shows `DELIVERED` but never infers `ACKNOWLEDGED`, `RENEWED`, or `REJECTED`.

### D. Renewal integrity

Create a successor reliance basis after review and record a renewal receipt. Attempt to attach a basis that does not supersede the original reliance or belongs to another counterparty; it must fail.

### E. Multi-transport equivalence

Deliver identical immutable signal semantics through internal, webhook-like, and SSF-like adapters. Verify that transport metadata changes but `signalDigest` does not.

### F. Fork non-transfer

Fork the actor after the original reliance was recorded. The child may prove ancestry but receives no inherited reliance signals or notification obligations by default.

---

## 13. Falsifiers

Reliance Signals should not become a core NOEONE primitive if:

1. Shared Signals/CAEP or emerging agent standards directly model the same historical persistent-actor reliance graph and renewal provenance;
2. real counterparties do not need actor-state change propagation because all authorization is always recomputed statelessly per action;
3. counterparty references cannot be represented safely enough without unacceptable privacy leakage;
4. delivery/acknowledgement evidence is too weak to distinguish meaningful notice from transport noise;
5. NOEONE cannot keep evaluator-specific materiality separate from its factual continuity graph;
6. reliance blast-radius computation becomes merely a duplicate of enterprise IAM rather than a cross-model/cross-runtime persistent-actor primitive.

---

## 14. Narrow novelty claim

Do **not** say:

> NOEONE invented revocation, continuous access evaluation, notification, recertification, security-event transport, or credential status.

The defensible hypothesis is narrower:

> **NOEONE binds change signals to the exact historical reliance relationships of a persistent artificial actor, preserving which counterparties relied on which actor state and what evidence exists that each affected reliance was notified, acknowledged, reviewed, renewed, rejected, or left unresolved across model/runtime/controller changes.**

---

## 15. Why this matters to the 2050 thesis

If autonomous actors become economically important, the hard problem is not only proving who they are.

It is preserving the institutional edges around them while they keep changing.

```text
identity continuity
      +
reliance provenance
      +
change propagation
      +
renewal / rejection history
      =
continuing institutional actor
```

A future AGI can be smarter than yesterday's model. That does not automatically answer which banks, hosts, insurers, researchers, employers, communities, and counterparties are still relying on the same actor under which assumptions.

That graph is independent of model intelligence and becomes more important as actors become more autonomous and mutable.
