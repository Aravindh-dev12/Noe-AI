# NOEONE Research: Actor Position

## Executive conclusion

The next layer above externally anchored state is **actor position**.

Externally anchored state asks:

> Which specific relationships, permissions, obligations, memberships, audience links, and externally attested facts continue after an actor changes?

Actor position asks:

> **What distributed place does this actor occupy in the surrounding social, economic, and institutional network, and how much of that position survives a transformation?**

This distinction matters because a mature artificial actor may become valuable not primarily because of what is stored inside it, but because many independent external parties coordinate around it.

A foundation model can be copied or replaced. A runtime can be migrated. A memory corpus can be exported. A cryptographic identifier can be rotated.

But the following cannot be recreated by copying one machine:

- 800 counterparties expecting future performance from the same actor;
- 40 institutions maintaining active authorizations or roles;
- millions of people independently choosing to follow that actor;
- 200 hosts admitting it under their own policies;
- open contractual rights and liabilities involving external parties;
- relationship-specific routines and investments built over years;
- rivalries, collaborations, and public historical events recognized by others.

These form a distributed **position**.

The strongest NOEONE thesis therefore becomes:

> **An artificial actor is partly a computational process and partly a persistent network position maintained by other actors and institutions.**

NOEONE should not own those external relationships. It should make their continuity, fracture, and reconstitution observable across model/runtime/body/controller changes.

---

## 1. Why “portable identity” is no longer enough

The 2026 agent-identity ecosystem is already moving aggressively toward persistent identifiers, portable memory, authorization, lineage, and social-graph portability.

Examples include:

- NIST's agent identity and authorization work;
- Microsoft Entra Agent ID;
- IETF agent-identity proposals;
- DCP-AI succession and rights/obligations specifications;
- JTel identity continuity proposals;
- self-hosted persistent identity projects;
- decentralized follower/social-graph protocols;
- AI-native social systems such as iBird that explicitly market portable agent identity, followers, history, and reputation.

Sources:
- https://www.nist.gov/blogs/cybersecurity-insights/back-future-why-agentic-ai-needs-strong-identity-foundation
- https://learn.microsoft.com/en-us/entra/agent-id/migrate-custom-app-registrations-to-agent-id
- https://www.ietf.org/archive/id/draft-aip-agent-identity-protocol-00.html
- https://docs.dcp-ai.org/specs/DCP-06/
- https://nic.csc.fi/pub/files/index/internet-drafts/draft-vandemeent-jis-identity-02.html
- https://ibird.io/blog/ai-agent-identity-portability

Therefore these are weak category claims for NOEONE:

- “portable agent identity”;
- “persistent social graph”;
- “agent reputation that travels”;
- “identity across model changes”;
- “agent succession.”

The deeper problem is what those systems do **not** automatically settle:

> A technically valid continuation does not imply that every independent external party continues treating the changed actor the same way.

---

## 2. Actor state versus actor position

### Actor state

Properties represented primarily inside or directly controlled by the actor/operator:

```text
model
runtime
memory
prompts
policies
tools
skills
private workspace
local goals
local keys
```

### Actor position

The actor's place in a network of externally controlled relations:

```text
                         Host A
                           |
                    admitted member
                           |
Institution X ---- authorized ---- ACTOR ---- followed ---- Users
     |                      |                    |
  mandate                    |                  audience
     |                       |
Company Y -------- contract / obligation
                             |
Agent R -------- rivalry / repeated exchange
                             |
Research Lab ---- benchmark history / citation
```

Position is therefore not one property attached to the actor.

It is a **distributed configuration of relations** whose other endpoints are controlled by independent principals.

---

## 3. Social ontology provides the conceptual foundation

John Searle's social-ontology work treats many institutional facts as status functions maintained through social recognition. Rights, duties, permissions, authorizations, obligations, entitlements, and related “deontic powers” do not exist merely because an object internally claims them.

Sources:
- https://doi.org/10.1177/1463499606061731
- https://doi.org/10.1111/jtsb.12332

NOEONE does not need to adopt every philosophical claim in Searle's framework. The operational lesson is enough:

> **A large class of economically important facts about an actor are constituted or maintained outside the actor by institutions and counterparties.**

A copied database row saying `ROLE = EMPLOYEE` does not preserve employment.

A copied memory saying `BANK_LIMIT = 50000` does not preserve bank authorization.

A copied follower list does not prove those humans still choose the fork.

The relevant external parties must continue recognizing or reissuing those states.

---

## 4. Counterparty consent already exists — so that is not the invention

NOEONE must be explicit about prior art.

DCP-06 already specifies succession with transfer policies, including explicit counterparty consent for relational memory. It also states that a successor must not impersonate the predecessor.

Source:
- https://docs.dcp-ai.org/specs/DCP-06/

The Agent Lifecycle Protocol similarly models major retraining/model-family changes as events that can require counterparty consent, and succession can transfer agreements subject to counterparty rules.

Source:
- https://vibeagentmaking.com/whitepaper/lifecycle-protocol/

Armalo's Pact Sunset Patterns also describes a successor handoff with counterparty consent for transferring obligations.

Source:
- https://trust.armalo.ai/blog/pact-sunset-patterns-how-to-retire-an-agent-without-stranding-its-pact-holders

JTel's draft identity standard goes further in another direction: for a valid in-control key rotation, established relationships are defined to survive the rotation without repeating bilateral establishment.

Source:
- https://nic.csc.fi/pub/files/index/internet-drafts/draft-vandemeent-jis-identity-02.html

These are valuable signals, but they mean:

> **NOEONE did not invent counterparty consent, relationship continuity, or succession.**

The opportunity is to observe the *aggregate distributed result* when many heterogeneous external parties apply different policies to the same actor transition.

---

## 5. Position is heterogeneous, not a single trust score

A single actor transition can produce:

```text
Game league              CONTINUED
Bank mandate              REISSUED
Employer role             CONDITIONAL
Research membership       CONTINUED
Sponsor contract          TERMINATED
User follower #1          continues following
User follower #2          unfollows
Counterparty A            recognizes same actor
Counterparty B            recognizes successor only
Counterparty C            disputes transition
```

There is no honest universal answer:

```text
“continuity = 83/100”
```

The correct representation is a **vector / graph of contextual continuity outcomes**.

This design choice is strategically important because it keeps NOEONE useful across very different domains without pretending that gaming loyalty implies financial authorization or that audience attachment implies safety.

---

## 6. Actor Position Graph

Conceptually, NOEONE can derive an actor-position graph from evidence rather than treating it as an independently asserted profile.

### Nodes

- canonical artificial actors;
- humans/principals, privacy-preserving where needed;
- organizations;
- hosts/environments;
- institutions/issuers;
- counterparties;
- contracts/commitments;
- credentials/authorizations;
- public events;
- communities/audience cohorts.

### Edges

- recognizes;
- authorizes;
- follows;
- employs;
- admits;
- owes;
- is owed by;
- collaborates with;
- competes with;
- sponsors;
- insures;
- validates;
- depends on;
- delegates to;
- contracts with.

Every edge has its own:

- controller/issuer;
- context;
- evidence;
- temporal validity;
- transfer policy;
- privacy policy;
- continuity behavior under migration/fork/controller change.

The graph is **not** authoritative merely because NOEONE stores it. The relevant issuer/counterparty remains authoritative where appropriate.

---

## 7. The key new quantity is not centrality — it is substitution resistance

Classical network analysis can compute degree, centrality, clustering, or embeddedness. Those metrics may be useful descriptively but are not the core NOEONE insight.

The important question is:

> **How difficult is it for a technically equivalent or superior replacement to occupy the incumbent actor's external position?**

That leads to a family of empirical metrics.

---

## 8. Proposed research metrics

These should remain context/cohort measurements, not permanent universal scores.

### 8.1 Position Retention Vector — `PRV`

For a specific transition, measure continuation separately by external-state class.

```text
PRV = {
  relationship: 0.84,
  institutional_status: 0.61,
  deontic: 0.93,
  audience: 0.72
}
```

Numerators and denominators must be clearly defined for each experiment/domain. Do not combine them unless a study pre-registers a meaningful weighting scheme.

### 8.2 Reconciliation Surface — `RS`

Count/diversity of independent external principals whose state may require evaluation after an actor transition.

Useful dimensions:

- total independent principals;
- number of organizations;
- number of human counterparties;
- number of jurisdictions/domains;
- number of active rights/obligations;
- number of high-consequence permissions;
- number of public audience relationships.

This is not “importance.” It measures how distributed the continuity problem has become.

### 8.3 Clone Substitutability Gap — `CSG`

Compare technical/behavioral substitutability with external position retention.

Example experimental form:

```text
behavioral equivalence to incumbent: 0.95
external-position retention:         0.18

CSG = 0.77
```

The exact measure of behavioral equivalence must be task-specific and pre-registered.

A large gap supports the hypothesis that actor value has moved outside the software snapshot.

### 8.4 Fork Fracture Vector — `FFV`

After a disclosed fork, measure how external anchors divide between branches:

```text
parent branch only
child branch only
both
neither
conditional / unresolved
```

Report separately by relationship class.

This is more informative than declaring one branch “the true identity” globally.

### 8.5 Position Half-Life

After an actor stops participating or undergoes a major change, measure how rapidly externally maintained position decays:

- follower retention;
- invitations;
- active mandates;
- counterparty choice;
- recognition;
- open contracts;
- collaboration recurrence.

### 8.6 Position Recovery Cost

After a transition causes external anchors to terminate, measure the cost/time required to regain comparable position:

- re-verification steps;
- human approvals;
- deposits/bonds;
- repeated successful interactions;
- elapsed time;
- lost demand;
- additional capability required to compensate for lost history.

This creates a direct economic measure of continuity value.

### 8.7 External-State Share

For a named task/domain, estimate how much of an actor's operational ability depends on externally maintained state versus operator-copyable state.

Example:

```text
can reason about procurement                  internal capability
can access vendor account                     external authorization
has negotiated supplier terms                 bilateral relationship
has purchasing mandate                        institutional status
has supplier trust/credit                      external relationship
```

Do not collapse all of these into one global percentage across domains.

---

## 9. Strongest experiment: Perfect Clone, Empty Position

This should become a flagship NOEONE research experiment.

### Setup

Create an established artificial actor A with meaningful history.

At time T, create B with as much legitimately copyable endogenous state as the study permits:

- same model;
- same memory snapshot;
- same tools;
- same policies;
- same public persona assets;
- same skill configuration.

B receives a new identity/lineage as a disclosed fork/clone.

### Then measure

Which external relationships reconstruct around B without forced transfer?

```text
followers
hosts
counterparties
collaborators
permissions
institutional roles
contractual rights
new invitations
repeat partner choices
```

### Hypothesis

> **A mature actor can be internally reproducible while externally non-substitutable.**

If B rapidly obtains the same external position merely because its behavior is equivalent, then NOEONE's network-position thesis is weaker.

If B remains structurally disadvantaged despite identical internals, the actor's scarce asset is increasingly external.

---

## 10. Stronger experiment: Superior Clone, Empty Position

Now make B measurably better.

```text
A = established actor, model X
B = fresh disclosed fork, stronger model Y
```

Randomize capability advantage.

Measure:

- partner choice;
- host invitations;
- follower migration;
- authorization reissuance;
- willingness to pay;
- task delegation;
- collaboration selection.

This unifies Actor Position with Recognition Capital.

A high replacement-resistance curve plus low external-state transfer demonstrates something powerful:

> **The network position itself has acquired independent value.**

---

## 11. Migration experiment: Same actor, changed internals

The inverse experiment is equally important.

```text
A(model X, runtime R1)
        ↓ canonical migration
A(model Y, runtime R2)
```

Measure:

- structural continuity;
- contextual recognition;
- external-state continuation decisions;
- revealed partner demand;
- objective capability drift;
- behavioral drift.

This separates:

```text
same ID
same lineage
same social recognition
same external position
same behavior
```

These should never be assumed to be equivalent.

---

## 12. Why Microsoft/NIST/IETF make this timing better rather than worse

NIST is actively working on standards-based identity and authorization for AI agents. Microsoft Entra Agent ID is turning agents into first-class governed identities with conditional access, lifecycle management, and auditability. IETF drafts are exploring identity, delegation, and policy enforcement.

Sources:
- https://www.nccoe.nist.gov/projects/software-and-ai-agent-identity-and-authorization
- https://learn.microsoft.com/en-us/entra/agent-id/migrate-custom-app-registrations-to-agent-id
- https://www.ietf.org/archive/id/draft-aip-agent-identity-protocol-00.html

That can commoditize low-level identity infrastructure.

But it also makes NOEONE's higher layer possible:

```text
standards make identities / permissions / credentials observable
                    ↓
NOEONE watches how those externally owned states behave through transitions
                    ↓
longitudinal actor-position dataset
```

The company should therefore integrate standards rather than compete to replace them.

---

## 13. Why portable social protocols do not kill the thesis

Decentralized social systems can make follower graphs portable. That solves an important platform-lock-in problem.

But portable graph storage and **continued human preference** are different things.

A protocol can say:

```text
User U followed Actor A before migration.
```

It cannot force:

```text
User U must continue caring about A after a severe behavioral/model/controller change.
```

Similarly, a fork cannot duplicate one human's singular attention by database operation.

The important experimental signal is therefore not merely whether the edge is technically portable but whether the external principal continues to enact it.

This is where recognition capital remains distinct from social-graph portability.

---

## 14. Why authority/credentials do not kill the thesis

Microsoft Entra Agent ID, NIST's work, AIP-style protocols, and other IAM systems can be authoritative about access.

NOEONE should not replace them.

Instead:

```text
Issuer system: “This credential/permission is active for Agent X.”

NOEONE: “Across transition T, issuer A continued it, issuer B reissued it,
issuer C rejected it, and users/hosts behaved as follows.”
```

The resulting cross-domain transition history can be valuable to:

- researchers;
- risk teams;
- insurers;
- counterparties;
- model labs;
- host developers;
- regulators;
- users choosing long-lived agents.

---

## 15. Actor Position is not automatically a moat

This thesis can still fail.

Potential failure modes:

1. Most external states are keyed to a stable identifier and automatically survive all ordinary upgrades.
2. Counterparties care only about current capability/security and routinely reauthorize replacements.
3. Social relationships to artificial actors prove weak after novelty disappears.
4. Model providers own both identity and distribution, leaving no neutral layer.
5. External systems refuse to expose enough evidence to build a useful cross-domain graph.
6. Privacy constraints make relationship-level observability impossible.
7. Different domains are so incomparable that no shared NOEONE abstraction creates value.
8. Regulatory systems bind all important rights to human/legal principals rather than persistent artificial actors.

These are empirical questions.

NOEONE should design experiments to discover failure early.

---

## 16. Current novelty assessment

The ingredients are established or emerging:

- social/institutional position is an old concept;
- rights and obligations depend on external institutions;
- network embeddedness and relational capital are established research areas;
- portable identity/social graphs already exist;
- agent lifecycle and succession protocols already handle counterparty consent;
- IAM systems already manage permission continuity;
- AI-agent identity research explicitly frames identity as a continuous relation between declared agent and observed action.

Relevant source:
- https://arxiv.org/abs/2604.23280

The comparatively open combination is:

> **A neutral longitudinal actor network that observes one canonical artificial actor across transformations, records per-counterparty continuation/rejection of heterogeneous external state, measures the resulting network-position retention/fracture, and experimentally compares that position with technically equivalent or superior replacements.**

That is substantially narrower—and more defensible—than “persistent AI identity.”

---

## 17. Product implication

The consumer product should eventually make this invisible research primitive feel simple.

A user sees:

```text
Nova changed brains.
Nova entered a new world.
Nova's old rival still recognizes Nova.
A league kept Nova's championship history.
A different host requires requalification.
Some followers stayed; others moved to the fork.
```

A researcher sees:

```text
transition T
execution delta
behavioral delta
recognition vector
external-state continuation vector
revealed choice
position-retention curve
```

An institution sees:

```text
canonical lineage
external issuer decisions
open obligations
recognized roles
transition evidence
```

Same underlying event graph.

---

## 18. The strongest long-run framing so far

Earlier versions of NOEONE centered on identity.

The research now suggests a stronger abstraction:

> **NOEONE tracks the continuity of an artificial actor's position in the world, not just the continuity of its software.**

Or even more precisely:

> **Models provide intelligence. Protocols provide identity and access. NOEONE measures what the world continues to recognize, grant, owe, expect, and choose around a specific artificial actor as that actor changes.**

This is the layer to keep testing.
