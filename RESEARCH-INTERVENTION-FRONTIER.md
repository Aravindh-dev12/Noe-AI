# NOE Research: Intervention Frontier and Oversight Opportunity Provenance

## Research question

NOE already preserves a historical Decision Frontier: what actions were materially evidenced as available to an artificial actor at decision time. It also preserves decision-time verification opportunities, outcome forecasts, the selected action, later consequences, and plural responsibility/foreseeability assessments.

A different question remains:

> Before an action or effect became practically irreversible, what intervention was materially available to an authorized overseer, what did that overseer actually know in time, what control could they actually exercise, and what happened to that opportunity?

This document calls the ex-ante object an **Intervention Frontier** and the broader evidence layer **Oversight Opportunity Provenance**.

The distinction is deliberate:

```text
Decision Frontier
What could the actor have done?

Intervention Frontier
What could an authorized overseer have done before effect finality?
```

The goal is not to compute a universal "human control score." The goal is to preserve reconstructable historical facts so different regulators, insurers, operators, researchers, courts, or safety evaluators can apply their own standards later.

---

## 1. Prior art: what NOE must not claim to invent

### Human escalation protocols already exist

The IETF Internet-Draft *The Human Escalation Mechanism (HEM) for Agentic AI Systems* defines a governed escalation lifecycle. A governing component can put an agent session into `HEM_PENDING`, route a request to designated human principals, block further transitions, process human decisions, and handle timeout behavior.

Sources:
- https://datatracker.ietf.org/doc/draft-sato-soos-hem/
- https://mailarchive.ietf.org/arch/msg/i-d-announce/kvDPDe4Tkt9V5lMNQmu1delbyj4/

NOE must therefore not claim to invent escalation, pause-for-approval, timeout handling, or human override protocols.

### Governance audit records already exist

The IETF *Governance Audit Record (GAR)* draft specifies auditable evidence for governed agent sessions, including escalation-related records and regulator-oriented audit packages.

Source:
- https://datatracker.ietf.org/doc/draft-sato-soos-gar/

NOE must not claim to invent human-override logging or general agent governance audit trails.

### Execution-finality enforcement already exists as an active design direction

The 2026 *Execution-Finality for Agentic AI Tool Dispatch* work separates a candidate tool act from an externally effective act and proposes protected enforcement before a high-risk operation becomes real.

Sources:
- https://www.ietf.org/archive/id/draft-das-agentic-execution-finality-00.html
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-das-agentic-execution-finality-02.html

NOE should treat enforcement/finality components as evidence issuers. It should not become another tool-dispatch authorization kernel.

### Meaningful human control is an established research field

Recent work emphasizes that human presence is not enough. Effective oversight requires understanding, evaluative ability, actual intervention power, and suitable allocation of human and machine agency. Current agentic-AI research also identifies latency, re-engagement, operator workload, and distributed supervision as practical constraints.

Sources:
- https://link.springer.com/article/10.1007/s43681-026-01147-7
- https://link.springer.com/article/10.1007/s11023-026-09783-y
- https://arxiv.org/abs/2606.05391
- https://arxiv.org/abs/2512.22154
- https://journals.sagepub.com/doi/full/10.1177/10711813261475191

NOE must not claim to invent meaningful human control or the concept that nominal oversight can become rubber-stamping.

### Regulation already requires real intervention capability in some contexts

EU AI Act Article 14 requires high-risk AI systems to support human oversight appropriate to the relevant risks, including the ability to understand limitations, monitor operation, disregard/override/reverse outputs, intervene, or interrupt the system through safe procedures.

Source:
- https://eur-lex.europa.eu/eli/reg/2024/1689/oj

NOE should preserve evidence useful to such oversight regimes without claiming that a NOE record itself establishes legal compliance.

---

## 2. The narrower NOE hypothesis

Existing systems are increasingly able to prove facts such as:

- an escalation was invoked;
- a human approved, rejected, redirected, deferred, or terminated;
- a runtime had an emergency-stop primitive;
- an audit log was produced;
- a policy required approval;
- a tool call was held before final execution.

Those facts do not by themselves answer the historical opportunity question.

Examples:

1. A human was formally assigned but received the alert after the payment settled.
2. A supervisor received an alert in time but lacked authority to stop the transaction.
3. A stop button existed but the affected action bypassed that enforcement domain.
4. A supervisor had authority and a stop mechanism but only two seconds to review a complex 500-page transaction context.
5. An alert was timely, but the information needed to recognize the danger was unavailable until after finality.
6. A valid intervention window existed, the supervisor acknowledged it, and explicitly approved the act.
7. A required escalation path was technically available but the actor/runtime bypassed it.
8. A later auditor invents a hypothetical human intervention that was never technically possible at decision time.

NOE's narrower hypothesis is:

> Longitudinal actor infrastructure should preserve the exact historical control opportunity around consequential decisions, bound to the continuing actor, exact execution, exact decision, exact action/effect boundary, and later consequences.

This is **opportunity provenance**, not a new escalation protocol.

---

## 3. Intervention Frontier

An `InterventionFrontierRecord` is immutable evidence about an oversight window around one historical decision.

It binds:

- the persistent actor;
- the exact decision;
- the exact Decision Frontier;
- the exact selected action digest;
- the historical execution, if known;
- the point at which the intervention window opened;
- the latest time an intervention could still change the relevant effect;
- the oversight requirement/policy basis;
- the designated overseer and evidence of that identity/assignment;
- the information actually available to the overseer and when it became available;
- the notice/delivery/acknowledgement timeline;
- the concrete intervention controls available;
- the no-response fallback;
- the attestor and evidence basis for the record.

A record is allowed to show **bad oversight**. Validation must not reject a frontier merely because the notice was late, the overseer never acknowledged it, or the control set was empty. Those are historically important facts.

---

## 4. Effect finality is the boundary, not merely decision time

An actor may decide at `T0` while the external effect becomes irreversible at `T1`.

```text
T0                    T1
|---------------------|
decision              effect finality
       ^
       intervention may still be possible here
```

For some actions `T0 ~= T1`; for others there is a settlement, deployment, publication, commit, approval, cancellation, or rollback window.

The Intervention Frontier therefore stores `windowOpenedAt` and `interventionDeadlineAt` separately from `decisionAt`.

The deadline is not asserted to be metaphysically exact. It is an attested operational boundary supplied by the host/runtime/enforcement system and must carry provenance.

---

## 5. Intervention controls are concrete, not generic

Possible control classes include:

- `approve`
- `veto`
- `pause`
- `stop`
- `modify`
- `substitute`
- `escalate`
- `revoke-authority`
- `rollback`

Each control must identify:

- the authority artifact that permitted the overseer to use it;
- the enforcement component or mechanism expected to make it effective;
- the time range in which the control was available;
- the scope of effect through a digest/reference;
- evidence references.

A UI button called "Stop" is not evidence of effective control unless the record also identifies the enforcement boundary to which it applied.

---

## 6. Information availability is separate from control availability

A person may technically be able to stop an action but lack the decision-relevant information needed to know whether stopping is appropriate.

The record therefore separates:

```text
control availability
from
information availability
```

The information bundle includes its digest, availability time, and evidence references. It can reference:

- the Decision Frontier;
- NOE Epistemic Diligence records;
- NOE Outcome Forecasts;
- policy/risk outputs;
- host state;
- explanation artifacts;
- third-party evidence.

NOE stores the external facts, not private chain-of-thought.

---

## 7. Notice and acknowledgement are separate facts

An oversight requirement can exist without the designated overseer ever seeing it.

The record distinguishes:

- notice issued;
- notice delivered;
- notice acknowledged;
- delivery status;
- channel/evidence.

A notice delivered after the intervention deadline remains valid historical evidence. It is classified as late; it must not be rewritten into a timely notice or rejected from the record.

---

## 8. Actual interventions are separate immutable records

`InterventionAttemptRecord` records an actual attempt against an existing Intervention Frontier.

It includes:

- overseer principal;
- selected control kind;
- attempt time;
- completion time if known;
- outcome (`succeeded`, `failed`, `rejected`, `too-late`, `partially-effective`);
- attestation/evidence;
- basis digest.

Rules include:

1. the control kind must exist in the referenced Intervention Frontier;
2. actor and decision IDs must match;
3. the acting overseer must match the recorded overseer unless a separately evidenced delegation/substitution is supplied in a later version;
4. a `succeeded` intervention cannot be recorded after its control availability window or after the intervention deadline;
5. an attempt that begins after the intervention deadline cannot claim success;
6. completion cannot precede attempt time;
7. an attempt never rewrites the original frontier.

---

## 9. Later assessment is plural

`OversightEffectivenessAssessment` is an evaluator-specific ex-post judgment.

Dimensions may include:

- `timeliness`
- `information-sufficiency`
- `authority`
- `technical-control`
- `operator-capacity`
- `overall-opportunity`

Dispositions:

- `meaningful`
- `nominal`
- `unavailable`
- `indeterminate`
- `disputed`

Two evaluators may disagree. NOE preserves both assessments.

NOE must not collapse them into one universal score.

---

## 10. Structural facts are allowed; normative scoring is not

NOE can safely compute reconstructable facts such as:

- intervention-window duration;
- whether notice was delivered before deadline;
- whether information was available before deadline;
- whether at least one concrete control was available before deadline;
- whether acknowledgement occurred before deadline;
- whether an actual successful intervention occurred before deadline.

It may expose deficiencies such as:

- `late-notice`
- `no-delivered-notice`
- `late-information`
- `no-effective-control`
- `no-acknowledgement`
- `control-window-closed`
- `unknown-effect-finality`

Those are structural statements. Whether that amounted to negligent, compliant, reasonable, or meaningful oversight belongs to a versioned evaluator or external institution.

---

## 11. Relationship to existing NOE primitives

```text
Epistemic Diligence
What should/could the actor verify, and did it?
        |
        v
Decision Frontier
What could the actor do?
        |
        +----> Outcome Forecasts
        |
        v
Selected Action
        |
        +----> Intervention Frontier
        |       What could an overseer still do before effect finality?
        |                 |
        |                 +----> Intervention Attempts
        |
        v
Consequence Observation
        |
        +----> Causal / responsibility assessments
        +----> Foreseeability assessments
        +----> Oversight effectiveness assessments
```

Each layer is append-only evidence. No later layer rewrites an earlier one.

---

## 12. Migration, fork, and collective semantics

### Model/runtime migration

An Intervention Frontier remains attached to the execution and decision at which it existed. A later model/runtime migration does not improve or erase the old oversight opportunity.

### Fork

A fork can inherit the historical record as ancestry up to the fork boundary, but post-fork intervention opportunities belong to the branch on which they occur.

### Collective actor

A collective may have multiple human or artificial supervisors and governance roles. V1 records one designated overseer per frontier. Later versions may support ordered or quorum-based oversight groups using NOE's collective actor primitives rather than inventing a parallel membership system.

---

## 13. Threat model

The system must resist or expose:

- **hindsight oversight fabrication** — creating a supposedly ex-ante opportunity after the consequence is known;
- **late-notice laundering** — recording a post-finality alert as timely;
- **phantom authority** — naming a supervisor who had no authority over the relevant effect;
- **phantom stop control** — claiming a stop mechanism that did not govern the affected sink;
- **information laundering** — attaching evidence that was not available until after the deadline;
- **control substitution** — recording an intervention kind not present in the historical frontier;
- **actor substitution** — attaching another actor's oversight record to this actor;
- **decision substitution** — binding the frontier to a different selected action;
- **execution substitution** — attaching an execution that was not active at decision time;
- **post-migration rewrite** — changing historical oversight facts after model/runtime migration;
- **single-score laundering** — presenting an evaluator-specific judgment as objective system truth.

---

## 14. Proposed experiments

### A. Nominal-vs-effective oversight benchmark

Construct scenarios where the same "human in the loop" label hides different realities:

1. timely notice + real veto + adequate context;
2. timely notice + no enforceable veto;
3. late notice;
4. timely notice + stale/incomplete information;
5. two-second window for a complex decision;
6. alert acknowledged and explicitly approved;
7. required escalation bypassed.

Test whether existing audit approaches distinguish them and whether NOE records support reliable later reconstruction.

### B. Oversight-latency replay

Keep actor/model/decision fixed and vary only delivery and decision latency. Measure effect-finality misses and how often a nominal control becomes unusable.

### C. Operator-load experiment

Hold technical controls fixed while changing the number of simultaneous actors supervised by one operator. This tests whether "control exists" diverges from practical supervisory capacity.

### D. Migration non-retroactivity

Record a weak oversight event under one runtime, migrate the actor to a safer runtime, and verify the original event remains unchanged and attributable to the historical execution.

### E. Multi-evaluator disagreement

Have operators, insurers, auditors, and researchers independently assess the same Intervention Frontier. Preserve disagreement rather than train the system toward one universal definition of meaningful control.

---

## 15. Falsifiers

This should not become a NOE core primitive if research or product testing shows any of the following:

1. existing HEM/GAR/execution-finality standards already preserve the same longitudinal historical opportunity semantics across actors, migrations, and external consequences;
2. intervention opportunity cannot be reliably distinguished from generic audit records without speculative reconstruction;
3. real hosts cannot attest effect-finality/control availability strongly enough to make the records useful;
4. downstream users only need actual override events and do not care about missed/unexercised opportunities;
5. the object cannot be generalized beyond one narrow domain without becoming a misleading legal conclusion.

---

## 16. Narrow novelty claim

Do **not** say:

> NOE invented human oversight, escalation, override logging, intervention windows, or meaningful human control.

The defensible research hypothesis is narrower:

> NOE binds historically evidenced oversight opportunities — including unexercised, late, unavailable, or ineffective control paths — to the exact continuing artificial actor, execution, decision, selected action, effect-finality boundary, and later consequence graph across model/runtime changes.

That is the layer this implementation should test.