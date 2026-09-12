# NOEONE Research: Exposure Applicability & Conflicting Assessments

## Core question

The dependency graph can answer:

> Which actor executions are **potentially exposed** to an upstream component incident at time T?

That is not the same question as:

> Which executions were **actually affected**, and according to whom?

NOEONE must preserve that distinction.

If dependency reachability is treated as impact, the system will create false positives, overstate correlated risk, and silently turn supply-chain topology into a universal truth judgment.

The correct architecture is:

```text
Dependency graph
    -> potential exposure
    -> assessment(s)
    -> evidence + method + evaluator
    -> possibly conflicting conclusions
```

NOEONE records the assessment provenance. It does not collapse all assessments into one global answer.

---

## 1. The SBOM/VEX precedent

CISA's software-component-transparency guidance explicitly distinguishes component presence from downstream impact. A product may include an upstream component yet not use the affected code path. VEX exists to communicate product-specific status such as:

- `NOT AFFECTED`
- `AFFECTED`
- `FIXED`
- `UNDER INVESTIGATION`

Sources:
- https://www.cisa.gov/sites/default/files/2024-10/SBOM%20Framing%20Software%20Component%20Transparency%202024.pdf
- https://www.cisa.gov/sites/default/files/publications/VEX_Use_Cases_Document_508c.pdf

CycloneDX describes VEX as contextual exploitability information: a vulnerable component can be present while the product is not exploitable in its actual context.

Source:
- https://cyclonedx.org/capabilities/vex/

SPDX 3.0 separates relatively static BOM facts from dynamic security assessments so changing vulnerability/applicability information does not require rewriting the original component record.

Sources:
- https://spdx.dev/capturing-software-vulnerability-data-in-spdx-3-0/
- https://spdx.dev/learn/areas-of-interest/security/

**NOEONE implication:** the dependency snapshot must remain immutable. Later impact analysis becomes a new assessment record.

---

## 2. Generalize the pattern beyond vulnerabilities

NOEONE's dependency incidents are broader than CVEs.

Examples:

- model provider outage;
- API regression;
- model withdrawal;
- key compromise;
- cloud region outage;
- authorization-provider revocation;
- safety regression;
- incompatible tool update;
- corrupted dataset;
- compromised runtime package.

Therefore V1 uses generalized dispositions rather than pretending every incident is a software vulnerability:

- `AFFECTED`
- `NOT_AFFECTED`
- `UNDER_INVESTIGATION`
- `MITIGATED`
- `DISPUTED`

A later standards adapter may map VEX `FIXED` into an appropriate NOEONE assessment/remediation record without changing the underlying dependency graph.

---

## 3. Assessment is issuer-specific evidence

An impact assessment records:

- incident;
- persistent actor;
- exact execution;
- dependency snapshot used as context;
- exposure time;
- disposition;
- evaluator identity/reference;
- method + method version;
- supporting EvidenceArtifact;
- confidence optional;
- immutable path basis;
- path digest;
- assessment basis digest;
- idempotency key;
- metadata.

The assessment says:

> `Evaluator E, using method M and evidence X, assessed execution Y as disposition Z for incident I.`

It does **not** say:

> `NOEONE declares Z to be objectively true.`

---

## 4. Multiple assessments must be allowed to disagree

CycloneDX 2.0's direction is especially relevant: vulnerability evidence can carry the author, analysis method, confidence, and supporting evidence; multiple parties may publish conflicting determinations rather than one assertion overwriting another.

Source:
- https://cyclonedx.org/news/cyclonedx-v2.0-coming-soon/

NOEONE should preserve the same institutional property.

Example:

```text
Incident: model-provider-X regression
Actor execution: E42

Provider assessment:
  NOT_AFFECTED
  method = internal-eval-v3

Independent lab assessment:
  AFFECTED
  method = reproduction-suite-v2

Insurer assessment:
  UNDER_INVESTIGATION
  method = underwriting-review-v1
```

All three remain visible to authorized consumers.

A downstream policy engine can choose which issuers/methods it trusts.

---

## 5. Potential exposure is a prerequisite

V1 only accepts an impact assessment when the actor/execution is reachable from the incident component in NOEONE's dependency graph at the assessment's `exposureAt` time.

This prevents unrelated actors from accumulating arbitrary incident labels.

The path used for the assessment is captured as immutable `pathBasis` data and hashed.

The path basis contains only structural IDs and dependency roles necessary to reproduce the assessment context. It does not copy secrets or raw telemetry.

---

## 6. Why verification must not simply recompute the current graph

A subtle problem appears when dependency knowledge arrives late.

Example:

```text
10:00 execution uses dependency A
10:05 incident begins
10:30 evaluator assesses based on known path P1
12:00 a previously unknown transitive dependency edge is discovered
```

If NOEONE later recomputed the 10:30 assessment against today's graph and required exact equality, historical assessments would become unstable.

So verification checks:

1. the stored path basis hash still recomputes;
2. referenced actor/execution/snapshot/incident/evidence records still exist;
3. the snapshot belongs to the actor/execution;
4. the basis digest still recomputes;
5. the immutable assessment record has not been altered.

It does **not** assert that the evaluator had perfect knowledge.

A new discovery can generate a **new assessment**.

This is knowledge-time provenance, not retroactive truth rewriting.

---

## 7. Assessment basis digest

The basis digest commits to the institutional meaning of the assessment:

```text
incidentId
actorId
executionId
snapshotId
exposureAt
disposition
evaluator
method
methodVersion
sourceEvidenceArtifactId
confidenceBps
pathDigest
```

Metadata is intentionally not part of the core basis digest unless a future schema version promotes a field into the canonical assessment semantics.

---

## 8. Privacy and publication policy

Raw assessment evidence may contain sensitive operational/security data.

V1:

- creating assessments: privileged;
- reading raw assessments: privileged;
- reading incident triage: privileged;
- public passports: no raw incident labels by default;
- future public disclosure requires explicit policy/owner authorization or a legally public source.

NOEONE should not become a public accusation feed for AI systems.

---

## 9. Threat model

### False reachability
An evaluator attempts to attach an incident to an execution that was not in the graph's potential blast radius.

Mitigation: require a reachable exposure path at `exposureAt` before accepting the assessment.

### Assessment overwrite
A later evaluator attempts to replace a previous conclusion.

Mitigation: append-only assessments; no mutable `currentImpact` field.

### Idempotency substitution
The same idempotency key is reused with a different disposition/evidence/method.

Mitigation: basis digest conflict -> HTTP 409.

### Historical graph drift
Newly discovered dependency edges change today's reconstruction of an old event.

Mitigation: persist and hash the exact assessment path basis; do not rewrite it.

### Confidence laundering
A source assigns a high confidence to weak evidence.

Mitigation: confidence is issuer-provided evidence, not a NOEONE truth score; retain evaluator + method + source evidence.

### Sybil evaluators
Many low-quality evaluators repeat one conclusion.

Mitigation: do not aggregate by raw vote count into truth. Trust policy is downstream and issuer-aware.

---

## 10. API direction

```text
POST /v1/dependencies/impact-assessments
GET  /v1/dependencies/impact-assessments/:assessmentId
GET  /v1/dependencies/impact-assessments/:assessmentId/verify
GET  /v1/dependencies/incidents/:incidentId/assessments
GET  /v1/dependencies/incidents/:incidentId/triage
```

`triage` combines:

- current potential exposure paths at an explicit time;
- all stored issuer-specific assessments;
- no synthesized universal verdict.

---

## 11. Research experiments unlocked

### Reachability precision
Compare raw dependency blast radius against evidence-backed affected/not-affected assessments.

### Evaluator disagreement
Measure disagreement among providers, independent labs, users, insurers, and automated methods.

### Method drift
Track how one evaluator's assessment changes as its method version changes while the underlying incident and actor execution remain fixed.

### Late-discovered dependencies
Inject a dependency edge after an assessment and verify the original assessment remains historically stable while a new assessment can use the richer graph.

### Underwriting value
Compare insurance/risk models using only dependency reachability versus models using reachability + issuer/method-specific applicability evidence.

---

## 12. Long-term significance

The dependency layer answers:

> `Who might be exposed?`

The applicability layer answers:

> `Who says this execution was actually affected, based on what evidence and method?`

That separation is important for NOEONE's long-term role as neutral longitudinal infrastructure. It lets NOEONE support incident response, research, underwriting, audits, and future regulation without turning the registry itself into an oracle.
