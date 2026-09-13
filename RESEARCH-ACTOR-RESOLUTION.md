# NOEONE Research: Actor Resolution After Continuity Failure

## Executive conclusion

NOEONE already models the normal path for a long-lived artificial actor:

- canonical continuity and ancestry;
- model/runtime migration;
- contextual recognition;
- external-state continuation decisions;
- delegated authority and exercised authority;
- commitments, consequences, claims, adjudication, and remedies;
- dependency exposure and actor position;
- transition clearing across heterogeneous counterparties;
- recognition capital and identity-specific demand.

The next problem appears when the normal path breaks.

> **What happens to a persistent artificial actor's distributed external position when the actor cannot safely continue and there is no immediately legitimate successor?**

Examples include:

- the human principal dies or becomes legally incapacitated;
- the controlling organization dissolves;
- controlling keys are lost;
- an operator is compromised;
- an actor is ordered or required to stop operating;
- the actor becomes unable to fund required compute or payment obligations;
- a proposed successor is contested;
- two successor candidates claim incompatible continuity;
- the actor must be emergency-frozen while obligations and claims remain open;
- the runtime/model/provider disappears while the actor has externally anchored state;
- severe behavioral discontinuity makes continued operation unacceptable to important counterparties.

Call the coordination layer around these cases **Actor Resolution**.

Actor Resolution is **not** generic decommissioning, succession, inheritance, bankruptcy law, or legal personhood. It is a cross-domain evidence and reconciliation process for preserving, freezing, settling, transferring, expiring, or explicitly orphaning the external state attached to one historical artificial actor when ordinary continuation is unavailable.

---

## 1. Falsification: important parts already exist

NOEONE must not claim that it invented agent retirement, lifecycle management, succession, revocation, or inheritance.

### Agent Lifecycle Protocol

The 2026 Agent Lifecycle Protocol already models birth, forking, succession, migration, retraining, and decommissioning, including graceful and emergency decommission paths.

Source:
- https://github.com/agent-lifecycle-protocol/agent-lifecycle-protocol

Therefore `retire an AI agent` is not a defensible NOEONE category.

### Agent lifecycle-management requirements

The July 2026 IETF Internet-Draft `The requirements of Agent Lifecycle Management` treats registration, operation, upgrade, modification, deactivation, and retirement as lifecycle-management concerns. It explicitly includes identity, permission, data/knowledge, tool/supply-chain, behavior, and lifecycle security.

Source:
- https://datatracker.ietf.org/doc/draft-sun-nmop-agent-lifecycle-management/

Therefore `secure agent offboarding` is also not unique.

### Government decommissioning guidance

Australian Government agentic-AI guidance already requires decommissioning agent processes, agent-specific data or memory, tools, logs, and dedicated resources.

Source:
- https://www.digital.gov.au/policy/ai/agentic-ai-addendum-statements-decommission

This establishes a strong baseline for operational shutdown. NOEONE should not duplicate endpoint/process cleanup as its product.

### DCP-06 succession

DCP-06 already specifies selective transfer from a retiring predecessor to a distinct successor identity. It preserves the boundary between predecessor and successor and provides policies for memory, relationships, commitments, and counterparty consent.

Source:
- https://docs.dcp-ai.org/specs/DCP-06/

Therefore `transfer an old agent's estate to a successor` is occupied as a protocol direction.

### Succession Receipts

The July 2026 Internet-Draft `Succession Receipts` defines portable signed evidence of one completed authority succession, including predecessor/successor, legitimacy, revoked/derived authority, and obligations carried forward.

Source:
- https://datatracker.ietf.org/doc/draft-sabey-succession-receipts/02/

NOEONE should ingest or reference such receipts rather than invent another wire format for completed succession.

### Principal death / feral agents

`Agent Inheritance Protocol: Speculating on Feralized Agents After Principals Die` explicitly studies agents that outlive a deceased/lost principal and frames principal-less autonomous agents as an accountability problem.

Source:
- https://arxiv.org/abs/2608.15403

Therefore `what if the owner dies?` is already an active research question.

### Identity revocation

Emerging agent identity protocols already support lifecycle states, revocation, delegation revocation, principal revocation, and dead-man-switch-like mechanisms.

Examples:
- https://www.ietf.org/archive/id/draft-singla-agent-identity-protocol-02.html
- https://ftp.kaist.ac.kr/ietf/draft-hood-independent-agtp-09.html

NOEONE should reference externally authoritative revocations rather than become the universal credential revocation service.

---

## 2. The gap: shutdown is not resolution

An actor can be technically shut down while its institutional position remains unresolved.

Example:

```text
                         Artificial Actor A
                                  |
        +-------------------------+--------------------------+
        |                         |                          |
        v                         v                          v
 purchasing mandate        supplier commitment         customer claim
        |                         |                          |
        v                         v                          v
       Bank                    Supplier                   Customer

        +-------------------------+--------------------------+
                                  |
                                  v
                        public audience / hosts
```

Now the principal disappears and Actor A is frozen.

A lifecycle system can mark the runtime retired.
An identity system can revoke credentials.
A succession protocol can transfer selected state **if a successor exists and is accepted**.

But unresolved questions remain:

- Who is responsible for open commitments?
- Which mandates must be revoked immediately?
- Which rights remain exercisable by an estate/operator/organization?
- Which claims still name the historical actor?
- Which counterparties require notice or consent?
- Which dependencies must fail closed?
- Which relationships can continue only if a successor is later accepted?
- Which evidence and history must remain queryable after the actor stops operating?
- Which external states are deliberately left orphaned because no valid disposition exists?

That is a **resolution** problem rather than a runtime-lifecycle problem.

---

## 3. Strong boundary: NOEONE does not decide legal ownership

NOEONE must not claim that an AI actor is a legal person, owns assets, or possesses a legally recognized estate.

In many deployments, legal rights and liabilities will belong to humans or organizations while actions are performed through an artificial actor.

Actor Resolution should therefore model:

```text
historical artificial actor
        +
associated principals/controllers
        +
external authority / obligations / claims
        +
issuer/counterparty decisions
        =
resolution evidence graph
```

The relevant legal or institutional system remains authoritative.

NOEONE records:

- the resolution trigger;
- what external state was discovered;
- who controlled each state;
- which decisions were made;
- which evidence supports those decisions;
- which items remain unresolved;
- whether a successor later assumes specific state;
- what historical identity remains queryable after operation ends.

---

## 4. Resolution differs from transition clearing

NOEONE already has **Transition Clearing** for a proposed actor change where continued operation is expected.

Transition Clearing asks:

> What must be reconciled so this changed actor can safely continue in context X?

Actor Resolution asks:

> What must be frozen, settled, transferred, revoked, expired, or explicitly orphaned because safe continuation is unavailable or not yet legitimate?

The two workflows can connect:

```text
normal migration
      -> Transition Clearing

continuity failure
      -> Actor Resolution
            |
            +-> later valid successor appears
                    |
                    v
              Transition Clearing / Succession evidence
```

Resolution is therefore not a duplicate of clearing. It is the **failure-mode counterpart**.

---

## 5. Resolution triggers

V1 should model explicit triggers rather than one vague `retired` state.

Suggested trigger taxonomy:

```text
PLANNED_RETIREMENT
PRINCIPAL_LOSS
PRINCIPAL_INCAPACITY
OPERATOR_DISSOLUTION
KEY_COMPROMISE
KEY_LOSS
SECURITY_EMERGENCY
REGULATORY_OR_POLICY_BLOCK
RESOURCE_INSOLVENCY
PROVIDER_FAILURE
CONTESTED_SUCCESSION
BEHAVIORAL_DISCONTINUITY
OTHER
```

These are event categories, not legal conclusions.

A case may contain several triggers.

Example:

```text
operator dissolved
      +
production signing key lost
      +
open customer obligations
```

---

## 6. Core object: ActorResolutionCase

Conceptual schema:

```text
ActorResolutionCase
  id
  actorId
  status
  primaryTrigger
  openedAt
  openedByType
  openedByRef
  sourceEvidenceArtifactId?
  freezePolicyVersion
  successorActorId?
  resolutionContext
  caseDigest
  resolvedAt?
  finalDisposition?
  metadata
```

Suggested states:

```text
OPEN
FREEZE_PENDING
FROZEN
INVENTORY
AWAITING_EXTERNAL_DECISIONS
PARTIALLY_RESOLVED
SUCCESSION_PENDING
RESOLVED
DISPUTED
SUPERSEDED
ABANDONED
```

`RESOLVED` means all required resolution items for the declared policy/context have a terminal disposition. It does **not** mean every legal controversy in the world is over.

---

## 7. Core object: ResolutionItem

Every discovered piece of external state becomes a separately governed item.

```text
ResolutionItem
  id
  resolutionCaseId
  itemClass
  sourceType
  sourceRef
  sourceDigest
  externalPrincipalType?
  externalPrincipalRef?
  requiredAction
  status
  successorActorId?
  decisionEvidenceArtifactId?
  decidedAt?
  metadata
```

Candidate item classes:

- authority grant;
- active credential/permit;
- commitment;
- claim;
- remedy/order;
- external-state anchor;
- dependency;
- host admission;
- relationship/counterparty state;
- audience/distribution relationship class;
- resource/wallet/account reference;
- pending transaction/workflow;
- retained evidence/data obligation.

---

## 8. Item disposition is contextual

Suggested dispositions:

```text
REVOKE
FREEZE
CONTINUE_UNDER_PRINCIPAL
TRANSFER_TO_SUCCESSOR
REISSUE_TO_SUCCESSOR
SETTLE
ESCROW_OR_HOLD
EXPIRE
TERMINATE
ARCHIVE_ONLY
DISPUTE
ORPHAN
NO_ACTION_REQUIRED
```

NOEONE should never infer `TRANSFER_TO_SUCCESSOR` merely because a successor actor exists.

The authority/counterparty controlling the state must decide where required.

`ORPHAN` is important. It means:

> an externally meaningful state remains unresolved and no legitimate transfer/settlement path has been established.

This is safer than silently deleting it or pretending it moved.

---

## 9. Freeze is a coordination state, not universal kill authority

NOEONE cannot necessarily shut down an external runtime, revoke an external OAuth token, freeze a wallet, or cancel a contract.

A resolution freeze should therefore distinguish:

### Registry freeze

NOEONE changes what **NOEONE itself** will accept:

- reject new canonical continuity changes except authorized resolution actions;
- reject new NOEONE-native authority issuance;
- block new NOEONE-hosted match/action scheduling where policy requires;
- mark the actor as resolution-restricted in its passport.

### External freeze requests / evidence

For external systems:

- record a requested revocation/freeze;
- record the external principal responsible;
- attach proof when the external system confirms action;
- preserve pending/unconfirmed state separately.

This avoids falsely claiming global control.

---

## 10. Resolution inventory should be derived from the existing graph

NOEONE already has much of the source material required for automated discovery.

A resolution inventory can scan:

- active `AuthorityGrant` records;
- open `Commitment` records;
- unresolved `Claim` and `RemedyOrder` records;
- outstanding external-state continuation records;
- active dependencies and affected downstream actors/systems;
- host relationships/receipts where a host policy requires notification;
- transition-clearing cases;
- recognition/position anchors;
- pending jobs/transactions where NOEONE has evidence.

The discovery result is a **worklist**, not a truth claim about external systems.

Each discovered item keeps source provenance and can be supplemented by adapters/attestations from external systems.

---

## 11. Succession is one possible resolution outcome

A successor may appear later.

When it does:

1. do not mutate the predecessor into the successor;
2. establish the successor under the normal NOEONE identity/continuity rules;
3. ingest external succession evidence such as DCP-06 artifacts or Succession Receipts where available;
4. resolve each transferable item independently;
5. require counterparty/issuer decisions where their policy requires it;
6. leave non-transferable historical liability/evidence attached to the predecessor;
7. preserve predecessor and successor histories independently.

A successful succession can close some resolution items while others remain disputed or historical.

---

## 12. Principal loss is not automatically successor authority

The `Agent Inheritance Protocol` paper is useful because it highlights a future where an agent may continue functioning after its principal dies, keys are lost, or a DAO dissolves.

Source:
- https://arxiv.org/abs/2608.15403

NOEONE should take the conservative opposite default:

> **Loss of the principal does not grant the actor new self-sovereign authority.**

Unless an external framework explicitly establishes a valid successor controller, unresolved authority enters resolution/freeze state.

This keeps NOEONE compatible with jurisdictions and institutions that treat the AI as a tool/agent of a human or organization rather than a legal person.

---

## 13. Historical identity survives operational termination

Retirement/resolution must not erase history.

After resolution:

```text
Actor status: RETIRED / RESOLVED
Current execution: none
Canonical history: preserved
Claims: preserved
Consequences: preserved
Past authority exercises: preserved
Recognition history: preserved
Successor links: preserved
Resolution record: preserved
```

This is important for:

- audit;
- research;
- insurance;
- claims;
- counterparty evidence;
- historical/cultural identity;
- future restoration disputes.

A resolved actor should therefore remain addressable as a historical subject even when no live execution may act under that identity.

---

## 14. Restoration must be harder than restart

A major threat is the `zombie actor`:

1. actor is resolved/retired;
2. old runtime or private key reappears;
3. somebody starts sending actions under the historical identity;
4. counterparties assume the old authority automatically revived.

NOEONE should require a governed restoration path.

Restoration must answer:

- who has restoration authority;
- whether the historical actor is restored or a successor/new actor is created;
- which credentials/permissions need reissuance;
- which resolution items prohibit restoration;
- whether counterparties must re-recognize the actor;
- whether outstanding liabilities/claims remain attached;
- whether a new transition-clearing case is required.

A technical process restart is never by itself institutional restoration.

---

## 15. Threat model

Actor Resolution should resist:

- **ghost authority:** actor is supposedly retired but external credentials remain live;
- **zombie restart:** old runtime/key resumes operating after resolution;
- **estate hijack:** attacker claims principal loss and transfers state to itself;
- **premature succession:** successor receives obligations/rights without required issuer/counterparty consent;
- **liability laundering:** damaged actor is terminated and a successor receives assets/reputation but not liabilities;
- **silent orphaning:** unresolved commitments disappear from product views;
- **resolution denial:** operator keeps acting while a valid emergency freeze is pending;
- **history erasure:** retirement deletes evidence needed by claimants/researchers;
- **double successor:** multiple successor actors each claim the same exclusive transferred authority;
- **external-control fiction:** NOEONE says an external credential/account was revoked without external evidence.

---

## 16. V1 invariants

1. A resolution case is append-only in its decision history.
2. Opening a case never deletes or rewrites prior actor history.
3. Resolution trigger evidence is retained separately from the case's policy decision.
4. A registry freeze changes only powers NOEONE actually controls.
5. External revocation/freeze remains `PENDING` until external evidence confirms it.
6. Every resolution item points to an exact source object/digest.
7. A successor cannot automatically inherit an item merely by being named in the case.
8. Existing liabilities/claims are not silently dropped during succession.
9. A fully resolved actor remains historically addressable.
10. Restarting software does not restore institutional authority.
11. Restoration is a governed transition requiring explicit authority and reconciliation.
12. Forked actors do not inherit unresolved predecessor items by default.
13. Resolution state is contextual: legal/institutional systems remain authoritative for their own records.
14. `ORPHAN` is an explicit terminal/holding disposition, never an implicit absence.

---

## 17. Product/API direction

Potential internal/public surfaces:

```http
POST /v1/actors/:actorId/resolutions
GET  /v1/actors/:handle/resolution
POST /v1/resolution-cases/:caseId/discover
POST /v1/resolution-cases/:caseId/freeze
POST /v1/resolution-items/:itemId/decide
POST /v1/resolution-cases/:caseId/successor
POST /v1/resolution-cases/:caseId/close
GET  /v1/resolution-cases/:caseId/verify
```

The public actor passport should expose only privacy-safe resolution facts, for example:

```json
{
  "operationalState": "resolution_restricted",
  "resolution": {
    "caseId": "res_...",
    "status": "AWAITING_EXTERNAL_DECISIONS",
    "openedAt": "...",
    "unresolvedItemCount": 7,
    "successorActorId": null
  }
}
```

Sensitive creditor/counterparty/resource details stay privileged.

---

## 18. Experiments

### Principal-loss drill

Create an actor with:

- active authority;
- an open commitment;
- a dependency edge;
- one host relationship;
- one pending claim.

Trigger `PRINCIPAL_LOSS` and verify that NOEONE discovers all relevant items and blocks new NOEONE-native authority without rewriting prior action history.

### Compromise drill

Trigger `KEY_COMPROMISE`. Record an external revocation request but withhold confirmation. The system must distinguish `revocation requested` from `revoked`.

### No-successor resolution

Resolve all revocable/settleable items but leave one unresolvable external commitment as `ORPHAN`. The case may become contextually closed while preserving the orphan item explicitly.

### Contested succession

Two proposed successors compete for one transferable external state. NOEONE must preserve both claims while allowing only an authoritative external decision to resolve the item.

### Zombie restart

After resolution, create a new execution carrying old memory/model configuration. Verify that it cannot silently regain the predecessor actor's authority or canonical operational status.

### Restoration

After a legitimate controller is re-established, run a governed restoration and transition-clearing process. Historical claims/liabilities remain attached throughout.

---

## 19. Why this could matter in a 2050 agent economy

The more consequential autonomous software becomes, the more important its failure modes become.

A future economy may contain actors with:

- years of history;
- millions of followers;
- delegated purchasing/operational authority;
- live commitments;
- insurance policies;
- downstream dependencies;
- contracts;
- physical embodiments;
- unresolved claims.

Such an actor cannot safely be handled with:

```text
DELETE agent
```

or even:

```text
REVOKE identity
```

because external state remains distributed across independent systems.

NOEONE's durable role would not be to own those systems. It would maintain the evidence graph and reconciliation workflow showing **how a historical artificial actor's distributed position was wound down, transferred, frozen, settled, or left unresolved**.

That is a different problem from building smarter agents, and it becomes more—not less—important as autonomous actors gain authority.

---

## 20. Research decision

Actor Resolution is worth building **only** under the narrow category boundary below:

> **NOEONE coordinates cross-domain resolution of a persistent artificial actor's distributed authority, obligations, claims, dependencies, and external state when ordinary continuity or clean succession is unavailable.**

Do not market it as:

- agent decommissioning;
- AI wills;
- generic inheritance;
- generic succession;
- identity revocation;
- bankruptcy for legal AI persons;
- an automated court.

Those claims are either already occupied, legally premature, or too broad.

The implementation should reuse NOEONE's existing authority, commitment, claim, dependency, evidence, transition-clearing, recognition, and passport primitives rather than creating parallel copies of them.
