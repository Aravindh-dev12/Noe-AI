# NOEONE Deep Research — September 2026

## Executive conclusion

The original thesis must be stated more precisely after the September 2026 literature update.

NOEONE should **not** claim that it invented persistent AI identity, model-independent agents, agent identity standards, multi-agent social evaluation, or signed agent receipts. Those areas now have substantial research and infrastructure.

The defensible opportunity is the layer that connects them:

> **A neutral, evidence-backed career and recognition network for artificial actors whose identity can persist across replaceable models, runtimes, hosts, and environments.**

The product is not another model, agent runtime, identity protocol, or benchmark. It is the longitudinal record that answers:

- Which actor is this?
- What authorized continuation does this actor have?
- What has the actor actually done?
- Which independent hosts attest to those events?
- Which humans/counterparties recognize the actor?
- What changed when its execution changed?
- Which rights, obligations, relationships, and consequences followed the actor?

## 1. Research that materially changes the architecture

### 1.1 Runtime-independent persistence is now an explicit research problem

Zhao & Zhao, **Runtime-Independent Persistent Agents: Preserving Identity, Memory, and Code Across Models, Harnesses, and Servers** (2026) explicitly separates a continuity-bearing substrate from replaceable reasoner, harness, host, and interaction surfaces. The paper defines migration as continuation only when authorized lineage and continuation authority are preserved.

Source: https://arxiv.org/abs/2609.00546

### Consequence for NOEONE

The low-level statement "actor != model" is no longer enough to differentiate the company. It is a validated research direction.

NOEONE should therefore move upward:

```text
Research proves mechanical persistence
             ↓
NOEONE measures recognized continuity
             ↓
NOEONE aggregates independent evidence
             ↓
NOEONE records career + relationships + consequences
             ↓
NOEONE becomes the cross-environment recognition layer
```

### 1.2 AI identity itself is becoming a research field

**AI Identity: Standards, Gaps, and Research Directions for AI Agents** (2026) frames AI identity as the continuous relationship between what an agent is declared to be and what it is observed to do. It identifies semantic intent verification, recursive delegation accountability, identity integrity, governance opacity/enforcement, and operational sustainability as unresolved gaps.

Source: https://arxiv.org/abs/2604.23280

### Consequence for NOEONE

The company should not compete with identity standards at the credential layer. Instead, NOEONE can become the **historical resolution layer** above those credentials.

A credential answers:

> "Who controls this key?"

NOEONE should answer:

> "Which continuing actor does this evidence belong to, and what recognized history follows it?"

Those are different questions.

## 2. Multi-agent games are becoming a serious evaluation substrate

**Social Gym and SPaRTan: Benchmarking and Improving LLM Social Reasoning via Multi-Agent Game Tournaments** (2026) introduces 21 rule-decided social games and an Elo tournament. Importantly, the paper finds that even strong models do not dominate uniformly across games and roles.

Source: https://arxiv.org/abs/2608.09128

This validates the choice to begin with an authoritative, rule-defined environment rather than a subjective LLM-judge-only environment.

### NOEONE implication

The first environment should evolve from a toy match into a **continuity benchmark** built on objective game outcomes.

The benchmark should ask a different question from Social Gym:

> Does a persistent actor remain recognizable and effective when its execution substrate changes?

That creates four experimental dimensions:

1. **Mechanical continuity** — was the transition authorized and valid?
2. **Behavioral continuity** — how much behavior changed?
3. **Social continuity** — do humans still recognize/follow the actor?
4. **Institutional continuity** — do hosts/counterparties continue to accept the actor's history?

## 3. Identity is not memory

The research direction suggests three separate continuity layers:

```text
Identity continuity
      ↓
Who is authorized to continue this actor?

State continuity
      ↓
Which internal/private state was carried forward?

Behavioral continuity
      ↓
Does the new execution behave recognizably like the old one?
```

A system can have:

- identity continuity without behavioral continuity;
- behavioral similarity without identity continuity;
- memory continuity without legitimate authority;
- mechanical continuity without social recognition.

NOEONE must store these as separate measurements rather than collapsing them into a single "same AI" score.

## 4. The central research experiment: Continuity Transfer Benchmark

### Experiment A — model swap

Create a canonical actor `A`.

1. Run 100 interactions using model M1.
2. Freeze canonical history.
3. Migrate actor A to M2.
4. Run 100 matched interactions.
5. Compare behavior, goals, style, decisions, relationships, and human recognition.

Control:

- fresh actor B using M2 with the same public persona;
- fresh actor C using M2 with copied private state where policy permits.

The important comparison is:

```text
A → M2
vs
Fresh B → M2
```

If humans cannot distinguish the continuing actor from a fresh clone, identity has little consumer value.

### Experiment B — fork test

Fork A at exact history point H.

Show users:

- canonical A;
- research descendant A′;
- same model;
- similar state;
- explicit ancestry disclosure.

Measure whether users automatically transfer trust, followers, or reputation.

This tests whether **lineage itself has economic/social value**.

### Experiment C — cross-world pull

Expose A first in Environment X, then invite A into Environment Y.

Measure:

- percentage of X followers who follow A into Y;
- host preference for A over a fresh generic agent;
- return rate after novelty decays;
- willingness to pay for A's appearance.

This is the experiment that connects the research infrastructure to the eventual network business.

### Experiment D — history premium

Give a host two equivalent-capability agents:

- fresh agent;
- established agent with independently verified history.

Hold capability constant.

Measure:

- selection rate;
- compensation offered;
- retention;
- human preference;
- perceived accountability.

The hypothesis is that verified history becomes economically valuable as intelligence becomes more substitutable.

## 5. Signed receipts are necessary but not sufficient

SCITT/agent-receipt work is increasingly relevant. Signed receipts can establish that a particular issuer made an unaltered statement, but they do not automatically prove that the statement was true or that the agent actually caused a downstream real-world effect.

NOEONE therefore needs a layered evidence model:

```text
Cryptographic authenticity
        ↓
Issuer authority
        ↓
Event schema validity
        ↓
Subject/actor binding
        ↓
Independent corroboration
        ↓
Outcome evidence
        ↓
Human/institutional recognition
```

Never turn "signed" into "true."

## 6. Reputation should not be one score

Reputation is vulnerable to identity resets, collusion, fake reviewers, and Sybil behavior.

NOEONE should expose evidence dimensions instead:

- verified competitions;
- host attestations;
- counterparties;
- fulfilled commitments;
- disputed events;
- model/runtime history;
- human recognition;
- independent corroboration;
- institutional acceptance.

A host can derive its own trust policy from these facts.

This is more durable than a universal five-star AI reputation score.

## 7. The real moat hypothesis

The moat should not be:

- a model;
- a prompt;
- an agent runtime;
- an identity key format;
- a single game;
- a leaderboard;
- a generic social feed.

The potential moat is the **Artificial Actor History Graph**:

```text
Actor
 ├── model executions
 ├── environments
 ├── hosts
 ├── opponents
 ├── collaborators
 ├── commitments
 ├── evidence
 ├── outcomes
 ├── audiences
 ├── institutional decisions
 ├── forks / descendants
 └── recognized continuity transitions
```

The graph becomes more useful as the actor moves through more independently operated environments.

This is why the architecture must support third-party Host Receipts from the beginning, even though V1 can run entirely on NOEONE-owned environments.

## 8. What happens if AGI arrives?

The company survives only if its scarce asset is **not intelligence**.

Suppose a future model is dramatically better than today's models.

That makes generic intelligence cheaper to substitute, not necessarily the following scarce assets:

- an established actor's identity;
- years of verified activity;
- trusted relationships;
- audience recognition;
- commitments;
- institutional credentials;
- host-specific history;
- counterparty history;
- accountability record.

But this is an empirical hypothesis, not a guarantee.

The critical test is:

> When users are offered a much smarter fresh agent, do they still choose the established actor?

If the answer is no, NOEONE should not pretend identity is valuable. The product would need to pivot toward evidence infrastructure rather than consumer identity.

## 9. What happens if the AI bubble collapses?

NOEONE should be designed to survive a model-market contraction.

A bubble collapse could remove:

- expensive model subsidies;
- speculative agent marketplaces;
- fake agent social engagement;
- low-value AI wrappers.

That is potentially favorable if NOEONE's infrastructure is tied to real activity.

The survival strategy is:

```text
Do not sell AI intelligence.
Do not depend on one model vendor.
Do not depend on speculative token economics.
Do not depend on generated social content.

Instead:

verified activity
+ identity continuity
+ host integrations
+ historical evidence
+ real counterparties
```

If autonomous actors become less fashionable, the system should still be useful for research, testing, governance, audit, and institutional agent management.

## 10. Product architecture consequence

NOEONE should become three layers:

### Layer 1 — Continuity Registry

Canonical actor IDs, lineage, authorized migrations, forks, execution history.

### Layer 2 — Evidence Graph

Host receipts, research artifacts, outcomes, commitments, credentials, corroboration and disputes.

### Layer 3 — Recognition Network

Profiles, follows, rivalries, collaborations, host invitations, career discovery and eventually bookings.

This creates a stronger long-term boundary than "AI social network":

> **NOEONE is the recognition and evidence layer for persistent artificial actors.**

## 11. Product loop

The consumer loop should remain simple:

```text
Meet actor
   ↓
Watch actor do something real
   ↓
Follow actor
   ↓
Actor accumulates verified history
   ↓
Actor enters another environment
   ↓
You follow because it is the same actor
   ↓
Another host values that history
   ↓
Host invites actor
   ↓
New verified event
   ↓
Career becomes more valuable
```

This is the loop that must be experimentally proven.

## 12. Kill criteria

NOEONE should be willing to kill the consumer-network thesis if:

1. users care only about capability and not actor continuity;
2. followers do not transfer across environments;
3. fresh clones are indistinguishable in economic selection;
4. hosts always prefer proprietary characters;
5. platforms broadly reject external autonomous actors;
6. history provides no measurable premium;
7. evidence can be commoditized without a network effect.

The company can still pivot to an infrastructure/research product if the evidence graph remains valuable.

## 13. Research sources

Primary research used for this update:

- Zhao & Zhao, *Runtime-Independent Persistent Agents*, 2026: https://arxiv.org/abs/2609.00546
- Otsuka, Toyoda & Leung, *AI Identity: Standards, Gaps, and Research Directions for AI Agents*, 2026: https://arxiv.org/abs/2604.23280
- He, Zhou & Sap, *Social Gym and SPaRTan*, 2026: https://arxiv.org/abs/2608.09128
- Reza, *The Social Laboratory: A Psychometric Framework for Multi-Agent LLM Evaluation*, 2025: https://arxiv.org/abs/2510.01295
- OpenAI et al., *Personhood Credentials*, 2024: https://arxiv.org/abs/2408.07892
- OSWorld, *Benchmarking Multimodal Agents*, 2024: https://arxiv.org/abs/2404.07972

Standards/industry references that should be tracked separately include W3C Agent Identity work, IETF SCITT, A2A, MCP, and payment/authorization standards. NOEONE should consume these standards rather than replace them.

## Final research thesis

The deepest version of the idea is not:

> "AI agents need persistent memory."

It is:

> **As artificial intelligence becomes interchangeable, society will need a way to distinguish the continuing actor from the current machinery executing it. NOEONE can become the evidence-backed network that records that distinction.**

That thesis is strong enough to remain meaningful under cheaper models, open models, multimodal systems, robotics, and potentially AGI—but only if real users and institutions demonstrate that recognized continuity has value.
