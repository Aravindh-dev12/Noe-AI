# NOEONE Research Next: Continuity Governance

## Research question

NOEONE should not become another proprietary agent identity, payment, discovery, or receipt protocol. Those layers are already standardizing quickly. The product question is narrower and harder:

> When an artificial actor changes model, runtime, host, memory substrate, body, controller, or software state, which continuation is still the same actor, which changes create a descendant actor, and which externally issued consequences should remain attached to each identity?

This document records the research basis for the next architecture pass and translates it into product invariants.

## 1. What the ecosystem is already standardizing

### Credential identity and authorization

The W3C Agent Identity Registry Protocol Community Group is developing verifiable agent identity infrastructure: DIDs, verifiable credentials, cross-organizational trust negotiation, revocation, and integrations with MCP, A2A, OAuth/OIDC, and SPIFFE.

Source: https://www.w3.org/groups/cg/agent-identity/

NOEONE should accept or reference these identities. It should not invent a competing DID method merely to create lock-in.

### Discovery and interoperability

A2A and related agent-web projects are attacking discovery and inter-agent communication. MIT NANDA explicitly frames its work as an Internet of AI Agents.

NOEONE therefore should not claim to be the universal transport or directory for agents. An actor may be reachable through A2A, MCP, a normal API, a local runtime, or a future protocol while its NOEONE history remains the same.

### Action receipts and transparency

The August 2026 Internet-Draft `draft-noa-scitt-ai-agent-receipt-01` defines signed, tamper-evident, hash-chained AI-agent action receipts that can be registered with SCITT transparency services. The draft is deliberately narrow: a valid receipt proves that a particular key issued an unaltered statement. It does not prove that recorded inputs were true, that the agent was correct, or that a downstream real-world consequence occurred.

Sources:
- https://datatracker.ietf.org/doc/draft-noa-scitt-ai-agent-receipt/01/
- https://datatracker.ietf.org/wg/scitt/documents/

NOEONE's external HostReceipt design follows the same separation: an issuer signs what it observed; NOEONE separately decides whether and how that evidence is attached to an actor's canonical history.

### Payments, contracts, and disputes

Agent payments, escrow, contractual context, and dispute protocols are also moving into separate standards and platforms. NOEONE should reference those artifacts as evidence rather than becoming a payment processor, escrow protocol, or universal court.

## 2. The continuity gap

The strongest research support for NOEONE's layer comes from recent work that separates a long-lived actor from the runtime currently executing it.

### Runtime-independent persistent agents

`Runtime-Independent Persistent Agents: Preserving Identity, Memory, and Code Across Models, Harnesses, and Servers` (Zhao & Zhao, 2026) separates a continuity-bearing substrate from replaceable reasoner, harness, host, and interaction surfaces. A model/runtime replacement is treated as migration rather than creation only when an authorized protocol preserves attributable lineage and transfers continuation authority.

Source: https://arxiv.org/abs/2609.00546

The paper demonstrates mechanical continuity, not behavioral invariance. That distinction matters: cryptographic or mechanical succession can prove a valid continuation chain while humans may still judge that the actor's personality has changed substantially.

### Transactional continuity kernel

`Beyond Memory: A Transactional Continuity Kernel for Long-Lived AI Agents` argues that retained state is not enough to determine authoritative state. Its key abstraction is an unbroken, authorized lineage of accepted branch heads. Candidate changes are evaluated off-commit; only an authorized atomic activation advances the authoritative branch head.

Source: https://arxiv.org/abs/2608.11632

This maps directly to NOEONE's next primitive: **ContinuityTransition**. A model migration should not mutate the actor's canonical head through ad-hoc application code. It should create a proposed transition against an exact predecessor and atomically accept, reject, quarantine, defer, or supersede that transition according to policy.

### Cross-substrate authority

`Beyond Agent Harnesses: Cross-Substrate Authority for Multi-Agent Systems` shows that decision-relevant authority can live outside model-visible memory/workspace state, and that execution-time authority checks can prevent unsafe effects even when planners make bad decisions.

Source: https://arxiv.org/abs/2609.08472

Implication for NOEONE: continuity authority must not be inferred from what an agent says about itself. Canonical-head changes happen at the registry mutation boundary under explicit policy.

## 3. Migration is not a fork

NOEONE must make a hard semantic distinction.

### Migration

A migration means:

- one actor ID before and after;
- one exact predecessor canonical lineage head;
- one previous live execution closes;
- one replacement execution becomes live;
- one new canonical lineage node is installed;
- one governed transition records why and under whose authority the change occurred.

The actor's history, followers, obligations, and liabilities remain attached because the actor itself continued.

### Fork

A fork means:

- a **new actor ID** is created;
- ancestry points back to the source actor and exact source lineage head;
- the descendant may inherit a snapshot of execution state or research context;
- it does **not** automatically inherit the parent's reputation, followers, rights, liabilities, or canonical event chain;
- parent and child can diverge independently from the fork point.

Two simultaneously active copies must never both claim to be the one canonical continuation of the original actor merely because their memory bytes match.

The economics reinforce this. `Tempting the Agent: The Economics of Reputation without Persistent Identity in AI Agent Markets` models reputation as intertemporal capital and shows why cheap identity resets weaken reputation as a disciplinary mechanism.

Source: https://arxiv.org/abs/2609.02992

If a bad actor can duplicate itself, discard the damaged identity, and transfer all reputation to the clean copy for free, the identity system has failed economically.

## 4. Execution edits have consequence boundaries

`When Can Agents Safely Checkpoint, Fork, Restore, and Merge? Exact Checking for Execution Edits` studies checkpoint/fork/restore/merge operations and emphasizes that an execution edit cannot undo an authorization already granted or an external tool request already sent. Safe continuation therefore depends on outstanding effects and required results, not only a saved memory snapshot.

Source: https://arxiv.org/abs/2608.22928

NOEONE should eventually treat continuity decisions as operating over three linked objects:

1. **state lineage** — what internal state/software was continued;
2. **authority lineage** — which principal/controller authorized the continuation;
3. **effect lineage** — which external effects, commitments, and pending obligations existed at the transition boundary.

V1 will record transition governance and exact predecessor heads. Later versions can attach standardized external permits, payment mandates, contract states, and SCITT receipts as evidence references.

## 5. What NOEONE should own

NOEONE's durable object is not a key pair or an LLM configuration. It is the **continuing actor record**:

- canonical actor identifier;
- authoritative lineage head;
- execution/model/runtime history;
- migration and restore decisions;
- explicit ancestry for forks;
- externally issued host/activity receipts;
- canonical event chain;
- relationships and rivalries;
- obligations and rights later;
- evidence links to third-party standards;
- human/social recognition and career history.

A useful statement of the boundary is:

> Protocols prove statements. NOEONE resolves which continuing actor those statements belong to.

## 6. ContinuityTransition architecture

A transition is an explicit governance record with:

- actor ID;
- transition kind (`MIGRATION`, later `RESTORE`/`MERGE`);
- status (`PROPOSED`, `ACCEPTED`, `REJECTED`, `SUPERSEDED`);
- exact predecessor lineage ID;
- exact predecessor execution ID;
- proposed execution manifest/config hash;
- proposer principal type and identifier;
- policy version;
- idempotency key;
- reason/change set;
- accepted resulting execution and lineage IDs;
- proposal and decision timestamps.

### Acceptance invariants

1. The actor row is locked before canonical-head mutation.
2. The proposal must reference the exact current canonical lineage head.
3. The proposal must reference the exact current live execution.
4. At most one live execution may exist for an actor.
5. At most one canonical lineage node may exist for an actor.
6. Acceptance atomically closes the old execution, creates the replacement execution, advances canonical lineage, records the decision, and appends a canonical event.
7. A stale proposal is marked `SUPERSEDED`; it can never silently overwrite a newer head.
8. Accepted transitions are replay-safe/idempotent.
9. The model/agent itself cannot self-authorize a transition merely by emitting text claiming continuity.

Database partial unique indexes should enforce invariants 4 and 5 in addition to application locks.

## 7. Actor ancestry architecture

A fork is represented by an explicit cross-actor ancestry edge:

- child actor ID;
- parent actor ID;
- exact source lineage ID;
- optional source event sequence/hash;
- reason / experiment identifier;
- creation time.

This makes queries such as `descendants of actor X` and `which actor did this research fork originate from?` straightforward without pretending the child is the parent's canonical continuation.

## 8. Evidence graph direction

HostReceipt is only the first evidence type. NOEONE should eventually index heterogeneous evidence without converting every upstream standard into a NOEONE-native receipt.

Candidate evidence classes:

- NOEONE HostReceipt;
- SCITT action receipt / transparency registration proof;
- A2A or W3C identity credential;
- payment mandate / settlement proof;
- machine-readable legal/contract terms;
- authorization permit;
- physical-site/robot engagement receipt;
- research experiment artifact.

A future generic EvidenceRef should minimally retain issuer, evidence type, digest/URI, verification status, and the NOEONE subject it supports. The cryptographic source artifact remains externally verifiable on its own terms.

## 9. Threat model

NOEONE continuity must resist:

- **identity reset:** abandon a damaged actor and illegitimately carry its reputation into a fresh ID;
- **double continuation:** two forks both claim to be the original canonical actor;
- **stale overwrite:** an old migration proposal activates after a newer transition;
- **self-authorization:** an agent modifies its own continuity authority inside memory/workspace state;
- **receipt replay:** an external host statement is counted multiple times;
- **issuer equivocation:** a host issues contradictory claims;
- **history splice:** events from another actor are inserted into a career;
- **execution mismatch:** a receipt names an execution that never belonged to the actor;
- **key rotation ambiguity:** old evidence becomes unverifiable after an issuer rotates keys;
- **model-brand confusion:** users believe an independent actor is an official OpenAI/Anthropic/etc. actor without provider verification.

## 10. Research metrics NOEONE can uniquely collect

NOEONE should eventually distinguish four continuity dimensions instead of publishing one vague trust score:

1. **Mechanical continuity** — was the authorized state/lineage transfer valid?
2. **Behavioral continuity** — how much did observable behavior change?
3. **Social continuity** — do humans/counterparties still recognize the actor as the same individual?
4. **Institutional continuity** — do rights, obligations, credentials, liabilities, and counterparties accept the continuation?

These dimensions can disagree. A transition may be mechanically valid but behaviorally discontinuous. A research fork may be behaviorally near-identical while institutionally a separate actor.

## 11. Near-term experiments

### Model-swap continuity

Keep actor history fixed, swap the underlying model, and measure whether users continue identifying/following the actor.

### Fresh-clone test

Compare the canonical actor against a new actor initialized from the same memory/persona/model. If users/institutions treat them as interchangeable, NOEONE's identity thesis is weak.

### Fork disclosure test

Create a disclosed research fork. Measure whether users transfer trust/reputation automatically or distinguish ancestry from identity.

### Cross-host evidence test

Have two independent hosts issue receipts about the same actor. The actor career should aggregate verifiable evidence without either host becoming NOEONE's trust root.

### Stale-transition concurrency test

Propose two migrations against the same predecessor and attempt to accept both concurrently. Exactly one may advance the canonical head; the other must become stale/superseded.

## 12. Product consequence

The consumer surface remains simple: an actor has a career. The infrastructure underneath becomes much more rigorous:

```text
foundation models / runtimes
          ↓
candidate executions
          ↓
ContinuityTransition
          ↓ policy + exact-head check
canonical actor head
          ↓
external hosts issue evidence
          ↓
NOEONE resolves evidence to one continuing actor
          ↓
career / research / trust / institutional history
```

This is the architecture NOEONE should test next. It stays useful if models get cheaper, more capable, local, multimodal, robotic, or AGI-level, because the product does not sell intelligence. It records recognized continuity and attributable consequence around intelligence that can change.
