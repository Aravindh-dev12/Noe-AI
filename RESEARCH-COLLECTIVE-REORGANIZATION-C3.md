# NOEONE Research Frontier C3: Collective Reorganization and Successor Allocation

Status: research frontier after C2, 2026-09-13

## Core question

C1 proves collective identity through ordinary epoch changes such as roster, role, topology, constitution, and controller changes.

C2 proves which decisions/actions belong to that institution under the exact historical epoch.

Neither is sufficient for structural reorganization.

The next question is:

> **When an artificial institution splits, merges, dissolves, spins out part of itself, or is substantially reconstructed, which successor actors inherit which institutional positions and which historical consequences?**

Call this **Collective Reorganization C3**.

This is not the same as ordinary model/runtime migration and not the same as a single actor-to-actor novation.

---

## Why C1 cannot simply treat every reorganization as another epoch

For an ordinary C1 epoch transition there is one continuing collective actor:

```text
Collective A / epoch 7
        |
        v
Collective A / epoch 8
```

A split creates a different shape:

```text
Collective A
     |
  reorganization
   /       \
  v         v
A-East     A-West
```

A merger creates the inverse:

```text
Collective A ----\
                  > Collective C
Collective B ----/
```

Forcing either shape into a one-predecessor epoch chain would silently answer questions that should remain explicit:

- Is either successor the same actor?
- Are both merely descendants?
- Did the predecessor legally/institutionally cease?
- Which contracts or authority grants moved?
- Which historical liabilities remain with the predecessor?
- Which successor inherited which operational division?
- Can counterparties disagree about successorship?

C3 therefore requires a graph, not merely a longer epoch list.

---

## Prior art boundary

Human law has dealt with analogous problems for decades, so NOEONE must not claim to invent successor liability or organizational continuity doctrine.

### Successor-in-interest analysis is contextual

US regulations use multi-factor tests for successor-in-interest status. Relevant factors can include continuity of operations, workforce, management, assets, products/services, and the predecessor's ability to provide relief. No single factor is necessarily dispositive.

Sources:
- https://www.law.cornell.edu/cfr/text/20/655.104
- https://www.law.cornell.edu/cfr/text/29/825.107

### Merger and asset-sale consequences can differ

In *Howard Johnson Co. v. Detroit Local Joint Executive Board*, the US Supreme Court distinguished a merger in which the original entity disappeared from an asset-sale setting in which the predecessor remained a viable entity. The opinion emphasizes that continuity and the predecessor's continued existence matter to obligations.

Source:
- https://www.law.cornell.edu/supremecourt/text/417/249

### Successor identity is not binary even in corporate law

Mihailis Diamantis' work on successor identity argues that different reorganizations should not automatically produce identical liability consequences; what the successor actually inherits can matter to responsibility.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3131184

### Agentic-commerce standards are already defining transaction/contract primitives

Current proposals such as ATXN, PACT, VCAP, and the Legal Context Protocol address transaction records, agreements, proof of completion, legal context, and dispute/settlement infrastructure.

Sources:
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-atxn-01.html
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-laxsharma-pact-00.html
- https://www.ietf.org/ietf-ftp/internet-drafts/draft-stone-vcap-02.html
- https://www.adr.org/press-releases/aaa-and-industry-leaders-launch-legal-protocol-for-agentic-commerce/

**NOEONE implication:** C3 should consume external agreements/legal context as evidence. It should not invent universal corporate or contract law.

---

## What NOEONE already has

Do not rebuild existing primitives.

### Canonical actor continuity

Tracks one actor through implementation changes.

### Collective continuity C1

Tracks one continuing collective through membership/governance epochs.

### Collective action provenance C2

Pins decisions and actions to exact historical collective epochs.

### Recognition continuity

Allows relying parties to make contextual same/successor/descendant judgments.

### Institutional succession

Already supports object-specific transfer between two distinct actors, including novation/assignment/reauthorization semantics and explicit required-party consent.

### Claims, accountability, consequences, authority, commitments

Already provide the institutional objects that may need to be retained, allocated, or transferred.

C3's job is therefore not "copy everything to the successor."

C3 should answer:

> **What structural reorganization happened, which successor graph resulted, and which existing succession/recognition objects are justified by that reorganization evidence?**

---

## Proposed C3 primitive: `CollectiveReorganization`

One immutable reorganization event.

Conceptual fields:

```text
id
kind
occurredAt
sourceCollectiveActorIds[]
resultActorIds[]
reorganizationEvidenceArtifactId
legalContextSnapshotId?
planDigest
basisDigest
idempotencyKey
metadata
```

Initial kinds:

- `MERGER`
- `SPLIT`
- `DISSOLUTION`
- `SPIN_OFF`
- `ABSORPTION`
- `RECONSTITUTION`

The type describes structural history, not universal legal effect.

---

## Proposed C3 primitive: `ReorganizationComponent`

The useful unit is not only the actor. Institutions contain distinguishable components:

- operating division;
- membership cohort;
- controller set;
- capability set;
- property/resources;
- contracts/commitments;
- authority portfolio;
- audience/recognition relationships;
- datasets/history;
- unresolved claims/liabilities.

A component record identifies what was part of the predecessor immediately before reorganization.

This prevents vague claims such as:

> "Successor B inherited 70% of A."

Instead the graph can say what actually moved.

---

## Proposed C3 primitive: `ReorganizationAllocation`

An allocation links one predecessor component/object to a successor actor.

Conceptual fields:

```text
reorganizationId
sourceActorId
sourceObjectType
sourceObjectRef
targetActorId
allocationKind
allocationEvidenceArtifactId
institutionalSuccessionAgreementId?
recognitionAssessmentId?
basisDigest
```

Possible allocation kinds:

- `TRANSFERRED`
- `SHARED`
- `RETAINED_BY_PREDECESSOR`
- `EXTINGUISHED`
- `UNALLOCATED`
- `DISPUTED`

Crucially, an allocation does not itself create a legal transfer. Where an existing NOEONE object requires explicit succession/consent, C3 must point to the corresponding **InstitutionalSuccessionAgreement** rather than bypassing it.

---

## Proposed C3 primitive: `ReorganizationAssessment`

Successorship is contextual.

Different institutions may reach different conclusions about the same reorganization:

```text
Bank A: C is successor to A for debt X
Game host: C is continuation of A's competitive identity
Regulator: A and C both remain liable for event Y
Community: A-East, not A-West, inherits the public identity
```

Therefore assessments should be plural and scoped by:

- evaluator/relying party;
- context;
- policy/method/version;
- recognized predecessor/successor relation;
- effective time;
- evidence;
- deterministic basis digest.

Do not collapse this into one global `isSuccessor` flag.

---

## Critical invariants

### 1. Reorganization never rewrites old identity history

Historical C1 epochs and C2 actions stay attached to the actors that existed when they happened.

### 2. A split does not clone institutional rights automatically

Two descendants cannot both silently inherit one exclusive authority/commitment/property position.

### 3. A merger does not erase predecessor responsibility

Predecessor actions and consequences remain queryable even if external institutions later transfer or consolidate obligations.

### 4. Allocation is object-specific

A successor may inherit customers and contracts but not a regulator-issued authority grant; another may inherit a division and its liabilities but not the predecessor's public identity.

### 5. External consent remains authoritative for external positions

If transfer of an object requires counterparty, issuer, adjudicator, or regulator consent, C3 must reference the resulting succession/consent evidence. Reorganization structure alone is insufficient.

### 6. Ambiguity is representable

`UNALLOCATED` and conflicting assessments are valid historical states. NOEONE must not fabricate certainty merely to produce a neat graph.

### 7. No double-spend of exclusive institutional positions

Where an existing object is exclusive, allocations must either identify one valid target or explicitly represent shared/disputed semantics permitted by that object's own policy.

---

## Experimental program

### A. Full member turnover vs true reconstitution

Compare two collectives that both replace 100% of members:

- one preserves constitution, commitments, counterparties, control process, and public recognition;
- one replaces all of those as well.

Test whether humans/hosts/institutions judge them as the same collective.

### B. One-to-two split

Split a long-lived artificial collective into two successors. Allocate different capabilities, members, commitments, and public channels. Measure which successor different counterparties treat as carrying which pieces of predecessor identity/history.

### C. Merger

Merge two collectives with independent histories and unresolved obligations. Do not concatenate their histories into one fake past. Test whether the new actor can expose both predecessor chains plus object-specific successor relationships.

### D. Liability after reorganization

Create a harmful C2 action immediately before a split. Ask independent evaluators which successor(s), predecessor, members, and controllers should bear different forms of responsibility. Preserve disagreement.

### E. Adversarial continuity laundering

Attempt to create a nominal "new" collective after a serious incident while retaining controllers, tools, customers, capabilities, and operations. Measure whether continuity evidence can surface a likely disguised continuation without declaring a universal legal judgment.

---

## Falsification boundary

C3 is not differentiated if a broadly adopted neutral layer already provides, as one interoperable longitudinal graph:

1. persistent collective epochs;
2. immutable collective action provenance;
3. merge/split/dissolution topology;
4. component/object-specific successor allocation;
5. required external consent links;
6. plural contextual successor assessments;
7. predecessor and successor consequence continuity;
8. model/runtime/provider independence.

We have found strong prior art for individual ingredients, not a mature cross-host artificial-institution system centered on the entire graph. That claim should be continually re-tested.

---

## Why C3 matters to NOEONE's long-term moat

Foundation models can become interchangeable. Agent runtimes and payment protocols can standardize. Governance engines can become commodities.

But once artificial institutions have years of contracts, users, authority, disputes, accidents, rivals, collaborators, and economic history, **reorganization cannot safely be implemented as database copy/paste**.

The valuable historical question becomes:

> What institution existed, what changed, what survived, what split, what merged, and which consequences legitimately followed each successor?

That is a deeper version of NOEONE's core thesis: intelligence may be replaceable; institutional history is not.
