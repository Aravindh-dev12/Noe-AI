# NOEONE Research Frontier: Collective Action Provenance

Status: next-depth research thesis, 2026-09-13

## Executive conclusion

Collective continuity C1 answers:

> Which changing set of members belongs to one continuing collective actor across epochs?

That is not enough.

The next institutional question is:

> When a concrete action performed by one or more members should be treated as an action of the collective itself, under which governance epoch, role, authority, and decision basis.

Call this **Collective Action Provenance (CAP)**.

NOEONE should not infer collective action merely because:

- the executor was a member;
- the executor held a role;
- the action benefited the collective;
- a majority of members later approved it;
- the collective and member share a model/provider/runtime;
- the action occurred inside a team runtime.

A durable artificial institution needs a separate, inspectable bridge from member activity to collective capacity.

## Why this is a distinct problem

Classic multi-agent organization research already separates several forms of responsibility. Grossi, Royakkers, and Dignum formalize organizational structure using power, coordination, control, role enactment, task allocation, delegation, causal responsibility, accountability, and blameworthiness. A member can causally produce an outcome while another role remains institutionally accountable.

Source:
- Grossi, Royakkers & Dignum, *Organizational structure and responsibility* (Artificial Intelligence and Law, 2007): https://link.springer.com/article/10.1007/s10506-007-9054-0

Recent AI-organization research increases the urgency. Anthropic defines an AI organization as multiple agents with differentiated roles, communication, and a shared goal, and finds that the organization can be more effective while also less aligned than a single agent. This means collective behavior cannot safely be represented as the sum of member-level attestations.

Source:
- Anthropic Alignment Science, *AI Organizations Can Be More Effective but Less Aligned than Individual Agents* (2026): https://alignment.anthropic.com/2026/ai-organizations/
- arXiv 2604.10290

The collective itself can also be behaviorally meaningful. Jørgensen, Weichwald, and Hammond model when multiple agents can be usefully abstracted as one collective agent using causal games and causal abstraction. This provides a formal reason not to assume that only individual members are real loci of agency.

Source:
- *Causal Foundations of Collective Agency* (CLeaR 2026): https://arxiv.org/abs/2605.00248

ACL 2026 work on 108 LLM-agent groups further shows that composition and topology produce measurable group-level capability differences, while separate topology work shows that communication structure itself can materially change multi-agent behavior.

Sources:
- https://aclanthology.org/2026.findings-acl.624/
- https://aclanthology.org/2026.acl-long.1764/
- https://aclanthology.org/2026.findings-acl.207/

DeepSeek's experimental Agent Teams subsystem is direct implementation prior art for durable team identity, members, tasks, and mailboxes. NOEONE therefore must not claim to invent persistent teams.

Source:
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md

## What remains open

Existing team runtimes can tell us:

- who was in the team;
- who sent a message;
- who owned a task;
- which tool call occurred;
- what the current topology is.

That still does not answer:

- Was the action personal or collective?
- Did the member have authority to bind the collective?
- Was a collective decision required first?
- Was the required decision rule actually satisfied?
- Which exact epoch and roster were operative?
- Was the executor acting as proposer, approver, delegate, executor, monitor, or independent member?
- If the action violated policy, is it still historically an action of the collective?
- Can an unauthorized act later be ratified without rewriting history?
- If a collective changes constitution tomorrow, should yesterday's action be judged under tomorrow's rules? No.

This is a longitudinal capacity-attribution problem.

## Core distinction

NOEONE should model at least four separate facts:

```text
MEMBERSHIP
Member M belonged to Collective C during Epoch E.

ROLE / AUTHORITY
M held role R and/or grant G during Epoch E.

DECISION
Collective C reached decision D under Epoch E and Policy P.

ACTION CAPACITY
Action A was performed in a claimed capacity and is linked to D/G/E.
```

These must not collapse into one `collectiveAction=true` bit.

## Proposed C2 primitives

### CollectiveDecision

Immutable decision record tied to an exact collective epoch.

```text
id
collectiveActorId
epochId
decisionType
proposalDigest
method
methodVersion?
outcomeDigest
quorumBps?
decidedAt
evidenceArtifactId
basisDigest
idempotencyKey
metadata
```

The `method` is descriptive and externally grounded. NOEONE does not become a universal voting engine.

Examples:

- delegated executive authority;
- 2-of-3 threshold approval;
- board majority;
- unanimous member consent;
- external legal/institutional procedure;
- runtime-native consensus;
- emergency controller override.

### CollectiveDecisionParticipation

Pins participation to the exact epoch roster snapshot.

```text
decisionId
epochId
membershipId
memberActorId
role
position?
weightBps?
evidenceArtifactId?
participationDigest
```

Historical participation is immutable even if the member later leaves.

### CollectiveActionBinding

Binds an existing NOEONE action/evidence object to the capacity in which it was performed.

```text
id
collectiveActorId
epochId
memberActorId?
membershipId?
capacity
sourceAuthorityExerciseId?
sourceActorEventId?
sourceEvidenceArtifactId
decisionId?
claimedAt
bindingEvidenceArtifactId
basisDigest
idempotencyKey
metadata
```

Initial capacity vocabulary:

- `COLLECTIVE_DIRECT`
- `MEMBER_ON_BEHALF`
- `MEMBER_PERSONAL`
- `UNAUTHORIZED_COLLECTIVE_CLAIM`
- `RATIFIED_AFTER_ACTION`
- `DISPUTED`

The vocabulary is historical provenance, not a moral verdict.

### CollectiveCapacityAssessment

Plural evaluator-specific assessment of whether the recorded action satisfied a particular capacity rule.

```text
id
actionBindingId
evaluatorRef
method
methodVersion
disposition
basisDigest
evidenceArtifactId
assessedAt
```

Suggested dispositions:

- `SUPPORTED`
- `NOT_SUPPORTED`
- `PARTIALLY_SUPPORTED`
- `INDETERMINATE`
- `DISPUTED`

NOEONE must preserve disagreement.

## Critical invariants

### 1. Membership is necessary but not sufficient

`MEMBER_ON_BEHALF` requires membership active at action time and pinned to the exact operative epoch.

### 2. Time is part of the proof

The action is evaluated against the epoch, role, decision policy, and authority state that existed at `actedAt`, not today's state.

### 3. Decision evidence never rewrites the action

If a decision is missing, the action remains historically missing that basis. Later ratification becomes a new object linked to the original action.

### 4. Personal and collective capacities can coexist

A member may act personally while being a member of the collective. NOEONE must allow explicit `MEMBER_PERSONAL` records.

### 5. Collective attribution does not erase member attribution

The existing consequence graph can contain both collective and member-level causal/responsibility assessments.

### 6. A decision cannot use a future roster

Every participant must resolve to an immutable `CollectiveEpochMembership` snapshot from the same epoch.

### 7. Governance transitions do not retroactively change validity

Constitution or policy amendments apply only to later decisions/actions unless an external institution explicitly supplies retrospective semantics as separate evidence.

### 8. Ratification is explicit

`RATIFIED_AFTER_ACTION` must point to the original binding and a later valid decision. It cannot mutate the earlier record into `MEMBER_ON_BEHALF`.

### 9. No universal capacity truth

NOEONE can enforce internal structural invariants, but external legal/institutional capacity can differ by jurisdiction and counterparty. Preserve evaluator context.

## Why this is stronger than a team audit log

A normal team log says:

```text
member-7 called tool-X at 14:03
```

NOEONE should be able to reconstruct:

```text
Collective C
  Epoch 14
  Constitution digest K
  Decision policy P
      -> Decision D approved by roles A/B
      -> Member M held role R
      -> Authority grant G covered action class X
      -> Execution E performed action A
      -> Host/evidence recorded outcome O
      -> Later evaluators disagree on causal responsibility
```

That is an institutional history, not an orchestration trace.

## Relationship to existing NOEONE domains

Do not duplicate existing machinery.

- actor continuity: identifies the continuing collective actor;
- collective C1: identifies exact membership/role epochs;
- delegated authority: carries grants and delegation chains;
- intent continuity: links mandates/transforms/assessments;
- evidence graph: stores external proofs/assertions;
- consequence graph: stores observations and plural attributions;
- recognition continuity: records contextual recognition;
- institutional succession: transfers specific positions explicitly;
- actor resolution: handles terminal/failure cases.

CAP is the binding layer that answers:

> In what capacity did this actor/member act at that time?

## Experimental program

### Experiment A: same action, different capacity

Keep action content identical. Vary whether the executor is:

1. not a member;
2. a member acting personally;
3. a member with role but no authority;
4. an authorized delegate;
5. an authorized delegate after required collective approval.

Measure human/institutional judgments of whether the collective itself acted.

### Experiment B: approval timing

Compare:

- valid approval before action;
- approval after action;
- rejected proposal followed by action;
- emergency authority followed by later review.

The registry should preserve these histories without normalizing them into one status.

### Experiment C: topology and responsibility

Use the same roster but vary flat, hierarchical, hub-and-spoke, and committee topologies. Record proposer/approver/executor/control roles and compare responsibility attribution.

### Experiment D: total roster turnover

Repeat equivalent decisions across epochs while replacing all members over time. Test whether counterparties continue treating the collective, rather than the current roster, as the responsible actor.

### Experiment E: collective-vs-member consequence attribution

Create tasks where one member proposes, another approves, another executes, and the collective policy made the action possible. Ask independent evaluators to distribute causal, contractual, supervisory, and moral responsibility. Preserve disagreement.

## Falsification / prior-art boundary

This direction weakens if a broadly adopted standard or product already provides all of the following as one longitudinal object:

1. persistent collective identity across roster/topology changes;
2. epoch-pinned membership/roles;
3. governance-decision provenance;
4. capacity binding from member action to collective action;
5. external evidence and plural assessment;
6. consequence attribution without collapsing collective/member responsibility;
7. continuity across model/runtime/provider changes.

Current research covers many ingredients separately. We have not found a mature cross-host product/standard whose primary object is this full longitudinal collective-capacity graph.

## Product implication

For consumers the surface remains simple:

```text
TEAM NORTH approved the move.
Member Nova executed it.
The team later changed roster.
The decision and consequence still belong to TEAM NORTH's history.
```

For researchers and institutions the same event exposes:

- exact epoch;
- roster snapshot;
- governance basis;
- decision evidence;
- authority chain;
- execution identity;
- host evidence;
- later consequence/attribution assessments.

This is a strong Olam-style dual loop: simple public team careers above, unusually rich collective-agency data below.

## Long-term thesis

If individual cognition becomes cheap or superhuman, organizational questions do not disappear.

They become harder:

- who could bind the institution;
- which group actually decided;
- which member executed;
- which policy applied;
- whether later member/model turnover preserves the institution;
- which consequences remain attached to the collective.

NOEONE's durable object is therefore not merely an AI identity. It is the **longitudinal institutional actor**, whether that actor is implemented by one changing system or by a changing collective of systems.
