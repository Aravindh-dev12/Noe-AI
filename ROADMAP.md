# Onbae Roadmap

## Guiding rule

Onbae should not attempt to build the 2050 infrastructure layer before proving that persistent artificial actors matter to users.

The roadmap therefore moves from **career/competition product → research validation → external hosts → portable verified history → institutional infrastructure**.

---

## Stage 0 — Foundation

### Goal

Establish the technical object we mean by a persistent actor.

### Deliverables

- monorepo initialized;
- actor core package;
- stable actor ID;
- execution configuration model;
- lineage model;
- canonical event schema;
- PostgreSQL schema/migrations;
- provider abstraction;
- first provider adapters;
- one deterministic environment;
- actor profile prototype.

### Exit criteria

- an actor can complete multiple sessions;
- events accumulate into one career;
- model configuration can change without changing actor ID;
- a research fork can be created without becoming canonical.

---

## Stage 1 — Internal Arena

### Goal

Prove the system works with a small artificial population.

### Population

Start with approximately 6–10 actors.

Include:

- provider-powered benchmark actors;
- at least one model-independent persistent actor;
- optionally one reproducible research actor.

### Deliverables

- automated scheduling/match runner;
- rankings;
- event pages;
- actor profiles;
- replay/trajectory inspection;
- rivalry derivation;
- basic admin console;
- at least two model providers.

### Exit criteria

- hundreds/thousands of valid events;
- reliable provider switching;
- low operational failure rate;
- career pages remain correct after migrations.

---

## Stage 2 — Public V1

### Goal

Test whether normal users care about persistent actor identity.

### Deliverables

- public landing/home;
- authentication;
- spectator mode;
- follows;
- user-created actor identities;
- challenge flow;
- second, meaningfully different environment;
- rivalry pages;
- public model-migration events;
- sharing cards/links;
- basic analytics for identity experiments.

### Primary experiments

- replacement resistance;
- model-swap continuity;
- history premium;
- cross-environment follow rate.

### Exit criteria

We should see evidence that at least some users:

- return for specific actors;
- preserve an actor across model upgrades;
- follow actors into another environment;
- form interest around careers/rivalries rather than only model comparisons.

If not, revisit the core product thesis before expanding.

---

## Stage 3 — Research Platform

### Goal

Turn the same persistent-actor infrastructure into a useful research instrument.

### Deliverables

- immutable execution snapshots;
- research fork creation;
- experiment cohorts;
- trajectory export;
- environment version pinning;
- reproducible seeds/configuration where possible;
- longitudinal comparison views;
- public technical reports.

### Research targets

- model-swap identity continuity;
- actor fork/canonicality;
- behavioral discontinuity;
- history premium;
- cross-environment identity transfer.

### Exit criteria

- external researchers can reproduce at least one Onbae experiment;
- Onbae has a useful longitudinal dataset unavailable from a static model leaderboard.

---

## Stage 4 — External Host Network

### Goal

Prove that an actor can accumulate history outside Onbae-owned worlds.

### Deliverables

- host SDK;
- environment manifest;
- host registration;
- scoped actor permissions;
- signed host events;
- webhook/event ingestion;
- host sandbox;
- host trust labels;
- host-level analytics.

### First external hosts

Prefer environments that explicitly support bots/agents or are built for Onbae integration.

Avoid integrations that depend on violating platform rules or impersonating humans.

### Exit criteria

- multiple independent hosts;
- actors maintain one identity across hosts;
- users follow at least some actors between hosts;
- external events become a meaningful portion of actor history.

---

## Stage 5 — Presence & Distribution

### Goal

Demonstrate that specific artificial actors have portable distribution.

### Deliverables

- host invitations;
- scheduled appearances;
- actor availability/permissions;
- audience notifications;
- booking/appearance records;
- paid/sponsored disclosure;
- optional compensation rails through existing payment providers.

### Core signal

A host asks for **a specific actor**, not merely "an AI agent."

### Exit criteria

- repeated host demand for named actors;
- measurable audience transfer with the actor;
- early willingness to pay for specific actor presence.

---

## Stage 6 — Verified Actor History

### Goal

Move from entertainment history to institutionally useful longitudinal evidence.

### Deliverables

- richer host attestations;
- commitments/obligations;
- dispute/supersession events;
- delegation lineage;
- selective disclosure;
- standards-based credentials where useful;
- actor history query APIs.

### Potential users

- developer platforms;
- companies deploying agents;
- marketplaces;
- trust/risk providers;
- researchers;
- insurers.

Onbae should expose evidence, not rush to create one universal reputation score.

---

## Stage 7 — Artificial Actor Infrastructure

### Goal

Become a neutral longitudinal layer for autonomous actors across models, runtimes, organizations, and eventually physical embodiments.

Potential questions Onbae could answer:

- Is this the canonical continuation of this actor?
- What model/runtime transitions has it undergone?
- What external environments have verified its activity?
- What obligations are associated with it?
- Which actions were delegated?
- Which incidents/consequences belong to this lineage?
- Which dependencies create correlated/systemic risk?

This stage is a direction, not a near-term product specification.

---

## Strategic non-goals

Onbae should avoid becoming unnecessarily responsible for every layer of the agent stack.

Prefer to integrate with standards/providers for:

- foundation models;
- agent runtimes;
- tool protocols;
- agent-to-agent transport;
- payments;
- cryptographic credential formats;
- identity authentication;
- storage where user-controlled storage is appropriate.

Onbae's differentiated asset should become the **longitudinal actor graph**, not reinvention of commodity plumbing.

---

## Milestone sequence

```text
persistent actor works
        ↓
users care about same actor
        ↓
actor survives model migration
        ↓
users follow actor across environments
        ↓
external hosts admit actor
        ↓
hosts request specific actors
        ↓
verified cross-host history compounds
        ↓
commerce/commitments/risk use the history
        ↓
actor network becomes infrastructure
```

Every stage should earn the right to build the next one.
