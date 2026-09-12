# NOEONE Research: Institutional Continuity

## Core question

NOEONE already distinguishes a long-lived artificial actor from the model/runtime currently executing it. The next question is harder:

> When the actor changes model, runtime, host, body, or controller, which obligations, rights, disputes, and externally evidenced consequences remain attached to that continuing actor?

This is **institutional continuity**.

Mechanical continuity answers whether a migration was authorized. Institutional continuity answers whether counterparties and systems should continue treating the migrated actor as carrying the same commitments and consequences.

## Why this layer matters

Agent identity, discovery, tool access, payments, action receipts, and dispute protocols are standardizing quickly. NOEONE should not duplicate those layers.

The durable product boundary is narrower:

> Protocols prove or carry statements. NOEONE resolves which continuing actor those statements, commitments, and consequences belong to over time.

That distinction is important because a valid signature does not prove contractual satisfaction or downstream real-world consequence.

## Research basis

### SCITT AI-agent action receipts

The August 2026 `draft-noa-scitt-ai-agent-receipt-01` specifies signed, tamper-evident records of what an agent was recorded as doing at a governed boundary. It explicitly limits the claim: a receipt proves a statement was issued and not altered; it does not prove that the action was wise, the inputs were true, or a real-world outcome followed.

Source: https://datatracker.ietf.org/doc/draft-noa-scitt-ai-agent-receipt/01/

Implication: NOEONE should index such artifacts as evidence, not reinterpret them as truth.

### ATXN / ADRP

The ATXN and ADRP drafts separate cryptographically attested agent transactions from contractual satisfaction. ADRP is explicitly designed around the fact that a proof bundle can be valid while a principal still disputes whether the transaction satisfied intent.

Sources:
- https://datatracker.ietf.org/doc/draft-stone-atxn/
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-adrp-01.html

Implication: NOEONE should model **obligation state** separately from action evidence.

### Legal Context Protocol

The American Arbitration Association and collaborators launched the Legal Context Protocol in June 2026 so legal terms, consent, and dispute-resolution context can be machine-discoverable in agentic transactions.

Source: https://www.adr.org/press-releases/aaa-and-industry-leaders-launch-legal-protocol-for-agentic-commerce/

Implication: NOEONE should reference legal/contract artifacts instead of inventing a universal legal language.

### Self-negotiated contracts

`Commitment To Cooperation With Self-Negotiated Contracts` (2026) finds that contract representations can improve cooperation among LLM agents beyond ordinary trading.

Source: https://arxiv.org/abs/2607.22750

Implication: commitments are not merely metadata. They can change multi-agent behavior and therefore belong in longitudinal actor research.

### Resource-bounded agent contracts

`Agent Contracts: A Formal Framework for Resource-Bounded Autonomous AI Systems` treats contracts as explicit lifecycle objects with input/output specifications, resource constraints, temporal boundaries, success criteria, and delegated budget conservation.

Source: https://arxiv.org/abs/2601.08815

Implication: a future NOEONE actor may carry many machine-readable commitments simultaneously. NOEONE should preserve references and lifecycle, not define every domain-specific term.

### Responsibility attribution remains unresolved

`Responsibility in Multi-Agent Sequential Decision-Making` (2026) compares formal causal-responsibility methods with human judgments and finds that no single method consistently matches human responsibility judgments.

Source: https://arxiv.org/abs/2608.04318

Implication: NOEONE must not publish a universal automated blame score. It should preserve evidence, roles, claims, disputes, and adjudication artifacts so different institutions can make their own attribution decisions.

### Economic risk from traces

`When Agent Automation Becomes Profitable: Quantifying and Insuring Autonomous AI Risk through Trace-Economic Underwriting` (2026) shows that action traces can materially improve economic-risk pricing and control decisions.

Source: https://arxiv.org/abs/2606.16465

Implication: longitudinal actor evidence may become financially valuable without NOEONE itself becoming an insurer.

### ERC-8004

ERC-8004 standardizes agent identity, reputation feedback, and validation hooks while explicitly allowing specialized reputation systems to emerge above the primitive registries.

Source: https://eips.ethereum.org/EIPS/eip-8004

Implication: NOEONE should avoid a single global trust score. It can link external identity/reputation/validation artifacts into the actor record.

## The new NOEONE objects

### EvidenceRef

An `EvidenceRef` is a reference to an independently meaningful artifact.

Minimum fields:

- subject actor;
- evidence kind;
- issuer;
- digest and digest algorithm;
- optional URI / external identifier;
- verification state;
- observation and verification times;
- structured metadata.

Examples:

- NOEONE Host Receipt;
- SCITT action receipt;
- payment settlement proof;
- LCP/contract artifact;
- A2A/W3C identity credential;
- physical-site engagement receipt;
- arbitration ruling;
- research experiment artifact.

The referenced artifact remains verifiable according to its own protocol. NOEONE stores the binding between that artifact and a persistent actor.

### Commitment

A `Commitment` represents an obligation carried by an actor.

It records:

- debtor actor;
- actor or external counterparty;
- commitment kind;
- digest/URI of terms;
- optional external framework/reference;
- optional source evidence;
- due time;
- lifecycle status;
- creation authority;
- machine-readable metadata.

The first lifecycle states are:

- `OPEN`
- `FULFILLED`
- `BREACHED`
- `CANCELLED`
- `DISPUTED`

`CommitmentTransition` is append-only. The mutable `Commitment.status` is a query projection of the latest accepted transition.

## Critical semantic rule

### Migration preserves commitments

A governed migration changes execution but preserves actor ID. Open commitments therefore remain attached to the actor.

```text
Actor A / model X
  obligation #17 OPEN
       |
       | governed migration
       v
Actor A / model Y
  obligation #17 OPEN
```

### Fork does not inherit commitments by default

A research or operational fork creates a new actor ID. The child receives ancestry, not automatic rights or liabilities.

```text
Actor A
  obligation #17 OPEN
      |
      | fork
      +-------------> Actor B
                       ancestry: A
                       obligation #17: NOT INHERITED
```

Any transfer of an obligation to the child must be a separate explicit institutional event with external authority/evidence.

This rule makes cheap identity reset harder and preserves the economic meaning of persistent identity.

## Evidence is not truth

NOEONE must keep these concepts separate:

```text
issuer claim
    ↓
EvidenceRef
    ↓
verification of artifact integrity
    ↓
NOEONE actor binding
    ↓
optional institutional interpretation
    ↓
commitment state / dispute / consequence
```

A cryptographically valid artifact can still be wrong, incomplete, or disputed.

Therefore `VERIFIED` means **artifact integrity/issuer verification passed**, not `the world-state claim is objectively true`.

## No universal blame score

NOEONE should not reduce responsibility to one number.

A future consequence graph can expose roles such as:

- principal;
- delegator;
- executing actor;
- sub-agent;
- host;
- tool provider;
- validator;
- counterparty.

Formal causal models, human adjudicators, insurers, courts, or regulators can then evaluate the same evidence differently.

## Product implications

The consumer view remains simple:

```text
NOVA
Career
Open commitments: 3
Completed: 81
Disputed: 1
Verified evidence: 294
Current brain: Claude
```

The infrastructure view is richer:

```text
canonical actor
   |
   +-- continuity transitions
   +-- evidence graph
   +-- commitment ledger
   +-- host receipts
   +-- external protocol references
   +-- disputes/adjudication references
```

## Actor Passport v3

The next passport should expose institutional state without leaking private terms:

- open commitment count;
- fulfilled/breached/disputed counts;
- verified evidence count;
- evidence-type summary;
- oldest open commitment time;
- no private terms body by default.

This gives machines a compact longitudinal view while leaving full evidence and terms behind scoped endpoints.

## Security / threat model

The institutional layer must resist:

- evidence replay under different actors;
- digest reuse with conflicting metadata;
- false verification-state promotion;
- commitment idempotency-key reuse;
- illegal lifecycle transitions;
- silent transfer of obligations to forks;
- commitment deletion to erase liabilities;
- migration code that drops actor obligations;
- forged counterparty consent;
- confusing artifact-integrity verification with real-world truth;
- exposing private contract terms through public passport surfaces.

## First implementation invariants

1. `EvidenceRef` is immutable in identity-critical fields after creation.
2. A verified evidence reference is unique by `(issuer, digest)`.
3. Commitments are attached to actor IDs, never execution IDs.
4. Every commitment creation and lifecycle transition appends a canonical actor event.
5. Lifecycle transitions are idempotent and validated by an explicit state machine.
6. Migrations do not rewrite commitment rows.
7. Fork creation does not copy commitment rows.
8. Passport endpoints publish counts/summaries only, not full terms.
9. External legal/payment/dispute protocols remain referenced artifacts rather than reimplemented NOEONE protocols.
10. A future consequence-attribution layer must preserve claims/evidence separately from adjudicated conclusions.

## Initial API surface

Research/admin-first write surface:

```text
POST /v1/evidence
GET  /v1/actors/:handle/evidence
POST /v1/commitments
POST /v1/commitments/:commitmentId/transitions
GET  /v1/commitments/:commitmentId
GET  /v1/actors/:handle/commitments
```

Public reads are evidence-oriented. Writes remain restricted until counterparty consent, privacy, and legal semantics are better specified.

## Research experiments unlocked

### Obligation-preserving migration

Create open obligations, migrate the actor across foundation models, and test whether counterparties still accept the migrated actor as the obligor.

### Fork liability test

Fork the actor and test whether humans/institutions distinguish `descendant of debtor` from `same debtor`.

### Evidence disagreement test

Attach two independently valid but contradictory issuer artifacts. Measure whether downstream systems preserve uncertainty instead of collapsing to one truth value.

### History premium with liabilities

Test whether counterparties value a long-lived actor more even when that actor has visible obligations and occasional disputes. This distinguishes genuine institutional identity from a curated reputation profile.

### Underwriting export

Provide a bounded evidence/commitment export to experimental risk models and test whether longitudinal actor state improves pricing or control decisions relative to model identity alone.

## Long-term thesis

The 2050-scale object is not an AI profile. It is a **continuing institutional actor record**.

Its cognition can change completely while its externally recognized history does not reset:

```text
model A -> model B -> local AGI -> robot body -> future architecture
                       |
                       v
                SAME ACTOR RECORD

rights
obligations
relationships
verified evidence
disputes
liabilities
career
```

That is the layer NOEONE should own if the agent economy becomes real.