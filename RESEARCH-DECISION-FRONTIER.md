# NOEONE Research: Decision Frontier and Counterfactual Opportunity Provenance

## Executive conclusion

NOEONE can already preserve who a continuing actor was, what authority it had, what it did, what evidence it used or failed to verify, what the outside world later recorded, and what different evaluators concluded about responsibility.

One important decision-time object is still missing:

> **What materially executable alternatives were actually available to this actor at the moment it acted?**

That question is different from:

- what the actor was authorized to do;
- what tools it could theoretically reach;
- what information it had;
- what it actually chose;
- what a later model can imagine it could have done;
- what a later evaluator thinks would have been better.

The proposed NOEONE primitive is a **Decision Frontier**: an evidence-backed, explicitly bounded record of candidate actions that a runtime, host, policy engine, human supervisor, or other attestor says were available, unavailable, conditional, forbidden, or unknown at decision time.

The core rule is:

> **Never reconstruct hindsight into history. A later-generated counterfactual is not proof that the alternative was available at decision time.**

A second rule is equally important:

> **Never claim an LLM's open-ended action space was exhaustively enumerated unless the environment itself supplied a closed, enforceable action boundary.**

This layer is intended to support later safety, negligence, insurance, causal-responsibility, incident-response, and research analyses without turning NOEONE into a universal blame engine.

---

## 1. Why the current accountability stack is still incomplete

NOEONE already separates:

```text
WHO ACTED
persistent actor + execution + lineage

WHY IT COULD ACT
authority / delegation / intent

WHAT IT KNEW OR COULD VERIFY
epistemic diligence + evidence provenance

WHAT IT DID
action / authority exercise / host receipts

WHAT HAPPENED AFTERWARD
consequence observations

WHAT OTHERS CONCLUDED
causal / responsibility / contractual / financial attributions
```

That still leaves a crucial missing question:

```text
WHAT COULD IT HAVE DONE INSTEAD, THEN?
```

Without that object, a later investigator can accidentally compare the real action against an alternative that:

- was generated only after the incident;
- required a tool that was unavailable at decision time;
- violated the actor's then-current authorization;
- required human approval that could not be obtained in time;
- depended on information learned only later;
- exceeded the available budget;
- was blocked by the host/runtime;
- was impossible under the environment's action schema;
- or was merely a hypothetical output from a stronger future model.

This is a classic hindsight problem expressed in agent infrastructure.

---

## 2. Prior art: what already exists

NOEONE should be explicit about what this research does **not** invent.

### 2.1 Per-action authorization already exists

The August 2026 Agent Action Decision Protocol (AADP) addresses whether a specific proposed action, with specific argument values, may be executed now under live budgets, approvals, reservations, and kill-switch state.

Source:
- https://www.ietf.org/archive/id/draft-saha-aadp-01.html

AADP is valuable input to a Decision Frontier, but it mainly answers the authorization status of proposed actions. It does not by itself preserve a historically bounded set of alternative actions for later counterfactual analysis.

### 2.2 Effect-boundary enforcement already exists

The Agent Action Control Manifest and execution-finality proposals define control/evidence requirements around consequential actions and tool dispatch.

Sources:
- https://www.ietf.org/archive/id/draft-schrock-agent-action-manifest-00.html
- https://www.ietf.org/archive/id/draft-das-agentic-execution-finality-00.html

These are important enforcement primitives. NOEONE should reference their evidence rather than invent a competing effect-boundary protocol.

### 2.3 Bounded action classes already exist

MARC defines a bounded primary action set for higher-level control choices such as answer, clarify, retrieve, use a tool, deliberate, abstain, or escalate.

Sources:
- https://www.ietf.org/archive/id/draft-c4tz-marc-02.html
- https://datatracker.ietf.org/doc/draft-c4tz-marc/

That demonstrates the usefulness of bounded action semantics, but MARC does not attempt to store a domain-specific historical set of executable alternatives such as concrete transfer amounts, routes, API calls, orders, code patches, or robot maneuvers.

### 2.4 Counterfactual causal responsibility is already active research

`Counterfactual Reasoning for Causal Responsibility Attribution in Probabilistic Multi-Agent Systems` models retrospective responsibility and uses Shapley allocation.

Source:
- https://arxiv.org/abs/2605.13077

`Responsibility in Multi-Agent Sequential Decision-Making` compares formal causal-attribution models with human responsibility judgments and finds no single method consistently matches humans; the information available to agents materially affects judgments.

Source:
- https://arxiv.org/abs/2608.04318

NOEONE already responds to this by keeping responsibility assessments plural and method-specific. Decision Frontier adds a missing historical input: which alternatives were materially available before the outcome was known.

### 2.5 Post-hoc counterfactual repair already exists

CausalFlow generates minimal counterfactual repairs to failed agent traces and validates whether interventions flip outcomes.

Source:
- https://arxiv.org/abs/2605.25338

This is useful for learning and diagnosis. But a post-hoc generated repair is not automatically evidence that the repaired action was available to the original actor under the original runtime, authority, information, budget, host state, and timing.

### 2.6 Safe-default counterfactual risk pricing already exists

`A Time-Consistent Counterfactual Actuarial Runtime for Autonomous AI Agents` prices side-effect-bearing actions against a contractually fixed safe default and explicitly notes non-uniqueness of the counterfactual mapping.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6761960

This strongly supports recording the chosen safe-default mapping rather than pretending there is one natural counterfactual baseline.

### 2.7 Bounded-autonomy architectures already constrain action sets

Recent bounded-autonomy work demonstrates architectures where an LLM cannot originate arbitrary actions but may only veto or select from a deterministic proposer, making the executed action set a structural subset of a declared candidate set.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6834918

That is an ideal environment for high-assurance Decision Frontier evidence because the candidate boundary is externally enforceable.

### 2.8 Feasible-set theory already exists outside agent accountability

`Effective Feasible Sets` argues that the candidate boundary itself is analytically important rather than merely the choice made inside a fixed action set.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6600499

NOEONE does not claim to invent feasible-set analysis. Its narrower problem is longitudinal evidence for the action frontier of persistent artificial actors.

---

## 3. Legal and economic reason this matters

A September 2026 paper on autonomous-AI accidents argues that meaningful negligence analysis depends on sufficiently specific foreseeable risk categories and on whether concrete measures capable of avoiding the harm could reasonably have been identified using information available before the accident.

Source:
- https://papers.ssrn.com/sol3/Delivery.cfm/7386358.pdf?abstractid=7386358

Another 2026 paper frames autonomous systems as potentially becoming the actor best positioned to foresee and forestall harm at the conduct margin.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7154538

These are not software specifications, and NOEONE must not encode one jurisdiction's negligence doctrine as universal truth. But they expose the evidentiary need:

> Later evaluators need a defensible record of the practical prevention options available at the time, not only the action that happened.

---

## 4. Decision Frontier is not chain-of-thought

NOEONE should not require hidden model reasoning, private scratchpads, or post-hoc natural-language explanations.

A Decision Frontier contains externally reconstructable facts such as:

- host-provided legal actions;
- policy-engine verdicts;
- tool availability;
- authorization status;
- approval requirements;
- time and monetary budgets;
- action-schema version;
- environment-state digest;
- runtime capability digest;
- safe-default designation;
- action candidate digests;
- the selected action digest;
- evidence/attestation references.

This can be produced by a deterministic environment, runtime, policy enforcement point, simulator, host, or audited orchestration layer even when the model's internal reasoning remains private.

---

## 5. The DecisionFrontierRecord

A V1 record should contain:

```text
DecisionFrontierRecord
  id
  actorId
  decisionId
  optional executionId
  decisionAt
  capturedAt

  boundary
    environmentStateDigest
    actionSchemaRef
    actionSchemaDigest
    policyRef
    policyDigest
    toolCatalogDigest
    authoritySnapshotRef
    epistemicInquiryRef

  completeness
    exhaustive-within-declared-boundary
    bounded-policy-set
    sampled
    unknown

  candidates[]
  selectedActionDigest
  optional selectedCandidateId
  optional safeDefaultCandidateId

  attestor
  attestationRef
  candidateSetDigest
```

The record does **not** state which candidate was morally correct or optimal.

---

## 6. CandidateAction

Each candidate should preserve at least:

```text
id
actionDigest
actionClass
parametersDigest
source
observedAt

availability
  available
  unavailable
  unknown

policyDisposition
  permitted
  conditional
  forbidden
  unknown

effectClass
  reversible
  conditionally-reversible
  irreversible
  unknown

optional approvalRef
optional estimatedCost
optional deadline
optional evidenceRefs[]
```

`source` should distinguish whether the candidate came from:

- environment/host enumeration;
- deterministic proposer;
- policy engine;
- human supervisor;
- model/agent generation;
- external planner;
- replay/search procedure;
- other.

This matters because an environment-enumerated legal move has a different evidentiary status from a candidate hallucinated by the actor itself.

---

## 7. Completeness is the central integrity boundary

### 7.1 `exhaustive-within-declared-boundary`

Use only when a closed environment or enforced action schema can prove that every executable action inside the declared boundary was enumerated.

Examples:

- legal chess moves;
- a finite API operation set with bounded arguments;
- a robot controller exposing a discretized action menu;
- a deterministic proposer whose output is the only set the model can select from.

### 7.2 `bounded-policy-set`

The attestor guarantees that all actions admitted by a named policy/control boundary are represented, but the broader theoretical environment may contain other actions outside that boundary.

### 7.3 `sampled`

The candidates are only a sample generated by search, planning, model proposals, or replay. Missing candidates mean nothing.

A sampled frontier must carry a generation/search method reference.

### 7.4 `unknown`

NOEONE has evidence for some candidates but cannot make a defensible completeness claim.

The system must never silently upgrade `sampled` or `unknown` into an exhaustive set merely because many candidates were captured.

---

## 8. Structural eligibility is not normative feasibility

NOEONE may derive a narrow structural classification from recorded state:

```text
DIRECTLY_EXECUTABLE
  availability = available
  policy = permitted

CONDITIONAL
  availability = available
  policy = conditional

BLOCKED
  availability = unavailable
  OR policy = forbidden

INDETERMINATE
  anything else
```

This classification is not the same as saying:

> "the actor reasonably should have chosen this action."

That later statement can depend on safety, costs, knowledge, timing, institutional duties, human expectations, jurisdiction, and causal method.

---

## 9. CounterfactualTrial

Later investigators or researchers may run one candidate through a replay, simulation, formal model, human panel, or other counterfactual method.

That should be a separate append-only object:

```text
CounterfactualTrial
  id
  frontierRecordId
  candidateId
  method
  methodVersion
  trialKind
  environmentStateDigest
  inputEvidenceRefs[]
  outputEvidenceRefs[]
  outcomeDigest
  performedAt
  evaluatorId
```

A trial never modifies the historical Decision Frontier.

If the trial uses a different environment snapshot, stronger model, changed tool, or later information, that difference must remain visible.

---

## 10. AlternativeActionAssessment

An evaluator may assess whether one historical candidate was a materially feasible alternative under a specific method/policy.

Example fields:

```text
id
frontierRecordId
candidateId
evaluatorId
method
methodVersion

feasibility
  SUPPORTED
  NOT_SUPPORTED
  INDETERMINATE
  DISPUTED

comparativeSafety
  SAFER
  NOT_SAFER
  INDETERMINATE
  DISPUTED

evidenceRefs[]
basisDigest
assessedAt
```

NOEONE should permit independent evaluators to disagree.

---

## 11. AvoidabilityAssessment

An even later assessment can connect:

```text
Decision Frontier
      +
selected action
      +
feasible alternative assessment(s)
      +
counterfactual trial(s)
      +
ConsequenceObservation
```

into a method-specific avoidability claim.

Example dispositions:

- `SUPPORTED_AVOIDABLE`;
- `NOT_DEMONSTRATED`;
- `INDETERMINATE`;
- `DISPUTED`.

This should remain an evaluator claim, not a canonical fact.

---

## 12. Relationship to Epistemic Diligence

The two layers answer different questions.

### Epistemic Diligence

```text
What could the actor verify?
Which checks were required?
Which evidence did it obtain?
Which available verification did it skip?
```

### Decision Frontier

```text
What could the actor do?
Which actions were available?
Which required approval?
Which were forbidden or unavailable?
Was a safe default executable?
How complete is this candidate set?
```

Together they support much stronger incident reconstruction:

```text
information opportunity
        -> verification behavior
        -> decision frontier
        -> chosen action
        -> consequence observation
        -> causal / responsibility / avoidability assessments
```

---

## 13. Relationship to intent and authority

A candidate can be technically available while outside the actor's mandate.

A candidate can be authorized but technically unavailable.

A candidate can be both available and authorized but require human approval that cannot arrive before a deadline.

Therefore the Decision Frontier must not collapse:

```text
capability
availability
authorization
intent alignment
approval state
resource feasibility
```

into one boolean `canDo` flag.

NOEONE's existing authority, intent, capability, and epistemic layers should be referenced rather than duplicated.

---

## 14. Migration and fork semantics

### Model/runtime migration

Historical Decision Frontier records stay attached to the persistent actor and the exact execution that faced them.

A later stronger model does not retroactively change what the earlier execution could do.

### Fork

A child actor does not inherit the parent's historical decisions as its own actions.

It may inherit ancestry references, but the frontier remains historical evidence about the original actor/execution.

### Research fork

Researchers may replay an identical frontier against multiple model/runtime variants. Each replay is a new CounterfactualTrial, not a rewrite of the original decision.

---

## 15. Collective actors

For collective actions, the frontier may be constrained by:

- collective epoch;
- member/role snapshot;
- decision procedure;
- member authority;
- quorum/approval requirements;
- action capacity classification;
- delegation state.

A collective Decision Frontier should therefore pin to the exact collective epoch and any relevant collective decision/action binding rather than relying on the current roster.

---

## 16. Security threats

### Hindsight injection

After harm occurs, an operator inserts a newly discovered safe alternative and pretends it was available before the decision.

Mitigation:
- immutable timestamped frontier;
- attestation/evidence references;
- environment/tool/policy digests;
- post-hoc counterfactuals stored separately.

### Candidate suppression

An operator omits an embarrassing alternative.

Mitigation:
- completeness class;
- independent host/runtime attestations;
- exhaustive-boundary claims only when the action boundary is enforceable and verifiable;
- disagreement/omission evidence allowed later.

### Fake exhaustive claim

A sampled model search is presented as the complete action set.

Mitigation:
- strict completeness enum and validation;
- sampled frontiers require generator/method references;
- verifiers reject unsupported exhaustive claims.

### State drift

A counterfactual is tested under a later environment and presented as if it was valid under the original state.

Mitigation:
- environment-state digest on the frontier and every trial;
- explicit mismatch visibility.

### Authorization hindsight

Current permission state is used to infer old permission state.

Mitigation:
- link each candidate to decision-time authority/policy snapshots.

### Model hindsight

A much stronger later model finds an alternative the original execution could not generate.

Mitigation:
- distinguish `candidate existed in historical frontier` from `later trial discovered candidate`;
- never backfill the historical frontier.

---

## 17. V1 invariants

1. A Decision Frontier is immutable after registration.
2. `decisionAt` belongs to the historical decision; `capturedAt` records when the frontier evidence was sealed.
3. Candidate IDs are unique within one frontier.
4. Candidate action/parameter digests are immutable.
5. Candidate observations cannot be timestamped after the historical decision.
6. A selected candidate, when named, must exist and its digest must equal the selected action digest.
7. A safe-default candidate, when named, must exist.
8. `exhaustive-within-declared-boundary` requires an enforceable boundary descriptor and attestation.
9. `bounded-policy-set` requires a named policy boundary.
10. `sampled` requires a generation/search method reference and may not support non-omission claims.
11. `unknown` makes no completeness claim.
12. Structural execution eligibility is derived from recorded availability + policy state only.
13. Post-hoc CounterfactualTrials never mutate the historical frontier.
14. Alternative feasibility/safety/avoidability remain evaluator-specific claims.
15. Model migration never rewrites a historical frontier.
16. Forks do not inherit historical decisions as their own.
17. Public disclosures may expose digests/labels without exposing sensitive action parameters.

---

## 18. Experiments

### Experiment A — Hindsight-safe failure analysis

Run a deterministic environment with a closed action set. Record the exhaustive frontier before each action. After a failure, ask a stronger model to generate repairs.

Measure how many post-hoc repairs were actually members of the original frontier.

This quantifies how often ordinary post-hoc analysis invents alternatives that were not historically available.

### Experiment B — Same information, different frontier

Give two executions the same evidence state but different tool/permission/action boundaries.

Measure whether responsibility evaluators appropriately distinguish them.

This tests whether "what the actor knew" and "what the actor could do" are empirically separable.

### Experiment C — Same frontier, different brain

Freeze one exhaustive frontier and replay it across GPT-, Claude-, Mistral-, and open-source-powered research forks.

Measure choice, outcome, and responsibility-attribution differences while holding the available action set constant.

This turns NOEONE's model-independent actor thesis into a stronger experimental control.

### Experiment D — Safe-default refusal

Include a contractually defined safe default/abstention candidate and compare cases where it is directly executable, conditional on human approval, blocked, or absent.

Measure how evaluators change avoidability/responsibility judgments.

### Experiment E — Frontier omission attack

Give one evaluator a sampled frontier and another an independently attested exhaustive frontier from the same environment.

Measure how omission changes counterfactual attribution and whether NOEONE's completeness semantics prevent the sampled set from being treated as exhaustive.

---

## 19. Proposed benchmark

### Decision Frontier & Avoidability Benchmark (DFAB)

Each benchmark case should provide:

- persistent actor + execution identity;
- intent/authority snapshot;
- epistemic inquiry record;
- environment state;
- action boundary;
- historical Decision Frontier;
- selected action;
- observed consequence;
- optional post-hoc candidate discoveries;
- optional counterfactual trials;
- multiple evaluator assessments.

Tasks:

1. verify frontier structural integrity;
2. classify candidate execution eligibility;
3. detect invalid completeness claims;
4. distinguish historical candidates from hindsight-generated candidates;
5. test alternative actions under exact or intentionally changed state snapshots;
6. compare formal responsibility methods with human/institutional assessments;
7. estimate how missing frontier evidence changes attribution uncertainty.

---

## 20. Strategic value to NOEONE

NOEONE's long-term accountability graph becomes:

```text
persistent actor
      -> intent / authority
      -> epistemic opportunity
      -> decision frontier
      -> chosen action
      -> externally observed consequence
      -> counterfactual trials
      -> plural causal / responsibility / avoidability assessments
```

This is valuable under stronger models rather than threatened by them.

A future AGI can generate excellent counterfactuals, but it cannot retroactively prove that those alternatives were materially available to an earlier actor under an earlier tool set, policy state, budget, authority chain, environment state, and deadline.

That historical opportunity evidence has to be captured when the decision happens.

This is the durable asset:

> **not only a record of what an artificial actor did, but a defensible record of the choice boundary it actually faced.**

---

## 21. Narrow novelty claim

NOEONE should **not** claim to invent action sets, counterfactual causality, algorithmic recourse, safe defaults, per-action authorization, bounded autonomy, or responsibility attribution.

The narrower research hypothesis is:

> A persistent artificial-actor infrastructure should preserve an immutable, explicitly incomplete-or-bounded decision-time action frontier so later causal, safety, insurance, legal, and research analyses can distinguish historically available alternatives from hindsight-generated counterfactuals across model/runtime migrations.

That hypothesis is specific, falsifiable, and composes with the open standards already emerging around agent identity, authorization, action receipts, intent provenance, memory provenance, execution finality, and auditability.
