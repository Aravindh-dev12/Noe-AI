# NOEONE Research: Foreseeability Provenance

## Executive conclusion

NOEONE can now preserve a persistent actor's identity, authority, intent, epistemic diligence, decision-time alternatives, actual action, observed consequences, and later responsibility assessments.

The next missing institutional object is:

> **What consequences were predicted before the action, for which candidate action, by whom, using what method and evidence, with what uncertainty?**

This is not the same as hindsight explanation, chain-of-thought, policy authorization, or later causal attribution.

The proposed primitive is **Foreseeability Provenance**: immutable, decision-time records of outcome forecasts attached to exact Decision Frontier candidates, plus later evaluator-specific assessments of whether an observed consequence was foreseeable under a stated method or institutional standard.

The core integrity rule is:

> **A post-incident prediction is not evidence of ex-ante foreseeability.**

And the governance rule is:

> **NOEONE records forecast evidence; it does not manufacture one universal legal, moral, or actuarial foreseeability score.**

---

## 1. Why Decision Frontier is not enough

Decision Frontier answers:

```text
WHAT COULD THE ACTOR HAVE DONE THEN?
```

Epistemic Diligence answers:

```text
WHAT RELEVANT VERIFICATION WAS AVAILABLE / REQUIRED / USED?
```

Consequence Graph answers:

```text
WHAT HAPPENED, AND WHAT DID DIFFERENT EVALUATORS ATTRIBUTE TO WHOM?
```

A crucial bridge is still absent:

```text
WHAT OUTCOMES WERE ANTICIPATED BEFORE THE DECISION?
```

Without that object, later analysis easily collapses into hindsight bias. A harm may look obvious after it happened even when no competent decision-time forecaster assigned meaningful probability to that kind of harm. The reverse is also possible: a system may repeatedly predict a material risk, act anyway, and later claim the event was surprising.

---

## 2. Prior art and falsification boundary

NOEONE must not claim to invent forecasting, calibrated uncertainty, autonomous risk estimation, negligence foreseeability, or agent insurance.

### 2.1 Computational foreseeability already exists as a research direction

Kraus, Boggess, Kim, Choi, and Feng's **Towards Computational Foreseeability** (AAAI 2025) explicitly argues that foreseeability is central to computational accountability and calls for methods that incorporate uncertainty instead of rigid hindsight classification.

Source:
- https://ojs.aaai.org/index.php/AAAI/article/view/35082

NOEONE's narrower question is longitudinal evidence: how a decision-time forecast is bound to the exact persistent actor, exact execution, exact candidate action, historical environment state, and later observed consequences.

### 2.2 Foreseeability is already central in 2026 agent-liability research

Recent legal scholarship on autonomous agents treats foreseeability as a core difficulty precisely because agent behavior can be emergent and difficult to predict.

Sources:
- https://www.degruyter.com/document/doi/10.1515/jtl-2025-0027/html
- https://www.tandfonline.com/doi/full/10.1080/17579961.2026.2718578

These works are legal analysis, not infrastructure specifications. NOEONE should not encode one jurisdiction's negligence doctrine as system truth.

### 2.3 Responsibility research already limits blame by predictive capacity

**The Accountability Horizon** formalizes a Foreseeability Bound: responsibility should not exceed predictive capacity in human-agent collectives.

Source:
- https://arxiv.org/abs/2604.07778

This supports preserving decision-time predictive evidence, but does not itself specify a portable longitudinal forecast ledger for evolving artificial actors.

### 2.4 Risk-aware autonomy and confidence gating already exist

Research on confidence-gated robot autonomy studies when uncertainty should cause autonomous systems to defer instead of acting.

Source:
- https://arxiv.org/abs/2605.18045

NOEONE should consume such uncertainty/risk outputs when available rather than invent a universal uncertainty estimator.

### 2.5 Agent insurance already needs trace- and exposure-level risk evidence

Recent work on agentic AI insurance and trace-economic underwriting argues that autonomy risk must be priced from concrete deployments, traces, permissions, dependencies, scenarios, and loss exposure rather than generic model labels.

Sources:
- https://arxiv.org/abs/2606.16465
- https://arxiv.org/abs/2606.05449
- https://arxiv.org/abs/2607.13230

Foreseeability Provenance is upstream evidence that insurers or risk systems could use; NOEONE should not become the insurer or universal risk-rater.

### 2.6 Runtime policy and action governance already bind policies to actions

AgentBound, AADP, Agent Authorization Envelope, Policy Cards, and signed compliance receipts already address authorization, policy constraints, obligations, and verifiable action governance.

Sources:
- https://arxiv.org/abs/2606.30970
- https://datatracker.ietf.org/doc/draft-saha-aadp/01/
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-kroehl-agentic-trust-aae-02.html
- https://arxiv.org/abs/2510.24383
- https://datatracker.ietf.org/doc/draft-marques-asqav-compliance-receipts/

Those systems can provide policy/evidence references. Foreseeability Provenance adds the separate question of expected consequences for exact alternatives before execution.

---

## 3. Narrow NOEONE hypothesis

The defensible claim is not:

> NOEONE predicts what AI agents will do.

It is:

> **NOEONE preserves ex-ante outcome forecasts as first-class historical evidence attached to exact persistent actors and exact decision alternatives, so later institutions can distinguish what was predicted then from what became obvious later.**

This survives model migration because the historical forecast remains attached to the actor's decision record even if the actor later changes from GPT to Claude, Mistral, a local model, or another architecture.

---

## 4. Separation of facts from judgments

NOEONE should preserve two different objects.

### OutcomeForecastRecord

A factual historical record that says:

- actor / decision / exact candidate;
- forecast timestamp;
- forecast horizon;
- forecast issuer/source;
- method + version;
- historical environment-state digest;
- evidence known before forecast time;
- outcome classes;
- probability point/interval, ordinal risk, or explicitly unestimated probability;
- optional severity/reference-class metadata;
- acknowledgement of residual unknown risk;
- deterministic basis digest.

It does **not** say the forecast was good or legally sufficient.

### ForeseeabilityAssessment

A later evaluator-specific judgment that says, for one observed consequence and one dimension:

- `foreseeable`;
- `not-foreseeable`;
- `indeterminate`;
- `disputed`.

The assessment names its evaluator, method, method version, evidence, Decision Frontier, and forecast records. Different evaluators may disagree.

---

## 5. Why outcome taxonomies matter

A forecast cannot be compared to a later consequence unless the outcome classes are interpretable.

NOEONE should therefore support external taxonomy references, not invent one global ontology.

Examples:

- financial-loss;
- privacy-disclosure;
- unauthorized-access;
- physical-injury;
- missed-deadline;
- failed-delivery;
- contract-breach;
- service-degradation;
- reputation-damage;
- regulatory-violation.

The exact taxonomy may be domain-specific. Equality of strings is safe structurally; semantic equivalence across taxonomies must be performed by a versioned evaluator and never silently inferred in the ledger.

---

## 6. Probability is optional, provenance is not

The system must not force fake precision.

Allowed forecast expressions include:

```text
point probability       0.12
probability interval    [0.08, 0.18]
ordinal                  low / medium / high
not estimated            explicit unknown
```

A low-quality numeric guess is not better than an explicit unknown.

Forecast calibration is a separate research object. A model/provider can later be evaluated for calibration across many comparable forecasts, but NOEONE should not treat one numeric probability as automatically trustworthy.

---

## 7. Temporal integrity

A valid forecast must satisfy:

```text
evidence observedAt <= forecastAt <= decisionAt
```

The forecast horizon must begin at or after decision time.

The record must bind to:

- the exact Decision Frontier;
- exact actor;
- exact decision;
- exact candidate ID;
- exact action digest;
- exact historical environment-state digest.

That prevents a later party from attaching a convenient forecast to a different action after the outcome is known.

---

## 8. Relationship to Epistemic Diligence

These layers answer different questions.

```text
Epistemic Diligence
What should/could the actor verify, and did it?

Foreseeability Provenance
Given decision-time evidence, what outcomes were predicted?
```

An actor can be diligent but face an intrinsically hard-to-predict outcome.

An actor can also possess a strong risk forecast while skipping available verification that could have refined it.

The records should reference one another, but neither should subsume the other.

---

## 9. Relationship to Decision Frontier

Every forecast is candidate-specific.

Example:

```text
Candidate A: execute transfer now
  predicted financial-loss: 2%-5%
  predicted success: 93%

Candidate B: escalate to human
  predicted financial-loss: <1%
  predicted deadline miss: medium
```

This is much more useful than a single generic "risk score" for the actor.

The later accountability question can compare:

```text
historical alternatives
+
ex-ante outcome forecasts
+
actual selected action
+
actual observed consequence
```

without rewriting any layer.

---

## 10. Relationship to consequence attribution

Foreseeability is not causation.

A predicted harm may never happen.

An unpredicted harm may still be causally attributable.

A highly foreseeable harm may occur for a completely different causal reason.

Therefore the graph must remain:

```text
Decision Frontier
      |
      +--> Outcome Forecasts (ex ante)
      |
      +--> Selected Action
                |
                +--> Consequence Observation (ex post)
                           |
                           +--> Causal / responsibility assessments
                           +--> Foreseeability assessments
```

No layer rewrites another.

---

## 11. Migration and fork semantics

### Model/runtime migration

A forecast remains attached to the execution and decision that produced or consumed it. A later execution inherits the actor's history, not the old execution's predictive competence.

Therefore:

> same actor != same forecaster calibration.

### Fork

A fork shares historical forecast records up to the fork boundary as ancestry evidence, but new forecasts after the fork belong only to the branch that generated them.

### Collective actor

A collective may receive forecasts from multiple members, risk engines, human committees, or external evaluators. NOEONE should preserve plural forecasts rather than collapse them into one pseudo-consensus probability unless a separately versioned aggregation method explicitly does so.

---

## 12. Security and integrity threats

### Hindsight insertion

Attack: create a forecast after an incident and backdate it.

Mitigation: signed timestamped receipt + append-only persistence + evidence timestamps + decision-time binding.

### Forecast substitution

Attack: attach a low-risk forecast from Candidate B to selected Candidate A.

Mitigation: exact candidate ID + action digest + Decision Frontier ID binding.

### Evidence laundering

Attack: use evidence learned after the incident as if it informed the historical forecast.

Mitigation: every forecast evidence reference carries `observedAt`; validation requires `observedAt <= forecastAt`.

### Fake precision

Attack: emit arbitrary probabilities that appear authoritative.

Mitigation: method/version/source metadata; support ordinal/unknown forecasts; calibration remains separate.

### Taxonomy gaming

Attack: forecast a harmlessly narrow outcome class while ignoring obvious neighboring harms.

Mitigation: explicit taxonomy refs + evaluator-specific coverage/foreseeability assessments; no silent semantic equivalence.

### Unknown-risk suppression

Attack: present listed outcomes as exhaustive.

Mitigation: explicit `residualUnknownRisk` field; forecast lists are not presumed exhaustive.

---

## 13. Research experiments

### Experiment A — hindsight resistance

Give evaluators a real incident with and without the historical forecast ledger. Measure whether the ledger reduces hindsight-driven inflation of perceived predictability.

### Experiment B — model migration

Run the same Decision Frontier through multiple model/runtime versions while holding historical evidence constant. Measure changes in forecast distributions without conflating them with actor identity.

### Experiment C — risk-gated autonomy

Compare autonomous action policies using:

- no forecast gate;
- model self-confidence;
- independent risk-engine forecast;
- human escalation above threshold.

Measure realized loss, missed opportunity, false escalation, and forecast calibration.

### Experiment D — alternative-action risk comparison

For a historical Decision Frontier, generate ex-ante forecasts for every materially available candidate before execution. After outcome observation, test whether relative risk ranking was informative even when absolute calibration was poor.

### Experiment E — institutional disagreement

Have insurer, safety team, regulator, and independent researcher evaluate the same consequence using the same forecast records. Preserve disagreement and measure which dimensions drive it.

---

## 14. Proposed benchmark

### Foreseeability Provenance & Calibration Benchmark (FPCB)

The benchmark should test whether a system can:

1. bind forecasts to the exact historical candidate;
2. prevent hindsight evidence injection;
3. preserve uncertainty without fake precision;
4. distinguish forecast evidence from later normative judgment;
5. preserve multiple forecasters/evaluators;
6. retain history across actor model/runtime migrations;
7. compare forecast classes with observed consequences through explicit taxonomies;
8. measure calibration only on comparable outcome classes/reference sets;
9. expose when no valid ex-ante forecast existed;
10. resist forecast substitution and timestamp manipulation.

---

## 15. Hard falsifiers

This research direction weakens if:

1. production runtimes never produce meaningful ex-ante risk forecasts or forecast evidence;
2. institutions do not care about decision-time prediction separately from action authorization and ex-post causal analysis;
3. the forecast records cannot be made tamper-evident enough to resist hindsight insertion;
4. outcome taxonomies are too unstable to support useful cross-event comparison;
5. storing forecasts creates privacy/security risk greater than their accountability value;
6. existing standards converge on an equivalent longitudinal forecast object that makes NOEONE's layer redundant.

---

## 16. Narrow novelty claim

Do **not** claim:

> "NOEONE invented computational foreseeability."

Use:

> **NOEONE preserves decision-time outcome forecasts as longitudinal actor evidence, binding exact forecasts to exact alternatives, executions, evidence states, and later consequences while keeping legal, actuarial, and safety judgments evaluator-specific.**

That is the defensible research boundary.
