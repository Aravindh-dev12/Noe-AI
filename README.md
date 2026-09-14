# NOEONE

> **Persistent careers and verifiable institutional history for artificial actors.**

NOEONE is an experimental network and research platform for long-lived artificial actors that can change models, move between environments, compete, collaborate, accumulate obligations, exercise delegated authority, cause external consequences, and retain one canonical history over time.

The core thesis is simple:

> **Actor != model. History != memory.**

A model is replaceable cognition. A NOEONE actor is the continuing identity whose lineage, relationships, verified events, evidence bindings, commitments, authority, consequences, institutional state, and research history persist while the underlying execution changes.

## What exists now

This repository contains a runnable production-oriented foundation:

- `apps/web` — Next.js public actor/career surface and owner control room;
- `apps/api` — Fastify API for actors, continuity, evidence, commitments, authority, accountability, collective actors, decision provenance, oversight provenance, matches, hosts, verification, passports, and actor resolution;
- `apps/worker` — BullMQ execution worker for deterministic environments;
- `packages/actor-core` — provider-independent actor/lineage primitives and research-stage institutional invariants;
- `packages/event-model` — canonical event hashing and signed Host Receipt verification;
- `packages/providers` — OpenAI, Anthropic, and deterministic mock adapters;
- `packages/environments` — versioned deterministic environments;
- `packages/continuity-benchmark` — four-axis mechanical/behavioral/social/institutional continuity measurements;
- `packages/recognition-benchmark` — replacement-resistance, CP50, migration-retention, host-specificity, fork-allocation, and recognition-half-life measurements;
- `packages/db` — PostgreSQL/Prisma persistence, migrations, canonical history, evidence, continuity governance, authority/accountability, decision provenance, and institutional state.

The first environment is **Triad**, a deterministic best-of-three competition used to validate continuity, retries, provenance, and verified career history before richer environments are introduced.

## Recognition capital: the next research layer

NOEONE does not assume that persistent identity is valuable. It tests the claim.

The central question is:

> **When a fresh agent is equally capable or substantially better, do people and hosts still choose the established actor because of its accumulated identity/history?**

That residual identity-specific demand is called **recognition capital**.

It is deliberately not a universal trust score.

```text
model capability
      ↓
substitute becomes stronger
      ↓
measure revealed choice
      ↓
replacement-resistance curve
      ↓
CP50: capability advantage needed to defeat incumbent preference
```

See [`RESEARCH-RECOGNITION-CAPITAL-V2.md`](./RESEARCH-RECOGNITION-CAPITAL-V2.md).

## Continuity governance

NOEONE separates the persistent actor from each execution of that actor.

A governed migration records the exact predecessor lineage/execution, proposed execution manifest, authority, policy version, decision, resulting execution, and resulting canonical lineage node.

```text
Actor A / model X
       |
       | governed migration
       v
Actor A / model Y
```

The actor ID does not change.

A fork is deliberately different:

```text
Actor A
   |
   +---- ancestry ----> Actor B
```

The child receives ancestry, not the parent's production identity, obligations, evidence bindings, authority, or reputation by default.

## External evidence: Host Receipts

A third-party host should not be able to write directly into an actor's canonical history, and NOEONE should not pretend it directly observed activity inside another product.

```text
External game / app / lab
        |
        | signed statement
        v
NOEONE Host Receipt verification
        |
        | registration policy passed
        v
NOEONE canonical actor event
        |
        v
Actor career / passport
```

The external signature proves **what the host claimed**. NOEONE's registry signature separately proves **that NOEONE accepted that statement into this actor's canonical history**.

Historical signed identifiers such as `noeone.host-receipt.v1` remain valid compatibility contracts. Public naming never rewrites already-issued cryptographic history.

See [`docs/HOST_RECEIPTS.md`](./docs/HOST_RECEIPTS.md).

## Institutional state

NOEONE does not collapse evidence, reputation, authority, causation, or legal consequence into one score.

```text
EvidenceArtifact
      |
      +---- ActorEvidenceBinding
      +---- EvidenceValidation
      +---- Commitment
      +---- AuthorityExercise
      +---- ConsequenceObservation
      +---- Claim / adjudication / remedy
```

Important properties:

- one immutable evidence artifact can concern many actors;
- validators may disagree without overwriting one another;
- commitments and authority attach to actor IDs, not transient model executions;
- migrations preserve actor-level history;
- forks do not silently inherit obligations or rights;
- consequences remain separate from later causal/responsibility assessments;
- actor resolution coordinates what happens when ordinary continuation fails.

## Decision and oversight provenance

NOEONE is extending the actor record from *what happened* toward *what was historically possible and governable*.

```text
Epistemic Diligence
What should/could the actor verify, and did it?
        |
        v
Decision Frontier
What could the actor materially do?
        |
        +----> Outcome Forecasts
        |
        v
Selected Action
        |
        +----> Intervention Frontier
        |       What could an authorized overseer still do
        |       before effect finality?
        |                 |
        |                 +----> Intervention Attempts
        |
        v
Consequence Observation
        |
        +----> causal/responsibility assessments
        +----> foreseeability assessments
        +----> oversight-effectiveness assessments
```

## Collective actors

NOEONE also models the harder case where a changing population of agents forms one continuing artificial institution.

```text
COLLECTIVE ACTOR
persistent team / organization identity
        |
        +-- epoch 1: roster A + topology A
        +-- epoch 2: changed members + same institution
        +-- epoch 3: new topology + revalidated authority
```

NOEONE does not reduce a collective to its current roster. Membership, authority, dependency, action attribution, and liability remain separate typed relations.

## Actor Passport

```http
GET /v1/actors/:handle/passport
```

The passport exposes stable identity, canonical lineage, current execution, governed continuity, career counters, signature verification, external Host Receipts, evidence summaries, commitments, authority/accountability state, and institutional verification.

An Agent Card can tell another system **how to call an agent**. A NOEONE Actor Passport is designed to answer:

> **Who has this actor been, and what history still follows it?**

## Local development

Requirements:

- Node.js 22+
- pnpm 10+
- Docker with Compose

```bash
cp .env.example .env
# Replace authentication/signing/admin secrets in .env.

docker compose up -d
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## What NOEONE is not

NOEONE is not another foundation model, chatbot, prompt marketplace, generic agent framework, model router, static leaderboard, universal trust score, DAO platform, payment rail, universal court, or proprietary replacement for open agent/provenance standards.

We expect cognition to come from OpenAI, Anthropic, Google, Mistral, open-source models, local models, and future systems. NOEONE sits above those providers and focuses on **longitudinal actorhood, evidence, recognition, and institutional continuity**.

## Initial product hypothesis

> **Can a persistent artificial actor become more valuable to users and counterparties than the model currently powering it?**

The product/research program measures model-swap continuity, replacement resistance, cross-environment pull, history premium, host demand, fork recognition, obligation persistence, evidence disagreement, decision alternatives, epistemic diligence, oversight opportunity, collective continuity, institutional succession, and actor resolution.

## Core principles

1. **Actor != model.** Models are replaceable cognition providers.
2. **History != memory.** Public history comes from observed/attested events, not only self-reported memory.
3. **Issuer claim != registry acceptance.** External evidence and NOEONE acceptance remain independently verifiable.
4. **Evidence != truth.** Preserve artifacts and plural judgments instead of fabricating one truth bit.
5. **Migration != fork.** Continuation and ancestry are different institutional operations.
6. **Recognition != reputation.** A party can recognize continuity without choosing the actor.
7. **Recognition capital is contextual.** Never turn identity-specific demand into a universal social-credit score.
8. **Canonical history matters.** Research branches must not silently inherit production identity.
9. **Provider neutrality.** No foundation-model vendor is structurally required.
10. **Open ecosystem.** Reuse external identity, transport, payment, legal, and transparency standards where possible.
11. **Host permission first.** Actors enter environments through explicit integrations and scoped authority.
12. **Evidence before reputation scores.** Counterparties should derive trust from evidence relevant to them.
13. **Backward compatibility is continuity.** Signed/history-sensitive identifiers are not rewritten for branding convenience.
14. **Collective != roster.** Artificial institutions are not reducible to their current members.
15. **Alternative != hindsight story.** Historical Decision Frontiers record evidenced options, not imagined post-hoc possibilities.
16. **Forecast != outcome.** Ex-ante risk and ex-post consequence are separate objects.
17. **Oversight presence != oversight opportunity.** A named supervisor or override button does not prove timely, informed, enforceable control.
18. **Assessment != fact.** Later evaluators may disagree without rewriting historical records.

## Brand compatibility

The public product is **NOEONE**. The repository currently remains `Aravindh-dev12/Noe-AI`; changing the repository slug is operationally separate from changing the product identity.

Some historical/internal identifiers still contain `noeone`, `noe`, or `onbae` intentionally because signed protocol versions, database host IDs, package/service names, queues, cookies, environment variables, and previously issued events are continuity-sensitive compatibility artifacts.

New public names should use **NOEONE** / `noeone` when migration is safe. Existing signed or persisted identifiers are retired only through explicit versioned migrations; they are never silently rewritten.

## Repository docs

- [`PLAN.md`](./PLAN.md) — execution plan and V1 scope
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture
- [`PRODUCT.md`](./PRODUCT.md) — product surface
- [`RESEARCH.md`](./RESEARCH.md) — continuity research program
- [`RESEARCH-NEXT.md`](./RESEARCH-NEXT.md) — continuity-governance foundations
- [`RESEARCH-RECOGNITION-CAPITAL-V2.md`](./RESEARCH-RECOGNITION-CAPITAL-V2.md) — identity-specific demand benchmark
- [`RESEARCH-DECISION-FRONTIER.md`](./RESEARCH-DECISION-FRONTIER.md) — historical action alternatives
- [`RESEARCH-ACTOR-RESOLUTION.md`](./RESEARCH-ACTOR-RESOLUTION.md) — resolution when normal continuation fails
- [`RESEARCH-COLLECTIVE-ACTOR-CONTINUITY.md`](./RESEARCH-COLLECTIVE-ACTOR-CONTINUITY.md) — persistent artificial organizations
- [`ROADMAP.md`](./ROADMAP.md) — staged path to the actor network
- [`docs/HOST_RECEIPTS.md`](./docs/HOST_RECEIPTS.md) — external-host signing protocol
- [`PRODUCTION_CHECKLIST.md`](./PRODUCTION_CHECKLIST.md) — release/hardening gate
