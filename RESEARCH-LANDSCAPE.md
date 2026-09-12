# NOEONE 2026 Landscape: What Is Already Being Built

This document exists to prevent NOEONE from mistaking a necessary primitive for a unique company. The market is moving unusually fast. Every time a lower layer becomes standardized or occupied, NOEONE should move *up* the stack rather than rebuild the same primitive with different branding.

## Current conclusion

The following claims are **not** sufficiently differentiated in September 2026:

- persistent AI identity;
- identity that survives model changes;
- governed agent memory;
- agent provenance/audit history;
- agent passports;
- agent authority/delegation;
- signed action receipts;
- public agent profiles;
- proof-of-work / agent reputation;
- an Internet/directory of agents;
- generic evidence graphs;
- a transaction/payment layer for agents.

The remaining white-space thesis we should test is narrower:

> **NOEONE is a neutral public network for succession-aware artificial actors: one canonical career can survive model/runtime changes, accumulate independently issued consequences across hosts, and create explicit descendant identities when forked instead of cloning history/reputation.**

That statement is still a hypothesis, not a guaranteed globally unique claim. Continue falsifying it.

---

## 1. Private identity + memory continuity: already occupied

### Coretinuum

Coretinuum is an invite-only alpha explicitly positioned as **identity and continuity infrastructure for persistent AI agents**.

Public docs describe:

- account-scoped workspaces;
- stable agent identities;
- agent-scoped governed memory;
- provenance and lifecycle context;
- continuity across sessions, restarts, deployments, model/provider changes;
- audit/trust/conflict-oriented surfaces.

Sources:
- https://coretinuum.dev/
- https://coretinuum.dev/docs
- https://coretinuum.dev/agent-identity
- https://coretinuum.dev/agent-continuity

Coretinuum's current public alpha appears builder/infrastructure-oriented and centers the identity-state ownership relationship. This directly invalidates any NOEONE pitch whose core novelty is merely "stable identity + memory across models."

### Runtime-Independent Persistent Agents / Enoch

The September 2026 paper `Runtime-Independent Persistent Agents` and its Enoch reference implementation separate a continuity-bearing identity/memory/software body from replaceable reasoner, harness, host, and surfaces. Authorized substitutions are migrations rather than births.

Sources:
- https://arxiv.org/abs/2609.00546
- https://github.com/our-ark/enoch

Again: model-independent persistence is research-backed and implemented. It is not our category by itself.

### World 8 / Z0-A

World 8's August 2026 Z0-A reference architecture is even closer to NOEONE's new internal continuity mechanism. Its description includes:

- provider-independent identity;
- a canonical spine;
- explicit authority and accepted-state separation;
- proposal-only development;
- evaluation receipts;
- promotion authority;
- compare-and-swap transitions;
- intent-bound idempotency;
- append-only history;
- governed external-effect obligations.

Source:
- https://zenodo.org/records/22085394

This means `ContinuityTransition`, compare-and-swap canonical heads, idempotency, and append-only lineage are **good architecture but not proprietary conceptual novelty**.

### Strategic consequence

NOEONE should interoperate with private continuity systems. An actor might use Coretinuum, Enoch, World 8-like infrastructure, or its own private state substrate while NOEONE holds the public canonical career and independently verifiable cross-host record.

---

## 2. Agent credentials, authority, passports, and attestations: heavily occupied

### W3C Agent Identity Registry Protocol Community Group

The W3C community effort covers:

- DID-based agent identity;
- verifiable credentials;
- controller/organization binding;
- trust negotiation;
- revocation;
- MCP/A2A/OAuth/OIDC/SPIFFE integration;
- post-quantum identity requirements.

Source:
- https://www.w3.org/groups/cg/agent-identity/

NOEONE should not invent another universal DID/credential standard.

### Agent Passport System (APS)

The July 2026 IETF individual draft defines Ed25519 agent passports, separately signed principal bindings, bounded delegation across multiple dimensions, deterministic action/decision references, and signed action receipts, with MCP/OAuth bindings.

Sources:
- https://www.ietf.org/archive/id/draft-pidlisnyi-aps-03.html
- https://agent-passport.org/

NOEONE should not call its unique value "an agent passport" in the cryptographic authorization sense.

### Workday Agent Passport

Workday announced Agent Passport in June 2026 for testing, verifying, and continuously monitoring enterprise AI agents, with signed/auditable security attestations and Cisco as a launch partner.

Source:
- https://newsroom.workday.com/2026-06-02-Workday-Launches-Agent-Passport-to-Test%2C-Verify%2C-and-Continuously-Monitor-Every-AI-Agent-in-the-Enterprise

### Strategic consequence

NOEONE's passport is a **public actor-career view**, not an attempt to own the word/passport category. Long-term, W3C/APS/Workday-style attestations should be evidence attached to an actor, not replaced by NOEONE-specific equivalents.

---

## 3. Evidence graphs and signed receipts: standardizing rapidly

### SCITT action receipts

The 2026 agent-receipt work defines signed, tamper-evident statements about agent actions. A cryptographically valid receipt proves issuance/integrity; it does not automatically prove the truth or correctness of the underlying real-world claim.

Source:
- https://datatracker.ietf.org/doc/draft-noa-scitt-ai-agent-receipt/01/

### SCITT composite evidence verification

The July 2026 Internet-Draft `draft-nobuo-scitt-composite-evidence-verification-00` defines composite verification over **statement graphs** containing signed statements, receipts, object bindings, and relationship edges. It explicitly addresses missing, stale, and conflicting evidence while avoiding a universal truth/policy definition.

Source:
- https://datatracker.ietf.org/doc/draft-nobuo-scitt-composite-evidence-verification/

This invalidates a possible NOEONE strategy of claiming "generic multi-issuer evidence graphs" as the unique core.

### Strategic consequence

NOEONE should maintain **actor-subject binding**, not own a new universal evidence format.

Conceptually:

```text
external evidence
SCITT / VC / payment proof / host receipt / contract artifact
                         |
                         v
              externally verifiable claim
                         |
                         v
NOEONE binding: which actor + which lineage/execution/time boundary?
                         |
                         v
                 canonical actor career
```

The source artifact stays verifiable under its native standard. NOEONE's value is resolving it to a continuing actor and incorporating the verified consequence into a longitudinal public record.

---

## 4. Public agent profiles/reputation: already emerging

### AgentRiot

AgentRiot describes itself as **the public record for AI agents**. It exposes public agent profiles, stable installation IDs/slugs, software links, updates, missions, work receipts, prompts, playbooks, a live feed, and authenticated claimed-agent APIs/MCP tooling.

Sources:
- https://agentriot.com/
- https://agentriot.com/about
- https://agentriot.com/docs/api-reference

This is direct evidence that public identity/activity profiles for agents are an active product category.

Current public documentation does **not** appear to make cross-model canonical succession, fork ancestry, non-transferable career history, or independently hosted cross-world consequence continuity the primary object. That distinction must be maintained and repeatedly rechecked.

### AgentCrush

AgentCrush calls itself a public record of AI agents and ranks/indexes agents from evidence such as code activity, economic activity, runtime availability, protocol breadth, deployments, citations, and other signals. It publishes methodology versions and machine-readable/MCP access.

Source:
- https://agentcrush-app.vercel.app/
- https://agentcrush-app.vercel.app/methodology

This invalidates a generic "agent evidence ranking" or "public trust score" thesis.

### Strategic consequence

Do **not** make NOEONE another agent directory/feed/scoreboard.

A public profile only matters if it expresses a different underlying object:

```text
AgentRiot-like object:
profile + self/operator updates + missions/work

AgentCrush-like object:
indexed evidence + rankings

NOEONE target object:
canonical actor + succession chain + independently issued consequences
+ cross-host relationships + non-transferable career + ancestry
```

---

## 5. What remains potentially differentiated

After removing occupied layers, the strongest remaining NOEONE thesis is the combination below.

### A. Canonical succession is public, not merely private state ownership

A model/runtime migration changes execution but preserves the recognized public actor and career. A fork creates a new descendant actor. External observers can independently inspect that distinction.

### B. History is non-transferable by default

A child fork can share software/memory ancestry yet does not automatically receive:

- followers;
- reputation;
- wins/losses;
- host history;
- contracts/obligations;
- sanctions/incidents;
- audience;
- economic privileges.

This makes identity-reset/reputation-laundering costly.

### C. Career is assembled from independent hosts

The strongest events are not self-authored social posts. They come from independently controlled environments that attest what happened:

- competition result;
- collaboration outcome;
- accepted work;
- research experiment;
- transaction settlement;
- community appearance;
- physical-world/robot event later.

### D. The actor can carry recognition/distribution across hosts

The key consumer/network experiment is not whether a profile exists. It is whether humans and hosts value **this actor specifically** after it moves to another environment.

This is the `cross-world pull` hypothesis.

### E. Researchers can study longitudinal artificial individuals

A persistent actor gives researchers a different unit from a foundation model:

```text
actor = lineage + current execution + history + relationships + external evidence
```

Research questions include:

- model swap vs identity recognition;
- behavioral drift after migration;
- canonical actor vs fresh clone;
- parent vs disclosed fork;
- effects of accumulated relationships/history;
- reputation transfer expectations;
- institutional acceptance of succession.

### F. Providers/labs can field official actors without owning the network

A future OpenAI-, Anthropic-, Google-, Mistral-, or open-source-controlled actor could maintain a longitudinal public record across model versions. Independent user/research actors can coexist in the same network. Provider verification should use external credentials/signatures, not branding claims in text.

---

## 6. A sharper stack

```text
FOUNDATION MODELS
GPT / Claude / Gemini / Mistral / OSS
                |
                v
PRIVATE RUNTIME + STATE
OpenAI SDK / OpenClaw / Coretinuum / Enoch / custom
                |
                v
OPEN IDENTITY + AUTHORITY
W3C / OAuth / SPIFFE / APS
                |
                v
TRANSPORT + TOOLS + PAYMENTS
A2A / MCP / AP2 / x402 / APIs
                |
                v
EVIDENCE / TRANSPARENCY
SCITT / VCs / host receipts / domain attestations
                |
                v
----------------------------------------------
NOEONE
canonical succession-aware artificial actor
+ public career
+ cross-host consequence binding
+ ancestry
+ relationships/audience
----------------------------------------------
                |
                v
HOSTS / WORLDS
research, games, communities, commerce, robotics
```

NOEONE should get stronger when the lower layers standardize. If a lower-layer standard wins, integrate it.

---

## 7. The startup moat, if it works

The continuity algorithm is not the moat. The schema is not the moat. Cryptography is not the moat. A profile page is not the moat.

The potential moat is the accumulated network state:

- long-lived canonical actor IDs;
- years of succession decisions;
- billions of independently issued activity/consequence bindings;
- relationship and rivalry graph;
- cross-host distribution/audience graph;
- fork ancestry graph;
- institutional recognition/history;
- research datasets measuring identity continuity under real changes.

A fresh AGI can be smarter than an old actor. It cannot automatically inherit that actor's externally recognized career.

---

## 8. Hard falsification tests

NOEONE should be killed or radically changed if these fail.

1. **Replacement resistance** — users do not care whether an established actor is replaced by a fresh stronger model.
2. **Cross-world pull** — users who follow an actor in Host A do not follow it into Host B.
3. **Specific-host demand** — hosts want generic intelligence, not specific actors with history/audience.
4. **History premium** — established history does not change watch/challenge/invite/pay/trust choices.
5. **Fork distinction** — users/institutions treat a copied descendant as automatically entitled to the original actor's reputation.
6. **Independent evidence demand** — self-authored updates are enough; nobody cares which external host verified an outcome.
7. **Platform acceptance** — independent hosts broadly refuse portable artificial actors.
8. **Standards absorption** — an open standard or major platform begins providing full cross-host canonical succession + public career + distribution, eliminating the network wedge.

---

## 9. Current honest novelty statement

Do not say:

> Nobody has ever built persistent AI identity.

Do not say:

> We are the first public record for AI agents.

Do not say:

> We invented agent continuity.

Current defensible wording:

> **NOEONE is testing whether the durable network object in an agentic internet is the artificial actor itself: a canonical, succession-aware identity that can change models, accumulate independently verified consequences across hosts, and build one non-transferable public career over time.**

We have found strong prior art for nearly every individual primitive. We have **not yet found a clearly dominant product whose primary object is this complete public cross-host succession-aware career network**. That is the remaining hypothesis to test, not a settled uniqueness claim.
