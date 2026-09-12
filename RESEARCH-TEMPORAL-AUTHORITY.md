# NOEONE Research: Temporal Authority and Exercise Provenance

## Core problem

NOEONE now records persistent authority grants and monotonic delegation chains. That is sufficient for answering **what authority exists now**, but it is not sufficient for historical accountability.

A later revocation must not rewrite the meaning of an earlier action.

```text
10:00 grant becomes effective
10:30 actor purchases item
11:00 principal revokes grant
```

At 12:00 the actor is no longer authorized to purchase. But the 10:30 action was performed while the recorded authority chain was effective. Any audit system that checks only the grant's current `REVOKED` projection will incorrectly rewrite history.

The next NOEONE primitive is therefore:

> reconstruct authority **as of an action time**, then bind externally evidenced actions to the exact persistent actor and authority chain that covered them.

## Research basis

### IETF agent auditing architecture

The May 2026 Internet-Draft `An Architecture for Auditing AI Agent Delegation and Interactions` separates user intent, agent actions, delegation, authorization transitions, and service execution outcomes. It treats authorization as time-evolving state and proposes reconstructing the authority in force at a point in a run from ordered authorization-transition records.

Source: https://datatracker.ietf.org/doc/draft-kuehlewind-audit-architecture/00/

Implication: NOEONE should not judge a historical action from today's materialized grant status. It should replay the append-only authority lifecycle up to the action timestamp.

### Agent Operation Authorization

The OAuth `Agent Operation Authorization` draft separates an operation proposal from a confirmed fine-grained authorization token and is explicitly aimed at auditable autonomous-agent delegation.

Source: https://datatracker.ietf.org/doc/draft-liu-agent-operation-authorization/

Implication: NOEONE should reference external authorization artifacts rather than inventing another operation token.

### Delegation Receipt Protocol / HDP / DAAP

Multiple 2026 proposals encode human-to-agent and multi-hop delegation chains, scope, time windows, revocation, and auditability.

Sources:
- https://www.ietf.org/archive/id/draft-nelson-agent-delegation-receipts-09.html
- https://ftp.kaist.ac.kr/ietf/draft-helixar-hdp-agentic-delegation-02.html
- https://www.ietf.org/archive/id/draft-mishra-oauth-agent-grants-00.html

Implication: NOEONE's value is not the token format. It is the durable mapping from those changing artifacts to a continuing actor and its long-term history.

### Bounded Agents / Agentic Principal Chain

`Bounded Agents` argues that delegated authority must be enforced outside the model, narrowed monotonically, and evaluated against accumulated state rather than individual requests in isolation.

Source: https://arxiv.org/abs/2608.15888

Implication: NOEONE's authority graph is an audit/continuity substrate, not the sole runtime policy-enforcement point. Runtime enforcement should remain external to the model and can consume NOEONE decisions or external policy engines.

### Responsibility attribution remains plural

2026 work on responsibility in sequential multi-agent systems finds that no single formal responsibility rule consistently matches human judgments, while other work explores counterfactual/Shapley allocation.

Sources:
- https://arxiv.org/abs/2608.04318
- https://arxiv.org/abs/2605.13077

Implication: NOEONE should preserve the causal/authority evidence graph and avoid declaring one universal blame score.

## Strategic boundary

The standards ecosystem can provide:

```text
authorization token / mandate / receipt
service-side action record
payment proof
host receipt
transparency record
```

NOEONE should answer:

```text
Which continuing actor performed the evidenced action?
Which authority grant chain existed at that exact time?
Did the recorded chain cover this action/resource/value at that time?
What immutable evidence supports the observation?
Did later migration/revocation/fork change the historical answer?
```

## Temporal authority evaluation

Authority is reconstructed from append-only lifecycle transitions.

For each grant in a root -> leaf chain, evaluate at timestamp `t`:

1. an opening transition must exist at or before `t`;
2. no revocation transition may exist at or before `t`;
3. `notBefore <= t`;
4. `expiresAt` must be null or greater than `t`;
5. requested action/resource/value must fit every grant in the chain;
6. child scope must remain a valid attenuation of its parent.

A revocation after `t` does not invalidate the historical decision.

Current-state evaluation is simply temporal evaluation at `now`.

## AuthorityExercise

An `AuthorityExercise` binds an independently evidenced action to a persistent actor and an authority decision at the time of action.

Fields in v1:

- persistent actor ID;
- leaf authority grant ID;
- source evidence artifact ID;
- action/resource requested;
- optional amount/currency;
- action timestamp (`exercisedAt`);
- evaluation result: `COVERED` or `NOT_COVERED` by NOEONE-recorded authority;
- deterministic authority-chain digest;
- deterministic request digest;
- evaluator version;
- idempotency key;
- immutable creation timestamp.

The source evidence artifact must already be bound to the actor. This stops an arbitrary third-party receipt from being attached to the wrong actor solely because its digest is known.

## Semantics of COVERED

`COVERED` means:

> Given NOEONE's recorded authority graph and lifecycle transitions, the referenced grant chain covered this exact action/resource/value at `exercisedAt`.

It does **not** mean:

- the action was wise;
- the external evidence is objectively true;
- the principal legally authorized the action under every jurisdiction;
- the action caused a later outcome;
- NOEONE has assigned liability.

Those questions remain separate.

## Why NOT_COVERED is not universal guilt

A `NOT_COVERED` result may mean:

- the grant had not started;
- it had expired or been revoked;
- the requested scope exceeded the recorded grant;
- a parent grant was ineffective;
- NOEONE lacks an external authority artifact that exists elsewhere.

So public language must say `outside recorded authority`, not `illegal`, `fraudulent`, or `unauthorized in law`.

## Immutability rule

An exercise is a historical snapshot and is append-only.

Later events may add:

- validator judgments;
- dispute evidence;
- reversal/compensation records;
- court/arbitration outcomes;
- causal-analysis artifacts.

They do not rewrite the original exercise row.

## Canonical actor history

Each exercise appends a privacy-safe actor event:

`actor.authority.exercise.recorded`

The public canonical event carries only:

- exercise ID;
- grant ID;
- `COVERED` / `NOT_COVERED`;
- exercised time;
- evidence artifact ID;
- request digest;
- authority-chain digest;
- evaluator version.

Raw resource/action strings and monetary details remain privileged.

## Continuity semantics

### Migration

If Actor A migrates GPT -> Claude after an action, its prior exercise remains attached to Actor A and verifies against authority as of its original action time.

### Revocation

Revocation affects future/current effective authority but not earlier historical exercises.

### Fork

A fork creates Actor B. Actor B receives ancestry only. It does not inherit Actor A's grants or exercises.

### Evidence

The action evidence remains an independent artifact. NOEONE records how it is bound to the actor and authority exercise; it does not turn provenance into objective truth.

## Verification

`verifyAuthorityState(actorId)` should eventually distinguish:

- structural integrity of grant/transition history;
- current effective grant count;
- historical exercise integrity.

A new exercise verifier checks:

1. source evidence remains bound to the actor;
2. leaf grant belongs to the actor;
3. authority chain can be reconstructed;
4. temporal evaluation recomputes to the stored decision;
5. request digest matches the privileged request fields;
6. authority-chain digest matches the reconstructed chain;
7. canonical actor event exists with the expected type/source key.

## Experiments unlocked

### Revocation-after-action test

Record a covered action, revoke authority afterward, then reverify. The historical action must remain `COVERED` while a later identical action becomes `NOT_COVERED`.

### Model-migration test

Exercise authority, migrate the actor's model/runtime, and reverify the exercise. The decision remains attached to the actor rather than the old execution.

### Delegated-action attribution

Principal -> Actor A -> Actor B. Actor B performs an evidenced action. NOEONE reconstructs the root-to-leaf authority chain and stores its digest for later audit.

### Fork test

Fork Actor A after an exercise. Descendant Actor B has ancestry but zero inherited exercises or authority.

### Responsibility research

Combine authority exercises with later evidence/commitment outcomes. Researchers can compare causal responsibility methods without NOEONE collapsing them into one blame score.

## Next layer after this

Once temporal exercise provenance is stable, NOEONE can build a **consequence graph** linking:

```text
principal intent
  -> authority chain
  -> actor action
  -> external outcome evidence
  -> commitment transition / dispute
  -> downstream consequence
```

That graph is the natural substrate for risk analysis, underwriting, incident reconstruction, and future institutional accountability.
