# NOEONE Research: Consequence Reception and Corrective-State Continuity

## Research question

NOEONE already records a continuing actor's canonical lineage, evidence, delegated authority, decisions, oversight opportunity, consequences, claims, remedies, and control state.

The next question is narrower and more difficult:

> When a consequence has been credibly attached to a persistent artificial actor, how can a corrective condition remain attached to that **same continuing actor** across model/runtime migrations, while still allowing evidence-based repair, review, appeal, expiry, and restoration?

This is not an attempt to make a language model "feel punishment." It is an institutional continuity problem.

## 1. Why ordinary reputation is insufficient

Two 2026 papers make the problem unusually sharp.

### Consequence reception

Hu & Rong, **Some[Body] Must Receive That Pain for Agent Accountability** (2026), argues that attribution alone does not create an effective accountability loop. If the producing system can be swapped, copied, reset, or discarded without a continuing locus that accumulates consequences, later sanctions may fail to shape the relevant future actor.

Source: https://arxiv.org/abs/2605.16872

NOEONE does not claim that an external registry creates intrinsic machine experience or internal learning. The useful engineering interpretation is narrower:

- a continuing actor can be the stable institutional subject of restrictions and repair obligations;
- those conditions can survive replacement of the current model/runtime;
- downstream enforcement systems can query that state before granting authority;
- restoration can require explicit evidence and authorized transition rather than a silent reset.

### Reputation preconditions and agent fungibility

**Dissociative Identity: Language Model Agents Lack Grounding for Reputation Mechanisms** (FAccT 2026) argues that reputation assumes conditions such as persistent identity, behavioral continuity, memory, observability, sanction sensitivity, costly identity, and social learning. Current LLM agents can violate several of these assumptions because personas, memories, runtimes, and models are cheaply replaceable.

Source: https://arxiv.org/abs/2605.30169

This is a direct falsification pressure on NOEONE. A score such as `trust = 87` would not solve it. The architecture must instead preserve independently enforceable institutional state around an actor whose cognition can change.

## 2. What already exists and must not be reinvented

### Credential lifecycle and revocation

The W3C Agent Identity Registry Protocol Community Group explicitly includes credential revocation and lifecycle management.

Source: https://www.w3.org/groups/cg/agent-identity/

NOEONE should consume/refer to those credentials. It should not invent a competing credential revocation standard.

### Per-action authorization and kill switches

The Agent Action Decision Protocol (AADP) is explicitly aimed at per-action authorization under mutable state such as budgets, approvals, reservations, and kill switches.

Source: https://datatracker.ietf.org/doc/draft-saha-aadp/

Products such as Sanction also act as independent authorization planes for spend, tools, credentials, provisioning, and capability acquisition.

Source: https://github.com/ericlovold/sanction

NOEONE should not become another policy engine.

### Agent incident response

AIR and related work already attacks detection, containment, recovery, and recurrence prevention for unsafe agent behavior.

Source: https://arxiv.org/abs/2602.11749

NOEONE should not become an incident-response orchestrator.

### Claims, remedies, and legal dispute machinery

NOEONE already models claims, adjudication decisions, and remedy orders, while external legal/dispute/payment systems can issue their own artifacts. The registry should preserve and bind these outcomes without pretending to be a universal court.

## 3. The specific gap NOEONE can own

Existing systems can answer questions such as:

- Is this credential revoked?
- May this particular action execute now?
- Should this incident be contained?
- Did a court/arbitrator order a remedy?

NOEONE's layer is different:

> **Which corrective conditions now belong to this continuing artificial actor, and what must happen before those conditions may legitimately change?**

That is a longitudinal binding problem.

A model migration should not do this:

```text
Actor A / model X
  active restriction
        |
        | swap model
        v
Actor A / model Y
  restriction disappeared   <- invalid
```

It should do this:

```text
Actor A / model X
  active restriction
        |
        | governed migration
        v
Actor A / model Y
  same actor-level corrective state
```

A fork is deliberately different:

```text
Actor A -- ancestry --> Actor B
```

Actor B does not silently inherit Actor A's sanctions, liabilities, or restoration rights merely because internal state was copied. Any cross-actor transfer must be explicit and evidenced.

## 4. Proposed primitive: Consequence Reception Record

A V1 record is an **externally authorized corrective condition bound to one actor**.

Suggested structure:

```text
ConsequenceReceptionRecord
  id
  actorId
  sourceConsequenceId?
  sourceAttributionId?
  sourceClaimId?
  sourceRemedyId?
  sourceEvidenceArtifactId

  kind
    RESTRICTION
    REMEDIATION
    PROBATION
    SUSPENSION
    DISCLOSURE

  status
    ACTIVE
    SATISFIED
    LIFTED
    SUPERSEDED

  scope
    actions[]
    resources[]
    capabilities[]
    environmentRefs[]

  termsDigest
  restorationCriteriaDigest?
  effectiveAt
  reviewAt?
  expiresAt?

  issuedByType
  issuedByRef
  authorityEvidenceRef

  migrationPolicy = CARRY_WITH_ACTOR
  forkPolicy = DO_NOT_INHERIT

  idempotencyKey
  metadata
```

The object does **not** assert that a consequence attribution is objectively true. It records that a particular authorized issuer imposed a particular corrective condition on a particular actor, based on named evidence.

## 5. Corrective-state transitions

Corrective state is append-only through explicit transitions:

```text
ACTIVE
  |
  +--> SATISFIED
  +--> LIFTED
  +--> SUPERSEDED
```

A transition records:

- exact previous status;
- exact new status;
- evidence artifact;
- deciding principal;
- reason;
- timestamp;
- idempotency key;
- canonical ActorEvent.

### Restoration is not deletion

When an actor satisfies remediation, the original corrective record remains historical evidence.

```text
restriction imposed
      |
      v
ACTIVE
      |
repair evidence
      |
      v
SATISFIED / LIFTED
```

The history must continue to show both events.

## 6. V1 invariants

1. **Actor-level attachment.** Corrective state attaches to `actorId`, never only to a transient execution/model ID.
2. **Migration carry-over.** A governed migration does not alter active corrective state.
3. **No fork laundering.** A new actor created by research fork does not automatically inherit the parent's corrective state or restoration status.
4. **Evidence required.** Creating a corrective state requires an immutable evidence artifact.
5. **Source integrity.** If a source consequence/attribution/claim/remedy is referenced, it must exist and be consistent with the actor where the domain permits such verification.
6. **Issuer explicitness.** NOEONE preserves which principal imposed the condition; it does not collapse multiple issuers into one global truth score.
7. **Semantic idempotency.** Replaying the same idempotency key with different semantic content is a conflict.
8. **Append-only transitions.** Status changes never rewrite the original issuance facts.
9. **No silent restoration.** Model/runtime changes, memory resets, or owner changes do not lift corrective state.
10. **Evidence-based restoration.** `SATISFIED` should require evidence proving completion of stated remediation/restoration conditions; `LIFTED` requires explicit authorized decision evidence.
11. **Temporal enforcement.** A restriction is active only inside its valid effective interval and before a terminal transition.
12. **Plural authority.** Multiple corrective records from different issuers may coexist; NOEONE does not pretend one automatically cancels another.
13. **No universal punishment score.** Consumers may derive their own policy from the evidence and active records.
14. **Compatibility first.** Existing identity, authorization, credential, and incident-response systems remain enforcement/execution providers rather than being reimplemented.

## 7. Enforcement boundary

NOEONE should expose **corrective state**, not become the only enforcement point.

```text
NOEONE persistent actor
        |
        +---- active corrective state
        |
        v
external authorization / host / payment / tool system
        |
        +---- allow
        +---- deny
        +---- reduce scope
        +---- require human approval
```

For NOEONE's own authority evaluation, a narrowly scoped integration is justified: an active `SUSPENSION` or matching `RESTRICTION` can make an `AuthorityExercise` not covered. That demonstrates the institutional loop without claiming that NOEONE replaces external policy engines.

## 8. Threat model

The primitive must resist:

- **model-reset laundering** — swapping the model to escape corrective state;
- **runtime-reset laundering** — rebuilding execution state while keeping valuable history but dropping restrictions;
- **fork laundering** — moving reputation to a descendant while ambiguity hides the damaged source identity;
- **unauthorized lifting** — actor/owner self-removes a restriction without issuer authority;
- **stale lifting** — an old restoration decision overwrites a newer corrective condition;
- **scope confusion** — a restriction on one resource is incorrectly treated as universal, or vice versa;
- **issuer equivocation** — an issuer produces conflicting corrective instructions;
- **evidence substitution** — restoration is justified with evidence unrelated to the imposed condition;
- **perpetual sanction by accident** — no review/expiry/restoration path when the policy intended one;
- **hindsight rewriting** — historical restriction facts are edited after a later dispute;
- **identity collision** — corrective state is attached to a similar clone instead of the canonical actor;
- **double counting** — repeated imports create duplicate active conditions;
- **policy-engine lock-in** — NOEONE starts inventing another proprietary authorization protocol instead of exposing portable state.

## 9. Research hypotheses

### H1: migration persistence

If an actor migrates GPT -> Claude while a corrective state is active, counterparties querying NOEONE should observe the same active corrective condition before and after migration.

### H2: restoration integrity

An actor cannot regain unrestricted state merely by changing cognition. Restoration requires the evidence and authority specified by the corrective lifecycle.

### H3: fork distinction

A fork should remain visibly descended from the source actor without automatically inheriting either its sanctions or its cleared/restored status.

### H4: institutional usefulness

Hosts, insurers, researchers, and enterprise authorization systems should find a typed history of corrective conditions more useful than a single aggregate reputation score.

### H5: consequence coupling

When corrective state is queried by authorization systems, a persistent actor becomes meaningfully more sanction-sensitive at the institutional layer even if the underlying model itself is replaceable.

## 10. Kill criteria

This layer is not worth owning if:

1. emerging identity standards already standardize actor-level, cross-runtime corrective obligations with equivalent longitudinal semantics;
2. counterparties only care about current credentials and never about historical/remedial state;
3. model/runtime replacement legitimately resets all relevant obligations in the dominant legal/economic structures;
4. corrective state cannot be made portable without every host adopting a proprietary NOEONE policy engine;
5. the data merely duplicates claim/remedy records without adding actor-continuity semantics;
6. issuers will not provide authoritative evidence for restoration/restriction transitions.

## 11. Implementation boundary for this branch

The first implementation should be intentionally narrow:

- pure core record + transition invariants;
- database persistence with foreign-key integrity and semantic idempotency;
- canonical actor events for issuance and transition;
- point-in-time active-state projection;
- migration persistence test;
- fork non-inheritance test;
- privileged research/admin API;
- verifier for record/transition consistency;
- optional internal authority-coverage hook for suspension/restriction, only after the projection is proven correct.

It should **not** add:

- a universal trust/reputation number;
- autonomous punishment generation;
- a payment rail;
- credential revocation protocol;
- incident-response automation;
- a universal legal adjudicator;
- automatic transfer of sanctions between related actors.

## 12. Long-term significance

If autonomous agents become more capable, the model layer may become cheaper and more interchangeable while actions become more consequential. A fresh model invocation can be smarter than yesterday's actor but it cannot legitimately erase yesterday's obligations merely by being smarter.

That gives NOEONE a durable long-term object:

> **the continuing institutional subject to which consequences, restrictions, repair, and restoration remain attributable even when cognition changes.**

That is the research hypothesis this branch should now test in code.
