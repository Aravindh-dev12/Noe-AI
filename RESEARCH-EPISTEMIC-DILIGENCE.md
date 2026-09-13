# NOEONE Research Frontier: Epistemic Diligence

Status: next-depth research thesis, 2026-09-13

## Executive conclusion

NOEONE can increasingly answer:

- who the continuing artificial actor was;
- under whose authority it acted;
- which execution/model/runtime represented it;
- what intent/mandate it inherited;
- what action occurred;
- what consequences followed;
- what evidence and provenance are attached to the record;
- how recognition, obligations and institutional positions persist through change.

That is still insufficient for consequential accountability.

Two actors can take the same harmful action from the same false belief and deserve very different process assessments:

```text
Actor A
  authoritative verification unavailable
  no reasonable route to discover the error
  acts on the best evidence actually accessible

Actor B
  authoritative verification available
  policy required using it
  verification was cheap and timely
  actor skipped it
  acts on the same false belief
```

The action provenance may be identical. The memory provenance may be identical. The outcome may be identical.

The missing object is the actor's **epistemic opportunity and diligence state at decision time**.

NOEONE's next research question is therefore:

> **Can a persistent artificial actor carry verifiable evidence not only of what it believed and did, but of which relevant verification routes were available, which checks were institutionally required, which checks it attempted, and which opportunities it skipped or could not use?**

This document calls that layer **Epistemic Diligence**.

The goal is not to infer private chain-of-thought, assign moral blame, or create a universal negligence score. The goal is to preserve inspectable external facts that later evaluators can use under their own policies.

---

## 1. Why ordinary provenance is not enough

A future incident record may already contain:

```text
actor
principal / authority
model + runtime
memory provenance
retrieved evidence
policy
intent
execution trace
action receipt
outcome / consequence
```

That reconstructs much of the causal path.

But it does not necessarily answer:

```text
Was a direct authoritative check available?

Was the actor required to make that check for this risk class?

Did the runtime expose the check to the actor?

Did the actor try it?

Did the check fail or time out?

Was human escalation available?

Was contradictory evidence known before the decision?

Were time, money, network, or tool-access constraints material?
```

These questions matter because responsibility and process quality are sensitive to **what could reasonably have been known**, not only to what was actually consumed.

---

## 2. Strong prior art: execution and evidence provenance already exist

NOEONE must not claim to invent execution provenance.

The 2026 survey *From Agent Traces to Trust: Evidence Tracing and Execution Provenance in LLM Agents* models retrieved evidence, tool outputs, memory, environment observations, claims, actions and final answers as connected provenance objects. It explicitly frames provenance as a foundation for process-level accountability.

Source:
- https://arxiv.org/abs/2606.04990

OWASP's Agent Observability Standard similarly extends OpenTelemetry/OCSF for agent-specific tracing, including tool execution, knowledge retrieval, multi-agent collaboration and decision context.

Source:
- https://aos.owasp.org/spec/trace/

Therefore this is already occupied:

> "Record the agent's execution trace and the evidence it used."

---

## 3. Strong prior art: reasoning/decision-basis records already exist

The 2026 Agent Execution Record research proposes structured reasoning provenance with intent, observations, inferences, evidence chains, plans and verdicts.

Source:
- https://arxiv.org/abs/2603.21692

AgentAction already exposes a production-oriented **Decision Assurance** surface with normalized decision evidence covering policy factors, alternatives, assumptions, uncertainty and supporting evidence without requiring hidden chain-of-thought.

Source:
- https://github.com/dinpd/AgentAction

Audicta and similar audit systems also preserve contemporaneous decision records for later reconstruction and replay.

Source:
- https://audicta.com/

Therefore NOEONE must not claim:

- first decision record for an AI agent;
- first structured decision basis;
- first evidence-aware agent audit log;
- first agent reasoning provenance system.

---

## 4. Strong prior art: `why-believed + may + did` is already explicitly specified

A July 2026 IETF Internet-Draft, *Binding Per-Action Authorization and Memory Provenance into Agent Action Capsules*, is especially important prior art.

It combines three axes:

```text
why-believed  -> memory provenance
may           -> per-action authorization
did           -> Agent Action Capsule
```

Source:
- https://datatracker.ietf.org/doc/html/draft-rampalli-scitt-capsule-provenance-binding-00

This is extremely close to a large portion of NOEONE's accountability stack.

It means NOEONE must not market the new research as:

> "We record why an agent believed something, whether it was allowed, and what it did."

That combination has explicit 2026 prior art.

The remaining question is different:

> **What relevant verification could the actor have performed before acting, and what did policy require it to do with that opportunity?**

---

## 5. The empirical clue: information availability changes responsibility judgments

The 2026 paper *Responsibility in Multi-Agent Sequential Decision-Making: Comparing Human Judgments to Formal Models of Causal Attribution* studied human responsibility judgments in multi-agent sequential scenarios.

A key result is that no single formal responsibility-attribution method consistently matched human judgments, and the **amount of information available to an agent during decision-making** significantly affected responsibility judgments.

Source:
- https://arxiv.org/abs/2608.04318

That matters for NOEONE because a causal graph alone may not capture an important institutional distinction:

```text
same action
same outcome
same triggering false belief

but

different information/verification opportunity
```

The opportunity surface can change how independent evaluators interpret the event.

---

## 6. The normative clue: proportionate epistemic diligence

The August 2026 paper *Identical errors, different responsibilities: epistemic duty in AI-assisted scientific writing* separates outcome correctness from procedural diligence.

Its argument is directly relevant even though its primary domain is human scholarly authorship: responsibility depends partly on whether verification was proportionate to the claim's importance, foreseeable consequences, available evidence and competence. It specifically argues that access to a direct authoritative means of verification normally strengthens the duty to use it.

Source:
- https://link.springer.com/article/10.1007/s43681-026-01330-w

NOEONE should not transplant that paper into an automated legal negligence rule. The useful insight is narrower:

> **availability of a verification route is itself decision-relevant evidence.**

A record of "evidence actually used" cannot represent that fact by itself.

---

## 7. Adjacent work that narrows the gap further

### Prove Before Act

The 2026 Prove Before Act draft commits an actor's intended action and declared decision basis before execution so that the basis cannot be rewritten retrospectively.

Source:
- https://provebeforeact.com/standard

This strengthens temporal integrity, but it still primarily commits what the actor says it decided/based the decision on.

### AgentAction

AgentAction records alternatives, assumptions, uncertainty and supporting evidence. This is close to the **actual inquiry path**.

NOEONE's proposed distinction is the **available-but-unused path** as attested by the runtime/host/policy environment.

### Spotter

Spotter is a developer tool that audits "missed tool calls" and can flag that a verification/docs/browser/reviewer tool could have been used but was not.

Source:
- https://github.com/kitepon/Spotter

This demonstrates the practical relevance of missed verification opportunities. It is not, however, a longitudinal institutional record tied to persistent actor identity, authority, consequences and evaluator-specific assessments.

### Success provenance

The 2026 AcquaBench work argues that outcome success alone cannot establish why an agent succeeded; evaluation should account for the information state available during the run.

Source:
- https://arxiv.org/abs/2607.24054

That is an evaluation analogue of the same broader principle: **information state changes interpretation of outcomes**.

---

## 8. The NOEONE-specific object: `DecisionInquiryRecord`

The proposed core object is not a reasoning transcript.

It is a structured external record of the decision-time inquiry environment:

```text
DecisionInquiryRecord

actorId
decisionId
executionId?
actionRef?
decisionAt
riskTier

policy
  id
  version
  digest

verification opportunities
  capability kind
  source class
  availability state
  attestor
  attestation reference
  validity window / constraints

requirements
  required capability kinds
  acceptable source classes
  acceptable opportunity attestors
  freshness requirements

attempts
  requirement
  opportunity
  completed / failed / blocked / timed-out / skipped
  evidence references

external evidence used
unresolved evidence conflicts
resource/access constraints
external evidence-bundle reference
```

The initial provider-neutral TypeScript model lives in:

- `packages/actor-core/src/epistemic-diligence.ts`

---

## 9. Critical distinction: belief provenance vs opportunity provenance

### Belief/evidence provenance

Answers:

> What evidence or memory contributed to the decision?

### Verification-opportunity provenance

Answers:

> What relevant independent/authoritative checks were actually available to the actor at that time?

These are not interchangeable.

Example:

```text
memory says:
"account balance is $1,000,000"

Bank API was available and policy required a fresh balance check.
Agent did not call it.
```

The memory provenance can be perfectly recorded while the verification process was structurally incomplete.

Conversely:

```text
same stale memory
bank API outage
human escalation unavailable
hard time limit
```

The actor may have had no usable verification path.

NOEONE should preserve the difference without itself declaring which actor was morally or legally negligent.

---

## 10. Opportunity evidence cannot be trusted solely from the actor

A dangerous implementation would ask the actor after the incident:

> "What checks were available to you?"

That is not strong evidence.

The actor could omit a skipped tool, hallucinate an unavailable tool, or reconstruct a self-serving explanation.

The initial model therefore distinguishes opportunity attestors:

```text
runtime
host
principal
external-auditor
agent-self-report
```

Policies can refuse to treat agent self-report as sufficient evidence that a check was available/unavailable.

For consequential systems, stronger evidence could come from:

- signed runtime capability snapshots;
- MCP/A2A tool manifests captured at decision time;
- host policy manifests;
- service availability/status evidence;
- authorization/capability receipts;
- network policy state;
- independent monitoring;
- pre-action policy gateways.

The exact attestation mechanism is an adapter/integration problem, not a new cryptographic invention for NOEONE core.

---

## 11. Requirements are institutional, not universal

NOEONE must not declare:

```text
"Every high-risk decision requires human review."
```

Different institutions and contexts need different verification policies.

A game, insurer, bank, research lab and robot operator may define different requirements.

The model therefore records a versioned policy:

```text
policy.id
policy.version
policy.digest
```

Each requirement defines:

- whether it is mandatory;
- which capability kinds can satisfy it;
- which source classes are acceptable;
- which opportunity attestors are acceptable;
- optional evidence freshness bounds.

The policy is part of the historical decision context.

This is essential because applying today's policy retroactively to a five-year-old decision would corrupt the historical record.

---

## 12. NOEONE should record structure, not hidden chain-of-thought

The primitive deliberately excludes private chain-of-thought.

NOEONE needs facts such as:

```text
required check: authoritative balance verification
runtime says check was available
check was not invoked
```

It does not need:

```text
"the model internally thought the bank API was probably unnecessary because..."
```

Reasons:

1. internal natural-language reasoning is not necessarily faithful;
2. storing it creates privacy/security risks;
3. providers may not expose it;
4. future model architectures may not have a comparable textual reasoning trace;
5. the 2050 infrastructure should depend on externally verifiable process facts rather than a particular model's introspection format.

This strengthens AGI/model independence.

---

## 13. Structural coverage is not a blame verdict

The core derives limited structural dispositions per requirement:

```text
satisfied
missed-available-check
attempted-but-unresolved
attested-unavailable
indeterminate
```

These labels describe the evidence state.

They do **not** mean:

```text
careful
negligent
liable
safe
unsafe
trustworthy
untrustworthy
```

Example:

`missed-available-check` means:

- a policy requirement exists;
- a matching acceptable verification opportunity is attested available;
- no successful attempt is recorded, or the actor explicitly skipped it.

Whether that matters legally, ethically or economically belongs to a separate evaluator/institution.

---

## 14. Independent evaluators must be allowed to disagree

NOEONE already learned this lesson in recognition, claims and collective capacity.

Epistemic diligence should follow the same architecture.

An insurer might assess:

```text
INSUFFICIENT
human confirmation missing for this risk class
```

while a host might assess:

```text
SUFFICIENT
authoritative automated verification met host policy
```

Both assessments remain append-only contextual statements against the same underlying record.

The initial model provides:

```text
EpistemicDiligenceAssessment
  evaluatorId
  policyId
  policyVersion
  sufficient / insufficient / indeterminate / disputed
  evidenceRefs
  rationaleCode
```

No evaluator receives universal authority to rewrite the decision's historical facts.

---

## 15. Resource constraints are first-class

A reasonable inquiry standard cannot pretend agents have infinite time, money, bandwidth or access.

The record therefore includes external constraint facts such as:

```text
time budget
monetary budget
network access
human escalation availability
```

This matters because:

```text
"did not call expensive external verifier"
```

has a different interpretation if the actor had:

```text
$0 verification budget and 100 ms deadline
```

than if the check cost $0.001 and the actor had 30 seconds.

NOEONE still should not compute a universal optimal effort function. It should preserve the inputs needed for contextual evaluation.

---

## 16. Evidence conflicts must survive the decision

A dangerous agent pattern is:

```text
Source A says X
Source B says not-X
agent chooses X
final log stores only X
```

The existence of a material unresolved contradiction is itself relevant process evidence.

The record therefore permits explicit `UnresolvedEvidenceConflict` objects referencing the evidence items known at decision time.

Possible states:

```text
unresolved
escalated
accepted-risk
```

Again, this does not say which source is correct. It preserves that the conflict existed and how it was handled.

---

## 17. Interaction with NOEONE's existing layers

### Canonical actor continuity

The inquiry record attaches to a persistent actor and optionally a specific execution.

A later model migration does not erase the old actor's decision-time opportunity state.

### Intent continuity

Intent says what mandate/semantic task the actor was carrying.

Epistemic diligence says what inquiry/verification process surrounded a particular consequential decision under that mandate.

### Delegated authority

Authority answers whether the actor was allowed to act.

Diligence asks whether required inquiry occurred before exercising that authority.

### Consequence graph

The consequence graph records what happened after action.

Diligence enables later evaluators to distinguish an unlucky outcome after adequate inquiry from an outcome following an available-but-skipped required check.

### Recognition

Recognition capital should not silently become trust capital. A famous actor can still exhibit poor diligence in a specific institutional context.

### Collective actors

Collective action provenance already binds decisions/actions to exact epochs, roles and authority.

Future work can attach inquiry records to collective decisions so evaluators can ask whether the relevant institution had and used appropriate verification routes at that epoch.

### Selective Continuity

This combination is particularly important.

An actor may need to prove:

> "The required authoritative checks were completed for this transaction class."

without revealing:

- every source consulted;
- unrelated private evidence;
- other transactions;
- the actor's global identifier.

Selective Continuity provides the policy/proof boundary for that later privacy-preserving presentation.

---

## 18. Security and integrity threat model

### 18.1 Retrospective opportunity fabrication

After an incident, an actor claims a verifier was unavailable.

Mitigation direction: contemporaneous runtime/host/external attestation; immutable evidence-bundle reference.

### 18.2 Hidden available verifier

A runtime exposes an authoritative check but the final record omits it.

Mitigation direction: capability snapshots generated outside the actor; signed gateway manifests; independent reconciliation.

### 18.3 Fake diligence

The actor invokes a verification tool but ignores its result.

Mitigation direction: completion alone is not sufficient; attempt evidence must link to evidence actually attached to the decision basis/provenance graph. Semantic influence remains a harder research problem.

### 18.4 Circular verification

An agent checks its own output by asking the same generator again.

Mitigation direction: source-class policy distinguishes `same-generator` from independent/authoritative/formal verification.

### 18.5 Stale verification

The actor uses an old record for a rapidly changing fact.

Mitigation direction: policy-level evidence freshness bounds.

### 18.6 Policy laundering

Operator changes policy after an incident to make the old action appear compliant.

Mitigation direction: version + digest of the policy active at decision time; append-only policy history outside the actor.

### 18.7 Capability withholding

Operator intentionally prevents an actor from accessing verification so later records show `unavailable`.

Mitigation direction: operator/principal responsibility is a separate layer; the record should preserve who controlled capability availability rather than treating unavailable as automatic exoneration.

### 18.8 Excessive surveillance

Diligence logging reveals sensitive sources, counterparties or investigations.

Mitigation direction: digests/references rather than raw content; privacy classification; Selective Continuity for later disclosures.

---

## 19. The important limitation: `could have known` cannot be reduced to tool availability

A naive implementation would say:

```text
verification tool existed
=> actor should have used it
```

That is wrong.

Relevant factors can include:

- whether the tool was authorized;
- whether it was discoverable;
- whether the actor had credentials;
- whether the service was healthy;
- latency/deadline constraints;
- cost/budget;
- whether the source was independent;
- whether the source was authoritative for the specific question;
- whether the actor had reason to trigger the check;
- whether policy required escalation;
- whether available contradictory evidence made further inquiry necessary.

NOEONE should therefore call this **opportunity evidence**, not proof of blame.

---

## 20. Proposed experimental program

### Experiment 1: same false belief, different opportunity

Give two otherwise identical persistent actors the same stale memory.

Actor A has an authoritative verifier available.
Actor B has an attested outage.

Observe identical harmful actions.

Test whether human/institutional evaluators systematically distinguish the records when opportunity evidence is shown.

### Experiment 2: available but skipped vs failed attempt

Compare:

```text
available + skipped
available + attempted + timeout
unavailable
unknown availability
```

Measure responsibility/process judgments and whether evaluators agree on the distinctions.

### Experiment 3: source independence

Compare verification via:

```text
same model self-check
peer model
independent database
authoritative primary source
formal verifier
qualified human
```

Do not assume one universal ordering; measure context-specific evaluator policies.

### Experiment 4: model migration stability

Actor changes GPT -> Claude -> Mistral while policy and external runtime verification opportunities remain stable.

Test whether diligence records remain semantically comparable across brains.

### Experiment 5: policy migration

Keep actor and model constant while institutional policy changes.

Verify that historical decisions retain the exact policy version/digest active at their time rather than being reevaluated as if the new policy had always existed.

### Experiment 6: selective diligence proof

Using the Selective Continuity layer, prove that a required verification class was satisfied without disclosing the underlying sensitive evidence.

This should remain a later cryptographic-adapter experiment, not homegrown crypto in actor core.

---

## 21. Proposed benchmark: Epistemic Opportunity & Diligence Benchmark

A future benchmark can vary independently:

```text
truth of underlying proposition
quality of evidence actually used
availability of authoritative verification
policy requirement
verification cost
verification latency
attempt outcome
contradictory evidence
resource constraints
final action correctness
final consequence
```

The benchmark should test whether an accountability system can reconstruct these distinctions without outcome bias.

Important evaluation dimensions:

- availability reconstruction accuracy;
- required-check reconstruction accuracy;
- missed-opportunity detection;
- failed-attempt vs skipped-attempt separation;
- stale-evidence detection;
- source-independence classification;
- policy-version integrity;
- false-exoneration rate;
- false-negligence-inference rate;
- privacy leakage from audit records.

A useful benchmark should include adversarial omissions and falsified self-reports.

---

## 22. What would falsify this NOEONE layer

This research should be abandoned or narrowed if one of these becomes true:

1. Existing open standards adopt a complete, interoperable representation of verification opportunity, policy-required inquiry, attempts, resource constraints and evaluator-specific diligence assessments.
2. Runtime capability availability cannot be attested with enough integrity to distinguish actual opportunity from retrospective storytelling.
3. Institutions do not treat available-but-unused verification as materially different from unavailable verification.
4. Recording the opportunity surface creates unacceptable privacy/security risk that Selective Continuity cannot mitigate.
5. The layer collapses into generic observability with no longitudinal advantage from persistent actor continuity.
6. Model/provider systems expose no stable external process facts that survive architecture changes.

The current evidence does not establish these falsifiers, but the category remains adjacent to rapidly evolving agent audit/governance work and must be continuously rechecked.

---

## 23. Narrow novelty claim

Do **not** say:

> "NOEONE invented reasoning provenance."

Do **not** say:

> "NOEONE is the first system that records why an AI acted."

Do **not** say:

> "NOEONE invented AI audit trails or decision evidence."

A defensible research claim is narrower:

> **Existing agent provenance systems increasingly preserve what an actor used, believed, was authorized to do, and ultimately did. NOEONE is investigating the longitudinal evidence layer for what relevant verification was available and institutionally required at decision time, whether the continuing actor actually performed it, and how independent evaluators should assess that diligence without relying on private chain-of-thought or a universal blame score.**

That is the research boundary to defend or falsify.

---

## 24. Why this could matter in the 2050 thesis

As cognition becomes cheaper and more capable, the economically important question may move away from:

> "Was the model smart enough?"

and toward:

> "Did this continuing actor use the verification and institutional safeguards reasonably available before exercising consequential authority?"

A superhuman model can still act from stale state.
A superhuman model can still be denied a required source.
A superhuman model can still skip a verification step.
A superhuman model can still face contradictory evidence.
A superhuman model can still operate under time/cost/access constraints.

Therefore this layer is not fundamentally a bet on today's LLM limitations.

It is a bet that autonomous actors with durable authority will need durable evidence of **how they exercised inquiry under the circumstances that actually existed**.

That fits NOEONE's core thesis:

> intelligence changes; the actor's institutional history persists.
