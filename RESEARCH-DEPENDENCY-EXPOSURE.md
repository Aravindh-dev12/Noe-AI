# NOEONE Research: Dependency & Exposure Continuity

## Core question

NOEONE already records a persistent actor across changing models/runtimes, externally attested activity, obligations, delegated authority, consequences, claims, and remedies. The next institutional question is:

> At a particular point in time, which upstream systems did an actor actually depend on, and which actors/obligations are exposed when one of those dependencies fails, is revoked, is compromised, or changes?

This is **dependency and exposure continuity**.

A long-lived actor can remain the same actor while its model provider, runtime, toolchain, cloud, data sources, credentials, and hosts change. Therefore dependency state belongs to an **execution at a time**, not permanently to the actor identity.

---

## 1. Why this is a separate primitive

Continuity answers `who is this actor?`.

Authority answers `what was this actor permitted to do?`.

Accountability answers `what action/consequence was observed and how was responsibility assessed?`.

Dependency provenance answers a different question:

> `What did this execution rely on when that action happened?`

Those dimensions must not be collapsed.

Example:

```text
Actor A
  execution E1 (January)
    model: provider/model-X
    runtime: R1
    tool: payments-api-v2
    cloud: region-a

  execution E2 (March)
    model: provider/model-Y
    runtime: R2
    tool: payments-api-v3
    cloud: region-b
```

An incident affecting `model-X` in January may be relevant to E1 and historical January consequences. It must not be retroactively attached to E2 merely because the actor identity continued.

---

## 2. Use existing transparency standards instead of creating a NOEONE BOM

NOEONE should not invent a proprietary AI bill-of-materials format.

### SPDX AI

SPDX describes an AI System Bill of Materials as a machine-readable connected knowledge graph covering software dependencies, AI models, training/production data, prompts, agents, and related relationships.

Source:
- https://spdx.dev/learn/areas-of-interest/ai/

NOEONE implication: accept SPDX identifiers/digests/relationships as evidence and bind them to an actor execution.

### CycloneDX AI/ML-BOM

CycloneDX represents models, datasets, configurations, provenance, and dependencies for AI/ML systems.

Sources:
- https://cyclonedx.org/capabilities/mlbom/
- https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-AI-ML-BOM-en.pdf

NOEONE implication: preserve CycloneDX/PURL identifiers when present rather than minting parallel identifiers for the same component.

### OpenTelemetry GenAI observability

OpenTelemetry GenAI semantic conventions expose operational facts such as provider, request/response model, agent identity, data-source IDs, and tool invocations.

Sources:
- https://opentelemetry.io/blog/2026/genai-observability/
- https://opentelemetry.io/docs/specs/semconv/

NOEONE implication: telemetry can be one evidence source for dependency snapshots, but traces remain evidence, not universal truth.

---

## 3. Why dependency concentration matters economically

Recent agentic-AI insurance research repeatedly identifies dependency concentration and correlated upstream failures as distinct risks.

- `The Insurability Frontier of AI Risk` identifies foundation-model concentration as a genuinely novel insurability frontier because one upstream model failure can correlate losses across many insureds.
- `AI-Native Insurance for Agentic AI` explicitly includes dependency concentration in the deployment risk state.
- `Insurance of Agentic AI` calls for dependency mapping and accumulation-risk management.
- `Underwriting the Agent Economy` highlights concentration among a small number of foundation-model providers as a source of correlated losses.

Sources:
- https://arxiv.org/abs/2605.18784
- https://arxiv.org/abs/2607.13230
- https://arxiv.org/abs/2606.05449
- https://arxiv.org/abs/2607.11999

NOEONE should not become an insurer or publish a universal risk score. It can supply a more basic, durable object: **time-indexed, evidence-backed exposure paths around persistent actors**.

---

## 4. Data model

### DependencyComponent

A canonical component that may be depended upon.

V1 component kinds are intentionally open strings rather than a closed enum so external standards can evolve. Recommended values:

- `model`
- `model-provider`
- `runtime`
- `tool`
- `service`
- `cloud`
- `region`
- `data-source`
- `dataset`
- `identity-provider`
- `authorization-service`
- `host`
- `protocol`

Fields:

- component ID;
- kind;
- canonical name;
- provider/vendor optional;
- version optional;
- PURL optional;
- external framework/reference optional;
- deterministic identity digest;
- metadata.

The identity digest prevents accidental duplicates without pretending two vendor identifiers are equivalent unless explicitly mapped.

### ExecutionDependencySnapshot

An immutable statement of dependency state for one actor execution.

Fields:

- actor ID;
- execution ID;
- framework (`spdx`, `cyclonedx`, `otel`, `manual`, etc.);
- manifest digest;
- optional source EvidenceArtifact;
- effective time;
- capture time;
- idempotency key;
- metadata.

Critical invariant:

> The referenced execution must belong to the referenced actor.

A database trigger enforces this in addition to application checks.

### SnapshotDependency

Binds one immutable snapshot to one component.

Fields:

- snapshot ID;
- component ID;
- role;
- direct/transitive flag;
- required/optional flag;
- optional evidence artifact;
- disclosure class;
- metadata.

The same component may appear in different roles.

### DependencyRelation

A temporal directed edge between components.

Example:

```text
agent-runtime-A --depends_on--> sdk-B --calls--> model-provider-C
```

Fields:

- source component;
- target component;
- relation type;
- effective-from / effective-to;
- optional source evidence;
- idempotency key;
- metadata.

For blast-radius traversal the edge direction means:

> `source` depends on / routes through / is hosted by `target`.

Therefore an incident on `target` walks **incoming** dependency edges to discover downstream exposure.

### DependencyIncident

An evidence-backed observation that a component has an incident or material change.

Examples:

- outage;
- revocation;
- key compromise;
- model withdrawal;
- severe regression;
- vulnerability disclosure;
- region failure;
- policy/API incompatibility.

The incident records an external evidence reference and temporal window. NOEONE does not claim the incident is objectively true merely because a row exists.

---

## 5. Exposure is a query, not a score

The core operation is deterministic graph traversal:

```text
component X incident
      |
      v
reverse dependency traversal
      |
      v
impacted components
      |
      v
execution snapshots active at time T
      |
      v
persistent actors
      |
      +--> open commitments
      +--> active delegated authority
      +--> relevant consequences/cases (later)
```

V1 returns paths and counts, not a proprietary `risk = 87` number.

A downstream insurer, enterprise, regulator, or researcher can apply its own severity/loss model.

---

## 6. Temporal/non-retroactivity invariants

1. Dependency snapshots are immutable.
2. A snapshot references exactly one actor execution.
3. The execution must belong to the actor named by the snapshot.
4. A newer snapshot does not mutate an older snapshot.
5. Model/runtime migration creates a new execution; dependency history on the predecessor remains intact.
6. Component relationships are temporal; a relation can end without rewriting historical exposure.
7. Exposure queries accept an explicit `at` time.
8. Only executions active at `at` are considered operationally exposed at that time.
9. Incident rows are evidence-backed observations; incident presence is not a universal truth verdict.
10. Sensitive dependency details are privileged by default.
11. Public Actor Passports should expose only safe aggregates/concentration summaries unless the owner explicitly discloses more.
12. Forks do not automatically copy dependency snapshots because snapshots describe concrete executions, not ancestry.

---

## 7. Security/privacy boundary

Dependency graphs can reveal architecture, vendors, credentials, regions, and security-sensitive topology.

Therefore V1 policy is:

- writes: privileged/admin/research integration;
- full dependency graph: privileged;
- exposure/blast-radius query: privileged;
- public actor profile/passport: aggregate counts only;
- never store bearer secrets, private keys, API tokens, or raw credentials as component metadata;
- source artifacts may be referenced by digest/URI while raw sensitive evidence remains outside public APIs.

---

## 8. Threat model

The layer must resist:

- **snapshot rewriting** after an incident to hide exposure;
- **execution mismatch** attaching a clean dependency manifest from another actor/execution;
- **manifest replay** under conflicting metadata;
- **component alias laundering** where one dependency is re-registered under many names to hide concentration;
- **future-state leakage** where current dependencies are incorrectly projected backward;
- **stale relation traversal** using a dependency edge outside its effective interval;
- **incident truth collapse** treating one issuer's incident report as objective truth;
- **sensitive topology disclosure** through public APIs;
- **unbounded recursive traversal** causing query/resource exhaustion;
- **dependency cycle explosion** in graph traversal.

V1 exposure traversal is depth-bounded and de-duplicates visited component paths.

---

## 9. Research experiments unlocked

### Model concentration experiment

Track many actors across model migrations and measure the fraction simultaneously dependent on each provider/model at time T.

### Failure blast-radius experiment

Inject a synthetic incident on one model/tool/cloud component and compare direct vs transitive actor exposure.

### Dependency diversification experiment

Compare two actors with equal task performance but different provider/tool concentration. Determine whether counterparties/risk models value diversity.

### Migration risk reduction

Move a persistent actor from a concentrated dependency to a diversified execution and show that identity/obligations persist while operational exposure changes.

### Historical incident attribution

Given a later-discovered incident, query which execution/dependency snapshot was active when an observed consequence occurred without rewriting actor history.

### Underwriting export

Export bounded exposure paths plus longitudinal consequence history to experimental underwriting models; compare them with model-name-only baselines.

---

## 10. Product/API direction

Privileged writes:

```text
POST /v1/dependencies/components
POST /v1/dependencies/snapshots
POST /v1/dependencies/relations
POST /v1/dependencies/incidents
```

Privileged reads:

```text
GET /v1/dependencies/components/:componentId
GET /v1/dependencies/components/:componentId/exposure?at=...&maxDepth=...
GET /v1/actors/:handle/dependencies?at=...
```

Public Actor Passport later exposes only aggregate fields such as:

- active dependency count;
- dependency kinds;
- direct provider concentration count;
- snapshot recency;
- dependency-state verification result.

---

## 11. Long-term significance

A 2050 NOEONE actor may have a twenty-year institutional history while using hundreds of different cognition/runtime/tool/physical substrates.

```text
persistent actor
     |
     +-- 2028 execution -> model A / cloud X / tools P,Q
     +-- 2031 execution -> model B / local runtime / tools R,S
     +-- 2038 execution -> embodied system / fleet platform
     +-- 2050 execution -> unknown architecture

identity and obligations persist
operational dependencies change
```

The durable dataset is therefore not merely `what did the actor do?`.

It is also:

> **what was this continuing actor dependent on when it did it, and who else shares that exposure?**

That turns NOEONE's longitudinal actor graph into a potential substrate for reliability research, concentration analysis, underwriting, incident response, and systemic-risk mapping without requiring NOEONE to own the models, clouds, tools, payment rails, or insurance products themselves.
