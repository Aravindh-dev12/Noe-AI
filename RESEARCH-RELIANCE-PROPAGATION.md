# NOEONE Research: Reliance Propagation

Status: research + implementation candidate
Date: 2026-09-13

## 1. Question

Reliance Provenance answers:

> What exact state and evidence did one counterparty rely on when it trusted, authorized, insured, hosted, hired, followed, certified, delegated to, or transacted with a persistent artificial actor?

The next problem appears when **one reliance decision becomes an input to another reliance decision**.

Example:

```text
Auditor certifies Actor A
        |
        v
Insurer relies on that certification
        |
        v
Marketplace relies on the insurer's coverage
        |
        v
Enterprise authorizes Actor A for a production role
```

Then Actor A changes its runtime, model, controller, authority envelope, capabilities, or dependencies.

NOEONE must be able to answer:

1. Which historical reliance bases directly or indirectly depended on an earlier reliance decision?
2. Which downstream decisions are **exposed to review** because an upstream basis changed?
3. Which downstream decisions are definitely unaffected according to their own evaluators?
4. Which paths are stale, disputed, missing, or unknown?
5. What was known at each decision time?

The system must **not** answer a stronger question that the evidence cannot justify:

> Is trust transitively inherited?

NOEONE should model **reliance dependency**, not transitive trust.

---

## 2. Why this is a distinct primitive

A generic evidence graph can connect signed statements.

A dependency graph can show that software artifact X depends on package Y.

A trust/reputation graph can score participants.

Those are not enough for persistent artificial actors because the relevant object changes through time while retaining actor identity.

The primitive NOEONE needs is:

> **A time-bound, actor-bound graph of institutional decisions that records when one counterparty's reliance decision became material evidence for another counterparty's reliance decision, and exposes downstream review candidates when the upstream basis or actor state later changes.**

Three properties are essential:

### 2.1 Historical binding

Every edge binds to the **upstream reliance basis digest as it existed when the downstream decision was made**.

Later renewal or reassessment must not silently rewrite history.

### 2.2 Non-transitivity

If B relied on A, and C relied on B, NOEONE may show the path:

```text
A -> B -> C
```

It must not infer:

```text
A trusts C
C trusts A
A's conclusion is automatically C's conclusion
```

### 2.3 Plural materiality

An upstream change can be material for one downstream counterparty and irrelevant for another.

The registry exposes structural dependency and propagation candidates. Evaluators decide materiality.

---

## 3. Prior-art pressure

### 3.1 SCITT statement graphs

The July 2026 IETF Internet-Draft **SCITT Statement Relationship and Protected Object Binding** proposes relationship edges between signed statements and protected objects, including relationships such as `derivedFrom`, `authorizes`, `supersedes`, `revokes`, and `conflictsWith`, plus a Statement Graph Manifest.

This is important prior art.

NOEONE therefore must **not** claim to invent statement graphs, graph manifests, statement-to-object binding, revocation relationships, or generic graph verification.

Source:
https://datatracker.ietf.org/doc/draft-nobuo-scitt-protected-object-binding/

### 3.2 SCITT composite verification

The July 2026 IETF draft **Composite Evidence Verification for SCITT Statement Graphs** describes verifier-side evaluation of statement graphs, including missing, stale, conflicting, and unknown evidence.

Again, NOEONE should reuse or interoperate with this direction where appropriate rather than invent a proprietary generic evidence-verification format.

Source:
https://datatracker.ietf.org/doc/draft-nobuo-scitt-composite-evidence-verification/

### 3.3 SLSA dependency provenance

SLSA treats provenance as verifiable information tracing an artifact through the moving parts of a complex supply chain. Its provenance model records dependencies and supports recursive verification of resolved dependencies.

This is a useful analogy for NOEONE:

```text
software artifact supply chain
        ~
persistent actor reliance chain
```

But the semantics differ. A software dependency is an input artifact. A reliance dependency is a **historical decision relationship between counterparties about a continuing actor**.

Source:
https://slsa.dev/spec/v1.2/provenance

### 3.4 Agent identity and authorization

NIST's February 2026 software-agent identity work emphasizes identification, authorization, auditing, and non-repudiation for agents.

This supports the need for strong identity/authority foundations, but it does not by itself preserve downstream institutional reliance chains across later actor-state changes.

Source:
https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents

### 3.5 Agentic-AI insurance and accumulation risk

2026 research on agentic-AI insurance explicitly emphasizes dependency mapping, dependency concentration, exposure assessment, and accumulation-risk management.

That creates a concrete economic reason to know not merely that an actor has dependencies, but which institutional decisions and exposures depended on earlier actor states or third-party decisions.

Sources:
https://arxiv.org/abs/2606.05449
https://arxiv.org/abs/2607.13230

### 3.6 Reputation is not enough

The 2026 empirical study of ERC-8004 found that reputation data can be weakly grounded and highly exposed to Sybil behavior. A generic reputation score therefore should not be the basis of NOEONE's propagation model.

Source:
https://arxiv.org/abs/2606.26028

---

## 4. Proposed primitive: Reliance Dependency

A downstream reliance basis may explicitly declare that one or more prior reliance bases materially informed its decision.

```text
RelianceDependency
  id

  actorId
  downstreamRelianceId
  upstreamRelianceId

  dependencyKind
    REQUIRED
    MATERIAL
    INFORMATIVE
    FALLBACK

  upstreamBasisDigest
  downstreamBasisDigest

  observedUpstreamAssessmentSequence
  evidenceArtifactId

  createdByType
  createdByRef
  createdAt

  idempotencyKey
  dependencyDigest
```

### Required invariants

1. Upstream and downstream records must exist.
2. Both records must concern the same canonical actor in v1.
3. Upstream `reliedAt` must not be later than downstream `reliedAt`.
4. `upstreamBasisDigest` must match the immutable stored upstream basis.
5. `downstreamBasisDigest` must match the immutable stored downstream basis.
6. A dependency may never mutate after creation.
7. Idempotency is semantic, not identifier-only.
8. Direct self-dependency is forbidden.
9. Cycles are forbidden in the v1 reliance-dependency DAG.
10. Forked actors do not inherit reliance-dependency edges merely through ancestry.

The same-actor constraint is deliberate for v1. Cross-actor reliance chains are potentially valuable, but they introduce broader counterparty-network semantics and should be added only after the single-actor model is verified.

---

## 5. Proposed derived primitive: Exposure Report

NOEONE should avoid automatically changing downstream reliance records when an upstream record is reassessed.

Instead it computes a **derived exposure report**.

```text
RelianceExposureReport
  version
  actorId
  triggerRelianceId
  triggerAssessmentId?
  generatedAt
  maxDepth

  affected[]
    relianceId
    depth
    path[]
    dependencyKinds[]
    upstreamBasisDigests[]
    currentAssessmentDisposition?

  truncated
```

This is a graph query, not a new source of truth.

It answers:

> Which later decisions are structurally downstream from this reliance basis?

It does **not** answer:

> Which later decisions are invalid?

---

## 6. Proposed primitive: Propagation Assessment

A specific evaluator can assess the effect of an upstream change on a downstream reliance decision.

```text
ReliancePropagationAssessment
  id
  actorId

  dependencyId
  downstreamRelianceId
  triggerRelianceId
  triggerAssessmentId?

  triggerDigest
  observedDependencyDigest
  observedDownstreamBasisDigest

  disposition
    UNAFFECTED
    REVIEW_REQUIRED
    BLOCKED
    DISPUTED
    UNKNOWN

  evaluatorType
  evaluatorRef
  method
  methodVersion
  evidenceArtifactId
  reason?
  assessedAt

  idempotencyKey
  assessmentDigest
```

Multiple evaluators may disagree.

NOEONE preserves disagreement rather than compressing it into one global trust score.

---

## 7. Propagation semantics

Consider:

```text
R1 auditor certification
 |
 v
R2 insurer underwriting
 |
 v
R3 marketplace admission
 |
 v
R4 enterprise deployment approval
```

Actor model/runtime changes and the auditor assesses R1 as `REVIEW_REQUIRED`.

NOEONE computes:

```text
R1 -> R2 -> R3 -> R4
```

as an exposure path.

It does **not** automatically mark R2/R3/R4 invalid.

Instead:

```text
R2 insurer evaluator        -> REVIEW_REQUIRED
R3 marketplace evaluator    -> UNAFFECTED
R4 enterprise evaluator     -> BLOCKED
```

Those judgments may coexist because the reliance semantics differ.

---

## 8. Why a DAG in v1

Allowing cycles creates difficult historical semantics:

```text
A relied on B
B relied on A
```

A genuine circular decision process may occur in the real world, but representing it faithfully requires decision-time snapshots or strongly connected components rather than a simple dependency chain.

For the first protocol version, NOEONE should require:

```text
upstream reliedAt <= downstream reliedAt
```

and reject any edge that would create a graph cycle.

Later research can introduce explicit **joint decision bundles** for mutually dependent decisions rather than pretending a temporal cycle is an ordinary dependency edge.

---

## 9. Blast-radius queries

This layer creates a new institutional query class:

```text
What depends on this old decision?
```

Examples:

- which hosts relied on a certification tied to execution X?
- which insurance decisions depended on an assessment now in dispute?
- which deployments relied on a provider attestation that was later superseded?
- which counterparties need re-review after an authority or control transition?
- which decisions indirectly depend on one concentrated assessor/provider?

This connects NOEONE's persistent-actor graph to systemic-risk analysis.

---

## 10. Concentration risk

The graph may reveal that apparently independent actor deployments share one institutional dependency.

Example:

```text
Auditor A certification
      |
  +---+---+----------------+
  |       |                |
Insurer1 Insurer2       Marketplace
  |       |                |
  +---- thousands of actor deployments
```

A stale, revoked, or disputed upstream basis may therefore create a large review surface.

NOEONE should expose concentration metrics as **structural facts**, not risk scores:

- direct dependent count;
- transitive dependent count;
- maximum depth;
- counterparty classes exposed;
- actor-state versions represented;
- unresolved propagation assessments;
- reliance concentration by evaluator/issuer/provider.

An insurer, regulator, marketplace, or operator can apply its own risk model.

---

## 11. Privacy

Reliance graphs can reveal sensitive commercial relationships.

The default design should therefore support:

- pseudonymous counterparty refs;
- digest-bound private evidence;
- access-controlled graph queries;
- selective disclosure of paths;
- aggregate concentration reporting without revealing counterparties;
- no public graph traversal by default for private institutional reliance.

SCITT's graph work independently raises similar privacy concerns and suggests pseudonymous identifiers, commitments, encrypted payloads, access-controlled manifests, or selective disclosure. NOEONE should interoperate with those approaches where possible.

---

## 12. Threat model

Reliance Propagation should resist or expose:

- **trust transitivity laundering** — presenting an upstream approval as if every downstream institution independently approved the actor;
- **stale dependency laundering** — downstream decision claims to rely on a renewed upstream basis that did not exist at decision time;
- **dependency omission** — material upstream decision omitted from a recorded downstream basis;
- **cycle laundering** — circular reliance is represented as independent corroboration;
- **fork inheritance** — forked actor claims parent actor's institutional reliance network;
- **graph injection** — unrelated but valid reliance records are inserted to make a decision look better supported;
- **false propagation** — an upstream change is presented as automatically invalidating downstream decisions without evaluator authority;
- **path truncation** — presenter hides material upstream dependencies;
- **retroactive edge insertion** — dependency edge is backdated after a controversy;
- **concentration concealment** — many downstream decisions appear independent while depending on one upstream evaluator.

---

## 13. Experiments

### A. Certification cascade

Create four reliance records in a chain and change the actor's model/runtime after the first certification.

Verify that NOEONE finds all downstream records without changing their dispositions automatically.

### B. Divergent downstream materiality

Two counterparties both depend on one upstream certification. After a migration, one evaluator marks `UNAFFECTED`, another `REVIEW_REQUIRED`.

The system must preserve both.

### C. Cycle rejection

Attempt:

```text
R1 -> R2 -> R3 -> R1
```

Registry must reject the final edge transactionally.

### D. Historical-digest integrity

Renew R1 after R2 was created. R2's dependency must continue to bind to the old R1 basis digest, not silently float to the renewal.

### E. Fork non-inheritance

Fork the actor after a large reliance network exists. The descendant proves ancestry but receives no dependency edges automatically.

### F. Concentration shock

Construct many reliance chains that ultimately depend on one upstream assessor. Mark that upstream basis disputed and measure the derived blast radius without asserting universal invalidity.

---

## 14. Falsifiers

Do not make Reliance Propagation a core NOEONE primitive if:

1. SCITT or another open standard soon defines the same persistent-actor-specific historical reliance semantics and change propagation end to end;
2. real counterparties will not record which earlier institutional decisions materially influenced their own decisions;
3. almost all institutional decisions are independent enough that graph propagation adds little value;
4. users interpret dependency edges as transitive trust despite product safeguards;
5. privacy requirements make useful propagation queries impossible;
6. cycles/joint decisions dominate real workflows and the DAG abstraction proves misleading;
7. the feature duplicates ordinary GRC workflow tooling without adding persistent actor continuity semantics.

---

## 15. Narrow novelty claim

Do **not** say:

> NOEONE invented evidence graphs, trust graphs, supply-chain provenance, dependency graphs, composite verification, certification dependency, or systemic-risk analysis.

The defensible hypothesis is narrower:

> **NOEONE records which counterparty-specific reliance decisions about a persistent artificial actor depended on which earlier reliance decisions at which historical actor state, then exposes downstream change-impact paths across model/runtime/control migrations without treating trust as transitive or automatically invalidating downstream decisions.**

---

## 16. Relationship to the 2050 thesis

As cognition becomes cheaper and more replaceable, actor upgrades may become frequent.

Institutions will face two simultaneous problems:

```text
Who is this continuing actor?

and

Which decisions about this actor still depend on assumptions that changed?
```

Reliance Provenance solves the first decision boundary for one counterparty.

Reliance Propagation extends it across institutions.

That turns NOEONE from a historical actor registry into potential **institutional dependency infrastructure for autonomous actors**.
