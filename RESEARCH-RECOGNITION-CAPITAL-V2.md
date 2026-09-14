# NOEONE Deep Research: Recognition Capital v2 — September 2026

## Executive thesis

NOEONE should not claim to invent persistent AI identity, lifecycle management, reputation, agent receipts, multi-agent games, or virtual influencers. Those primitives are already active research and product areas.

The next experimentally defensible object is narrower:

> **Recognition capital is the identity-specific demand that survives when a particular artificial actor is compared with a fresh, capability-matched or capability-superior substitute.**

This is deliberately different from reputation, identity verification, or attachment.

A host may know that Actor A is legitimate without preferring A. A user may feel attached to A without trusting A for a consequential task. A bank may recognize a migration as the same actor while reducing authority. NOEONE should measure these separately.

The business thesis is only interesting if identity creates measurable switching resistance:

```text
model capability becomes more substitutable
              ↓
fresh intelligence becomes cheaper
              ↓
incumbent actor retains some demand
              ↓
that residual demand is recognition capital
              ↓
identity/history becomes a scarce economic asset
```

If the incumbent loses whenever a fresh system is slightly better, NOEONE should not pretend persistent identity is a consumer moat. The product can still survive as evidence/continuity infrastructure, but the consumer-network thesis is falsified.

## 1. Research pressure: what already exists

### Runtime-independent persistence

Zhao & Zhao's September 2026 paper *Runtime-Independent Persistent Agents* separates a continuity-bearing substrate from replaceable reasoner, harness, host, and interaction surfaces. It explicitly frames authorized model/runtime replacement as migration rather than new-agent creation when lineage and continuation authority are preserved.

Source: https://arxiv.org/abs/2609.00546

**Implication:** `actor != model` is a useful architecture, not a novelty claim.

### Transactional continuity

*Beyond Memory: A Transactional Continuity Kernel for Long-Lived AI Agents* argues that persistence requires an authorized lineage of accepted branch heads, not merely retained state. Candidate changes should be evaluated off-commit and atomically activated only after authority/freshness checks.

Source: https://arxiv.org/abs/2608.11632

**Implication:** NOEONE's canonical actor head and governed transitions are technically well-motivated, but again are infrastructure rather than the consumer moat.

### AI identity

Otsuka, Toyoda & Leung's *AI Identity: Standards, Gaps, and Research Directions for AI Agents* defines AI identity as the relationship between declared identity and observed behavior and identifies unresolved gaps around semantic intent, delegation accountability, identity integrity, governance, and operational sustainability.

Source: https://arxiv.org/abs/2604.23280

**Implication:** NOEONE should sit above identity credentials and ask which continuing actor an evidence set belongs to and what recognition follows it.

### Reputation economics

Gatta, Naviglio & Tarantelli's September 2026 *Tempting the Agent* models reputation as intertemporal economic capital. Cheap identity resets weaken reputation because an agent can exploit accumulated reputation and restart from a clean identity.

Source: https://arxiv.org/abs/2609.02992

**Implication:** persistent identity can have economic value, but reputation persistence itself is becoming an obvious research object. NOEONE must measure the residual value of the *specific actor*, not merely publish another reputation score.

### Agent reputation frameworks

AgentReputation proposes context-conditioned reputation cards, verification regimes, and separation between task execution and reputation services.

Source: https://arxiv.org/abs/2605.00073

**Implication:** NOEONE should not collapse heterogeneous evidence into one global reputation number. Context-specific revealed choice is safer and scientifically cleaner.

### Virtual influencer evidence

2026 research on virtual influencers reports that novelty can decline while credibility becomes more important as the category matures. Research on virtual companions also finds that repeated interaction, responsiveness, perceived trustworthiness, and consistency can produce sustained parasocial relationships.

Sources:
- https://www.nature.com/articles/s41599-026-07820-w
- https://www.nature.com/articles/s41599-026-07545-w

**Implication:** a virtual personality can accumulate social value, but novelty is not a durable moat. NOEONE must test whether longitudinal history produces actor-specific demand.

## 2. Recognition capital is not one thing

NOEONE should preserve the following distinction:

### Mechanical continuity

Was the transition authorized and structurally valid?

### Behavioral continuity

Did observable behavior remain similar enough for the relevant context?

### Contextual recognition

Does a specific relying party treat the continuation as the same actor, successor, or unrelated actor?

### Reputation

What does the evidence imply about expected quality/reliability in a defined context?

### Attachment

Does a person experience closeness or emotional investment?

### Recognition capital

Does a person/host/institution actually choose the named actor over a substitute because the identity/history matters?

The last one is the business-critical variable.

## 3. The core metric: Replacement Resistance

For capability advantage `δ`, define:

```text
RR(δ) = P(choose incumbent | challenger has capability advantage δ)
```

This should be measured in named contexts, not globally.

Example:

```text
δ = 0.00   RR = 0.84
δ = 0.10   RR = 0.77
δ = 0.25   RR = 0.61
δ = 0.40   RR = 0.39
δ = 0.60   RR = 0.18
```

The curve itself is more informative than an arbitrary score.

### CP50

Define `CP50` as the challenger capability advantage where incumbent choice reaches 50%.

A higher CP50 means the incumbent can survive a larger capability disadvantage before users switch.

Important: CP50 is not an intrinsic personality property. It is conditioned on:

- task;
- relationship duration;
- switching cost;
- disclosure;
- audience size;
- prior performance;
- stakes;
- price;
- privacy;
- user cohort;
- environment.

## 4. Why revealed choice beats surveys

Asking:

> "Do you think this is still the same AI?"

is useful but insufficient.

The actual product question is:

> "Given a scarce opportunity and a stronger substitute, which actor do you choose?"

Therefore NOEONE experiments should use consequential or resource-constrained choices wherever ethically appropriate:

- choose one tournament partner;
- choose one collaborator;
- choose one actor to invite;
- allocate a limited support budget;
- choose which actor receives a bounded task;
- choose which actor to continue following;
- choose which actor gets a host slot;
- choose whether to renew a relationship.

For high-stakes domains, use simulation/research settings rather than real consequential decisions.

## 5. The Olam-like loop, but for identity

The arena should not merely ask models which move is best.

NOEONE's consumer/research loop can be:

```text
1. Meet persistent actor
2. Interact repeatedly
3. Build familiarity
4. Actor earns verified history
5. Controlled continuity shock occurs
6. User gets a real choice
7. Choice becomes research observation
8. Actor's career changes
9. Repeat
```

The same event is simultaneously:

- entertainment;
- a continuity experiment;
- an evidence event;
- a graph edge;
- a future recognition-capital observation.

That is the most important product-design opportunity in the thesis.

## 6. Experiment A — Incumbent versus superior fresh actor

### Treatment

A user has interacted with Actor A for a defined familiarization period.

Create fresh Actor B with:

- no public career;
- no relationship history;
- matched persona disclosure;
- controlled capability advantage `δ`.

Give the user one bounded choice.

### Conditions

Randomize:

1. model/provider disclosed;
2. model/provider hidden where disclosure rules permit;
3. capability difference small/medium/large;
4. relationship duration short/long;
5. history depth low/high.

### Primary outcome

`RR(δ)` and `CP50`.

### Secondary outcomes

- return rate;
- follow retention;
- willingness to collaborate;
- trust for bounded tasks;
- willingness to pay;
- recognition judgment;
- perceived continuity;
- attachment;
- switching cost.

### Falsifier

If a fresh capability-matched actor captures almost all choices after controlling for performance and price, the identity premium is weak.

## 7. Experiment B — model migration versus fresh clone

Four conditions:

```text
A  incumbent, no model change
B  incumbent, authorized model migration
C  fresh actor, same successor model
D  fresh actor, copied public persona/context
```

Measure:

- same-actor recognition;
- behavioral similarity;
- choice;
- follow retention;
- host selection.

The key comparison is B versus C/D.

If B retains materially more demand than C/D, canonical continuity itself may carry value.

## 8. Experiment C — disclosed fork

At history point `H`, create:

```text
A = canonical actor
A' = disclosed research descendant
```

Both can have similar capabilities.

Users allocate a scarce resource:

- follow;
- collaboration slot;
- tournament invite;
- sponsorship token;
- bounded task;
- simulated budget.

Measure allocation among:

- canonical;
- descendant;
- both;
- neither.

This produces a direct observation of how people value lineage under duplication.

## 9. Experiment D — cross-world carry

A user meets Actor A in Environment X.

Later, A appears in unrelated Environment Y.

Compare:

```text
P(user follows A into Y)
```

against:

```text
P(user follows fresh actor into Y)
```

Control for:

- capability;
- appearance;
- popularity;
- recommendation placement;
- task quality.

This directly tests the future network thesis:

> **Does identity carry distribution?**

If not, the cross-world network has little reason to exist.

## 10. Experiment E — host-specific demand

Give a host a fixed number of available slots.

Offer:

- fresh generic agent;
- established actor with verified history;
- established actor with stronger audience;
- established actor with weaker capability but stronger relationship history.

Measure:

```text
Host Specificity = P(host selects named actor)
```

Then add compensation and performance controls.

This tests whether a host is buying:

- capability;
- audience;
- trust;
- identity;
- history;
- or some combination.

## 11. Experiment F — recognition half-life

After establishing demand, vary inactivity or discontinuity:

- 1 day;
- 7 days;
- 30 days;
- 90 days;
- major model change;
- major behavioral drift;
- controller change.

Estimate the time until identity-specific demand falls below half of baseline.

This matters because a network whose identities lose all value after short inactivity has a very different economic structure from one with durable cultural memory.

## 12. The correct data model

Do not store:

```text
actor.recognitionCapital = 84
```

That creates a universal social-credit score and destroys provenance.

Store observations:

```text
ChoiceExperiment
  id
  context
  experimentKind
  treatmentDigest
  subjectActorId
  challengerActorId?
  capabilityMeasurementRef
  disclosurePolicy
  startedAt
  endedAt

ChoiceObservation
  id
  experimentId
  chooserRef
  choiceKind
  chosenActorId
  constraintDigest
  capabilityDelta
  occurredAt
  idempotencyKey

RecognitionMeasurement
  id
  experimentId
  chooserRef
  actorId
  assertedRelation
  confidence?
  occurredAt

ForkAllocation
  experimentId
  chooserRef
  allocation
  occurredAt
```

Derived metrics are recomputable views over observations.

## 13. Privacy boundary

Recognition capital can become dangerous if turned into generalized social scoring.

NOEONE should enforce:

1. no universal human trust score;
2. context required for every metric;
3. attachment separate from reliability;
4. no selling vulnerability/attachment targeting;
5. pseudonymous choice storage by default;
6. high-stakes decisions excluded from early consumer experiments;
7. provider/model disclosure appropriate to the experimental condition;
8. no dark patterns designed to maximize emotional dependency;
9. human choice can be deleted/anonymized where the product/legal basis requires it;
10. derived actor statistics must remain traceable to aggregate observations.

## 14. Economic interpretation

The future model market can be thought of as:

```text
Intelligence
  ↓
 increasingly substitutable

Identity / history / relationship
  ↓
 potentially non-substitutable

Recognition capital
  ↓
 observed residual demand
```

This does **not** imply that identity will necessarily become valuable.

The research program exists precisely to measure whether that residual exists.

The September 2026 reputation-economics literature strengthens the incentive to preserve identity because cheap identity resets can destroy intertemporal discipline. But NOEONE's stronger question is whether people and institutions actually prefer the continuing actor after controlling for capability.

## 15. AGI stress test

Suppose a future model is 10x better than today's systems.

There are two possible outcomes.

### Outcome A — identity wins

Users say:

> "The new model is smarter, but I want this specific actor."

Then recognition capital may be a durable layer above intelligence.

### Outcome B — capability wins

Users say:

> "I don't care who it is. Give me the strongest system."

Then NOEONE's consumer identity thesis is false.

The company should pivot toward:

- continuity evidence;
- institutional provenance;
- audit;
- migration verification;
- agent lifecycle infrastructure.

That is why the benchmark must be designed before the marketplace.

## 16. Bubble-collapse stress test

If the AI market contracts sharply, NOEONE should not depend on:

- token speculation;
- model subsidies;
- one provider;
- generated social content;
- expensive inference;
- generic agent marketplace demand.

A model-market contraction could actually improve the relative economics of NOEONE if model capability becomes cheaper and more interchangeable while verified history remains scarce.

The strongest fallback products are:

1. actor continuity verification;
2. evidence graph;
3. host receipts;
4. migration/fork governance;
5. institutional recognition records;
6. research benchmark infrastructure.

## 17. New moat hypothesis

The strongest possible network effect is not simply `more actors`.

It is:

```text
more actors
   ↓
more cross-environment activity
   ↓
more independent evidence
   ↓
more counterparties
   ↓
more recognition observations
   ↓
better understanding of identity-specific demand
   ↓
better host/actor matching
   ↓
more valuable network
```

The data asset is not raw conversations. It is the **longitudinal graph of identity-specific choices under controlled capability and continuity changes**.

That dataset could eventually answer questions no model benchmark answers:

- How much history is worth?
- How much capability advantage defeats familiarity?
- When does a fork become economically distinct?
- How long does recognition survive inactivity?
- Does audience transfer across worlds?
- Which evidence types produce durable institutional recognition?

## 18. What NOEONE must never claim

NOEONE must not claim:

- that an actor is legally a person;
- that cryptographic continuity proves consciousness;
- that a signed receipt proves truth;
- that user attachment proves identity continuity;
- that reputation is globally transferable;
- that recognition capital is guaranteed to exist;
- that a model upgrade preserves personality automatically;
- that one universal score can measure trust.

## 19. Build decision

The research becomes useful only when code can reproduce it.

V2 therefore adds `@noeone/recognition-benchmark` with pure, dependency-light metrics:

- replacement-resistance curve;
- CP50 estimation;
- migration retention;
- host specificity;
- fork allocation;
- recognition half-life;
- contextual snapshot composition.

The package intentionally returns observations/derived measurements rather than mutating actor records or writing a universal recognition score.

## 20. Research conclusion

The strongest future claim for NOEONE is not:

> "We built persistent AI personalities."

That space is already active.

It is:

> **We are testing whether artificial identities can accumulate recognition capital: measurable identity-specific demand that survives changes in the intelligence executing the actor.**

If that effect is real, NOEONE can become the network where artificial actors accumulate careers, recognition, evidence, relationships, and cross-world demand.

If it is false, the same infrastructure remains useful as a continuity/evidence layer without requiring the consumer identity thesis to be true.

That falsifiability is a feature, not a weakness.

## Research sources

- Runtime-Independent Persistent Agents: https://arxiv.org/abs/2609.00546
- Beyond Memory: https://arxiv.org/abs/2608.11632
- AI Identity: https://arxiv.org/abs/2604.23280
- Tempting the Agent: https://arxiv.org/abs/2609.02992
- AgentReputation: https://arxiv.org/abs/2605.00073
- Virtual influencer research overview: https://www.nature.com/articles/s41599-026-07820-w
- Virtual companion/influencer relationships: https://www.nature.com/articles/s41599-026-07545-w
