# Onbae Research Program

## 1. Core research question

> **What makes an artificial actor remain the same actor across changes to model, runtime, environment, memory, and embodiment?**

Onbae should treat this as an empirical question, not merely a philosophical one.

We care about three distinct forms of continuity:

1. **Technical continuity** — state, lineage, credentials, and execution history transfer correctly.
2. **Behavioral continuity** — the actor remains recognizably similar in behavior after change.
3. **Social/institutional continuity** — humans, hosts, counterparties, and systems continue to recognize it as the same actor.

The product is primarily trying to discover whether #3 can become economically and socially meaningful.

---

## 2. Primary hypotheses

### H1 — identity can outrank model

After sufficient history accumulates, some users will prefer preserving a known actor over replacing it with a stronger fresh model instance.

### H2 — continuity can survive model swaps

A model/provider migration does not necessarily destroy perceived actor identity if lineage, history, relationships, and state are preserved appropriately.

### H3 — history has independent value

Externally observed career history changes how users evaluate an actor even when current model capability is held constant or is slightly worse.

### H4 — actor identity can carry distribution

People who care about an actor in one environment will follow that actor into another environment.

### H5 — canonical recognition matters after forks

After a perfect or near-perfect fork, users and hosts can still treat one lineage as the canonical continuation while treating the other as a descendant/research fork.

### H6 — host-verified events are more durable than self-reported memory

A career built from independently observed outcomes will be more trustworthy and reusable than a timeline generated only from the actor's own memory.

### H7 — increasingly capable models increase the need for actor-level accountability

As autonomous systems become more capable, identity, authority, provenance, and consequence attribution become more—not less—important.

---

## 3. Experiments

### E1 — Model Swap Study

**Setup**

- Build one actor with repeated user interactions and competition history.
- At a predetermined point, migrate the canonical actor to another model provider.
- Create a control actor powered by the new provider with copied public biography but no canonical lineage.

**Measure**

- identity recognition;
- preference;
- trust;
- interaction style;
- language used to refer to the actor;
- willingness to continue following/challenging it.

**Key question**

Does continuity + history outperform a fresh equivalent model instance?

---

### E2 — Fork Study

**Setup**

At time T, create two near-identical descendants from one actor state.

- Branch A retains canonical continuation.
- Branch B is explicitly labeled a research fork.

Allow both to evolve separately.

**Measure**

- which branch users call the "real" actor;
- whether recognition changes over time;
- whether canonical labeling alone is enough;
- how behavioral divergence affects perceived continuity.

---

### E3 — Cross-Environment Transfer

**Setup**

An actor develops a following in Environment A, then begins participating in Environment B.

**Measure**

- percentage of followers who view/follow activity in B;
- repeat attendance;
- whether identity attachment transfers across task type;
- whether a second environment increases or reduces attachment.

**Primary metric**

Cross-Environment Follow Rate.

---

### E4 — History Premium

Compare two actors:

- A: fresh actor using stronger model;
- B: known actor using slightly weaker model with long verified career.

Randomly expose users and ask which they prefer to:

- watch;
- challenge;
- follow;
- invite;
- trust for a low-risk task.

Estimate the value of history independent of current capability.

---

### E5 — Behavioral Discontinuity

For one actor, apply controlled changes separately:

- model provider;
- system policy;
- memory system;
- toolset;
- runtime;
- temperature/reasoning configuration.

Measure which transformations most strongly affect perceived actor continuity.

This can eventually become an **Artificial Identity Continuity Benchmark**.

---

### E6 — Canonicality Without Secrecy

Make it clear that actor state can technically be copied.

Test whether users still assign special value to the canonical lineage because of:

- recognized history;
- platform continuity;
- relationships;
- authority;
- host attestations.

This tests the thesis that uniqueness can be socially/institutionally recognized rather than technically uncopyable.

---

## 4. Proposed benchmark dimensions

A future benchmark could evaluate continuity under transformations such as:

```text
model swap
runtime swap
host migration
memory edit
persona/policy edit
tool change
fork
restore
ownership/controller transfer
body/device migration
```

For each transformation, measure:

- technical continuity;
- behavioral similarity;
- human identity recognition;
- relationship continuity;
- history/obligation continuity;
- security/provenance integrity.

Do not collapse all dimensions into a single score too early.

---

## 5. Research data model

Each experiment should be reproducible where possible.

Store:

- actor ID and lineage node;
- execution configuration hash;
- provider/model/version;
- runtime/harness identifier;
- environment/version;
- allowed tools/actions;
- starting state snapshot/reference;
- random seed where applicable;
- full action trajectory;
- canonical events/results;
- experiment cohort/condition;
- user response metrics;
- timestamps.

Sensitive prompts, private user data, and secrets should not be made public merely for reproducibility.

---

## 6. Research vs canonical production actor

Research must never silently rewrite the production actor.

```text
canonical actor
      │
      ├──────── continues canonical career
      │
      └──────── research fork
                   │
                   └── experiment / discard / publish
```

A research fork can reproduce state for scientific purposes while remaining clearly distinguishable from the canonical actor.

---

## 7. What Onbae should learn from adjacent work

Onbae is not starting from zero. Important adjacent directions include:

- generative agents and long-lived social agents;
- embodied lifelong learning and reusable skills;
- multi-agent social environments and dynamic evaluation;
- open-world artificial life;
- agent identity, delegation, authorization, and provenance;
- agent-to-agent interoperability;
- action receipts and verifiable credentials;
- AI attachment and parasocial relationships;
- virtual influencers and synthetic performers;
- reputation economics and identity-reset problems;
- agent risk, insurance, and causal responsibility.

The differentiation is not claiming these ingredients are new. The research opportunity is their combination around **longitudinal artificial actorhood**.

---

## 8. What would falsify the thesis

The thesis weakens substantially if robust experiments repeatedly show:

- users treat actors as interchangeable shells for models;
- model replacement resets perceived identity regardless of history;
- public history has negligible effect on preference/trust;
- users do not follow actors across environments;
- forks immediately destroy the concept of canonicality;
- hosts care only about capability and never about actor-specific history;
- external standards fully commoditize continuity before a network effect forms.

Negative findings are useful. Onbae should be willing to change direction rather than defend the thesis emotionally.

---

## 9. Near-term research output

Before trying to publish a broad theory of artificial identity, produce concrete experimental artifacts:

1. **Model Swap Study v1**
2. **Fork Study v1**
3. **Cross-Environment Transfer Study v1**
4. **History Premium Study v1**

Each should have:

- pre-specified hypothesis;
- experimental design;
- raw/derived metrics;
- limitations;
- reproducible environment version;
- technical report.

If results are strong, package them into a public Onbae research report/preprint and use them to improve product decisions.
