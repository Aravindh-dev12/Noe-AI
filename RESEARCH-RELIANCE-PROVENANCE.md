# NOEONE Research: Reliance Provenance and Material-Change Continuity

## Research question

NOEONE already preserves a continuing artificial actor's lineage, executions, authority, commitments, decisions, consequences, oversight opportunities, external evidence, corrective state, and institutional history.

That creates a new problem:

> When a counterparty decides to trust, authorize, insure, host, hire, follow, certify, transact with, or delegate to a persistent actor, **what exact actor state was that decision based on, and what happens to that reliance when the actor later changes materially?**

This matters because persistent identity can become a new form of trust laundering.

An actor may build a ten-year record under one model, runtime, controller, tool surface, authority envelope, and corrective state, then change several of those components while retaining the same actor ID and public history. Mechanical continuity can be perfectly valid while the basis for an earlier counterparty's trust is no longer valid.

NOEONE therefore needs to separate two questions:

```text
Continuity
Is this still the same actor?

Reliance continuity
Does a particular counterparty's earlier decision to rely on that actor still cover the actor as it exists now?
```

The second question is not answered by identity alone.

---

## 1. Prior art and falsification pressure

### Reputation is structurally fragile for mutable agents

Hu, Rong, and Van Kleek, **Dissociative Identity: Language Model Agents Lack Grounding for Reputation Mechanisms** (FAccT 2026), argues that ordinary reputation mechanisms assume persistent identity together with behavioral continuity, sanction sensitivity, predictability, and costly non-fungibility. Language-model agents are instead assemblages of mutable models, prompts, tools, memories, and multi-agent components, any of which may materially change behavior.

Sources:
- https://arxiv.org/abs/2605.30169
- https://doi.org/10.1145/3805689.3806748

This is direct pressure on NOEONE. A persistent actor identifier is useful, but it must not imply that historical reputation is automatically transferable across every internal or operational change.

### Trust is dynamic, not a permanent scalar

Liebherr et al., **Dynamic calibration of trust and trustworthiness in AI-enabled systems** (2026), treats trust, trustworthiness, and calibrated trust as dynamic phenomena that evolve with the history and evolution of both the system and user beliefs.

Source:
- https://doi.org/10.1007/s10009-026-00840-6

NOEONE should therefore not publish a permanent `trust = 92` value. The useful historical object is the evidence and system state upon which a specific reliance decision was made.

### Persistent names can hide materially changed systems

Recent enterprise governance work makes a closely related operational point: approval should attach to a defined system configuration and should be reassessed when a material change makes prior assumptions or evidence unreliable.

Source:
- https://aetherlab.co/blog/approval-should-expire-when-an-ai-agent-materially-changes

NOEONE must not claim to invent change management, recertification, or model governance. The narrower opportunity is to bind those decisions to a persistent artificial actor and preserve the exact historical reliance basis across migrations.

### Identity is not decision trustworthiness

Byrd, **A Certificate Authority for Autonomous-Agent Execution: Why Cross-Organizational Agent Trust Must Certify the Decision, Not the Identity** (2026), argues that identity/model provenance does not establish whether a particular decision is trustworthy.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6903979

NOEONE should not become a universal decision certificate authority. Instead, a decision certificate, evaluation, approval, or other external trust artifact can be part of the evidence bundle a counterparty relied upon.

### Representation agents expose attribution ambiguity

Andersson and Elmqvist, **From Role to Person: Trust Calibration Challenges in Twin Agents** (2026), identifies trust-calibration failures where users cannot reliably tell whether a questionable output came from a representation gap, epistemic gap, or model artifact.

Source:
- https://arxiv.org/abs/2605.19838

This supports recording the exact execution/configuration and disclosure state behind reliance rather than letting the persistent actor name absorb all trust.

---

## 2. The specific gap NOEONE can own

Existing identity infrastructure can answer:

- which key or credential identifies an agent;
- whether a credential is active;
- which principal authorized an action;
- which model/runtime produced an output;
- whether an approval/certification exists;
- whether a particular action cleared a policy or evaluation.

NOEONE's narrower question is longitudinal:

> **What did this counterparty rely on when it chose to rely on this continuing actor, and is that historical basis still applicable after the actor changed?**

A reliance record is not a claim that the actor was objectively trustworthy. It is a historical fact about a counterparty decision and the state/evidence available to that counterparty.

---

## 3. The laundering problem

Suppose an actor develops a strong record while running:

```text
Actor A
  model: frontier-model-safe-v4
  runtime: restricted-runtime
  capabilities: read-only research
  controller: Company X
  corrective state: none
  certification: Cert-123
```

A counterparty authorizes the actor to access a sensitive environment.

Later the same actor legitimately migrates:

```text
Actor A
  model: local-unreviewed-model
  runtime: custom-autonomous-runtime
  capabilities: research + payments + admin
  controller: Company Y
  corrective state: probation
  certification: Cert-123 still displayed
```

The actor may still be the **same actor** under NOEONE continuity rules.

But the earlier authorization cannot safely be interpreted as approval of the new configuration merely because the identity persisted.

This is the core distinction:

```text
identity continuity != reliance continuity
```

---

## 4. Primitive A: Reliance Basis Record

A `RelianceBasisRecord` captures one specific reliance decision against one exact actor state.

Suggested V1 shape:

```text
RelianceBasisRecord
  id
  actorId
  counterpartyType
  counterpartyRef
  relationKind
    AUTHORIZE
    TRANSACT
    INSURE
    HIRE
    FOLLOW
    HOST
    CERTIFY
    DELEGATE
    OTHER

  reliedAt
  validUntil?

  lineageId
  executionId
  executionConfigHash
  actorOwnerId?
  observedEventSequence

  disclosureBundleDigest
  capabilitySnapshotDigest?
  authoritySnapshotDigest?
  controlSnapshotDigest?
  correctiveStateDigest?
  dependencySnapshotDigest?

  basisEvidenceArtifactId
  actorStateDigest
  basisDigest
  idempotencyKey
  capturedAt
```

### Why record the event sequence?

The counterparty did not rely on the actor's future history. It relied on history visible up to a cutoff. `observedEventSequence` makes that boundary explicit.

### Why record execution and lineage separately?

The actor ID proves continuity. `executionId` and `lineageId` identify the exact operational continuation the counterparty observed.

### Why store snapshot digests rather than copying entire systems?

NOEONE should reference external systems rather than become a universal policy engine. Digests allow the reliance basis to bind to capability, authority, control, corrective-state, dependency, certification, or disclosure snapshots produced elsewhere.

---

## 5. Capture must be exact-head aware

V1 should prioritize strong contemporaneous capture over speculative historical reconstruction.

When a reliance basis is recorded:

1. the actor must exist;
2. the supplied lineage ID must equal the actor's current canonical lineage head;
3. the supplied execution ID must equal the actor's current live execution;
4. the execution must belong to that actor;
5. the evidence artifact must exist;
6. `observedEventSequence` is determined from the canonical actor event chain at capture time;
7. NOEONE computes `actorStateDigest` from the actual registry state plus supplied external snapshot digests;
8. semantic idempotency prevents replay with altered meaning.

A future import mode may ingest historical reliance from external signed evidence, but it should be visibly distinguished from contemporaneous NOEONE capture.

---

## 6. Primitive B: Reliance Change Assessment

NOEONE should not decide globally whether every transition is "material." Materiality is contextual.

A bank, game, insurer, researcher, fan, and infrastructure host may rationally use different thresholds.

A `RelianceChangeAssessment` therefore records one evaluator's judgment about one reliance basis after a later actor state exists.

```text
RelianceChangeAssessment
  id
  relianceId
  actorId

  successorLineageId
  successorExecutionId
  successorStateDigest

  structuralChanges[]
    LINEAGE
    EXECUTION
    PROVIDER
    MODEL
    RUNTIME
    OWNER
    DISCLOSURE
    CAPABILITY
    AUTHORITY
    CONTROL
    CORRECTIVE_STATE
    DEPENDENCY
    SNAPSHOT_UNAVAILABLE

  disposition
    UNAFFECTED
    REVIEW_REQUIRED
    INVALIDATED
    DISPUTED

  evaluatorType
  evaluatorRef
  method
  methodVersion
  evidenceArtifactId
  reason?
  assessedAt
  idempotencyKey
```

The structural change set is reconstructable from the stored basis and current/successor snapshot. The disposition is evaluator-specific.

Two evaluators may disagree, and NOEONE should preserve both.

---

## 7. Materiality is contextual, but structural drift is not

NOEONE can safely compute facts such as:

- execution changed;
- provider/model changed;
- runtime changed;
- owner/controller changed;
- canonical lineage advanced;
- capability snapshot changed;
- authority snapshot changed;
- corrective-state snapshot changed;
- dependency snapshot changed;
- prior snapshot is unavailable for comparison.

NOEONE should **not** silently convert those facts into a universal `safe/unsafe` or `trusted/untrusted` result.

Example:

```text
Reliance A: public fan follows actor
model changed -> evaluator says UNAFFECTED

Reliance B: bank grants payment authority
model + payment capability changed -> evaluator says REVIEW_REQUIRED

Reliance C: safety certifier approved exact runtime
runtime changed -> evaluator says INVALIDATED
```

Same actor. Same transition. Different legitimate reliance semantics.

---

## 8. Renewal is a new reliance decision

If a counterparty reviews a changed actor and decides to continue relying on it, NOEONE should create a **new Reliance Basis Record** that explicitly supersedes the earlier basis.

Do not mutate the old record.

```text
Reliance #1
based on execution A
      |
material change
      v
review required
      |
new counterparty decision
      v
Reliance #2
based on execution B
supersedes #1
```

This preserves what the counterparty actually knew and accepted at each stage.

---

## 9. Fork semantics

A descendant actor does not inherit the parent's reliance relationships automatically.

If a research fork is created from Actor A:

```text
Actor A ---- ancestry ----> Actor B
```

then:

- Actor B may prove ancestry;
- Actor B may have near-identical memory/model/state;
- Actor B does **not** inherit Actor A's authorizations, insurance decisions, certifications, hosting approvals, or follower reliance merely by similarity;
- a counterparty may issue a new reliance record for Actor B after reviewing it.

This is essential to prevent reliance laundering through cloning.

---

## 10. Migration semantics

Migration is deliberately different from a fork.

A migration preserves actor identity, but it does not silently refresh old reliance.

```text
Actor A / execution 1
  reliance #R1
       |
       | governed migration
       v
Actor A / execution 2
  same actor
  R1 remains historical
  R1 may now require reassessment
```

The old reliance record remains attached to Actor A because it really happened. Its applicability to the new state is a separate question.

---

## 11. Relationship to existing NOEONE primitives

```text
ContinuityTransition
Is this still the same actor?
        |
        v
Actor state
        |
        +--> Capability Continuity
        +--> Authority Continuity
        +--> Control Continuity
        +--> Corrective State
        +--> Dependency Exposure
        +--> Recognition / history
        |
        v
Reliance Basis
What exact state/evidence did a counterparty rely on?
        |
        v
Actor changes
        |
        v
Reliance Change Assessment(s)
Does that counterparty/evaluator believe prior reliance still applies?
        |
        +--> UNAFFECTED
        +--> REVIEW_REQUIRED
        +--> INVALIDATED
        +--> DISPUTED
        |
        v
optional new Reliance Basis / renewal
```

This layer connects NOEONE's continuity graph to real institutional adoption.

---

## 12. Threat model

Reliance provenance should resist or expose:

- **legacy-reputation laundering** — carrying historical trust across a radically changed execution without disclosure;
- **hidden brain swap** — same actor name, changed model/provider, old approval still presented as current;
- **capability expansion laundering** — adding payment/admin/tool authority after a narrower approval;
- **controller swap laundering** — changing who controls the actor while presenting old trust as unchanged;
- **stale certification** — displaying certification that covered an earlier state;
- **retroactive disclosure fabrication** — claiming the counterparty saw information that was not in its reliance bundle;
- **fork inheritance** — a descendant claims the parent's authorizations or certifications;
- **selective history presentation** — hiding the event cutoff on which a decision was made;
- **backdated recertification** — a later review is represented as if it existed at the original decision time;
- **single-evaluator monopoly** — one assessor's materiality judgment is represented as universal truth;
- **snapshot substitution** — an assessment compares against a state that was not the actual successor state;
- **idempotency mutation** — replaying an identifier with different semantic content.

---

## 13. Experiments

### A. Safe-history / risky-brain swap

Give an actor a strong six-month record, then change its model/runtime/tool surface while keeping identity constant.

Compare user/host behavior under:

1. actor identity + historical reputation only;
2. actor identity + explicit reliance basis + material-change notice.

Measure overreliance and re-review behavior.

### B. Material-change threshold benchmark

Hold the actor identity fixed and independently vary:

- model;
- runtime;
- controller;
- capability envelope;
- authority envelope;
- dependency graph;
- corrective state.

Ask insurers, developers, researchers, operators, and ordinary users whether their prior reliance still applies. Preserve disagreement rather than training toward one universal threshold.

### C. Stale certification benchmark

Attach a certification to execution A, migrate to execution B, and verify that NOEONE can show:

> certification existed, but the recorded reliance basis covers execution A.

The registry must not say the certification is invalid unless an authorized evaluator says so; it only makes scope mismatch visible.

### D. Fork non-transfer

Fork Actor A into Actor B with identical execution state. Verify that Actor B has ancestry but no inherited reliance records.

### E. Renewal integrity

After a change assessment marks `REVIEW_REQUIRED`, let the counterparty review the successor state and create a new reliance basis. The original record remains immutable and the new record explicitly supersedes it.

### F. Same migration, different counterparties

Record three reliance bases against the same actor:

- fan follows actor;
- game hosts actor;
- bank authorizes payments.

After one model/tool change, preserve three independent materiality assessments. This tests whether the data model supports contextual trust rather than collapsing to a global score.

---

## 14. Falsifiers

Reliance Provenance should **not** become a core NOEONE primitive if any of these prove true:

1. emerging identity/governance standards already preserve the same counterparty-specific historical reliance basis across persistent agent migrations;
2. real counterparties only care about current state and never need to reconstruct what they relied on previously;
3. state/configuration snapshots cannot be made stable enough to compare without copying entire proprietary systems into NOEONE;
4. material-change assessment inevitably becomes a misleading universal score rather than plural evaluator evidence;
5. the primitive duplicates ordinary approval/certification systems without adding cross-model/cross-runtime actor continuity semantics;
6. counterparties will not attest or reference their reliance decisions strongly enough to make the records useful;
7. preserving reliance histories creates more privacy/security risk than institutional value and cannot be minimized through digests/references.

---

## 15. Narrow novelty claim

Do **not** say:

> NOEONE invented trust calibration, change management, certification, recertification, agent reputation, or material-change review.

The defensible hypothesis is narrower:

> **NOEONE preserves the exact historical state and evidence a counterparty relied upon when it trusted a persistent artificial actor, then binds later material-change assessments and renewed reliance to that same actor across model/runtime migrations without treating identity continuity as automatic trust continuity.**

---

## 16. Why this matters to the 2050 thesis

If foundation models become dramatically stronger, cheaper, local, or AGI-level, actors may change cognition more frequently, not less.

That increases the danger of two opposite errors:

```text
Error 1: reset everything after every upgrade
-> persistent identity becomes economically useless

Error 2: carry all trust across every upgrade
-> persistent identity becomes a laundering mechanism
```

NOEONE needs the middle layer:

> preserve the actor, preserve the old reliance decision, expose what changed, and let the relevant counterparty or institution decide whether reliance continues.

That is a durable institutional function even when intelligence itself becomes interchangeable.