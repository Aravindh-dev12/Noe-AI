# NOEONE Capability Continuity

## Research question

NOEONE already separates a persistent actor from the model/runtime currently executing it. A governed migration can therefore preserve the actor while replacing cognition, runtime, tools, dependencies, or control infrastructure.

That creates a new problem:

> **same actor does not imply same risk envelope.**

An authority grant can legitimately remain attached to the same persistent actor while becoming unsafe, stale, or review-worthy for a materially different execution.

The architecture must therefore separate four questions:

1. **Identity continuity** — is this still the same actor?
2. **Capability evidence** — what does this exact execution claim or attest it can do?
3. **Authority continuity** — what authority remains historically attached to the actor?
4. **Admissibility** — does a particular evaluator/policy accept that authority for this execution under current evidence?

NOEONE owns #1 and the longitudinal binding among #2–#4. It should not invent a new OAuth token, universal capability vocabulary, or universal risk score.

---

## Why this becomes more important as models get stronger

Consider one actor whose identity and obligations persist:

```text
2027: modest model + email tool
2029: stronger reasoning model + browser
2031: frontier model + shell + finance tools + sub-agent delegation
2035: embodied or AGI-class execution
```

A grant such as `send-email` may remain within the same textual scope while the execution's ability to discover secrets, compose actions, delegate work, evade controls, or act at speed changes radically.

Revoking the actor's identity would be wrong: it is still the same actor and should retain its history and obligations.

Blindly carrying every prior authorization forward would also be wrong.

The durable invariant is therefore:

> **actor continuity may survive an execution migration; execution-scoped admissibility evidence does not automatically survive it.**

---

## What current standards/research already cover

### OAuth 2.0 AI Agent Instance Profile

The July 2026 Internet-Draft `draft-mcguinness-oauth-ai-agent-instance-00` defines attested agent instance identity/provenance including platform, primary model, and runtime evidence. Its security section explicitly states that changing the primary model invalidates earlier instance evidence and requires fresh evidence before further token issuance under the profile.

Source:
- https://datatracker.ietf.org/doc/draft-mcguinness-oauth-ai-agent-instance/

**Implication for NOEONE:** do not reuse stale execution evidence after model migration. Reference or ingest fresh evidence and bind it to the new `ActorExecution`.

### AuthZEN AARP

The OpenID Foundation's AuthZEN Access Request and Approval Profile models authorization prerequisites such as approval, consent, delegated authority, attestation, risk assessment, or justification, followed by re-evaluation.

Source:
- https://openid.net/openid-foundation-advances-authorization-for-the-agent-era-with-new-authzen-working-group-drafts/

**Implication:** NOEONE should be able to expose that an execution requires fresh review/evidence without inventing a competing approval protocol.

### Dynamic Capability Scoping

`Dynamic Capability Scoping for Enterprise AI Agents` argues that static credentials create persistent over-privilege and that permissions should be scoped dynamically using role ceilings, task context, and policy constraints.

Source:
- https://arxiv.org/abs/2607.22445

**Implication:** execution-time permissions remain the responsibility of policy/enforcement systems. NOEONE records longitudinal evidence and admissibility state across execution changes.

### Bounded Agents

`Bounded Agents: Delegation Security for Multi-Agent AI Systems` treats harmful compositions and delegation as an authorization-architecture problem and enforces accumulated session/delegation state outside the model.

Source:
- https://arxiv.org/abs/2608.15888

**Implication:** NOEONE must not assume a capable model can self-police its authority. Its records should be usable by an external enforcement point.

### Separating Capability from Permission

`Separating Capability from Permission: A Governance Framework for Agentic AI Autonomy Levels` explicitly separates Autonomous Capability Levels from Allowed Autonomy Levels.

Source:
- https://arxiv.org/abs/2607.23438

**Implication:** capability observations and authority/admissibility decisions must be different objects.

### OpenA2A AIP drift detection

The OpenA2A AIP draft includes capability drift, MCP drift, behavioral drift, suspension, and revocation.

Source:
- https://datatracker.ietf.org/doc/draft-fane-opena2a-aip/

**Implication:** drift detection is an input/evidence source. NOEONE's differentiated role is preserving which execution and which continuing actor the drift/admissibility record belongs to over time.

### Agent Capability and Profile Model (ACPM)

ACPM proposes a vendor-neutral capability profile covering capabilities, tools, model/runtime inventories, trust posture, cost, delegation rules, and compliance, while explicitly leaving verification/enforcement to consuming systems.

Source:
- https://www.ietf.org/archive/id/draft-schemacommons-acpm-00.html

**Implication:** NOEONE should reference external profile frameworks rather than freeze a proprietary capability taxonomy.

### Execution-time attestation / capability leases

ACLE-MCP demonstrates the post-authorization execution-trust gap: an endpoint can remain authorized while the actual workload, appraisal state, downstream dependencies, or sender changes. It proposes short-lived execution-time capability leases.

Source:
- https://arxiv.org/abs/2609.02690

**Implication:** NOEONE's longitudinal records complement execution-time enforcement; they do not replace it.

---

## NOEONE-specific primitive

### 1. Execution Capability Manifest

A manifest is an immutable, execution-scoped normalization of capability evidence.

It records:

- persistent `actorId`
- exact `executionId`
- external framework + version
- issuer
- optional external reference
- normalized capability labels
- normalized tool labels
- model/runtime references
- optional source `EvidenceArtifact`
- effective/expiry time
- deterministic manifest digest
- idempotency key

NOEONE does **not** assert that the manifest is universally true. The issuer and evidence remain explicit.

A model/runtime migration creates a new execution. Old manifests remain historical and do not silently apply to the new execution.

### 2. Authority Admissibility Assessment

An assessment is an append-only evaluator-specific statement about whether one authority grant is acceptable for one exact execution.

Dispositions:

- `ADMISSIBLE`
- `REVIEW_REQUIRED`
- `SUSPENDED`
- `NOT_APPLICABLE`
- `DISPUTED`

It binds:

- `actorId`
- `grantId`
- `executionId`
- optional capability manifest
- evaluator
- method + method version
- optional evidence artifact
- assessment/expiry time
- reasons
- deterministic basis digest
- idempotency key

Multiple evaluators may disagree. NOEONE preserves all valid assessments.

There is deliberately no `actor.riskScore` and no platform-global `grant.safe = true` bit.

---

## Derived structural state

For a `(grant, execution, time)` query NOEONE can safely derive structural facts without pretending to be the final policy engine:

- `EVIDENCE_MISSING` — no current capability manifest exists for the execution
- `REVIEW_REQUIRED` — capability evidence exists but no current admissibility assessment exists
- `ASSESSED` — one or more current assessments exist

When assessed, NOEONE returns:

- all current assessments
- disposition counts
- whether evaluators disagree
- the exact manifest/basis digests

The relying party decides how its own policy combines them.

---

## Migration semantics

Suppose actor `A` has grant `G` and execution `E1`.

```text
A --grant G--> authority persists
|
+-- E1 -- manifest M1 -- assessment ADMISSIBLE
|
+-- governed migration --> E2
```

After migration:

- actor `A` is unchanged
- grant `G` is unchanged
- historical E1 assessment remains valid for its historical interval
- E1 assessment does not authorize E2
- E2 has no capability evidence initially -> `EVIDENCE_MISSING`
- after fresh manifest M2 -> `REVIEW_REQUIRED`
- fresh evaluators can then issue assessments for E2

This is the central continuity invariant.

---

## What NOEONE should not build

NOEONE should not own:

- a universal capability ontology
- an OAuth replacement
- a generic policy engine
- a universal trust/risk score
- a claim that a signed capability profile is inherently true
- automatic authority revocation solely because a model changed

Those choices belong to standards, resource servers, policy engines, principals, insurers, regulators, and host environments.

NOEONE should own the longitudinal evidence graph that lets those systems reason about the *same actor across changing executions*.

---

## V1 falsification test

1. Create persistent actor A on execution E1.
2. Give A authority grant G.
3. Bind capability manifest M1 to E1.
4. Record evaluator assessment `ADMISSIBLE` for `(G, E1, M1)`.
5. Governed-migrate A to E2 with a different model/runtime.
6. Confirm actor ID and grant G remain unchanged.
7. Confirm old E1 assessment is still historically queryable.
8. Confirm E2 begins `EVIDENCE_MISSING`.
9. Register M2 for E2; E2 becomes `REVIEW_REQUIRED`.
10. Record one evaluator `ADMISSIBLE` and another `SUSPENDED`.
11. Confirm NOEONE exposes disagreement instead of collapsing it to a single score.

If this invariant cannot be represented cleanly, NOEONE has accidentally conflated actor identity, execution identity, capability, and permission.