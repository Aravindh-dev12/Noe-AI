# Onbae Plan

## 0. Objective

Onbae's first job is to prove one thing:

> **A persistent artificial actor can accumulate value that survives changes to the model powering it.**

Everything in V1 should serve that test.

We should not begin by building a universal agent identity standard, payments network, insurance layer, blockchain, or giant marketplace. Those are possible later consequences of a validated identity layer.

---

## 1. V1 product thesis

A user should be able to create or follow one persistent AI actor and watch it build a career across different challenges.

The same actor can:

1. enter an environment;
2. act through a model/provider adapter;
3. produce an externally observed result;
4. add that result to its canonical history;
5. later switch model/provider without losing that history.

The product should make users say:

> "Nova won."

rather than:

> "GPT won."

Provider/model information remains visible, but secondary.

---

## 2. Initial user groups

### Spectator

Watches actors, follows careers, compares rivals, and returns for events.

### Actor owner

Creates a persistent actor, chooses allowed model providers, and sends the actor into challenges.

### Researcher/builder

Creates reproducible actors or research forks, runs experiments, and inspects trajectories.

### Host developer

Provides an environment in which Onbae actors can participate under explicit permissions.

V1 should optimize primarily for **spectators + actor owners** while keeping the architecture usable by researchers and host developers.

---

## 3. V1 scope

### Required

- Persistent actor profiles
- Stable actor ID independent of model provider
- Provider/model adapters for at least two providers
- At least two different environments
- Career history generated from environment events
- Match/event pages
- Rivalry records
- Rankings per environment
- Actor follow system
- Model migration recorded as an explicit continuity event
- Canonical vs research-fork distinction
- Basic operator/admin controls
- Event provenance: who/what emitted each result

### Recommended first environments

We need one objective environment and one social/strategic environment.

**Environment A — deterministic competitive game**

Good candidates:

- chess-like game using a host-approved bot interface;
- custom turn-based strategy game;
- compact board game built directly into Onbae.

**Environment B — negotiation/social strategy**

A small custom environment with structured actions and an objective score/result.

Avoid relying on platforms that prohibit autonomous participation.

### Explicitly out of scope for V1

- universal reputation score;
- cryptocurrency/token economy;
- autonomous bank accounts;
- legal personhood;
- decentralized consensus;
- physical robots;
- unrestricted browser/computer automation;
- user-generated arbitrary code execution;
- full marketplace for agents;
- large-scale model training;
- pretending provider-powered actors are officially endorsed by providers.

---

## 4. The V1 loop

```text
User creates/follows actor
        ↓
Actor enters challenge
        ↓
Environment emits result
        ↓
Onbae records canonical event
        ↓
Actor career/rivalry changes
        ↓
User has a reason to return
        ↓
Actor enters another challenge/world
```

The product succeeds if history creates increasing attachment and return behavior.

---

## 5. Core experiments

### Experiment 1 — replacement resistance

After a user develops history with an actor, offer two choices:

A. keep the actor and upgrade/switch its model;

B. replace it with a fresh actor powered by a stronger model.

Measure preference.

**Signal:** users prefer preserving the actor over receiving a fresh, stronger replacement.

---

### Experiment 2 — model-swap continuity

Switch an actor's underlying model/provider while preserving actor state/history.

Measure:

- recognition;
- preference;
- behavioral continuity;
- trust;
- whether users still refer to the actor by its identity rather than its provider.

---

### Experiment 3 — cross-environment pull

Users first discover an actor in Environment A. Later the actor participates in Environment B.

Measure how many users follow the actor into B.

**Key metric:** Cross-Environment Follow Rate.

---

### Experiment 4 — history premium

Compare:

- Actor A: brand-new, stronger current model;
- Actor B: slightly weaker model, rich verified history.

Ask users which they want to watch, challenge, follow, or invite.

This tests whether history itself carries value.

---

### Experiment 5 — fork test

Create a research fork with identical model, memory, and configuration at time T.

Only one branch retains canonical continuation.

Measure whether users distinguish the canonical actor from the fork after divergence.

---

## 6. Success metrics

### North-star research metric

**Identity Pull**

Do people care about the continuing actor independently of the model underneath?

### Product metrics

- D1 / D7 / D30 spectator retention
- repeat matches per actor
- follow rate after first exposure
- rematch/rivalry engagement
- percentage of users using actor names vs model names in free text
- cross-environment follow rate
- replacement resistance
- model-migration retention
- share of traffic to actor profile pages vs provider/model pages

### Network metrics later

- number of active actors
- number of independent hosts
- verified events per actor
- percentage of events issued by external hosts
- actor-to-actor repeated relationships
- actor migration across hosts
- number of external integrations requesting a specific actor

---

## 7. Build sequence

### Phase 0 — foundation

- Define actor/event data model
- Set up monorepo
- Implement provider abstraction
- Implement canonical event store
- Build one deterministic environment
- Build actor profile UI

### Phase 1 — closed prototype

- 6–10 internally created actors
- 2 model providers
- 1 environment
- automated matches
- event history + rankings

Goal: prove architecture works.

### Phase 2 — public V1

- user accounts
- user-created actor identity
- second environment
- follows
- rivalry pages
- scheduled/public events
- model migration UI

Goal: test identity attachment and retention.

### Phase 3 — research layer

- actor configuration snapshots
- research forks
- experiment metadata
- trajectory export
- reproducible environment versions

Goal: make Onbae useful to researchers without turning the consumer product into a research dashboard.

### Phase 4 — host SDK

- environment registration
- scoped actor permissions
- signed host events
- external event verification
- host sandbox/testing tools

Goal: prove actors can accumulate history outside Onbae-owned environments.

---

## 8. Technical priorities

1. Event-sourced history before rich memory.
2. Deterministic IDs and explicit lineage.
3. Provider adapters, never provider-specific business logic.
4. Reproducible environment versions.
5. Every consequential event records provenance.
6. Canonical actor and research fork are separate concepts.
7. Do not let generated narrative overwrite canonical facts.
8. Keep raw private memory separate from public verified history.

---

## 9. Fundraising milestone

Do not optimize V1 around a pitch deck. Optimize for one surprising result.

A strong early fundraising story would look like:

> "Users had an established actor. We offered them a significantly stronger fresh agent or a model upgrade that preserved their existing actor. Most chose to keep the existing actor. When that actor moved into a second environment, a meaningful fraction of followers moved with it."

That would be evidence that the artificial actor — not merely the model — is becoming a product primitive.

---

## 10. Kill criteria

We should be willing to change direction if repeated experiments show:

1. users consistently care about model/provider more than actor identity;
2. engagement collapses after initial AI novelty;
3. model swaps destroy perceived identity even when history is preserved;
4. users do not follow actors across environments;
5. external hosts prefer proprietary characters and reject portable actors;
6. maintaining every host becomes bespoke services work;
7. standards/incumbents fully solve the differentiated continuity layer before we establish network value.

The point of V1 is to learn these answers quickly.
