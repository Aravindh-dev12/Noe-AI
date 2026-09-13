# NOEONE Research: Lifecycle Finality and Resurrection Provenance

## Research question

NOEONE already preserves persistent actor identity, authority, evidence, decision-time alternatives, foreseeability, oversight opportunity, consequences, claims/remedies, corrective state, and collective continuity.

A deeper lifecycle question remains:

> When a persistent artificial actor is intentionally retired, revoked, decommissioned, lost, or otherwise stops operating, under what evidence may a later runtime legitimately claim to be the **same continuing actor** rather than a clone, descendant, restore, or unauthorized zombie — and which obligations, restrictions, rights, and history follow that determination?

This is not a secure-deletion protocol and it is not a metaphysical claim about consciousness. It is a longitudinal institutional identity problem.

---

## 1. Why this matters

Long-lived agents will not merely migrate while healthy. They will also:

- crash and recover;
- lose keys;
- be intentionally retired;
- be revoked after compromise;
- be decommissioned while retaining historical obligations;
- later be restored from checkpoints or backups;
- be cloned from pre-retirement snapshots;
- reappear through a different model/runtime/host;
- be replaced by a successor that should **not** inherit the same identity.

A registry that only knows `ACTIVE` vs `RETIRED` cannot distinguish these cases safely.

The dangerous failure is resurrection laundering:

```text
Actor A
  obligations + restrictions + history
        |
        | decommission
        v
RETIRED
        |
        | restore old snapshot / new runtime
        v
"Actor A" again
  obligations disappeared    <- invalid
```

The opposite failure is also dangerous: treating every recovery as a new actor destroys legitimate continuity and makes ordinary disaster recovery impossible.

---

## 2. Prior-art boundary

### EPITAPH: secure decommissioning already exists as a research direction

Mohamed Chahine Ghanem's 2026 EPITAPH work treats retirement of a stateful agent as a coordinated teardown across credentials, tool/MCP bindings, memory, learned policy state, and A2A trust relationships. It proposes an externally verifiable Proof of Decommissioning.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7341378

**NOEONE must not reimplement this.** A decommissioning system can issue evidence; NOEONE binds that evidence to the persistent actor lifecycle and determines what later continuity claims must prove.

### DNSid: retirement/revocation and historical verification

The 2026 DNS-Anchored Durable Identity draft models durable identity across key rotation, retirement and revocation, and explicitly argues that past ownership/key state must remain verifiable after an agent is gone.

It also states that continuity-preserving recovery from key loss or compromise is not specified by the base revision and is reserved for future profiles.

Source:
- https://datatracker.ietf.org/doc/draft-ihsanullah-dnsid/

**NOEONE implication:** consume durable identity/lifecycle evidence where available; do not invent another DNS or credential standard. The unresolved layer is whether a later execution legitimately continues a historical actor.

### W3C Agent Identity Registry Protocol CG

The W3C community group's scope already includes verifiable agent identity, controlling-entity credentials, trust negotiation, revocation, and credential lifecycle management.

Source:
- https://www.w3.org/groups/cg/agent-identity/

**NOEONE implication:** revocation and credential lifecycle are inputs, not the product moat.

### NIST agent identity and authorization

NIST's 2026 work asks how software/AI agents should be identified, authenticated, authorized, audited, and made non-repudiable, including key issuance/update/revocation and delegation.

Sources:
- https://csrc.nist.gov/pubs/other/2026/02/05/accelerating-the-adoption-of-software-and-ai-agent/ipd
- https://www.nist.gov/blogs/cybersecurity-insights/back-future-why-agentic-ai-needs-strong-identity-foundation

**NOEONE implication:** identity/IAM controls are prerequisites; lifecycle continuity after operational death is a separate longitudinal problem.

### Runtime-independent persistent agents

Runtime-Independent Persistent Agents (2026) separates continuity-bearing state from replaceable model/runtime/host bindings and defines governed migration through continuation authority.

Source:
- https://arxiv.org/abs/2609.00546

**NOEONE implication:** mechanical continuation is important but insufficient. A post-retirement restore must also be institutionally authorized and must not erase actor-level state.

### AI individuation and liability

How to Count AIs (2026) emphasizes that AIs can copy, split, merge and swarm, making individuation a prerequisite for liability.

Source:
- https://doi.org/10.2139/ssrn.6273198

**NOEONE implication:** a resurrection claim cannot be accepted merely because the candidate has the same memory/persona/model weights.

---

## 3. NOEONE's narrower layer

Existing systems can answer:

- Was this credential revoked?
- Was this runtime securely decommissioned?
- What identity/key was valid at a past time?
- Does this process possess current credentials?

NOEONE should answer:

> **What is the actor-level lifecycle state, what terminality evidence exists, and is a later execution recognized as a legitimate continuation of the same actor or a distinct descendant/clone?**

The crucial object is not process uptime. It is continuity authority across lifecycle discontinuity.

---

## 4. Proposed primitives

### 4.1 ActorLifecycleClosure

An append-only record that a continuing actor entered a non-operational lifecycle state.

```text
ActorLifecycleClosure
  version = noeone.lifecycle-closure.v1
  id
  actorId
  executionId?

  kind
    RETIREMENT
    REVOCATION
    DECOMMISSION
    LOST_CONTROL
    OWNER_CESSATION

  effectiveAt
  capturedAt

  sourceEvidenceArtifactId
  externalLifecycleRef?
  proofOfDecommissionRef?
  reasonCode?

  issuedByType
  issuedByRef
  authorityEvidenceArtifactId

  continuationPolicy
    PROHIBITED
    REVIEW_REQUIRED
    PREAUTHORIZED_RECOVERY

  recoveryPolicyDigest?
  basisDigest
```

The closure does not prove secure deletion by itself. `proofOfDecommissionRef` may reference EPITAPH-like evidence or another external teardown attestation.

### 4.2 ResurrectionClaim

A later execution that claims continuity with the closed actor.

```text
ResurrectionClaim
  version = noeone.resurrection-claim.v1
  id
  actorId
  closureId
  candidateExecutionId

  claimType
    SAME_ACTOR_RECOVERY
    RESTORE_FROM_CHECKPOINT
    KEY_RECOVERY
    HOST_RECOVERY
    DISASTER_RECOVERY

  sourceSnapshotDigest?
  sourceLineageNodeId
  continuationAuthorityRef
  recoveryEvidenceArtifactId
  credentialEvidenceArtifactId?
  stateCommitmentDigest?

  claimedAt
  basisDigest
```

A claim is only a claim. It does not reactivate the actor.

### 4.3 ResurrectionDecision

An authorized, append-only institutional decision about the claim.

```text
ResurrectionDecision
  version = noeone.resurrection-decision.v1
  id
  claimId
  actorId

  disposition
    ACCEPT_SAME_ACTOR
    REJECT_DISTINCT_ACTOR
    REQUIRE_ADDITIONAL_REVIEW
    SUPERSEDED

  decidedAt
  decidedByType
  decidedByRef
  authorityEvidenceArtifactId
  evidenceArtifactId
  basisDigest
```

Only `ACCEPT_SAME_ACTOR` may re-establish operational continuity for the existing actor ID.

A rejected candidate may still become a new actor/fork through ordinary lineage machinery, but it must not inherit identity by assertion.

---

## 5. Lifecycle state model

NOEONE should not collapse credential state, runtime state, and actor state.

A V1 actor-lifecycle projection may expose:

```text
ACTIVE
  -> CLOSED

CLOSED
  -> CLOSED                 (rejected resurrection claim)
  -> RECOVERY_PENDING       (claim under review)
  -> ACTIVE                 (accepted continuation)
```

`REVOKED` / `RETIRED` from external credential systems remain external facts. NOEONE's closure records why the persistent actor is not currently recognized as operational.

### Finality matters

If `continuationPolicy = PROHIBITED`, ordinary recovery should not reopen the same actor. Reappearance requires an explicit superseding institutional record or must become a new actor.

If `PREAUTHORIZED_RECOVERY`, the closure still requires exact recovery-policy evidence and cannot be bypassed by a lookalike execution.

---

## 6. State that follows accepted continuation

Accepting a candidate as the same actor does **not** mean starting clean.

Actor-level state continues unless the governing domain explicitly says otherwise:

- canonical lineage/history;
- open commitments;
- claims and remedies;
- active corrective conditions;
- relationship history;
- collective roles where the historical/current epoch permits them;
- authority constraints and delegation limits;
- evidence provenance;
- unresolved incidents or disputes.

A model/runtime swap cannot selectively preserve valuable reputation while dropping liabilities or restrictions.

This is a core NOEONE invariant:

> **continuity is symmetric with respect to benefits and burdens.**

---

## 7. State that must not silently transfer to a distinct actor

If a candidate is rejected as a distinct actor, it does not automatically inherit:

- the source actor's authority;
- credentials;
- contracts/commitments;
- corrective state;
- followers/reputation claims;
- property/control rights;
- legal/economic standing.

Its ancestry may be recorded explicitly through a fork/derivation edge.

This prevents both identity theft and sanction laundering.

---

## 8. Core invariants

1. **Closure is append-only.** Retirement/decommission history is never erased by later recovery.
2. **Claim is not continuation.** A candidate execution cannot reactivate an actor merely by presenting the same memory/persona/model.
3. **Authority required.** Every accepted continuation requires explicit continuation authority or a valid preauthorized recovery policy.
4. **Exact closure binding.** A resurrection claim binds to the exact lifecycle closure it seeks to cross.
5. **Exact lineage binding.** Candidate recovery identifies the source lineage node/checkpoint rather than saying only `same actor`.
6. **No pre-closure snapshot laundering.** Restoring an old snapshot does not restore old authority or erase later obligations/restrictions.
7. **No credential-only proof.** Current possession of a credential is evidence but not sufficient actor-continuity proof after closure.
8. **Benefits and burdens travel together.** Accepted continuity carries the actor-level institutional state in force at the relevant time.
9. **Fork distinction.** Rejected/different candidates may become descendants but never silently share the canonical actor ID.
10. **Temporal monotonicity.** A claim cannot predate its closure; a decision cannot predate its claim.
11. **Semantic idempotency.** Replaying one source key with different semantic content is a conflict.
12. **Plural evidence.** NOEONE stores issuer/verifier-specific facts rather than one metaphysical `same person` score.
13. **No secure-deletion overclaim.** A closure may reference decommissioning proof; NOEONE does not claim teardown completeness it cannot observe.
14. **Historical verifiability.** Old work remains attributable even while the actor is closed.
15. **No zombie authority.** Actor-level authority evaluation must treat a closed actor as non-operational until accepted continuation.

---

## 9. Adversarial threat model

### Zombie runtime

A supposedly decommissioned process continues using cached credentials or stale peer trust.

NOEONE response: preserve closure and mark post-closure activity as lifecycle-inconsistent unless separately explained by evidence.

### Snapshot rollback laundering

Operator restores a checkpoint from before a sanction, claim, or obligation.

NOEONE response: accepted actor continuity resolves current institutional state from canonical history, not from candidate local memory.

### Clone impersonation

A copied memory/model claims the famous actor's identity.

NOEONE response: same state digest is not sufficient; continuation authority and lineage evidence are required.

### Key possession after closure

A stale or stolen key signs a resurrection claim.

NOEONE response: exact lifecycle status and authority evidence are independently checked; a past operational key does not override closure.

### Selective inheritance

Candidate wants followers/reputation but rejects liabilities/restrictions.

NOEONE response: same-actor acceptance is all-or-nothing for applicable actor-level institutional state.

### Resurrection race

Two candidates simultaneously claim to be the same continuing actor.

NOEONE response: V1 permits at most one accepted active continuation for a closure unless a future explicit multi-instantiation policy is introduced.

### Operator equivocation

Controller accepts different candidates as the same actor to different relying parties.

NOEONE response: accepted continuation is an append-only canonical lifecycle fact and conflicting acceptances are invalid under V1.

### Fake death

Actor/operator announces retirement to escape obligations but continues acting elsewhere.

NOEONE response: closure does not erase historical obligations; later signed activity can be evaluated against the closure timeline.

---

## 10. Interaction with existing NOEONE domains

### Consequence Reception

Active corrective conditions survive accepted resurrection. A pre-closure snapshot cannot restore an earlier unrestricted state.

### Commitments and claims

Closure does not silently cancel commitments, claims, adjudications, or remedies. Domain-specific law/contracts may later create explicit release/succession records.

### Authority

A closed actor has no current NOEONE operational authority. Accepted resurrection may restore only authority that is still independently valid; expired/revoked delegations do not revive automatically.

### Collective actors

A resurrected member does not regain a historical collective role unless the current collective epoch says so.

### Selective Continuity

A relying party should be able to prove `continuation accepted after closure X` without receiving unrelated private history.

### Actor Resolution

Resolution should expose lifecycle state and canonical continuation head so hosts can reject stale/zombie executions.

---

## 11. Proposed research experiments

### E1: sanction rollback

1. create actor;
2. issue corrective restriction;
3. close/decommission actor;
4. restore a checkpoint from before restriction;
5. accept same-actor recovery;
6. verify restriction remains active.

Failure means NOEONE permits resurrection laundering.

### E2: legitimate disaster recovery

1. create actor with open commitments;
2. lose host/runtime unexpectedly;
3. close as `LOST_CONTROL` with review-required recovery;
4. restore latest authenticated checkpoint on a new provider/runtime;
5. accept continuation;
6. verify same actor ID/history/commitments and new execution binding.

### E3: clone rejection

Two identical candidate runtimes claim the same actor after closure. Accept one and reject the other. Verify only the accepted candidate can become canonical execution; rejected candidate can only continue through a distinct actor lineage.

### E4: stale-key attack

Use a pre-revocation operational key to submit a resurrection claim. The signature may be historically valid while continuation authority is not. Verify that cryptographic validity does not equal continuation authorization.

### E5: post-closure activity detection

Record an activity timestamp after effective closure and before accepted recovery. Verify the lifecycle verifier reports a zombie/inconsistent interval rather than silently treating it as ordinary activity.

### E6: model migration during recovery

Close GPT-backed actor, recover onto Claude/Mistral/other runtime, and verify that model difference does not itself decide identity; evidence and continuation authority do.

---

## 12. Proposed benchmark

### Artificial Actor Lifecycle Finality Benchmark (AALFB)

Scenarios:

- graceful retirement;
- forced revocation;
- credential compromise;
- crash/disaster recovery;
- stale checkpoint restore;
- duplicate candidate resurrection;
- model/provider swap during recovery;
- post-decommission zombie traffic;
- active-sanction rollback attempt;
- owner/controller transition;
- accepted restore vs new successor actor.

Metrics:

- false-continuation rate;
- false-new-identity rate;
- obligation/corrective-state preservation;
- stale-key acceptance rate;
- zombie-activity detection;
- continuity-decision reproducibility;
- selective-disclosure compatibility.

---

## 13. Kill criteria

Do not continue owning this layer if:

1. durable-identity standards fully standardize post-retirement same-actor recovery with equivalent longitudinal obligations/lineage semantics;
2. real agent deployments never restore identity after closure and simply create new actors every time;
3. accepted continuity cannot be distinguished from clone claims using externally verifiable evidence;
4. counterparties do not care whether benefits and burdens survive recovery;
5. the feature reduces to credential revocation/reissuance already handled by IAM;
6. implementation requires NOEONE to become the secure-deletion/runtime-enforcement provider.

---

## 14. Narrow novelty claim

Do **not** claim:

> NOEONE invented agent retirement, revocation, decommissioning, backup recovery, or persistent identity.

The defensible hypothesis is narrower:

> **NOEONE is testing a longitudinal actor lifecycle layer that binds externally evidenced closure to later same-actor continuation decisions, while preserving the continuing actor's benefits, burdens, restrictions, obligations, and history across discontinuous execution.**

That is the layer this branch should now test in code.
