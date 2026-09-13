# NOEONE Research: Institutional Succession

## Core question

NOEONE can now distinguish canonical continuity from contextual recognition. A relying party can say that actor B is a successor of actor A without changing NOEONE's canonical lineage.

That still leaves a harder institutional question:

> **If B is recognized as A's successor, which rights, obligations, permissions, claims, remedies, and liabilities actually move from A to B, under whose consent, and with what residual liability for A?**

The critical boundary is:

> **Recognition != inheritance.**

A recognition assessment is evidence about how a relying party interprets a continuity relationship. It is not a transfer instrument.

NOEONE already intentionally prevents a fork from silently inheriting commitments, authority, evidence bindings, or production identity. Institutional succession must preserve that safety property.

---

## 1. Assignment, delegation, and novation are different

Contract law already separates several concepts that an artificial-actor system must not collapse.

Cornell Legal Information Institute's Wex explains that an assignment can transfer contractual rights and can also delegate duties, but the original obligor can remain secondarily liable. A **novation** is different: a new obligor substitutes for the original obligor and releases the original party, and the obligee's consent is required.

Sources:
- https://www.law.cornell.edu/wex/assignment
- https://www.law.cornell.edu/wex/novation
- https://www.law.cornell.edu/wex/delegate

**NOEONE implication:** `SUCCESSOR / RECOGNIZED` cannot mean `copy all obligations`. Transfer semantics must state whether the predecessor is released, remains secondarily liable, or guarantees performance.

---

## 2. Government novation practice shows the data model is richer than identity

Federal novation rules provide a useful institutional analogy. A successor-in-interest arrangement can include:

- evidence of the transfer;
- successor assumption of obligations and liabilities;
- transferor waiver of rights;
- recognition of the transferee as successor;
- ratification of prior actions;
- predecessor guarantees for future performance;
- an effective date;
- execution by the relevant parties.

Sources:
- https://www.acquisition.gov/far/42.1204
- https://www.acquisition.gov/fehbar/1642.1204-agreement-recognize-successor-interest-novation-agreement

**NOEONE implication:** succession is not one boolean. It is an evidence-backed institutional event with separately recorded assumptions, releases, retained liabilities, consents, and resulting objects.

---

## 3. Legal-entity identity already records successors without pretending they are the same entity

GLEIF's LEI-CDF 3.1 can record one or more `SuccessorEntity` entries when a legal entity ceases through a corporate action. The successor is a surviving/new legal entity that continues or replaces the old LEI registration.

Source:
- https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-1-data-lei-cdf-3-1-format

**NOEONE implication:** a successor relationship can be first-class while actor IDs remain distinct. Institutional transfer can then reference that relationship without rewriting ancestry or canonical identity.

---

## 4. Agentic commerce standards should remain external inputs

The American Arbitration Association's Legal Context Protocol makes legal terms, authority, governing law, consent, and dispute context discoverable/verifiable for agentic transactions. It is intentionally narrow: it does not dictate the legal terms themselves.

Sources:
- https://www.adr.org/press-releases/aaa-and-industry-leaders-launch-legal-protocol-for-agentic-commerce/
- https://www.adr.org/industries/commercial-industries/smart-contracts-and-blockchain-disputes/

**NOEONE implication:** succession agreements may reference a `LegalContextSnapshot`, LCP context, external contract, court/arbitration decision, or other legal artifact. NOEONE should not invent universal contract law.

---

## 5. Cryptographic proof does not settle contractual effect

The September 2026 ADRP Internet-Draft explicitly separates valid cryptographic proof from contractual satisfaction. An append-only proof can establish that an action occurred without determining whether the action satisfied an agreement.

Source:
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-adrp-01.html

**NOEONE implication:** a signed succession statement proves who issued the statement. It does not by itself prove that every counterparty, jurisdiction, host, or authority issuer must honor the transfer. NOEONE therefore stores transfer evidence and consent rather than a universal legal-truth bit.

---

## 6. The NOEONE-specific gap

Existing NOEONE layers answer different questions:

```text
Canonical continuity
  -> what transition/fork structurally happened?

Recognition continuity
  -> who treats the later actor as same/successor/descendant in context X?

Institutional succession
  -> which specific institutional positions actually move, with whose consent and what residual liability?
```

This new layer is useful only if those questions remain separate.

The product hypothesis is not that NOEONE invented novation or successor-in-interest doctrine. It did not.

The hypothesis is:

> **Persistent artificial actors need a longitudinal transfer graph that binds explicit assumptions, releases, reissued authority, and resulting obligations to actor lineage without conflating recognition with inheritance or mutating historical records.**

---

## 7. V1 primitive: InstitutionalSuccessionAgreement

An agreement records a proposed institutional transfer between two distinct actors.

Required conceptual fields:

- predecessor actor;
- successor actor;
- succession kind;
- context;
- policy framework/version;
- optional legal-context snapshot;
- immutable source evidence;
- optional recognition assessment used as evidence, never as automatic authority;
- required parties whose consent must be present;
- proposed/effective time;
- deterministic proposal digest;
- deterministic activation-basis digest;
- idempotency key;
- metadata.

V1 agreement kinds:

- `NOVATION`
- `ASSIGNMENT`
- `REAUTHORIZATION`
- `MIXED`

V1 states:

- `PROPOSED`
- `EFFECTIVE`
- `REJECTED`
- `SUPERSEDED`

NOEONE will initially implement the transition to `EFFECTIVE`; rejection/supersession remain reserved for subsequent policy workflows.

---

## 8. Required parties are explicit

An agreement must identify exact required consent principals rather than merely saying "counterparty consent required".

A party record contains:

- role;
- principal type;
- principal reference;
- whether consent is required;
- metadata.

V1 roles:

- `PREDECESSOR`
- `SUCCESSOR`
- `COUNTERPARTY`
- `AUTHORITY_ISSUER`
- `ADJUDICATOR`

This prevents a random counterparty from satisfying another counterparty's consent requirement.

---

## 9. Consent is append-only and contextual

A consent record targets one exact agreement party.

V1 dispositions:

- `CONSENTED`
- `CONDITIONAL`
- `REJECTED`

Consent stores:

- evidence artifact;
- method + version;
- assessment time;
- optional validity interval;
- conditions/reasons;
- deterministic basis digest;
- idempotency key.

Activation uses the exact consent records captured in the activation basis. Later consents or revocations do not rewrite the historical activation proof; a new dispute or superseding succession process can be recorded separately.

---

## 10. Succession items are object-specific

NOEONE must not transfer an actor wholesale.

V1 item types:

### `DEBTOR_NOVATION`

The predecessor is the debtor on an existing commitment. An effective succession creates a **new commitment** for the successor, linked to the original commitment and the succession agreement.

The original commitment is not deleted or rewritten. The succession item records whether institutional interpretation releases or retains predecessor liability.

V1 predecessor-liability modes:

- `RELEASED`
- `RETAINED_SECONDARY`
- `GUARANTOR`

The raw original commitment remains part of historical truth. Consumers that need current effective liability must resolve it through the succession overlay rather than assuming every `OPEN` historical record remains independently payable.

### `CREDITOR_ASSIGNMENT`

The predecessor is the actor creditor on an existing commitment. An effective succession creates a new commitment position with the successor as creditor while retaining the original commitment as immutable history.

### `AUTHORITY_REISSUANCE`

Authority is **never copied automatically**.

A succession item can only link an existing predecessor grant to a **fresh grant already issued to the successor**. The target grant must be independently valid and may not be broader than the source grant when represented as a reissuance.

If an authority issuer wants to grant broader powers, that is a new grant, not continuity-based reissuance.

---

## 11. Recognition is optional evidence, not an activation switch

A succession agreement may reference a `ContinuityRecognitionAssessment`.

If it does, V1 requires that the assessment:

- belongs to the successor actor;
- asserts `SUCCESSOR`;
- is `RECOGNIZED`;
- is valid at activation time.

But a succession agreement does not require a platform-global recognition vote. External legal evidence and explicit party consent can establish a transfer even when other recognizers disagree.

Recognition never mutates the transfer and transfer never mutates canonical lineage.

---

## 12. Activation invariants

An agreement can become effective only when:

1. predecessor and successor are distinct existing actors;
2. source evidence exists and is bound to both actors;
3. every required party has an unexpired `CONSENTED` record selected for activation;
4. any referenced recognition assessment satisfies its declared role;
5. at least one succession item exists;
6. each source object belongs to the predecessor position claimed by the item;
7. commitment items reference transferable, non-terminal commitments;
8. authority reissuance references a fresh successor grant;
9. reissued authority does not exceed the source grant's represented scope;
10. all resulting objects are created/validated atomically;
11. the exact selected consents/items/results are captured in an immutable activation basis;
12. predecessor and successor receive canonical succession events.

---

## 13. Historical records are never rewritten

NOEONE should never implement:

```text
successor recognized -> UPDATE all rows SET actorId = successor
```

Instead:

```text
source commitment / authority grant
           |
           | InstitutionalSuccessionItem
           v
resulting commitment / fresh authority grant
```

The predecessor record remains queryable forever.

This matters for:

- audits;
- disputes;
- causal attribution;
- prior payments/actions;
- insurance underwriting;
- regulatory review;
- research on actor continuity.

---

## 14. Fork semantics

A fork still inherits nothing by default.

```text
Actor A --ancestry--> Actor B
```

Even if a recognizer later says:

```text
B = SUCCESSOR / RECOGNIZED
```

B still receives no commitments or authority until a separate institutional succession process explicitly transfers/reissues those positions.

That separation is a core NOEONE safety invariant.

---

## 15. Derived current-state semantics

The raw commitment ledger remains append-only historical truth.

Current effective institutional state becomes a **projection** over:

- commitment lifecycle;
- effective succession items;
- predecessor liability modes;
- resulting commitments;
- claims/remedies that may later modify interpretation.

V1 exposes succession separately rather than silently changing every existing commitment query. This avoids pretending one projection is universal legal truth.

Later customers can choose policies such as:

- contractual-current-state;
- accounting exposure;
- insurer exposure;
- regulatory reporting;
- research history.

---

## 16. Verification

`verifyInstitutionalSuccession(actorId)` should independently reconstruct:

- agreement proposal digest;
- predecessor/successor identities;
- source evidence existence and actor bindings;
- required party set;
- selected activation consents;
- consent basis digests and validity at effective time;
- recognition reference validity when present;
- item digests;
- resulting commitment/grant linkage;
- authority reissuance non-amplification;
- activation basis digest.

It should report structural validity, not legal enforceability.

---

## 17. Actor Passport

A future `noeone.actor-passport.v6` can expose only privacy-safe succession aggregates:

```json
{
  "succession": {
    "predecessorAgreementCount": 1,
    "successorAgreementCount": 2,
    "effectiveAgreementCount": 2,
    "commitmentTransfersIn": 3,
    "commitmentTransfersOut": 1,
    "authorityReissuances": 2,
    "verification": { "verified": true }
  }
}
```

Do not expose private terms, party references, evidence contents, or consent reasons by default.

---

## 18. Falsification test

The first production experiment should prove the boundary:

1. actor A owes actor B under commitment C;
2. actor S is a fork/successor candidate;
3. a recognizer records `S -> SUCCESSOR / RECOGNIZED`;
4. confirm S still has zero inherited commitments;
5. propose A -> S novation for C;
6. identify A, S, and B as required parties;
7. record evidence-backed consent from all three;
8. activate succession;
9. create a resulting commitment for S without deleting C;
10. record whether A is released or retains secondary liability;
11. verify S still inherits no unrelated commitments;
12. verify A's unrelated authority grants do not move;
13. optionally link a separately issued successor authority grant as `AUTHORITY_REISSUANCE`;
14. independently recompute the activation basis and resulting object links.

If recognition alone is sufficient for real counterparties, this layer is unnecessary.

If institutions require explicit object-level transfer, consent, release/retention, and reauthorization, the succession graph is a real missing primitive.

---

## 19. Strategic boundary

NOEONE should own:

> **the longitudinal graph that records how specific institutional positions move between persistent artificial actors, with explicit evidence, consent, residual liability, and resulting-object provenance.**

NOEONE should not own:

- universal contract law;
- a universal definition of successor-in-interest;
- bearer authorization credentials;
- payment settlement;
- arbitration itself;
- jurisdiction-specific legal advice;
- automatic inheritance from recognition.

The long-term asset is not a magical identity score. It is the historical graph connecting **actor continuity -> recognition -> explicit institutional succession -> later actions and consequences**.