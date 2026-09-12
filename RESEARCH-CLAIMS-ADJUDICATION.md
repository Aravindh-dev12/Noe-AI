# NOEONE Research: Claims, Disputes, Adjudication, and Remedies

## Core question

NOEONE now records persistent actor continuity, evidence, commitments, delegated authority, historical authority exercises, observed consequences, and method-specific consequence attribution. The next institutional problem is what happens when a principal contests an outcome or another principal's performance.

The wrong abstraction is an "AI court" or a global reputation score.

The right abstraction is:

> **an append-only case record that preserves who the real principals were, which persistent artificial actors were involved, what legal/contractual context applied at the relevant time, what evidence and claims were submitted, which state transitions occurred, what an external forum or adjudicator decided, and what remedies were ordered or satisfied.**

NOEONE should preserve case provenance. It should not pretend to supply legal personhood, universal jurisdiction, or legally authoritative rulings by itself.

---

## 1. Current protocol landscape

### ATXN: transactions are instruments of principals

The September 2026 ATXN draft defines agent-to-agent transactions as exchanges between software agents acting as instruments of identified principals. Its state machine moves through `proposed -> authorized -> executing -> delivered -> finalized`, with a branch from delivered to `disputed -> adjudicated`.

It explicitly aims to operate without requiring statutory recognition of AI-agent personhood.

Sources:
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-atxn-01.html
- https://datatracker.ietf.org/doc/draft-stone-atxn/

**NOEONE implication:** a case should be anchored to principals or organizations with capacity/recourse. The artificial actor is still important as the persistent executor/evidentiary subject, but it is not silently promoted into a legal person.

### ADRP: cryptographic validity is not contractual satisfaction

The September 4, 2026 ADRP draft defines a dispute-resolution state machine layered over cryptographically attested A2A transactions. Its core distinction is essential for NOEONE: proof that an agent took specified actions does not prove that the principal's intended contractual outcome was satisfied.

The draft's Arbitration Mandate records consent, forum, governing law, fee and tier parameters in machine-verifiable form, while explicitly noting that the protocol itself does not determine legal enforceability in every jurisdiction.

Source:
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-adrp-01.html

**NOEONE implication:** decisions and claims must be separate from action/consequence evidence. An adjudicator's decision is an externally issued institutional record, not a recomputation of the canonical actor event log.

### Legal Context Protocol: transaction-time terms must be frozen

The Legal Context Protocol launched by the American Arbitration Association and collaborators including Google, IBM, Circle, Wayfair and others in June 2026. It makes terms, consent, jurisdiction and dispute resolution discoverable for agentic commerce.

Its `atrHash` pattern is particularly relevant: the exact terms document is hashed, and prior transactions continue to reference the previous hash when a service updates its terms. The transaction-time hash is authoritative for that transaction.

Sources:
- https://www.adr.org/press-releases/aaa-and-industry-leaders-launch-legal-protocol-for-agentic-commerce/
- https://legalcontextprotocol.org/
- https://legalcontextprotocol.org/standard
- https://legalcontextprotocol.org/levels/provable
- https://legalcontextprotocol.org/levels/integrated

**NOEONE implication:** legal/dispute context is a versioned evidence snapshot, not a mutable pointer to whatever terms exist today.

### VCAP: verification and settlement are distinct state machines

VCAP defines escrow, delivery verification and settlement mechanics for autonomous-agent commerce. Verification callbacks can trigger release/refund decisions; timeout/dispute conditions can escalate to human review.

Sources:
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-vcap-02.html
- https://datatracker.ietf.org/doc/draft-stone-vcap/

**NOEONE implication:** a decision that a deliverable passed, a payment release, a refund, and a later dispute are different records. NOEONE should model institutional transitions rather than flatten them into one `success` flag.

---

## 2. NOEONE's layer

NOEONE should not compete with ADRP, AAA, courts, arbitration providers, escrow services, chargeback networks, payment rails, or insurers.

It should make their outputs longitudinally attributable to the same persistent artificial actor and principal context.

The institutional graph becomes:

```text
persistent actor
    -> authority at action time
    -> action evidence
    -> observed consequence
    -> attribution assessment(s)
    -> claim filed by principal
    -> evidence submissions
    -> claim state transitions
    -> external decision / settlement
    -> remedy order
    -> remedy fulfillment evidence
```

The scarce object is not the protocol message. It is the long-lived, cross-system historical record that says which case and consequence belongs to which continuing actor and principals.

---

## 3. Strong boundary: principals are parties, actors are subjects

A claim should have one or more **Principal Parties**:

- `CLAIMANT`
- `RESPONDENT`
- optionally `INTERESTED`

Each party stores only an opaque principal identity reference and an optional supporting evidence artifact. NOEONE does not need to store raw PII in its public actor graph.

A claim may separately link one or more persistent artificial actors with roles such as:

- `EXECUTOR`
- `DELEGATE`
- `SUBJECT`
- `COUNTERPARTY_AGENT`
- `WITNESS`

This separation prevents a dangerous conceptual collapse:

```text
AI actor involved in case != legal party by default
```

If a future jurisdiction grants some artificial entity legal status, that can be represented explicitly by a principal identity class/evidence record rather than changing the architecture.

---

## 4. LegalContextSnapshot

NOEONE needs an immutable transaction/case-time legal context object.

Proposed fields:

- `id`
- `framework` (`lcp`, `atxn`, custom contract, etc.)
- `termsDigest`
- `termsUri` optional
- `disputeClauseDigest` optional
- `method` optional
- `jurisdiction` optional
- `forumRef` optional
- `acceptanceEvidenceArtifactId` optional
- `sourceEvidenceArtifactId` required when the snapshot claims external provenance
- `effectiveAt`
- `capturedAt`
- `idempotencyKey`
- immutable metadata

The important invariant is non-retroactivity:

> A claim never resolves its governing context by fetching "current terms".

It references a frozen content digest/evidence snapshot associated with the relevant transaction/action/commitment time.

A later LCP terms version is a new snapshot.

---

## 5. Claim object

A V1 `Claim` should represent the institutional assertion that a principal contests or seeks remedy for an observed state.

Possible sources:

- `ConsequenceObservation`
- `Commitment`
- `AuthorityExercise`
- external transaction/agreement reference

Proposed fields:

- `id`
- `claimType`
- `status`
- `consequenceId` optional
- `commitmentId` optional
- `authorityExerciseId` optional
- `legalContextSnapshotId` optional
- `statementEvidenceArtifactId` required
- `claimDigest` — canonical digest of the asserted claim basis
- `amountMinor` / `currency` optional
- `externalFramework` / `externalReference` optional
- `appealOfClaimId` optional
- `filedAt`
- `idempotencyKey`
- immutable metadata

The mutable current `status` is a projection of append-only `ClaimTransition` rows, just like NOEONE's existing commitment/authority state projections.

---

## 6. Claim state machine

NOEONE should use a generic institutional state machine rather than copying one arbitration provider's exact workflow.

V1:

```text
FILED
  -> RESPONDED
  -> UNDER_REVIEW
  -> ADJUDICATED

FILED / RESPONDED / UNDER_REVIEW
  -> SETTLED
  -> DISMISSED
  -> WITHDRAWN
```

Terminal V1 states:

- `ADJUDICATED`
- `SETTLED`
- `DISMISSED`
- `WITHDRAWN`

Appeals do not mutate the old adjudication back into an open case. An appeal is a new Claim linked by `appealOfClaimId`.

This preserves history:

```text
original claim -> adjudicated
appeal claim   -> filed -> ...
```

instead of:

```text
adjudicated -> magically un-adjudicated
```

---

## 7. ClaimTransition

Every state change is append-only and idempotent.

Fields:

- `id`
- `claimId`
- `fromStatus`
- `toStatus`
- `evidenceArtifactId` optional
- `decidedByType`
- `decidedByRef`
- `reason` optional
- `occurredAt`
- `idempotencyKey`
- metadata

Rules:

1. lock Claim row before transition;
2. validate allowed state transition;
3. append transition;
4. update materialized Claim status in same transaction;
5. never edit/delete prior transition in normal product operations;
6. transition evidence remains separately verifiable.

---

## 8. ClaimEvidenceBinding

Evidence submission is independent from state transitions.

One immutable EvidenceArtifact can be linked to a claim with roles:

- `CLAIM_STATEMENT`
- `RESPONSE`
- `DELIVERY_RECORD`
- `PAYMENT_RECORD`
- `AUTHORITY_RECORD`
- `COMMUNICATION`
- `EXPERT_REPORT`
- `DECISION`
- `REMEDY_SATISFACTION`
- custom

Fields:

- claim ID
- evidence artifact ID
- role
- submitted-by principal-party ID optional
- submittedAt
- idempotency key
- metadata

The evidence itself is not duplicated into the case table.

---

## 9. AdjudicationDecision

A decision is an immutable external/institutional record. NOEONE is not the adjudicator unless a future product explicitly offers a separate adjudication service.

Proposed fields:

- `id`
- `claimId`
- `disposition`
  - `GRANTED`
  - `PARTIALLY_GRANTED`
  - `DENIED`
  - `DISMISSED`
  - `NO_JURISDICTION`
- `adjudicatorType`
- `adjudicatorRef`
- `decisionEvidenceArtifactId`
- `decisionDigest`
- `legalContextSnapshotId` optional
- `decidedAt`
- `externalFramework` / `externalReference`
- `idempotencyKey`
- metadata

Creating the first final decision should atomically append a `ClaimTransition` to `ADJUDICATED`.

If a forum later corrects/supersedes a decision, do not overwrite the decision row. Record a new decision with `supersedesDecisionId` or create an appeal claim.

---

## 10. RemedyOrder

A decision or settlement may create remedies. Keep them distinct from the decision itself.

Examples:

- refund
- damages/payment
- redelivery
- corrective action
- account restoration
- credential/authority revocation recommendation
- other non-monetary remedy

Proposed fields:

- `id`
- `claimId`
- `decisionId` optional
- `kind`
- `obligorPrincipalPartyId`
- `beneficiaryPrincipalPartyId`
- `amountMinor` / `currency` optional
- `termsDigest`
- `dueAt` optional
- `status`: `ORDERED`, `SATISFIED`, `FAILED`, `CANCELLED`
- `idempotencyKey`
- metadata

`RemedyTransition` can project satisfaction state from append-only evidence-backed transitions.

A payment rail may later settle the remedy. NOEONE should record the evidence/reference, not become the payment rail.

---

## 11. Non-retroactivity invariants

This layer must preserve historical context across change.

### Terms change

```text
10:00 terms H1 accepted
10:30 transaction
12:00 merchant publishes H2
14:00 dispute filed
```

The claim references H1. H2 must not govern the earlier transaction unless a real legal process explicitly says otherwise.

### Authority revoked later

An authority exercise already recorded as historically `COVERED` remains covered after later revocation. The claim can still contest performance, fraud, negligence, contractual satisfaction, etc. Authorization and satisfaction are separate questions.

### Actor model migration

The actor can switch GPT -> Claude -> Mistral after the incident. The claim remains attached to the persistent actor ID and the original execution/action evidence.

### Actor fork

A fork gets ancestry, not automatic liability. Claims/decisions/remedies remain with the original actor/principal relationships unless explicitly linked to the child by a new institutional record.

### Forum rules change

A later arbitration catalog/rules version must not silently rewrite the clause/rules snapshot already attached to the transaction/claim.

---

## 12. Concurrency and integrity

Production invariants:

1. Every institutional create/transition operation has an idempotency key.
2. Reusing an idempotency key with different data is a conflict.
3. Claim status transitions take a row lock.
4. Claim status is a projection of transition history and is independently verifiable.
5. Required filing/decision evidence must exist before the corresponding record is accepted.
6. Evidence artifacts are reused by reference rather than copied.
7. Legal-context digests are immutable.
8. Principal-party identities are opaque references; public APIs do not leak private principal metadata.
9. Decision creation cannot silently rewrite claim evidence or consequence observations.
10. Appeal creates a new case relationship rather than reopening history.
11. Monetary amount/currency fields are enforced as pairs and checked at the DB layer.
12. Raw case material is private/admin-only by default.

---

## 13. Public actor surface

Do not turn claims into a public accusation feed.

Default V1 policy:

- case details: privileged only;
- principal refs: privileged only;
- evidence: privileged/access-controlled;
- public actor passport: no raw claim names, allegations, amounts, counterparties, or evidence;
- at most, future opt-in/legally-public aggregates can be added after policy review.

This protects NOEONE from becoming a defamation/reputation engine while preserving the institutional substrate.

---

## 14. Verification

`verifyClaimState(claimId)` should independently check:

- filing evidence exists;
- principal parties exist with claimant/respondent roles;
- linked actor IDs exist;
- linked consequence/commitment/exercise exists;
- frozen legal context digest remains consistent;
- claim digest recomputes;
- transition chain is valid and chronological;
- materialized status equals last transition;
- transition idempotency and evidence references are structurally valid;
- decision evidence/digest verifies structurally;
- adjudicated state has a decision;
- appeal linkage does not create a cycle.

Verification means **record integrity**, not that the ruling is legally correct.

---

## 15. Experiments

### Historical terms test

Create legal context H1, file transaction/outcome, create H2 later, then file a claim. Verify the case remains bound to H1.

### Migration test

Action under execution A -> actor migrates to execution B -> claim filed later. Case must still resolve to one persistent actor while retaining original execution evidence.

### Fork liability test

Fork actor after incident. Child must have ancestry but zero inherited claims/remedies unless explicitly linked.

### Conflicting evidence test

Both principal parties submit contradictory evidence. NOEONE stores both and does not rewrite the underlying consequence observation.

### Appeal test

Original case reaches ADJUDICATED. Appeal creates a new claim referencing original claim/decision; original remains terminal.

### Remedy satisfaction test

Decision orders refund; separate payment/settlement evidence later marks remedy satisfied. Decision itself is unchanged.

---

## 16. Strategic meaning

Standards such as ATXN, ADRP, LCP and VCAP are good for NOEONE because they can standardize transaction, terms, dispute and settlement messages.

NOEONE should sit above them as the longitudinal case/history layer:

```text
ATXN / AP2 / ACP / payment rails
        -> transaction records
LCP
        -> transaction-time terms / forum
ADRP / arbitration / court / platform
        -> dispute and decision records
VCAP / escrow / payment rails
        -> settlement records

NOEONE
        -> which persistent actor and principals all of those records belong to across years, models, runtimes and environments
```

If stronger AI creates more autonomous commerce, more consequential actions, and more cross-system disputes, this history becomes more valuable rather than less.

The moat is not "we invented dispute resolution." It is the durable, auditable graph connecting **identity -> authority -> action -> outcome -> claim -> decision -> remedy** for continuing artificial actors.