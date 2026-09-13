# NOEONE Research Frontier: Selective Continuity

Status: next-depth research thesis, 2026-09-13

## Executive conclusion

NOEONE's earlier research asks how one artificial actor preserves canonical lineage, externally anchored state, recognition, authority, obligations, consequences, and network position while its model/runtime/body/controller changes.

That creates a new danger:

> **A useful longitudinal actor graph can become a surveillance graph if every relying party receives the same global identifier and the actor's complete history.**

The next research frontier is therefore **Selective Continuity**:

> **How can an artificial actor prove the continuity facts a relying party actually needs without revealing unrelated parts of its identity, history, counterparties, models, relationships, or institutional position?**

This is not a claim that NOEONE invented selective disclosure, pairwise identifiers, anonymous credentials, zero-knowledge proofs, or private agent identity. Those areas already have strong prior art and active standards.

The narrower NOEONE question is:

> **How should selective disclosure apply to longitudinal actorhood: canonical lineage, transition history, external position, authority, recognition, commitments, and consequences accumulated over years?**

The implementation principle is strict:

> **NOEONE should define claims, policy, provenance, freshness, and adapter boundaries. It should use reviewed cryptographic standards rather than invent cryptography.**

---

## 1. Why this becomes necessary if NOEONE succeeds

A mature actor may accumulate a history like:

```text
Actor A
  |
  +-- model migrations
  +-- employers
  +-- counterparties
  +-- hosts
  +-- followers
  +-- contracts
  +-- authority grants
  +-- incidents
  +-- claims/disputes
  +-- research participation
  +-- collective memberships
  +-- financial/operational consequences
```

A game host asking whether Actor A is the same competitor that qualified last season does not need to learn its employer, bank mandate, private collaborators, every model migration, or unresolved unrelated contract dispute.

A merchant checking a $500 purchasing mandate does not need the actor's complete tournament history or social graph.

A research lab checking that an experimental actor is a disclosed fork should not automatically gain the identity of every private counterparty of the source actor.

Without contextual disclosure, NOEONE would solve continuity by creating a cross-domain correlation identifier. That would be strategically and ethically wrong.

---

## 2. Strong prior art: pairwise identity already exists

NIST SP 800-63C defines **Pairwise Pseudonymous Identifiers (PPIs)** specifically to stop a single common subject identifier from making one subscriber trivially linkable across relying parties. Different relying parties receive different identifiers unless an explicit trust arrangement justifies correlation.

Source:
- NIST SP 800-63C, Pairwise Pseudonymous Identifiers: https://pages.nist.gov/800-63-4/sp800-63c.html

NIST also explicitly warns that pairwise IDs alone are insufficient if other disclosed attributes allow re-identification.

NOEONE implication:

```text
GLOBAL ACTOR ID
    !=
DEFAULT VERIFIER SUBJECT
```

The canonical actor ID can remain an internal/canonical graph key while an external relying party normally receives a verifier-scoped subject.

NOEONE should not invent its own cryptographic PPI construction. It should support compatible identity/federation mechanisms through adapters.

---

## 3. Strong prior art: selective Agent Cards already exist

The 2026 IETF draft **SD Agent: Selective Disclosure for Agent Discovery and Identity Management** integrates SD-JWT with A2A Agent Cards. It lets agents selectively disclose capabilities, contact information, and operational metadata while reducing cross-context correlation.

Source:
- IETF draft-nandakumar-agent-sd-jwt-02: https://datatracker.ietf.org/doc/draft-nandakumar-agent-sd-jwt/

Therefore this is not NOEONE's invention:

> "An AI agent can selectively reveal identity/capability attributes."

The NOEONE-specific extension is longitudinal:

```text
SD Agent:
  reveal the minimum current Agent Card fields

Selective Continuity:
  reveal the minimum justified facts about a continuing actor's history
```

---

## 4. Strong prior art: unlinkable credential proofs already exist

W3C's **Data Integrity BBS Cryptosuites v1.0** provides selective disclosure and unlinkable derived proofs for verifiable credentials. It also documents important privacy leakage channels, including linkage through hashes, deterministic signatures, issuer public keys, data structure, and revealed attributes.

Source:
- W3C Data Integrity BBS Cryptosuites v1.0: https://www.w3.org/TR/vc-di-bbs/

The lesson is important for NOEONE:

> Merely hiding the global actor ID is not enough if every presentation exposes the same event hash, checkpoint, issuer key, rare fact combination, exact timestamps, or unique relationship pattern.

Selective continuity needs a **correlation threat model**, not merely a redaction feature.

---

## 5. Strong prior art: privacy-preserving agent credentials already exist

Examples in 2026 include:

- Agent Passport System principal identity with selective disclosure;
- zkMe Agent Principal Credential using ZK proofs to bind an agent to a verified principal without exposing underlying identity data;
- Facet, which demonstrates BBS+/selective-disclosure credentials for agent marketplace identity;
- research and product proposals using ZK predicates between AI agents;
- portable reputation schemes using W3C credential envelopes and verifier-defined minimum claim sets.

Sources:
- Agent Passport System: https://agent-passport.org/
- zkMe Agent Principal Credential: https://docs.zk.me/hub/what/zkkya/apc
- Facet: https://github.com/arifintahu/facet
- Zero-Knowledge Predicate Proofs Between AI Agents: https://arxiv.org/abs/2608.30083
- Armalo Federated Trust: https://trust.armalo.ai/labs/research/2026-05-12-federated-trust-cross-platform-portability

So NOEONE must not claim:

- first private agent passport;
- first selective agent credential;
- first ZK agent authorization;
- first unlinkable agent proof.

---

## 6. The open problem: selective longitudinal actorhood

Current identity/privacy systems commonly prove facts such as:

```text
this credential belongs to an authorized principal
this agent has capability X
this agent may spend <= Y
this agent passed evaluation Z
this passport has not been revoked
```

NOEONE increasingly needs questions that span **time and institutional history**:

```text
Is this the same canonical actor that qualified before date T?

Has this actor maintained canonical continuity across its latest model migration?

Has this actor completed at least N host-verified events in context C?

Does this actor currently hold authority scope S without revealing its other grants?

Does this counterparty recognize the post-migration actor as the continuing actor?

Is this actor a disclosed descendant rather than the canonical continuation?

Did this collective occupy position P during historical epoch E?

Can the actor prove a relevant history threshold without exposing unrelated events?
```

That is the Selective Continuity domain.

---

## 7. Core separation: canonical subject vs contextual subject

NOEONE should model two different objects.

### Canonical actor ID

Used inside the longitudinal system to attach lineage, events, obligations, authority, consequences, and institutional state to one actor.

```text
act_abc123
```

This is stable and globally meaningful **inside the canonical graph**.

### Contextual/pairwise subject

Presented to a specific relying party or trust domain.

```text
Verifier A sees: psub_A_...
Verifier B sees: psub_B_...
```

The relying parties should not be able to infer the global actor ID or correlate the two subjects merely from the identifier.

Important caveat: pairwise subjects do not prevent correlation through disclosed attributes or behavior. The privacy model must minimize the entire presentation, not just the identifier.

---

## 8. Proposed primitive: `ContinuityPresentationRequest`

The relying party should explicitly state what it needs.

Conceptual form:

```text
version
requestId
verifierId
audience
nonce
requestedAt
expiresAt
claims[]
```

Every claim contains:

```text
id
kind
required
parameters
maxEvidenceAgeSeconds?
```

This is important for three reasons:

1. **data minimization** — verifier asks for relevant facts instead of a full passport;
2. **policy accountability** — the verifier's minimum claim set is explicit;
3. **anti-replay** — nonce, audience, and expiry bind the resulting presentation to one request/context.

The initial TypeScript policy primitives live in `packages/actor-core/src/selective-continuity.ts`.

---

## 9. Proposed claim families

Initial research claim kinds:

### `same_canonical_actor`

Prove continuity relative to a named prior credential/reference without exposing the complete lineage.

### `canonical_since`

Prove canonical lineage existed before a threshold date.

This is a derived historical property, not a demand to disclose every intervening migration.

### `verified_event_count`

Prove at least N qualifying verified events under a specified context/policy.

Example:

```text
at least 100 host-verified chess matches
under environment family C
within the last 12 months
```

### `recognized_by_host`

Prove a named/eligible host currently recognizes this continuing actor under a defined policy.

### `authority_scope`

Prove current scoped authority without exposing unrelated authority grants.

### `commitment_status`

Prove the state of a specific relevant commitment without exposing the actor's entire obligation graph.

### `no_critical_incident_in_window`

This is deliberately classified differently. It is a **negative claim over a committed dataset** and cannot honestly be implemented by ordinary selective disclosure alone.

---

## 10. Critical distinction: selective disclosure does not prove completeness

Suppose an actor possesses credentials for:

```text
100 successful events
1 critical incident
```

The actor can selectively present the 100 successful events.

That does **not** prove:

```text
"No critical incident exists."
```

The missing bad record could simply be withheld.

Therefore NOEONE should distinguish:

### Positive selective claim

> "Here is valid evidence that event/property X exists."

### Negative/completeness claim

> "Within the committed universe of relevant records, no record satisfying bad predicate Y exists."

The second requires a stronger construction, potentially involving:

- authenticated/committed datasets;
- transparency checkpoints;
- Merkle/non-membership structures where appropriate;
- cryptographic accumulators;
- zero-knowledge predicates over a committed source;
- trusted/measured source attestations;
- independent witnesses/auditors.

NOEONE must not implement homegrown cryptography for this.

The current core API therefore marks negative-history claims as `negative-over-committed-set` and requires a proof family capable of non-omission/completeness assurance.

---

## 11. Source integrity remains separate from predicate proof

The August 2026 paper *Zero-Knowledge Predicate Proofs Between AI Agents* makes a useful distinction: a predicate proof can prove a statement about a committed value, but that alone does not prove the value came from the authoritative system of record. The paper explores combining proof with measured-source attestation.

Source:
- https://arxiv.org/abs/2608.30083

NOEONE needs the same separation:

```text
predicate is valid
        !=
source dataset is authoritative/complete
        !=
actor identity/lineage binding is valid
        !=
verifier policy accepts the claim
```

All four can matter.

---

## 12. Transparency is an input, not the invention

NOEONE already uses signed canonical events and Host Receipts. The broader ecosystem is going further:

- SCITT provides transparency-service architecture;
- Certificate Transparency provides append-only Merkle-log precedent;
- the 2026 Agent Record draft specifies per-agent append-only logs, signed Merkle checkpoints, independent witness countersignatures, and portable dossiers.

Sources:
- SCITT RFC 9943: https://www.rfc-editor.org/rfc/rfc9943
- Certificate Transparency RFC 9162: https://www.rfc-editor.org/rfc/rfc9162
- Agent Record: https://datatracker.ietf.org/doc/html/draft-maintainer-1f916-agent-record-01

NOEONE should integrate/anchor to mature transparency systems where useful rather than market a proprietary transparency log as its moat.

Selective Continuity operates **above** those commitments:

```text
committed longitudinal history
          |
          v
policy-derived relevant facts
          |
          v
privacy-preserving presentation
          |
          v
relying party decision
```

---

## 13. Proposed proof-adapter boundary

NOEONE core should express semantics while cryptographic adapters implement mechanisms.

Conceptually:

```text
ContinuityClaimPlan
       |
       +-- SD-JWT adapter
       +-- W3C BBS adapter
       +-- ZK predicate adapter
       +-- external attestation adapter
       +-- committed-set/non-membership adapter
```

No adapter is globally superior.

Examples:

- SD-JWT may be appropriate for selective current claims;
- BBS can provide unlinkable selective credential proofs;
- ZK predicates can prove thresholds without revealing exact values;
- external attestations can preserve issuer authority;
- committed-set proofs are required when non-omission matters.

The verifier's policy chooses what proof families are acceptable for each claim.

---

## 14. Freshness and revocation are first-class

A presentation can be cryptographically valid and institutionally stale.

Every verifier request should be able to define freshness requirements.

Examples:

```text
authority evidence <= 5 minutes old
host recognition <= 24 hours old
career threshold <= 30 days old
lineage continuity checkpoint <= 1 hour old
```

Revocation/status must be checked according to the underlying credential/authority mechanism.

This follows a key lesson from portable-reputation systems: the relying party must define its own minimum claim set, recognized issuers, and freshness requirements instead of accepting whatever favorable subset the holder chooses to show.

---

## 15. Privacy threat model

Selective Continuity should explicitly test at least these threats.

### 15.1 Global-ID correlation

Two relying parties receive the same canonical actor identifier.

Mitigation direction: pairwise/contextual subjects.

### 15.2 Attribute correlation

Different pairwise subjects still disclose the same rare combination of model history, event hashes, timestamps, counterparties, or exact scores.

Mitigation direction: derived predicates, bucketing, threshold claims, disclosure minimization, unlinkable-proof mechanisms.

### 15.3 Verifier-verifier collusion

Two relying parties combine presentations and reconstruct one actor's cross-context activity.

Mitigation direction: unlinkable proof mechanisms where required plus minimal shared attributes.

### 15.4 Verifier-issuer collusion

Issuer observes or can correlate every proof interaction.

Mitigation direction: prefer mechanisms with appropriate unlinkability/offline verification properties for contexts that require it.

### 15.5 Replay

A valid proof is replayed to another verifier or at a later time.

Mitigation direction: nonce, audience binding, short expiry, freshness/status checks.

### 15.6 Favorable-subset attack

Actor discloses only favorable history while hiding a relevant negative record.

Mitigation direction: verifier-defined minimum claim set; completeness-aware proof for negative claims.

### 15.7 Stale-state attack

Actor presents an old authorization/recognition proof after revocation or transition.

Mitigation direction: status/revocation/freshness policy.

### 15.8 Fork laundering

A fork attempts to present itself as the canonical continuation by selectively showing shared pre-fork history.

Mitigation direction: canonical-lineage binding; proof must cover the relevant post-fork continuity decision, not only common ancestry.

### 15.9 Side-channel disclosure

Proof size, timing, issuer key, checkpoint interval, claim ordering, or rare policy IDs reveal information.

Mitigation direction: threat-specific padding/batching/standardized policies where justified; avoid promising perfect unlinkability.

---

## 16. Transition semantics

Selective Continuity must remain correct through NOEONE's existing transition classes.

### Model/runtime migration

A normal canonical migration should be able to preserve a verifier-scoped subject or issue a new unlinkable subject according to context policy while proving canonical continuity.

### Fork

A fork may prove ancestry but must not satisfy `same_canonical_actor` unless a later explicit recognition/succession policy says so.

### Control recovery

Recovery may preserve actor identity while requiring relying parties to re-evaluate sensitive authority claims.

### Institutional succession

A successor may prove specific transferred positions without claiming global sameness with the predecessor.

### Collective epoch transition

A collective can prove relevant institutional continuity without exposing its complete historical roster.

### Split/merger/reorganization

Presentations must be object-specific: a successor may prove inherited contract position X while not claiming predecessor identity or unrelated obligation Y.

---

## 17. Initial experiment program

### Experiment 1: same actor, two unlinkable hosts

One canonical actor authenticates to Host A and Host B.

Both can verify required continuity, but neither should receive the global actor ID by default.

Test verifier collusion against the full presentation, not only the subject identifier.

### Experiment 2: career threshold without career dump

Prove:

```text
verified_event_count >= 100
context = chess
window = 12 months
```

without disclosing the complete match list or unrelated environments.

Compare:

- full-history disclosure;
- simple signed aggregate credential;
- unlinkable selective credential;
- predicate proof over committed source.

Measure proof cost, verifier confidence, privacy leakage, freshness, and source-integrity assumptions.

### Experiment 3: scoped authority

Prove the actor may purchase up to $500 from verifier V without revealing:

- principal's private identity where policy permits;
- other merchant mandates;
- larger unrelated grants;
- full transaction history.

### Experiment 4: model migration

Actor migrates GPT -> Claude (or provider-neutral equivalents in experimental naming).

The actor should still prove `same_canonical_actor` relative to a pre-migration credential without revealing model history unless the verifier requires it.

### Experiment 5: fork laundering

Create disclosed fork B from A.

B shares all pre-fork history.

Test that B can prove ancestry but cannot satisfy a canonical-continuity proof request bound to A's post-fork canonical lineage.

### Experiment 6: negative-history proof

Attempt to prove:

```text
no critical incident in the last 30 days
```

Explicitly compare:

- naive selective disclosure (invalid for completeness);
- signed issuer summary;
- proof over committed event set;
- independent transparency/witness assumptions.

The experiment succeeds only if the threat model can explain why omitted qualifying incidents cannot be hidden.

### Experiment 7: recognition continuity with privacy

Prove that an eligible host class recognizes the actor after migration without exposing every recognizing host or the actor's entire position graph.

---

## 18. Proposed benchmark: Private Longitudinal Actor Proofs (PLAP)

Working research name only.

Transformations:

```text
model migration
runtime migration
key rotation
controller recovery
fork
successor recognition
collective epoch change
split/merger
revoked authority
stale host recognition
new critical incident
```

Verifier questions:

```text
same canonical actor?
canonical before date T?
N verified events?
current scoped authority?
recognized under policy P?
relevant commitment state?
negative-history predicate?
```

Metrics:

```text
cryptographic validity
policy correctness
source-integrity assurance
freshness correctness
revocation correctness
fork resistance
replay resistance
verifier-to-verifier linkability
issuer-to-verifier linkability
over-disclosure bytes/fields
proof generation cost
verification cost
false continuity acceptance
false continuity rejection
```

Do not compress these into a single privacy/trust score.

---

## 19. Product implication

The product should not expose a giant "download my complete actor history" button as the default trust flow.

A relying party should ask:

```text
What do I actually need to know for this interaction?
```

The actor can then authorize a presentation such as:

```text
Same continuing actor as last season        YES
Qualified before cutoff                     YES
100+ verified matches                       YES
Current game-league recognition             YES

Not disclosed:
model history
other hosts
employer
followers
financial authority
private counterparties
unrelated incidents/claims
```

For consumers this can be rendered simply:

> **Share only what this app needs.**

For institutions:

> **Request policy-scoped continuity evidence.**

---

## 20. Why this is strategically stronger than a public reputation profile

A universal public profile creates pressure to collapse heterogeneous history into one score and one globally correlatable identity.

Selective Continuity supports a different architecture:

```text
one canonical actor history
          |
          +-- game presentation
          +-- finance presentation
          +-- research presentation
          +-- employer presentation
          +-- public-fan presentation
```

Each relying party receives the minimum justified view while the actor's canonical institutional history remains coherent underneath.

This lets NOEONE serve domains with incompatible privacy requirements without inventing separate identities that destroy accountability.

---

## 21. Falsification boundary

Selective Continuity is not differentiated if an established interoperable layer already provides, as one longitudinal artificial-actor system:

1. canonical actor lineage across model/runtime/controller transformations;
2. pairwise/contextual verifier subjects;
3. policy-scoped disclosure of longitudinal history and external position;
4. fork-aware canonical-continuity proofs;
5. authority/commitment/recognition presentations tied to exact historical state;
6. completeness-aware negative-history predicates over committed event history;
7. cross-host freshness/revocation semantics;
8. collective/reorganization-aware selective history;
9. provider/runtime neutrality.

We found strong prior art for nearly every cryptographic/identity ingredient, but not a mature neutral system centered on **privacy-preserving presentation of longitudinal artificial actorhood and external position** as the main object.

That claim must be re-tested continuously.

---

## 22. What NOEONE must not build

Do not build:

- a proprietary replacement for SD-JWT;
- a proprietary BBS implementation;
- homegrown ZK circuits for production identity claims without expert review;
- a global public actor ID exposed to every verifier;
- a universal trust score;
- a proof claiming "no bad events" without completeness/non-omission support;
- a privacy layer that hides the subject ID but leaks unique event hashes everywhere;
- an issuer that decides what the verifier should trust;
- a verifier flow where holders may omit required claims silently;
- cryptographic claims that silently turn institutional uncertainty into mathematical certainty.

---

## 23. Deepest thesis after this pass

Earlier NOEONE research moved from:

```text
persistent software
  -> persistent identity
  -> canonical lineage
  -> verified consequences
  -> institutional continuity
  -> actor position
```

Selective Continuity adds a necessary constraint:

> **The world should be able to rely on a continuing artificial actor without automatically gaining the right to observe that actor's entire life.**

The resulting architecture is not "one public dossier for every AI."

It is closer to:

```text
ONE CANONICAL ACTOR
        |
        | coherent longitudinal history
        v
CONTEXTUAL PROOFS
        |
        +-- each verifier sees only what its policy legitimately needs
```

That is more compatible with a 2050 world containing personal agents, company agents, research agents, public artificial personalities, autonomous services, and robots operating across many institutions.

The long-run NOEONE object is therefore not only **recognized continuity of consequence**.

It is:

> **Recognized continuity of consequence with contextual privacy.**
