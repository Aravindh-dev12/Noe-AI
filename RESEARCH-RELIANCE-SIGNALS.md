# NOEONE Research: Reliance Signals and Material-Change Propagation

## Research question

NOEONE can preserve **what a specific counterparty relied upon** when it decided to authorize, host, insure, hire, certify, follow, transact with, or delegate to a persistent artificial actor.

That creates the next institutional problem:

> When the actor later changes, which historical reliance relationships may have become stale, and what evidence exists that each affected counterparty was informed, acknowledged the change, reviewed it, renewed reliance, rejected it, or remained unresolved?

This is not merely notification plumbing.

A persistent actor may have hundreds or millions of reliance relationships. A model/runtime/controller/capability change can therefore have a **reliance blast radius** even when the actor remains mechanically the same identity.

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

The missing object is not a global trust score. It is a **counterparty-specific change signal bound to a historical reliance basis** plus an append-only record of what happened after that signal existed.

---

## 1. Prior art and falsification pressure

### OpenID Shared Signals and CAEP already solve continuous event transport

The OpenID Shared Signals Framework provides interoperable event sharing between cooperating peers. The Continuous Access Evaluation Profile (CAEP) defines security events receivers can use to attenuate access, including session revocation, token-claims change, credential change, assurance-level change, and device-compliance change.

Sources:
- https://openid.net/wg/sharedsignals/specifications/
- https://openid.net/specs/openid-caep-1_0-04.html
- https://openid.net/specs/openid-caep-interoperability-profile-1_0.html

NOEONE should **not** build a proprietary replacement for Shared Signals. A future transport adapter may serialize a NOEONE signal through SSF/CAEP-compatible infrastructure when appropriate.

### W3C credential status already solves suspension/revocation of credentials

The W3C Bitstring Status List v1.0 provides privacy-preserving publication of credential status, including suspension and revocation.

Source:
- https://www.w3.org/TR/vc-bitstring-status-list/

A credential being revoked is not the same question as whether a specific counterparty's historical reliance on a persistent actor still applies after the actor changes. NOEONE should reference credential status as evidence, not duplicate it.

### Agent authorization work is moving toward lifecycle-aware revocation

2026 agent identity and authorization drafts increasingly include scoped/cascade revocation and propagation semantics.

Sources:
- https://datatracker.ietf.org/doc/draft-singla-agent-identity-protocol/
- https://datatracker.ietf.org/doc/draft-chen-oauth-agent-revocation/
- https://datatracker.ietf.org/doc/draft-fane-opena2a-aap/

The AITH research proposal similarly treats delegation as continuously bounded and describes push-based revocation.

Source:
- https://arxiv.org/abs/2604.07695

Again, NOEONE should not claim to invent revocation or propagation.

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
- did a delegation cascade get revoked?;
- was a deployment recertified?

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

Therefore a Reliance Signal should normally be emitted **from a recorded Reliance Change Assessment**, not from a global NOEONE decision that the actor has become unsafe or untrusted.

The assessment supplies:

- the exact original reliance basis;
- the exact successor state;
- structural changes;
- evaluator identity/method;
- evaluator-specific disposition;
- supporting evidence.

The signal freezes that already-bounded claim for the counterparty that originally relied on the actor.

---

## 4. Primitive A: Reliance Signal

A `RelianceSignal` is one immutable semantic statement that one recorded reliance relationship has one later change assessment that should be surfaced to its original counterparty.

### Critical design rule: signal semantics are transport-independent

A Reliance Signal does **not** contain CAEP/webhook/manual delivery identity.

If the same change is attempted over three transports, NOEONE must still have one semantic signal:

```text
                 Reliance Signal S1
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
       CAEP          webhook        manual
          |             |             |
          v             v             v
     receipt D1     receipt D2     receipt D3
```

Otherwise transport retry would create multiple institutional truths and inflate blast-radius counts.

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

  emittedAt
  signalDigest
  idempotencyKey
```

### One signal per assessment

Each Reliance Change Assessment already refers to one immutable Reliance Basis. Therefore V1 enforces one semantic signal per assessment.

Multiple transports or delivery attempts create receipts, not additional signals.

### Why bind to an assessment?

NOEONE should not turn a raw configuration diff into a universal normative judgment. The signal carries the provenance of **who assessed the change and how**.

### Why copy semantic facts into the signal?

The signal remains independently interpretable. Its digest commits to the assessment, source basis, successor state, structural changes, disposition, counterparty, and emission time.

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

  transportProfile?
    INTERNAL
    SSF
    CAEP
    WEBHOOK
    MANUAL
    OTHER
  transportRef?

  evidenceArtifactId?
  successorRelianceId?
  detailDigest?

  observedAt
  receiptDigest
  idempotencyKey
```

Rules:

- `DELIVERED` / `DELIVERY_FAILED` require a transport profile;
- a transport reference cannot exist without a transport profile;
- delivery evidence may be issued by the transport/operator;
- `ACKNOWLEDGED`, `REVIEW_STARTED`, `RELIANCE_RENEWED`, and `RELIANCE_REJECTED` must be attributable to the **original relying counterparty**;
- `REVIEW_STARTED` does not imply renewal;
- `RELIANCE_RENEWED` must reference a new Reliance Basis that explicitly supersedes the historical reliance;
- `DELIVERY_FAILED` is preserved instead of hidden;
- non-expiry receipts require evidence.

These are evidence records, not universal truth declarations.

---

## 6. Derived lifecycle, not mutable status

NOEONE should avoid a single mutable `signal.status` field as the source of truth.

The authoritative history is append-only:

```text
Signal emitted
      |
      +--> delivery failed via webhook
      |
      +--> delivered via CAEP
              |
              +--> acknowledged by counterparty
                      |
                      +--> review started
                              |
                              +--> renewed
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
- R2 has the same counterparty identity and relation semantics;
- R2 was captured no earlier than the signal;
- the renewal receipt was observed no earlier than R2.

This makes recertification/reapproval visible as a new historical decision rather than silent mutation.

---

## 8. Reliance blast radius

Once reliance signals exist, NOEONE can compute a powerful but factual query:

> Which reliance relationships have later assessments whose change signals have not yet reached a terminal counterparty response?

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

The projection retains evaluator-specific materiality. NOEONE must not turn counts into a universal claim that the actor is safe or unsafe.

The aggregate must not silently truncate at a pagination limit. An actor with large institutional reach is exactly where a false partial blast radius becomes dangerous. V1 can compute over the full persisted set; later scale work should move this to incremental/materialized projections rather than silently dropping edges.

---

## 9. Transport boundary

NOEONE should own the semantic record, not every transport.

Transports may include:

- OpenID Shared Signals / CAEP;
- enterprise message buses;
- registered webhooks;
- A2A messages;
- email/manual notice evidence;
- future agent-governance protocols.

A transport adapter must never rewrite the historical signal payload.

A delivery receipt proves only what that transport evidence supports.

### Security boundary

V1 should **not** accept arbitrary outbound webhook URLs and execute them directly. That would create an SSRF/credential-exfiltration boundary and mix semantic provenance with network execution.

Future delivery adapters should use pre-registered destinations, allow-listed schemes/hosts, destination ownership verification, bounded payloads, retry policy, and auditable delivery receipts.

---

## 10. Threat model

Reliance Signals should resist or expose:

- **silent material change** — the actor changes while counterparties continue relying on an old state without notice evidence;
- **broadcast-without-reliance** — a generic notice is presented as proof that a specific relying counterparty was informed;
- **fake acknowledgement** — delivery is represented as counterparty acknowledgement;
- **counterparty substitution** — a transport/operator claims acknowledgement on behalf of the relying institution;
- **renewal laundering** — old reliance is silently treated as renewed without a new basis record;
- **fork carryover** — a descendant actor inherits another actor's notices/reliance relationships;
- **signal replay** — one assessment creates several semantic signals and inflates blast-radius counts;
- **transport-induced identity fork** — CAEP/webhook/manual delivery each produce a different signal digest;
- **semantic idempotency mutation** — an idempotency key is reused with altered meaning;
- **assessment substitution** — a signal points to an assessment for another reliance/actor/state;
- **receipt backdating** — acknowledgement/review is recorded before the signal existed;
- **terminal-state fabrication** — a delivery event is treated as renewal or rejection;
- **transport monopoly** — NOEONE's semantics become dependent on one proprietary delivery network.

---

## 11. Database invariants

V1 should enforce:

1. every signal references an existing Reliance Basis;
2. every signal references an existing Reliance Change Assessment;
3. basis, assessment, signal, and actor IDs agree;
4. signal counterparty identity is copied from the immutable basis;
5. signal successor state/disposition/structural changes exactly match the immutable assessment;
6. `emittedAt >= assessment.assessedAt`;
7. one semantic signal exists per assessment;
8. signal semantic idempotency prevents replay with altered meaning;
9. signal rows are append-only;
10. every receipt references an existing signal;
11. receipt actor/reliance IDs match the signal;
12. `observedAt >= signal.emittedAt`;
13. delivery/delivery-failure receipts require transport metadata;
14. a transport reference requires a transport profile;
15. acknowledgement/review/renewal/rejection party identity equals the original relying counterparty;
16. non-expiry receipts require evidence;
17. a renewal receipt requires `successorRelianceId`;
18. the successor reliance explicitly supersedes the signal's original reliance;
19. the successor reliance concerns the same actor, counterparty, and relation;
20. non-renewal receipts cannot smuggle a successor reliance ID;
21. receipt semantic idempotency prevents replay with altered meaning;
22. receipt rows are append-only.

---

## 12. Experiments

### A. Silent-change versus signalled-change

Give participants/hosts an actor with accumulated history, then perform a model/runtime change.

Compare:

1. persistent identity + historical reputation only;
2. historical reliance basis + explicit change signal + successor-state disclosure.

Measure stale overreliance, review behavior, and replacement/renewal choices.

### B. Reliance blast-radius benchmark

Give one actor 100 synthetic counterparties with different relation kinds and evaluator policies. Perform one migration and measure whether the registry deterministically identifies all reliance edges with non-`UNAFFECTED` assessments and preserves propagation state independently for each.

### C. Delivery is not acknowledgement

Simulate successful transport with no counterparty response. Verify that NOEONE shows `DELIVERED` but never infers `ACKNOWLEDGED`, `RENEWED`, or `REJECTED`.

### D. Counterparty attribution

Let a transport operator produce valid delivery evidence, then attempt to use the same transport identity to record acknowledgement. It must fail; acknowledgement must be attributable to the original relying counterparty.

### E. Renewal integrity

Create a successor reliance basis after review and record a renewal receipt. Attempt to attach a basis that does not supersede the original reliance or belongs to another counterparty; it must fail.

### F. Multi-transport equivalence

Deliver the same immutable signal through CAEP, webhook-like, and manual adapters. Verify that transport metadata/receipt digests differ while the single `signalDigest` remains unchanged.

### G. Fork non-transfer

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

> **NOEONE binds one transport-independent change signal to the exact historical reliance relationship of a persistent artificial actor, then preserves evidence of how each relying counterparty was notified, acknowledged, reviewed, renewed, rejected, or left unresolved across model/runtime/controller changes.**

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
