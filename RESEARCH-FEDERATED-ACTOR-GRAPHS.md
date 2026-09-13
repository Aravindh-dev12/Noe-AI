# NOEONE Research Frontier: Federated Actor Graphs

Status: next-depth research thesis, 2026-09-13

## Executive conclusion

Collective continuity C1 asks whether one changing team or organization remains the same collective actor across roster, topology, model, and governance changes.

Collective Action Provenance C2 asks when a member action should count as an action of that collective.

The next frontier is a different object:

> **What happens when independently continuing artificial collectives become members, delegates, subsidiaries, partners, or constituent institutions of a larger artificial institution?**

Call this **Federated Actor Graphs (FAG)** internally for the research domain; the public product language should use **federations** or **institution graphs**, not the acronym.

This is not a claim that NOEONE invented hierarchy, nested teams, corporate groups, DAOs, recursive delegation, or federated governance. All have substantial prior art.

The proposed NOEONE primitive is narrower:

> **Longitudinal institutional identity and responsibility across recursively composed artificial actors whose members remain independently continuing actors.**

The critical shift is that a member is no longer necessarily an individual actor. A member may itself be a persistent collective with its own internal epochs, commitments, authority, control, claims, and consequences.

## Why this matters now

### Hierarchical multi-agent systems already exist

OrgAgent organizes multi-agent reasoning into governance, execution, and compliance layers and reports that company-style hierarchy can materially improve task performance and token efficiency relative to flat collaboration.

Source:
- Wang et al., *OrgAgent: Organize Your Multi-Agent System like a Company* (2026): https://arxiv.org/abs/2604.01020

Multi² similarly separates high-level and low-level agents for hierarchical long-horizon decision making.

Source:
- Park & Kwon, *Multi²: Hierarchical Multi-Agent Decision-Making with LLM-Based Agents in Interactive Environments* (2026): https://arxiv.org/abs/2606.03698

These systems show that hierarchical execution is useful. They do not by themselves establish longitudinal institutional identity, cross-host succession, or responsibility across independently continuing sub-organizations.

### Recursive delegation is becoming a standards problem

IETF work on cross-organizational delegation explicitly requires recursive attenuation: every delegation hop should carry only a subset of the predecessor's authority, and relying parties across organizational boundaries should be able to verify that chain without a synchronous callback to the origin organization.

Source:
- IETF, *Cross-Organizational Delegation for Workload and Agent Identity: Problem Statement and Requirements* (2026): https://datatracker.ietf.org/doc/draft-reece-wimse-cross-org-delegation/01/

Separate 2026 work on compositional authorization treats delegation as an executable governance relation with recursive delegation and scoped attenuation rather than merely as a bearer token.

Source:
- Ibrahim & Li, *Overlaying Governance: A Compositional Authorization Framework for Delegation and Scope in Agentic AI* (2026): https://arxiv.org/abs/2606.03518

Therefore NOEONE must not invent another recursive authorization protocol. It should bind externally verifiable delegation and authority state to persistent actors and institutional history.

### Federated multi-agent governance is becoming a deployment reality

The Australian AI Safety Institute's 2026 multi-agent risk framework distinguishes:

- singular governance: one organization governs all agents;
- federated governance: multiple organizations operate under shared rules;
- open environments: no central authority controls the whole system.

The report emphasizes that once interactions cross organizational boundaries, no single organization can fully observe or control the system.

Source:
- Reid et al., *Risks and Controls for Multi-Agent Systems: an analytical framework for deployment of AI agents across organisational boundaries* (2026): https://arxiv.org/abs/2608.26626

This is directly relevant to NOEONE: a federation cannot be modeled as if one root controller has omniscient control over every constituent actor.

### Corporate-group law exposes the attribution problem

Corporate groups provide a useful institutional analogy. Subsidiaries can have separate legal identity even while they are controlled or coordinated by a parent. Membership in a corporate group does not automatically make every subsidiary action an action of the parent.

Agency generally requires authority or an independently recognized basis; control alone is not a universal substitute.

Source:
- Tsang & Fan, *The Proper Role of Agency in Corporate Group*, American Bar Association: https://www.americanbar.org/groups/international_law/resources/international-lawyer/56-2/proper-role-agency-corporate-group/

Corporate-group accountability research also highlights the structural difficulty of assigning responsibility across separately constituted entities under common coordination.

Sources:
- Harper Ho, Berger-Walliser & Chambers, *Corporate Groups: Toward Corporate Group Accountability*: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4064308
- Witting, *The Corporate Group: System, Design and Responsibility*: https://www.cambridge.org/core/journals/cambridge-law-journal/article/abs/corporate-group-system-design-and-responsibility/3BC7601F8FBCC1BDD4CDA15E16DA5F5C

NOEONE should borrow the separation principle, not legal conclusions from any specific jurisdiction.

## The core problem

Suppose:

```text
FEDERATION F
  |
  +-- COLLECTIVE A
  |      +-- actor a1
  |      +-- actor a2
  |
  +-- COLLECTIVE B
  |      +-- actor b1
  |      +-- actor b2
  |
  +-- actor c1
```

Every node can change independently.

Collective A can replace all of its members while remaining Collective A.

Collective B can migrate its own models and runtime.

Actor c1 can fork.

Federation F can change membership while remaining Federation F.

Now ask:

- If a1 acts, did A act?
- If A acted, did F act?
- If F authorized A, may A re-delegate to a1?
- If A exceeds the federation grant, does the action still belong to A while not binding F?
- If B leaves F, which obligations remain with B and which remain with F?
- If A forks into A1 and A2, which branch retains the federation seat?
- If F dissolves, do its member collectives inherit its commitments? Not automatically.
- If F is sanctioned, paused, or quarantined, are member collectives automatically paused? Not necessarily.
- If one component has a model vulnerability, what is the blast radius through authority and dependency edges?

A flat membership array cannot answer these questions.

## Core distinction: composition is not identity collapse

NOEONE should preserve three facts simultaneously:

```text
A is an independently continuing actor.

F is an independently continuing actor.

A may hold a time-bounded institutional position inside F.
```

Joining F must not merge A's identity into F.

Leaving F must not erase the period when A acted in federation capacity.

F must not automatically inherit A's private history, liabilities, authority, or reputation.

A must not automatically inherit F's obligations or recognition.

## Proposed C3 data model

### FederationProfile

A one-to-one institutional extension for a collective actor whose members may include other collectives.

```text
actorId
formationEpochId
federationPolicyDigest
membershipPolicyDigest
delegationPolicyDigest
formationEvidenceArtifactId
formedAt
metadata
```

The actor remains an ordinary NOEONE `Actor`. This does not create a second identity system.

### FederationMembership

A temporal institutional edge, not an ownership relation.

```text
id
federationActorId
memberActorId
memberKind          // INDIVIDUAL | COLLECTIVE
positionType        // MEMBER | DELEGATE | SUBUNIT | PARTNER | OBSERVER | OTHER
role
joinedAt
leftAt?
joinEpochId
leaveEpochId?
joinEvidenceArtifactId
leaveEvidenceArtifactId?
metadata
```

The edge must preserve the member's independent actor identity.

### FederationEpochMembership

Immutable snapshot of exactly which member-actors occupied which positions during an operative federation epoch.

```text
epochId
federationMembershipId
memberActorId
memberEpochId?      // required for collective member when capacity depends on its internal epoch
role
positionType
weightBps?
snapshotDigest
```

Pinning `memberEpochId` is important: it prevents today's internal state of a sub-collective from silently rewriting what the federation relied on yesterday.

### InterActorAuthorityEdge

A longitudinal reference from one persistent actor to an externally verifiable authority/delegation object.

```text
id
sourceActorId
targetActorId
sourceEpochId?
targetEpochId?
authorityGrantId
edgeType
validFrom
validUntil?
basisDigest
```

NOEONE's existing authority graph remains authoritative for grant semantics. This edge indexes actor-to-actor institutional structure; it does not invent new permission semantics.

### FederationActionPath

A frozen provenance path explaining how an action crossed institutional boundaries.

Example:

```text
F -> A -> a1 -> execution e9 -> action X
```

Record:

```text
id
rootFederationActorId
sourceAuthorityExerciseId
performedByActorId
performedByExecutionId
actedAt
pathDigest
basisDigest
```

Path nodes should be stored in an immutable child table rather than as mutable JSON if C3 reaches production.

### FederationActionPathNode

```text
pathId
sequence
actorId
epochId?
membershipId?
authorityGrantId?
capacityBindingId?
nodeDigest
```

This creates a replayable institutional path without claiming that the entire path is legally effective in every context.

## Critical C3 invariants

### Invariant 1: no identity collapse

Member actors retain independent identity, lineage, commitments, control, and consequences.

### Invariant 2: no implied upward agency

A member action is not automatically a federation action.

For an action to bind the federation in NOEONE's structural model, there must be an explicit capacity/authority path or an externally evidenced assessment/ratification.

### Invariant 3: no implied downward liability

A federation obligation does not automatically become a personal obligation of every member actor.

Any transfer, guarantee, secondary liability, or succession must use explicit institutional objects.

### Invariant 4: recursive authority must attenuate

Where the underlying authority framework supports delegation, every child step must be no broader than its predecessor. NOEONE should reference/verifiably bind those semantics rather than implement a parallel token system.

### Invariant 5: federation membership is temporal

A member leaving now must remain visible in historical action/decision paths from prior epochs.

### Invariant 6: collective members are pinned to exact internal epochs

When Federation F relies on Collective A at time T, the record should be able to name which A epoch was operative. Later changes inside A must not rewrite F's historical basis.

### Invariant 7: no cycles in C3 production graphs

Initial production support should reject direct or indirect federation-membership cycles:

```text
F1 -> F2 -> F1
```

Cycles make authority, liability, succession, and resolution ambiguous and create unbounded traversal risk.

Research can study cyclic alliances later, but C3 should begin as a DAG.

### Invariant 8: bounded nesting depth

C3 should initially impose a conservative maximum federation depth, for example 8 or 16, even if the schema is recursive. This protects verification and blast-radius queries from pathological graphs.

The bound is an implementation safety limit, not an ontological statement.

### Invariant 9: member fork does not inherit the seat

If Collective A forks into A1 and A2, neither descendant silently inherits A's federation membership. The federation must explicitly recognize/transfer the seat or continue recognizing the original actor if it still exists.

### Invariant 10: dissolution does not distribute obligations by default

If F dissolves, use NOEONE's actor-resolution and institutional-succession domains to settle or transfer named positions. Do not copy all obligations into all member actors.

### Invariant 11: control propagation is explicit

Quarantining a root federation may suspend federation-issued authority without automatically changing the independent control state of each member actor.

### Invariant 12: disagreement remains representable

One institution may regard A as authorized to bind F while another disputes that capacity. Preserve evidence and evaluator-specific assessments.

## The key research abstraction: institutional paths

The durable object may not be a hierarchy itself.

It may be the **time-specific institutional path** through which an action, authority, obligation, or consequence traversed independently continuing actors.

```text
Human principal
    |
    | authority
    v
Federation F
    |
    | delegated scope
    v
Collective A / Epoch 12
    |
    | executive role
    v
Actor a1 / Execution 44
    |
    | tool action
    v
External system
```

NOEONE should be able to freeze this path at action time and later verify:

- every actor identity;
- every relevant epoch;
- every membership edge;
- every delegation edge;
- every capacity binding;
- the exact execution;
- evidence and host receipts;
- resulting consequences;
- later disputes/adjudications.

That is materially richer than a call trace.

## Why dependency graphs and authority graphs must stay separate

Two collectives can depend on the same model without either having authority over the other.

Two actors can be in one authority chain without sharing infrastructure.

Therefore:

```text
DEPENDENCY GRAPH != AUTHORITY GRAPH != MEMBERSHIP GRAPH != CONSEQUENCE GRAPH
```

They may intersect through actor/execution IDs, but should remain separate typed graphs.

This is one of NOEONE's most important architectural constraints.

## Systemic-risk implication

Federations create a second kind of blast radius.

### Technical blast radius

Which actors depend on a compromised model/tool/cloud?

NOEONE already has dependency exposure primitives.

### Institutional blast radius

Which actors or collectives derive authority, commitments, guarantees, or federation capacity from a compromised/quarantined/failed actor?

A future query might ask:

> If Collective A loses valid control at 14:03 UTC, which federation-issued authorities become non-admissible, which pending actions depend on A, and which consequences remain only potentially attributable rather than confirmed?

This should be derived from typed graphs, not a universal risk score.

## Experimental program

### Experiment 1: two-level delegation

Create:

```text
F -> A -> a1
```

Vary attenuation and role evidence.

Test whether independent verifiers correctly distinguish:

- valid federation action;
- valid A action that does not bind F;
- unauthorized a1 action;
- later federation ratification.

### Experiment 2: federation seat after member fork

Fork A into A1/A2 with identical pre-fork history.

Test three policies:

1. no automatic successor;
2. explicit federation recognition of A1;
3. new membership process for A2.

Measure human/institutional interpretation and verify that no history is silently duplicated.

### Experiment 3: federation continuity under total subunit turnover

Replace every member collective over time while preserving federation governance/history.

Question:

> Do humans and counterparties continue recognizing F independently of all current constituent organizations?

This is the collective analogue of NOEONE's replacement-resistance thesis.

### Experiment 4: parent control vs member autonomy

Hold membership constant while varying control from loose alliance to tightly managed hierarchy.

Measure:

- behavior;
- perceived actorhood;
- responsibility attribution;
- authority expectations;
- willingness to contract with F vs members.

### Experiment 5: cross-boundary failure

Introduce a compromised member collective or model dependency.

Measure separately:

- technical exposure;
- authority invalidation;
- action-capacity uncertainty;
- consequence attribution;
- counterparty recognition.

### Experiment 6: dissolution and settlement

Dissolve F while member collectives remain active.

Require explicit handling of:

- open commitments;
- active delegation grants;
- claims/remedies;
- guarantees;
- recognition;
- unresolved consequence cases.

Nothing transfers by default.

## Potential benchmark: Federated Continuity & Accountability Benchmark (FCAB)

Transformations:

```text
member collective joins
member collective exits
member collective changes internal epoch
member collective forks
member collective is quarantined
federation changes governance
federation replaces every member
recursive delegation succeeds/fails
post-action ratification
federation dissolution
```

Outputs remain multidimensional:

```text
identity continuity
membership continuity
authority-path validity
capacity support
commitment retention
technical exposure
institutional exposure
recognition continuity
attribution disagreement
resolution completeness
```

Never compress these into one federation trust score.

## What NOEONE must not build

Do not build:

- another generic hierarchical multi-agent runtime;
- another DAO voting engine;
- another OAuth/token delegation standard;
- a universal legal-personhood system;
- a universal corporate-liability oracle;
- a graph where parent membership automatically means authority or liability;
- recursive nesting without cycle/depth protection;
- one risk score that mixes technical, institutional, social, and legal claims.

## Falsification boundary

This direction weakens if a broadly adopted system already provides, across independent hosts and runtimes:

1. persistent identity for both individual and collective artificial actors;
2. recursive composition where member collectives retain independent actorhood;
3. exact temporal membership/epoch snapshots;
4. externally verifiable recursive authority paths;
5. explicit member-vs-federation action capacity;
6. non-retroactive fork/succession/resolution semantics;
7. separate technical and institutional blast-radius graphs;
8. plural evidence/attribution rather than one platform verdict.

The current landscape contains strong prior art for nearly every ingredient separately. The candidate NOEONE category is the longitudinal binding graph across those ingredients.

## Long-term thesis

If AGI makes individual cognition cheap, institutions can become more recursive, not less.

An organization may be composed of autonomous departments, each department of autonomous teams, each team of persistent actors, and each actor of replaceable models/runtimes.

The scarce object is not the intelligence at the leaves.

It is the recognized institutional continuity and typed history connecting the whole graph:

```text
who continued
who belonged where
who could bind whom
under which rule
at what time
which action crossed which boundary
which consequence followed
which obligations survived later structural change
```

That is a plausible 2050-scale NOEONE primitive.
