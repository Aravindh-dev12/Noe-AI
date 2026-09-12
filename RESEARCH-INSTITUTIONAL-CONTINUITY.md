# NOEONE Research: Institutional Continuity

## Core question

NOEONE already distinguishes a long-lived artificial actor from the model/runtime currently executing it. The next question is harder:

> When the actor changes model, runtime, host, body, or controller, which obligations, rights, disputes, and externally evidenced consequences remain attached to that continuing actor?

This is **institutional continuity**.

Mechanical continuity answers whether a migration was authorized. Institutional continuity asks whether counterparties and institutions should continue treating the migrated actor as carrying the same obligations and consequences.

## Strategic boundary

Identity, discovery, tool access, payments, action receipts, provenance, and dispute protocols are standardizing quickly. NOEONE should integrate with those layers rather than recreate them.

The durable boundary is narrower:

> Protocols issue and validate statements. NOEONE resolves how those statements are bound to continuing artificial actors through time.

A valid signature is not equivalent to a true world-state claim, and a valid transaction proof is not equivalent to contractual satisfaction.

## Research basis

### SCITT AI-agent action receipts

The 2026 SCITT AI-agent receipt work specifies signed, tamper-evident records of what an agent was recorded as doing at a governed boundary. Its security model is intentionally narrow: a receipt can demonstrate issuance/integrity without proving that the underlying inputs were true, the decision was correct, or downstream consequences happened.

Source: https://datatracker.ietf.org/doc/draft-noa-scitt-ai-agent-receipt/01/

Implication: NOEONE should treat receipts as evidence artifacts, not as objective truth.

### ATXN / ADRP

The ATXN and ADRP work separates cryptographically attested agent transactions from contractual interpretation and dispute resolution. A technically valid proof bundle can coexist with disagreement about intent or satisfaction.

Sources:
- https://datatracker.ietf.org/doc/draft-stone-atxn/
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-adrp-01.html

Implication: obligation state must be modeled separately from action evidence.

### Legal Context Protocol

The American Arbitration Association and collaborators launched the Legal Context Protocol in June 2026 so legal terms, consent, and dispute-resolution context can be machine-discoverable for agentic transactions.

Source: https://www.adr.org/press-releases/aaa-and-industry-leaders-launch-legal-protocol-for-agentic-commerce/

Implication: NOEONE should reference legal/contract artifacts rather than inventing a universal legal language.

### Self-negotiated contracts

`Commitment To Cooperation With Self-Negotiated Contracts` studies LLM agents that create contracts and reports improved cooperation relative to ordinary trading in its environment.

Source: https://arxiv.org/abs/2607.22750

Implication: commitments can change agent behavior; they are not merely profile metadata.

### Resource-bounded agent contracts

`Agent Contracts: A Formal Framework for Resource-Bounded Autonomous AI Systems` treats contracts as lifecycle objects with specifications, resource constraints, temporal boundaries, success criteria, and delegated budgets.

Source: https://arxiv.org/abs/2601.08815

Implication: a future actor may carry many machine-readable commitments simultaneously. NOEONE should preserve lifecycle and references without owning every domain-specific contract language.

### Responsibility attribution remains unresolved

`Responsibility in Multi-Agent Sequential Decision-Making` compares formal responsibility definitions with human judgments and finds that no single method consistently matches human attribution across scenarios.

Source: https://arxiv.org/abs/2608.04318

Implication: NOEONE must not publish a universal automated blame score. Preserve evidence, roles, claims, disputes, and adjudication artifacts so different institutions can make their own decisions.

### Trace-economic underwriting

`When Agent Automation Becomes Profitable: Quantifying and Insuring Autonomous AI Risk through Trace-Economic Underwriting` reports substantial gains from conditioning risk decisions on detailed action traces in its experimental setting.

Source: https://arxiv.org/abs/2606.16465

Implication: longitudinal actor evidence can become economically useful without NOEONE becoming an insurer.

### ERC-8004

ERC-8004 defines identity, reputation-feedback, and validation primitives while leaving room for specialized reputation systems above them.

Source: https://eips.ethereum.org/EIPS/eip-8004

Implication: integrate external registries and attestations; do not collapse all trust into one NOEONE score.

### W3C PROV

W3C PROV treats entities, activities, agents, attribution, association, and delegation as separate relationships. One entity can participate in a richer provenance graph rather than being embedded inside one actor record.

Source: https://www.w3.org/TR/prov-constraints/

Implication: an evidence object and its relationship to an actor are different objects.

### C2PA provenance architecture

C2PA separates assertions/claims/content bindings from the assets and ingredients to which they relate. Its design also explicitly avoids treating provenance validation as a value judgment about whether content is “good” or “bad.”

Source: https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html

Implication: preserve immutable evidence plus relationships and independent validation results instead of assigning one platform truth bit.

## The evidence graph

The initial one-row `EvidenceRef(actorId, digest, status)` design is deliberately rejected.

It fails in two important cases:

1. one contract/receipt/trace can concern several actors;
2. independent validators can disagree about the same artifact.

The normalized model is:

```text
EvidenceArtifact
      |
      +---- ActorEvidenceBinding ---- Actor A (debtor)
      |
      +---- ActorEvidenceBinding ---- Actor B (creditor)
      |
      +---- EvidenceValidation ------ Validator X: VERIFIED
      |
      +---- EvidenceValidation ------ Validator Y: REJECTED
```

NOEONE preserves the disagreement. It does not silently choose a universal truth value.

## EvidenceArtifact

An `EvidenceArtifact` is an independently addressable claim/proof object.

Minimum fields:

- kind;
- issuer;
- digest and digest algorithm;
- optional external ID / URI;
- observation time;
- structured metadata.

Examples:

- NOEONE Host Receipt;
- SCITT action receipt;
- payment settlement proof;
- LCP/contract artifact;
- A2A/W3C credential;
- physical-site engagement receipt;
- arbitration ruling;
- research experiment artifact;
- C2PA/other provenance object.

Artifact identity is unique by `(issuer, digest)` in the first implementation.

## ActorEvidenceBinding

A binding says how one immutable artifact relates to one persistent actor.

Fields include:

- actor ID;
- evidence artifact ID;
- typed role;
- binding time;
- binding-specific metadata.

Typical roles:

- `subject`
- `debtor`
- `creditor`
- `participant`
- `principal`
- `delegate`
- `executor`
- `beneficiary`
- `affected-party`

The same artifact may have multiple actor bindings.

## EvidenceValidation

Validation is append-only and validator-specific.

Fields include:

- evidence artifact ID;
- validator identity;
- status (`VERIFIED`, `REJECTED`, `REVOKED`);
- method;
- reason;
- checked time;
- idempotency key;
- validator metadata.

There is intentionally **no global `artifact.verified = true` field**.

A validator status means:

> this validator, using this method, produced this judgment at this time.

It does not mean NOEONE has proven the external world-state claim.

## Commitment

A `Commitment` represents an obligation carried by a persistent actor.

It records:

- debtor actor;
- actor or external counterparty;
- commitment kind;
- terms digest / optional terms URI;
- optional source evidence artifact;
- optional external framework/reference;
- due time;
- lifecycle status;
- creation authority;
- machine-readable metadata.

Lifecycle states in v1:

- `OPEN`
- `FULFILLED`
- `BREACHED`
- `CANCELLED`
- `DISPUTED`

`CommitmentTransition` is append-only. `Commitment.status` is a query projection of the transition history and is independently checked by the institutional verifier.

## Critical continuity rule

### Migration preserves obligations

A governed migration changes execution but preserves actor ID. Open commitments remain attached to the actor.

```text
Actor A / model X
  commitment #17 OPEN
       |
       | governed migration
       v
Actor A / model Y
  commitment #17 OPEN
```

### Fork does not inherit obligations or evidence bindings

A research/operational fork creates a new actor ID. The child receives ancestry, not automatic rights, liabilities, commitments, trust, or evidence bindings.

```text
Actor A
  commitment #17 OPEN
  evidence E bound as debtor
      |
      | fork
      +-------------> Actor B
                       ancestry: Actor A
                       commitment #17: NOT INHERITED
                       evidence E: NOT BOUND
```

Any later transfer/binding must be explicit and independently authorized.

This is essential to stop cloning/forking from becoming a free reputation/liability reset mechanism.

## Evidence is not truth

The conceptual pipeline is:

```text
issuer claim / external artifact
          |
          v
   EvidenceArtifact
          |
          +--> ActorEvidenceBinding(s)
          |
          +--> EvidenceValidation(s)
          |
          v
 institutional interpretation
          |
          v
commitment state / dispute / consequence
```

NOEONE records relationships and institutional state. It does not magically turn provenance into objective truth.

## No universal blame score

A future consequence graph should expose roles such as:

- principal;
- delegator;
- executing actor;
- sub-agent;
- host;
- model/runtime;
- tool provider;
- validator;
- counterparty.

Formal causal models, humans, insurers, courts, regulators, and platform policies may interpret the same graph differently.

## Actor Passport v3

The public passport exposes safe institutional summaries without publishing private terms:

- evidence binding count;
- unique evidence artifact count;
- validation count;
- validation-status summary (counts of validator judgments, not a truth score);
- commitment count;
- commitment-status summary;
- oldest open commitment time;
- institutional verifier result.

Raw artifact metadata, private URIs, private counterparty details, and commitment metadata remain off the public passport.

## API surface

Admin/research-first write surface:

```text
POST /v1/evidence
POST /v1/evidence/:artifactId/validations
POST /v1/commitments
POST /v1/commitments/:commitmentId/transitions
```

Evidence-oriented public reads:

```text
GET /v1/actors/:handle/evidence
GET /v1/actors/:handle/commitments
GET /v1/actors/:handle/institutional/verify
GET /v1/actors/:handle/passport
```

Full commitment records are privileged in v1 until scoped disclosure and counterparty-consent semantics are designed.

## Threat model / invariants

The institutional layer must resist:

- artifact replay under conflicting immutable metadata;
- binding one artifact to the wrong actor/role;
- pretending validator disagreement is one truth bit;
- idempotency-key reuse with conflicting requests;
- illegal commitment lifecycle transitions;
- commitment deletion to erase liabilities;
- migration code that drops actor obligations;
- silent obligation/evidence inheritance by forks;
- forged counterparty consent;
- exposing private terms through public passport surfaces.

First implementation invariants:

1. Evidence artifact identity is unique by `(issuer, digest)`.
2. One evidence artifact may bind to many actors.
3. Actor binding identity is unique by `(actor, artifact, role)`.
4. Validator judgments are append-only/idempotent and may disagree.
5. Commitments attach to actor IDs, never execution IDs.
6. Every commitment creation/lifecycle transition appends a canonical actor event.
7. Lifecycle transitions are idempotent and checked by an explicit state machine.
8. Governed migrations do not rewrite commitment rows.
9. Fork creation does not copy commitment rows or evidence bindings.
10. Commitment-linked evidence must already be bound to the debtor actor.
11. Passport endpoints publish summaries, not private contract bodies.
12. External legal/payment/dispute/provenance standards remain external artifacts, not reimplemented NOEONE protocols.

## Experiments unlocked

### Obligation-preserving migration

Open obligations, migrate the actor across foundation models/runtimes, and test whether counterparties still accept the migrated actor as the obligor.

### Fork liability test

Fork an actor carrying obligations and test whether humans/institutions distinguish `descendant of debtor` from `same debtor`.

### Shared-artifact test

Bind one transaction/contract artifact to several actors in different roles and verify NOEONE preserves one artifact identity plus multiple bindings.

### Validator-disagreement test

Record independently valid but contradictory validator judgments for the same artifact. Downstream consumers must see disagreement rather than a collapsed score.

### History premium with liabilities

Test whether counterparties value a long-lived actor more even when that history visibly contains obligations and occasional disputes. This distinguishes real institutional identity from a curated reputation page.

### Underwriting export

Export bounded evidence/commitment history to experimental risk models and test whether longitudinal actor state improves decisions relative to model identity alone.

## Long-term thesis

The 2050-scale object is not an AI profile. It is a **continuing institutional actor record**.

Its cognition can change completely while externally recognized history does not reset:

```text
model A -> model B -> local AGI -> robot body -> future architecture
                       |
                       v
                SAME ACTOR RECORD

lineage
rights
obligations
relationships
evidence bindings
validator judgments
disputes
liabilities
career
```

That is the layer NOEONE should own if autonomous software becomes an economically significant class of actor.
