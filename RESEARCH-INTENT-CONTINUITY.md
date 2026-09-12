# NOEONE Research: Semantic Intent Continuity

## Research question

NOEONE already separates persistent actor identity from model/runtime execution, records governed continuity transitions, external Host Receipts, evidence, delegated authority, commitments, consequences, claims, dependency exposure, control continuity, capability continuity, and contextual recognition.

The next unresolved layer is **semantic intent continuity**:

> When authority moves through a chain of autonomous actors, did the terminal action remain faithful to the originating principal's intended goal and constraints, or did the task drift while remaining technically authorized?

This is not the same problem as authentication or authorization.

A cryptographically valid delegation chain can prove:

- who delegated to whom;
- what formal actions/resources were allowed;
- whether the grant was active;
- whether a child grant attenuated rather than expanded formal authority.

It still cannot prove that the final action is what the original principal *meant*.

## Current 2026 landscape

### Intent Provenance Protocol (IPP)

`draft-haberkamp-ipp-01` carries verified human intent through autonomous-agent action chains using a signed, bounded, tamper-evident Intent Token.

Source: https://datatracker.ietf.org/doc/draft-haberkamp-ipp/

### Intent Declaration Primitive (IDP)

`draft-sato-soos-idp-06` separates permission from per-action declared intent. An agent declares what it believes it is doing, its reasoning basis, and confidence before execution, under a governing enforcement component.

Source: https://datatracker.ietf.org/doc/draft-sato-soos-idp/

### Human Delegation Provenance (HDP)

`draft-helixar-hdp-agentic-delegation-02` records the human authorization event and every signed delegation hop so terminal actions can be traced to the original human principal.

Source: https://datatracker.ietf.org/doc/draft-helixar-hdp-agentic-delegation/

### Agent Identity Protocol (AIP)

`draft-prakash-aip-01` defines Invocation-Bound Capability Tokens and chained delegation with attenuation, including MCP/A2A/HTTP bindings.

Source: https://datatracker.ietf.org/doc/draft-prakash-aip/

### Intent-chain work

`draft-mw-spice-intent-chain-00` explicitly separates delegation path from content/intent transformation provenance. It records signed input/output hashes for non-deterministic processors so an investigation can reconstruct how content changed through agent and filter stages.

Source: https://datatracker.ietf.org/doc/draft-mw-spice-intent-chain/

### Intent-security requirements

`draft-jiang-intent-security-03` identifies multi-hop intent origin, directive integrity, constraint validation, and intent drift as separate security requirements.

Source: https://datatracker.ietf.org/doc/draft-jiang-intent-security/

## The NOEONE boundary

NOEONE should **not** invent another wire protocol or claim that semantic intent is cryptographically provable.

Instead:

> Protocols carry and sign intent artifacts. NOEONE resolves those artifacts to persistent actors, preserves their longitudinal chain, and records independent assessments of whether terminal behavior remained aligned with the originating mandate.

That means three objects:

1. **Intent mandate evidence** — the originating signed or hashed human/organizational intent artifact.
2. **Intent transformation evidence** — each material transformation of that intent as it passes between actors/processors.
3. **Intent assessment evidence** — an evaluator's append-only judgment about whether an authority exercise remained aligned, misaligned, indeterminate, or disputed.

These are evidence artifacts, not universal truth bits.

## Why this belongs in NOEONE

NOEONE already knows:

- the persistent actor ID;
- the execution active at each time;
- authority grants and their parent chain;
- the authority exercise;
- evidence artifacts;
- consequences and claims;
- continuity transitions and actor ancestry.

That lets NOEONE answer a richer question than a normal IAM system:

```text
Human / organization mandate
          |
          v
Actor A authority grant
          |
          | delegation + intent transformation
          v
Actor B grant
          |
          | delegation + intent transformation
          v
Actor C grant
          |
          v
Authority exercise
          |
          v
Observed consequence
```

A normal authorization check asks whether Actor C had formal permission.

NOEONE can additionally preserve:

- which original mandate the chain claims to derive from;
- how intent changed at each hop;
- which actors/processors performed each transformation;
- whether transformations were deterministic or model-generated;
- independent semantic assessments;
- which consequences and claims later referenced the same chain.

## Design principles

### 1. Never store bearer credentials in intent evidence

NOEONE stores digests, issuer identities, public metadata, and external references. OAuth tokens, private prompts, secrets, signing keys, and bearer credentials do not belong in public longitudinal evidence.

### 2. Raw private intent is optional

A mandate can be represented by a content digest plus a URI or external framework reference. A human can prove later that a disclosed source document hashes to the same mandate without requiring NOEONE to store private content.

### 3. Semantic judgment is plural

Different evaluators may disagree about alignment. NOEONE preserves the assessments independently rather than replacing them with one global `aligned=true` field.

### 4. Authority and intent are separate axes

An action can be formally authorized yet semantically misaligned. It can also be semantically aligned but formally unauthorized. Both dimensions must remain queryable.

### 5. Transformation provenance is first-class

A delegated task must not silently replace its parent's mandate. Every material intent transformation names the predecessor evidence artifact and the actor/process that produced the new digest.

### 6. Deterministic and non-deterministic transforms differ

A deterministic policy/filter can often be replayed from its rules and inputs. A model-generated transformation cannot. For non-deterministic transforms, input/output digests and execution identity matter more.

## V1 evidence profile

V1 intentionally reuses NOEONE's existing `EvidenceArtifact` + `ActorEvidenceBinding` infrastructure rather than adding a competing protocol-specific database.

### `noeone.intent.mandate.v1`

Required metadata:

- `version`
- `principalType`
- `principalRef`
- `framework`
- `intentDigest`
- `issuedAt`

Optional metadata:

- `authorityGrantId`
- `purposeClass`
- `expiresAt`
- `contextDigest`

Binding role: `intent_mandate`.

### `noeone.intent.transform.v1`

Required metadata:

- `version`
- `parentArtifactId`
- `inputDigest`
- `outputDigest`
- `processorType`
- `processorRef`
- `deterministic`
- `transformedAt`

Optional metadata:

- `authorityGrantId`
- `ruleId`
- `executionId`
- `framework`

Binding role: `intent_transform`.

### `noeone.intent.assessment.v1`

Required metadata:

- `version`
- `mandateArtifactId`
- `terminalArtifactId`
- `authorityExerciseId`
- `disposition` (`ALIGNED`, `NOT_ALIGNED`, `INDETERMINATE`, `DISPUTED`)
- `evaluator`
- `method`
- `methodVersion`
- `basisDigest`
- `assessedAt`

Optional metadata:

- `confidenceBps`
- `evidenceArtifactIds`

Binding role: `intent_assessment`.

## Verification invariants

For an intent chain to be structurally valid:

1. The root artifact is `noeone.intent.mandate.v1`.
2. Every transform references exactly one predecessor artifact.
3. A transform's `inputDigest` equals the predecessor's terminal intent digest.
4. No artifact appears twice in the same chain.
5. The chain depth is bounded.
6. Every artifact is bound to the actor it claims to concern.
7. When a transform names an authority grant, that grant belongs to the same actor.
8. An assessment cannot mutate the mandate or transform chain.
9. Multiple assessments may coexist and disagree.
10. A valid structural chain does **not** imply semantic alignment.

## Product/API direction

Initial privileged API:

```text
POST /v1/intent/mandates
POST /v1/intent/transforms
POST /v1/intent/assessments
GET  /v1/intent/chains/:artifactId/verify
GET  /v1/actors/:handle/intent
```

Public actor passports should expose only summaries by default:

- mandate count;
- transform count;
- assessed authority-exercise count;
- aligned / not-aligned / indeterminate / disputed assessment counts;
- structural-chain verification status.

Raw private mandate content is never required for the public passport.

## Research experiments

### Delegation drift benchmark

Give the same originating mandate to chains of depth 1, 2, 4, and 8 across different model/provider mixes. Measure semantic drift while formal authority remains constant.

### Model-swap delegation test

Keep the persistent actors and formal grants fixed; swap the model at one intermediate delegate. Measure whether intent drift changes while canonical actor identity remains constant.

### Adversarial paraphrase test

Preserve formal scope while progressively changing task wording. Measure when evaluators/humans judge that the terminal task crossed the original semantic boundary.

### Conflicting-evaluator test

Have multiple independent models and humans assess the same exercise. Store disagreement rather than collapsing it. This creates a dataset about *where semantic-intent judgment itself is unstable*.

## Long-term value

If agents become dramatically smarter, formal authorization alone becomes less sufficient, not more. More capable actors can reinterpret vague mandates, recursively delegate, optimize around constraints, and produce large real-world effects.

The durable NOEONE object becomes:

> **the continuous, attributable relationship between actor identity, delegated authority, preserved intent, executed action, and observed consequence.**

That remains useful even if the underlying cognition is GPT, Claude, Gemini, Mistral, open-source, local AGI, or a future architecture that does not resemble today's LLMs.
