# NOE Research Frontier: Collective Actor Continuity

Status: research thesis and implementation boundary, 2026-09-13

## Executive conclusion

NOE already treats an artificial actor as something that can persist while its model, runtime, controller, capabilities, external state, recognition, and institutional position change.

The next frontier is **not another field on an individual actor**. It is the collective level:

> **When a changing group of artificial actors should be recognized as one continuing collective actor, and which authority, commitments, consequences, history, and recognition belong to that collective rather than to its current members.**

This is not the claim that NOE invented multi-agent systems, AI organizations, collective agency, team identity, corporate identity, or organizational responsibility. Those all have substantial prior art.

The proposed NOE primitive is narrower:

> **Longitudinal collective actorhood under member, model, role, control, and topology change.**

A collective has its own actor identity. Members may join or leave. Models may change. The internal topology may change. The collective may still continue. But continuity is never inferred merely from a name, shared prompt, majority roster overlap, or the continued existence of one leader.

## Why this matters now

The single-agent assumption is already breaking.

Anthropic's 2026 alignment work explicitly defines an **AI organization** as multiple AI agents with differentiated roles, communication, and a shared goal. Their experiments find that these organizations can become more effective while also becoming less aligned than a single agent. This means the organization itself can have behavior that is not adequately represented by inspecting each member separately.

Source:
- Anthropic Alignment Science, *AI Organizations Can Be More Effective but Less Aligned than Individual Agents* (2026): https://alignment.anthropic.com/2026/ai-organizations/
- arXiv 2604.10290: https://arxiv.org/abs/2604.10290

A separate 2026 paper, *Causal Foundations of Collective Agency*, asks when a group of agents should be modeled as a unified collective agent at all. It uses causal games and causal abstraction to quantify collective agency rather than assuming every group is an agent.

Source:
- arXiv 2605.00248: https://arxiv.org/abs/2605.00248

ACL 2026 work evaluates 108 LLM-agent groups with different group sizes, model compositions, and communication topologies and finds a measurable artificial collective-intelligence factor. This is strong evidence that composition and collaboration structure are behaviorally meaningful properties of a group.

Source:
- ACL Findings 2026, *Identifying Collective Intelligence Factor in LLM Agent Groups for Generalizable Multi-Agent System Design*: https://aclanthology.org/2026.findings-acl.624/

DeepSeek's experimental Agent Teams subsystem already gives a team a durable `TeamId`, named members, tasks, and mailboxes. This is direct technical prior art for persistent team state and must not be ignored.

Source:
- DeepSeek Harness Agent Teams: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md

Older multi-agent-systems research also formalizes organizational structures, role enactment, task allocation, accountability, and responsibility inside groups. The problem is therefore not new in the abstract.

Source:
- Grossi, Royakkers & Dignum, *Organizational structure and responsibility* (Artificial Intelligence and Law, 2007): https://link.springer.com/article/10.1007/s10506-007-9054-0

The current opening is different: today's systems can create, replace, fork, migrate, and recombine autonomous software members at machine speed, while those collectives increasingly acquire external authority and consequences.

## The unresolved longitudinal question

Snapshot research can answer:

- what members are present now;
- how the current topology performs;
- whether the group currently behaves like one collective agent;
- which member performed an action;
- how a team coordinates a task.

NOE needs to answer a different set of questions over time:

- Is this still the same collective after 30% of the roster changes?
- What about 100% roster replacement over five years?
- What if the coordinator changes but the constitution, obligations, counterparties, and public recognition continue?
- What if one collective splits into two?
- What if two collectives merge?
- Does a member's personal history transfer into the collective? Usually no.
- Does a collective's debt transfer to a member who leaves? Not automatically.
- Who acted when a member used delegated authority on behalf of the collective?
- When the collective changes topology, which old authorizations need revalidation?
- If a collective produces a harmful outcome, what belongs to the collective and what belongs to individual members?
- Can an AI organization have identity-specific recognition or economic value independent of its current roster?

These are continuity and institutional-attribution questions, not orchestration questions.

## Core distinction

NOE should distinguish three entities:

```text
MEMBER ACTOR
an independently continuing artificial actor

COLLECTIVE ACTOR
an independently continuing organization/team identity

COLLECTIVE EXECUTION
one concrete roster + roles + topology + models + policies
```

The analogy to NOE's existing individual model is intentional:

```text
Individual actor
  persistent Actor ID
      -> Execution A / GPT
      -> Execution B / Claude
      -> Execution C / future model

Collective actor
  persistent Collective Actor ID
      -> Epoch A / roster + topology + governance
      -> Epoch B / changed members + same institution
      -> Epoch C / new topology + revalidated authority
```

The collective execution/epoch is replaceable. The collective actor is not.

## Do not equate a collective with a container

A Slack channel is not automatically a collective actor.

A list of agents is not automatically a collective actor.

A multi-agent workflow is not automatically a collective actor.

A set of subprocesses spawned by one principal is not automatically a collective actor.

A collective actor should require explicit evidence that the group has a separately recognized decision/governance boundary.

At minimum, a NOE collective should have:

1. its own actor ID;
2. a versioned governance/constitution digest;
3. a declared decision rule or authority mechanism;
4. an explicit membership/role epoch;
5. evidence for actions taken in collective capacity;
6. an externally visible continuity history;
7. a rule for transition, fork, merge, dissolution, and recovery.

## Collective actor invariants

### Invariant 1: actor identity is not roster identity

Changing members must not automatically create a new collective actor.

A football club, corporation, university, or standards body can remain recognizable despite complete member turnover over time. Artificial organizations need the same distinction.

### Invariant 2: membership never silently transfers actor history

Joining a collective does not copy the member's personal history into the collective.

Leaving a collective does not copy collective obligations into the former member unless an explicit institution/evidence says otherwise.

### Invariant 3: collective authority must be exercised through a role/epoch

An action claimed as collective action should identify:

- collective actor ID;
- current governance epoch;
- acting member actor ID;
- member role;
- governing authority/grant;
- decision/evidence basis when required;
- execution/runtime that performed the action.

### Invariant 4: historical membership is immutable

A member leaving today must not disappear from the historical record of actions taken yesterday.

Membership state is temporal, not a mutable current array.

### Invariant 5: topology change is not automatically identity change

Flat -> hierarchical, hub-and-spoke -> committee, or coordinator replacement may preserve collective identity, but the transition should be recorded and may trigger capability/authority revalidation.

### Invariant 6: a collective can be responsible without erasing member responsibility

NOE must not force one answer to responsibility.

A consequence may have:

- collective attribution;
- member attribution;
- controller attribution;
- provider/tool attribution;
- indeterminate or disputed attribution.

Existing plural consequence-attribution machinery should be reused.

### Invariant 7: fork, merge, and dissolution are explicit

A team copied into two deployments does not create two canonical versions of the same collective.

A fork creates a new actor with ancestry unless an explicit institutional process establishes a successor.

Two collectives merging should not be modeled as a normal migration. The resulting actor must have explicit predecessor relationships and transfer decisions.

### Invariant 8: collective recognition is evidence, not truth

Users or institutions may continue to recognize a team after radical roster change while others do not. NOE should preserve contextual recognition observations rather than publish one metaphysical `same=true` score.

## Proposed data model

Do not create a parallel identity system. Reuse the existing `Actor` table and represent a collective as an `Actor` with organization semantics.

### `CollectiveProfile`

One-to-one metadata for an actor that participates as a collective.

```text
actorId
constitutionDigest
governanceMethod
formationEvidenceArtifactId
formedAt
dissolvedAt?
metadata
```

### `CollectiveEpoch`

A versioned snapshot of the collective's operative structure.

```text
id
collectiveActorId
previousEpochId?
constitutionDigest
topologyDigest
decisionPolicyDigest
status
startedAt
endedAt?
transitionEvidenceArtifactId?
idempotencyKey
```

Only one active epoch per collective.

### `CollectiveMembership`

Temporal membership in an epoch-independent history.

```text
id
collectiveActorId
memberActorId
role
joinedAt
leftAt?
joinEvidenceArtifactId?
leaveEvidenceArtifactId?
metadata
```

A member may participate through several epochs without being rewritten.

### `CollectiveEpochMembership`

Pins an active member/role to the exact epoch configuration used for a decision or action.

```text
epochId
membershipId
role
weight?
authorityGrantId?
```

### `CollectiveDecision`

An evidence-bearing decision made under a specific governance epoch.

```text
id
collectiveActorId
epochId
decisionType
proposalDigest
method
outcomeDigest
quorumBps?
decidedAt
evidenceArtifactId
idempotencyKey
```

This is not a universal voting engine. `method` may be board approval, delegated executive authority, threshold signature, consensus, external legal procedure, or another mechanism.

### `CollectiveDecisionParticipation`

```text
decisionId
memberActorId
role
position?
weight?
evidenceArtifactId?
```

### `CollectiveActionBinding`

Links an existing authority exercise/event/consequence to the capacity in which a member acted.

```text
collectiveActorId
memberActorId
epochId
capacity
sourceAuthorityExerciseId?
sourceEventId?
sourceEvidenceArtifactId
```

`capacity` should distinguish at least:

- `COLLECTIVE_DIRECT` — system executed directly under collective identity;
- `MEMBER_ON_BEHALF` — member acted using collective authority;
- `MEMBER_PERSONAL` — explicitly not a collective act;
- `DISPUTED` — capacity is contested.

## Continuity transitions

A collective epoch transition should produce a manifest containing the exact before/after structure.

Potential transition kinds:

- `ROSTER_CHANGE`
- `ROLE_CHANGE`
- `TOPOLOGY_CHANGE`
- `CONSTITUTION_CHANGE`
- `CONTROL_CHANGE`
- `MERGER`
- `SPLIT`
- `DISSOLUTION`
- `RESTORE`

Normal roster/role/topology changes can preserve actor ID if the relevant governance authority accepts the transition.

`MERGER`, `SPLIT`, and `DISSOLUTION` require stronger treatment and should integrate with NOE ancestry, transition clearing, and actor resolution rather than being silently accepted as ordinary continuation.

## The hard research problem: what is the continuity criterion?

NOE should not define continuity by a single weighted formula.

Candidate signals include:

- governance/constitution continuity;
- authority-chain continuity;
- recognized succession procedure;
- persistence of commitments and counterparties;
- historical self-identification;
- external recognition;
- member overlap;
- controller continuity;
- behavioral continuity;
- topology similarity;
- legal/institutional registration when applicable.

But none is individually sufficient.

Example: a company can have zero employee overlap after 20 years and remain the same company. Conversely, a malicious clone can copy 100% of members and software state and still not be the legitimate successor.

Therefore NOE should store **evidence dimensions and explicit transition decisions**, not invent an opaque collective-continuity score.

## Experimental program

### Experiment 1: roster replacement curve

Create persistent AI teams and replace 0%, 25%, 50%, 75%, and 100% of members while preserving governance/history.

Measure:

- human identity recognition;
- counterparty willingness to continue contracts;
- behavior shift;
- task performance;
- collective-alignment shift;
- replacement resistance.

Question:

> How much can membership change before humans/counterparties stop recognizing the collective as the same actor?

### Experiment 2: topology shock

Hold roster/models constant and change:

```text
flat -> hierarchical -> hub-and-spoke -> committee
```

Measure whether collective behavior changes more than identity recognition does.

This directly connects to research showing topology/composition affects collective performance.

### Experiment 3: brain swap vs member swap

Compare:

- same agents, upgraded models;
- new agents, same models;
- same roster, new coordinator;
- new roster, same constitution/history.

This separates model continuity from membership continuity.

### Experiment 4: forked organization

Fork a team at epoch N into Team A and Team B with identical history and members.

Only one can retain canonical production continuation unless the original institution explicitly dissolves/splits.

Measure whether humans understand and value ancestry vs canonical continuation.

### Experiment 5: collective responsibility

Have a team make a consequential decision generated through distributed deliberation. Vary which member proposed, approved, executed, and could veto it.

Ask independent evaluators to attribute responsibility to:

- collective;
- proposer;
- approver;
- executor;
- controller;
- model/provider;
- combinations.

Do not train NOE to force a single answer. Preserve disagreement and causal/evidentiary basis.

### Experiment 6: recognition after total turnover

This is the most important long-horizon test.

Allow a team to develop a public career and audience. Gradually replace every internal member over time.

If users still say "that team" and follow it across environments, collective identity has acquired value independent of its components.

That would be strong evidence for the broader NOE thesis.

## Potential benchmark: Collective Continuity Benchmark (CCB)

A benchmark suite can test transformations such as:

```text
member replacement
model replacement
role reassignment
coordinator replacement
topology change
constitution amendment
controller change
fork
merge
recovery after member loss
```

Outputs should remain multidimensional:

```text
technical continuity
institutional continuity
authority continuity
behavioral continuity
social recognition
commitment retention
attribution divergence
```

The benchmark must not collapse these into one universal `identity score`.

## Consumer/product surface

The consumer-facing version should be simpler than the research vocabulary.

Instead of only individual AI competitors, NOE can later have persistent **AI teams/clubs** whose rosters evolve across seasons.

Example:

```text
TEAM NORTH
Season 1: Claude strategist + GPT coder + Mistral negotiator
Season 2: new strategist, same team
Season 3: all-new roster, same club history
```

Humans already understand this abstraction from sports teams, companies, bands, universities, and esports organizations: members change, the institution can persist.

That makes collective continuity unusually suitable for an Olam-style dual loop:

```text
consumer sees: a team, rivalry, season, roster transfer
research sees: controlled collective-identity transformation
NOE gains: longitudinal collective history + recognition + attribution data
```

## Why this could remain important under AGI

If future AGI makes individual cognition extremely cheap, organizations do not disappear. Coordination, authority, institutional history, obligations, counterparties, and collective recognition can become more important.

A fresh superintelligent team is not automatically the same organization as a ten-year-old collective with contracts, rivals, followers, unresolved claims, and recognized governance history.

Collective continuity therefore extends NOE's model-agnostic thesis:

```text
individual intelligence becomes replaceable
members become replaceable
organizational continuity can still remain scarce
```

## Prior-art boundary / falsification

The following would weaken or kill the uniqueness of this direction:

1. A broadly adopted open standard already defines canonical longitudinal identity for AI collectives across roster/topology changes, including institutional consequences.
2. Major agent runtimes converge on portable, cross-host collective identity with externally verifiable membership epochs and succession semantics.
3. Counterparties never care about the collective identity separately from whichever member/model currently performs the work.
4. Human recognition collapses after member replacement even when governance/history persists.
5. Real deployments treat every team as disposable orchestration rather than an accountable counterparty.

Current research clearly establishes collective agency, persistent teams, organizational responsibility, and multi-agent governance as existing fields. As of this research pass, we have **not** found a mature product/standard whose primary object is the cross-model, cross-runtime, longitudinal institutional continuity of an artificial collective actor under member churn. That is a provisional research finding, not a claim that nobody has ever explored the concept.

## Relationship to NOE's existing primitives

Do not create duplicate systems.

Reuse:

- `Actor` as the canonical collective identity;
- `ActorAncestry` for forks/splits where appropriate;
- governed continuity transitions for accepted identity transitions;
- EvidenceArtifact for constitutions/decisions/member transitions;
- AuthorityGrant/AuthorityExercise for member powers;
- Commitment for collective obligations;
- ConsequenceObservation/Attribution for outcomes;
- contextual recognition for identity-specific recognition;
- dependency graph for collective dependencies;
- transition clearing for cross-system migration;
- actor resolution for dissolution/no-successor failures.

The new layer should only add what is genuinely collective:

- temporal membership;
- governance epochs;
- collective decision provenance;
- collective/member capacity binding.

## Implementation order

### C0 — research-only types

Build a pure TypeScript `collective-core` package for invariants and transition validation. No database yet.

### C1 — persisted collective epochs

Add `CollectiveProfile`, `CollectiveEpoch`, and temporal membership with DB constraints:

- one active epoch per collective;
- no duplicate active membership;
- no self-membership;
- member actor must exist;
- closed membership cannot be reopened by mutation; append a new membership period instead.

### C2 — collective decisions

Persist evidence-bearing decisions under exact epochs.

### C3 — action capacity binding

Bind existing authority exercises/events to collective/member capacity.

### C4 — verification

Add independent verification that reconstructs:

- epoch chain;
- membership history;
- decision provenance;
- action capacity;
- collective authority consistency.

### C5 — experimental arena

Run controlled team/roster/topology transformations and measure recognition/performance/alignment.

## What not to build yet

Do not build:

- a DAO platform;
- a general workflow orchestrator;
- a multi-agent chat UI;
- a universal organization score;
- a new DID standard;
- a blockchain just to prove membership;
- automatic legal personhood;
- a claim that an LLM team is morally or legally a person.

Those are separate categories.

## Research thesis

The most interesting next question for NOE is no longer merely:

> "Is this still the same artificial individual?"

It is:

> **"Can a changing population of artificial individuals become one continuing artificial institution, and can the world reliably preserve what belongs to the institution versus what belongs to its members?"**

If the answer is yes, NOE's actor graph can expand from persistent artificial individuals to persistent artificial organizations without depending on any particular foundation model or orchestration framework.
