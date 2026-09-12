# NOEONE Research: Consequence Graph and Responsibility Boundary

## Core question

NOEONE already separates persistent actor identity, continuity governance, evidence, commitments, delegated authority, and temporal authority reconstruction. The next problem is harder:

> After a persistent artificial actor acts under authority and the outside world changes, what exactly should NOEONE record as fact, what is only an observed claim, and what is an inference about causation or responsibility?

The design rule for this layer is strict:

> **Do not store causality as if it were an observed fact.**

NOEONE should preserve enough immutable evidence and temporal context for many later causal, responsibility, legal, actuarial, or human judgments without collapsing them into one universal blame score.

## 1. What standards can already tell us

### Intent -> delegation -> authorization -> action

The September 2026 revision of `An Architecture for Auditing Agent Delegation and Interactions` links user intent, delegation, time-varying authorization, agent actions, and service-side execution outcomes across administrative domains. It treats audit context as a correlation layer and explicitly separates records produced by users, agents, services, and auditors.

Sources:
- https://datatracker.ietf.org/doc/draft-kuehlewind-audit-architecture/
- https://www.ietf.org/archive/id/draft-kuehlewind-audit-architecture-01.html

NOEONE should ingest or reference this material, not replace it.

### CAN / WHO / WHAT / AUDIT are composable but not equal to CAUSE

`Agent Accountability: Composition and Conformance` decomposes an accountable agent action into independently verifiable questions such as whether the agent could act, which accountable human/principal authorized it, what the agent did, and whether enforcement/audit records conform.

Source:
- https://datatracker.ietf.org/doc/draft-mih-sato-agent-accountability-composition/

That composition still does not establish that a later real-world outcome was caused by one actor, nor how responsibility should be divided among several actors.

### Action receipts prove a statement, not downstream reality

The SCITT AI-agent action-receipt profile makes a deliberately narrow claim: a signed receipt can prove that an issuer recorded an action/principal/policy/verdict payload and that the payload was not modified. It explicitly does not prove that recorded inputs were true, the agent was correct, or a claimed downstream real-world consequence occurred.

Source:
- https://datatracker.ietf.org/doc/draft-noa-scitt-ai-agent-receipt/01/

NOEONE therefore needs a separate object for an externally evidenced outcome.

### Cryptographic performance is not contractual satisfaction

The September 2026 ADRP draft is explicit that a valid cryptographic proof bundle is not the same thing as contractual satisfaction. Dispute resolution is a separate state machine and can preserve the original evidence while adding later rulings/overrides.

Sources:
- https://datatracker.ietf.org/doc/draft-stone-adrp/
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-adrp-01.html

This supports NOEONE's append-only institutional model: later disagreement must not rewrite the original observation.

## 2. Provenance is not responsibility

W3C PROV already distinguishes entities, activities, agents, derivations, usage, association, delegation, and broad influence. Importantly, provenance relations describe how artifacts/activities are connected; they do not automatically answer normative blame.

Sources:
- https://www.w3.org/TR/prov-o/
- https://www.w3.org/TR/prov-constraints/

NOEONE should borrow this discipline. A graph edge such as `derived from`, `associated with`, or `followed` is not automatically `caused by`.

## 3. Causal responsibility is still research, not infrastructure truth

`Responsibility in Multi-Agent Sequential Decision-Making` compares several formal actual-causality responsibility definitions with human judgments and finds that no single formal method consistently matches human responses. Human judgments also depend on factors such as the information available to each agent.

Source:
- https://arxiv.org/abs/2608.04318

`Counterfactual Reasoning for Causal Responsibility Attribution in Probabilistic Multi-Agent Systems` develops a different formal approach using counterfactual responsibility and Shapley-value allocation.

Source:
- https://arxiv.org/abs/2605.13077

The conclusion for NOEONE is architectural, not philosophical:

> responsibility assessments must be versioned, method-specific, append-only claims over an immutable evidence graph.

Two assessments may disagree and both remain historically valid records of what their evaluators concluded.

## 4. Economic value of trace + outcome history

Trace-economic underwriting research shows why preserving action-level history and observed losses may become economically valuable. One 2026 study maps agent traces to economic exposure/loss labels and reports a large reduction in pricing error plus lower tail risk when controls condition on trace history.

Source:
- https://arxiv.org/abs/2606.16465

Related actuarial-agent work treats side-effect-bearing actions as the unit at which authority and risk can be priced and emphasizes replayable, deterministic boundaries rather than an LLM judge.

Sources:
- https://arxiv.org/abs/2605.25632
- https://arxiv.org/abs/2605.26508
- https://arxiv.org/abs/2606.16326

NOEONE should not become an insurer. It should preserve the longitudinal evidence substrate insurers, regulators, researchers, courts, operators, and counterparties can use with their own models.

## 5. Three-layer consequence model

The first production consequence graph should have three conceptually separate layers.

### Layer A — AuthorityExercise

An `AuthorityExercise` is a historical statement about one actor action:

- persistent actor ID;
- optional execution ID that performed the action;
- leaf authority grant ID;
- source evidence artifact ID;
- action + resource + optional value/currency;
- exact action time;
- deterministic `COVERED` / `NOT_COVERED` evaluation under NOEONE-recorded authority at that time;
- request digest;
- authority-chain snapshot digest;
- evaluator version;
- immutable reasons and metadata.

This is not a claim that the action was wise, legal in every jurisdiction, or causally responsible for later outcomes.

### Layer B — ConsequenceObservation

A `ConsequenceObservation` records an externally evidenced outcome without asserting cause:

- consequence kind;
- evidence artifact;
- optional source authority exercise;
- optional commitment;
- occurrence time;
- optional economic magnitude;
- external framework/reference;
- immutable metadata and idempotency identity.

Examples:

- payment settled;
- refund issued;
- database table became unavailable;
- customer claim opened;
- contract deliverable accepted;
- loss of $5,000 recorded;
- robot collision sensor event observed.

The wording is deliberately `observation`, not `fact caused by Actor X`.

### Layer C — ConsequenceAttribution

A `ConsequenceAttribution` is an append-only assessment relating a persistent actor to a consequence observation.

It records:

- actor ID;
- consequence ID;
- assessment type (for example `causal`, `responsibility`, `contractual`, `financial`);
- disposition: `SUPPORTED`, `NOT_SUPPORTED`, `INDETERMINATE`, or `DISPUTED`;
- method + method version;
- evaluator identity;
- optional normalized score in basis points;
- optional evidence supporting the assessment;
- deterministic basis digest;
- immutable metadata + idempotency key.

NOEONE never overwrites an earlier attribution because a later evaluator disagrees.

## 6. Why the temporal snapshot matters

Suppose:

```text
10:00 grant active
10:30 actor purchases
11:00 grant revoked
12:00 purchase causes/relates to a loss claim
```

The 10:30 `AuthorityExercise` must continue to verify against the grant state at 10:30. The loss at 12:00 is a separate `ConsequenceObservation`. A causal or legal link between the purchase and loss is a separate `ConsequenceAttribution` or later relation assessment.

This prevents three dangerous collapses:

1. current authorization state rewriting historical authorization;
2. action evidence being mistaken for outcome evidence;
3. outcome correlation being mistaken for causal responsibility.

## 7. Authority-chain snapshot digest

An authority exercise must commit to more than a list of grant IDs. Its deterministic chain snapshot should include, for every grant in root -> leaf order:

- grant ID and subject actor;
- parent grant ID;
- grantor identity class/reference;
- action/resource scopes;
- redelegation depth;
- value/currency cap;
- not-before / expiry;
- all lifecycle transitions at or before the exercise timestamp.

Arrays should be canonicalized and timestamps normalized. The snapshot is hashed using the same canonical JSON discipline used elsewhere in NOEONE.

If somebody later inserts a back-dated authority transition or mutates immutable grant data, re-verification should fail rather than silently produce a new historical answer.

## 8. Execution-time binding

If an `executionId` is recorded on an authority exercise, NOEONE must verify that:

- the execution belongs to the actor;
- it started at or before `exercisedAt`;
- it had not ended before `exercisedAt`.

This lets an actor migrate models later while preserving which concrete execution performed an earlier action.

## 9. Consequence-attribution boundary

NOEONE should support multiple attribution methods without privileging one globally.

Examples:

```text
outcome-17
  <- actor A / method=actual-causality-v2 / SUPPORTED / 7200 bps
  <- actor A / method=human-panel-v1      / DISPUTED  / null
  <- actor B / method=shapley-v1          / SUPPORTED / 2800 bps
  <- operator / future institutional ruling
```

The graph can therefore answer:

- which evidence exists;
- what action happened;
- what authority covered it;
- what outcome was observed;
- which evaluators attributed what share/role and by which method.

It does **not** pretend there is one universal scalar called `blame`.

## 10. Privacy boundary

Detailed action/resource/value fields may contain commercially sensitive or personal information. Public canonical actor events should carry only privacy-safe identifiers and digests by default:

- exercise ID;
- coverage state;
- exercised timestamp;
- evidence ID;
- request digest;
- chain digest;
- evaluator version.

Similarly, public attribution events should contain only consequence ID, assessment type, disposition, method/version, optional normalized score, and basis digest. Raw evidence/metadata stays privileged.

## 11. V1 invariants

1. An authority exercise is immutable and idempotent.
2. Its evidence must already be bound to the actor.
3. Its leaf grant must belong to the actor.
4. Coverage is recomputed at `exercisedAt`, never from current projected grant status.
5. Execution IDs, when supplied, must have been live for that actor at the action time.
6. Request and authority-chain digests must verify deterministically later.
7. Consequence observations are evidence-backed and immutable.
8. Consequence observations never assert causality by themselves.
9. Attribution assessments are append-only and may disagree.
10. Attribution score, when present, is bounded to 0..10000 basis points but is never a universal trust/blame score.
11. Forked actors do not inherit exercises or attributions automatically.
12. Model/runtime migrations preserve prior exercises/attributions because both attach to persistent actor IDs.

## 12. Verification surface

`verifyAuthorityExercise(id)` should check:

- actor/evidence binding;
- leaf grant ownership;
- temporal authority reconstruction;
- stored coverage vs recomputed coverage;
- request digest;
- authority-chain digest;
- execution-time binding;
- canonical actor event binding.

`verifyConsequenceState(actorId)` should check structural integrity of every attribution bound to that actor:

- consequence exists;
- optional supporting evidence exists;
- deterministic basis digest matches;
- score bounds hold;
- canonical actor event exists.

Verification proves record integrity and deterministic derivation. It does not prove that a causal method is philosophically or legally correct.

## 13. Experiments unlocked

### Revocation-after-action

Record a covered exercise, revoke the root grant afterward, and verify that the historical exercise stays `COVERED` while a later identical exercise becomes `NOT_COVERED`.

### Model migration

Record an exercise under one execution, migrate the actor to another model/runtime, then verify the old exercise still resolves to the same persistent actor and original execution.

### Conflicting attribution

Store two valid assessments of the same consequence using different methods/evaluators and opposing dispositions. NOEONE must preserve both without changing the underlying observation.

### Multi-actor allocation

Associate several actors with one consequence under one Shapley/counterfactual assessment method. The method may produce scores summing to 10000, but the database does not globally require this because other methods need not be exhaustive allocations.

### Underwriting export

Export an actor's privacy-authorized sequence of authority exercises + observed economic outcomes to an external risk model. NOEONE remains the evidence/history layer, not the pricing engine.

## 14. Strategic consequence

The long-term graph becomes:

```text
principal intent
      -> authority grant/delegation
      -> temporal AuthorityExercise
      -> independently evidenced ConsequenceObservation
      -> one or more ConsequenceAttributions
      -> commitment/dispute/ruling/compensation later
```

This graph survives model commoditization because its value is not intelligence. It is the durable mapping of **which continuing actor acted, under what authority, what the world recorded afterward, and which institutions or methods later attributed responsibility**.

That is a stronger 2050 asset than a model leaderboard or agent directory, because better models create more consequential autonomous actions rather than eliminating the need for attributable history.
