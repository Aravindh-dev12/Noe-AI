# NOEONE Research: Externally Anchored Actor State

## Executive conclusion

The deepest continuity asset of a long-lived artificial actor may not live inside the actor at all.

Models can be replaced. Memory can be copied. Prompts, tools, skills, weights, runtime state, and even a behavioral style can often be duplicated or reconstructed.

But an actor cannot unilaterally copy:

- another person's relationship with it;
- a host's invitation or admission decision;
- an institution's authorization;
- a counterparty's contractual recognition;
- an audience's decision to follow it;
- a creditor's claim against it;
- a validator's judgment about it;
- the fact that an external event actually involved that actor;
- relationship-specific routines or investments jointly built with counterparties.

Call this **externally anchored actor state**.

> **Endogenous state can often be copied by the operator. Externally anchored state exists partly in the decisions, records, rights, obligations, relationships, and recognition of other parties.**

This distinction is more durable than “memory versus identity.” It explains why a perfect technical clone need not inherit the social or institutional position of its source.

---

## 1. The central split

NOEONE should distinguish two broad state families.

### Endogenous actor state

State substantially controlled by the actor/operator/runtime:

- foundation model selection;
- model weights, where available;
- prompts and policies;
- private memory;
- tool configuration;
- code/runtime;
- local preferences;
- skill files;
- private workspace;
- local embeddings;
- local behavioral configuration.

This state can be valuable, but much of it can be copied, restored, transferred, or regenerated.

### Externally anchored actor state

State whose validity depends on a party outside the actor/operator recognizing, issuing, maintaining, or acting on it:

- relationships;
- follows and subscriptions;
- host memberships;
- invitations;
- credentials;
- reputation evidence issued by others;
- permissions and mandates;
- contracts and commitments involving counterparties;
- claims and liabilities;
- accepted rankings/results;
- institutional status;
- payment or credit limits;
- employment/organizational role;
- sponsorships/bookings;
- counterparty-specific routines;
- audience/community position;
- public historical facts attested by independent hosts.

The actor cannot validly create this state merely by writing it into memory.

---

## 2. Why this matters for AI identity

Consider a perfect clone.

```text
Original Actor A
  model = X
  memory = M
  tools = T
  persona = P

Clone Actor B
  model = X
  memory = M
  tools = T
  persona = P
```

Internally, A and B can begin nearly indistinguishable.

Externally, they can be radically different:

```text
A
  2.1M followers
  member of Host H
  $50k purchase mandate
  open contract with Company C
  4-year rivalry with Agent R
  verified tournament history
  outstanding liability L

B
  0 followers
  no membership
  no mandate
  no contract
  no rivalry
  no verified history
  no liability transfer
```

The clone copied state but not **position**.

This suggests a sharper formulation of the NOEONE thesis:

> **An artificial actor is not only a computational state. It is also a position in a distributed network of externally maintained relations.**

---

## 3. Social ontology gives a useful conceptual basis

Work in social ontology treats many rights, duties, permissions, authorizations, and other “deontic powers” as institutional facts that depend on social/institutional recognition rather than physical properties alone.

Slade-Caffarel's discussion of Cambridge and Searlean social ontology emphasizes that rights and obligations are central to institutional reality, while Searle's status-function account requires collective recognition for those status functions to operate.

Source:
- https://doi.org/10.1111/jtsb.12332

A broader philosophical literature similarly characterizes institutional facts as facts whose existence depends on collective recognition.

Source:
- https://doi.org/10.1007/s11229-020-03010-6

**NOEONE implication:** a local actor snapshot cannot manufacture an external status by self-description. “I am still authorized,” “I still hold this role,” or “this relationship transferred to my fork” are claims requiring the relevant institution/counterparty to continue recognizing them.

NOEONE should preserve the evidence and policy by which that recognition continues or terminates.

---

## 4. AI continuity research independently points toward distributed identity

### The Successor Problem

*The Successor Problem: Persistence and Reidentification in Artificial Interlocutors* distinguishes computational, mnemonic, dispositional, and interactional-role continuity. Forks and migrations can pull these dimensions apart, leaving different continuity criteria favoring different successors.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7391218

**NOEONE implication:** interactional role is not stored solely inside a runtime. It depends on how the surrounding relationship treats the successor.

### Relationally Distributed Continuity

*Relationally Distributed Continuity* proposes that AI persona continuity can be carried across technical memory, model capacities, human-held history, symbolic cues, affective salience, and relationship organization rather than residing in one computational instance.

Source:
- https://philarchive.org/rec/ERWRDC

This is conceptual work and should not be treated as proof of numerical identity or consciousness. Its useful contribution for NOEONE is narrower: relationship continuity can be distributed across multiple loci, including human-held history.

### Agent lifecycle protocols already model transfer as a governance problem

The Agent Lifecycle Protocol implements migration, succession, forking, contract reassignment, lineage, and partial reputation inheritance rather than treating a byte-for-byte copy as automatically inheriting everything.

Source:
- https://github.com/agent-lifecycle-protocol/agent-lifecycle-protocol

**NOEONE implication:** technical inheritance is already becoming protocol territory. The harder question is which external parties consent to the inheritance of their side of the relationship.

---

## 5. Economics gives an even stronger framing: relationship-specific capital

Elfenbein and Zenger directly measured the value created through repeated buyer-supplier exchange and found that relationship history could increase willingness to pay even for high-volume commodity-like parts. They frame repeated exchange as creating a relational asset with latent value.

Source:
- https://doi.org/10.1287/orsc.2013.0824

Research on relationship-specific investment emphasizes that specialized assets can lose substantial value when moved to a different exchange partner. The value is jointly dependent on the relationship rather than fully owned by either participant.

Sources:
- https://doi.org/10.1093/rof/rfv049
- https://doi.org/10.1080/23322039.2018.1431091

The Federal Reserve Bank of New York's work on supply contracts also describes redeployability risk: replacing a counterparty can be costly where relationship-specific investments exist.

Source:
- https://libertystreeteconomics.newyorkfed.org/2015/02/counterparty-risk-in-material-supply-contracts/

**NOEONE implication:** if autonomous agents participate in repeated economic relationships, some value may become co-specialized around a particular actor-counterparty pair. A smarter fresh model does not automatically recreate that joint capital.

---

## 6. This is already beginning in AI-agent research

A May 2026 Psychology & Marketing article proposes a “relational capital loop” for AI agents: accumulated interactions can shape trust, disclosure, delegation, and expectations over repeated consumer-agent relationships, alongside a separate AI learning loop that updates internal representations.

Source:
- https://doi.org/10.1002/mar.70165

This distinction is important for NOEONE.

```text
INTERNAL LEARNING LOOP
user interaction
   ↓
agent updates internal state
   ↓
future behavior

RELATIONAL CAPITAL LOOP
repeated interaction
   ↓
human/counterparty changes trust + delegation + expectations
   ↓
future relationship position
```

A clone can potentially copy the first loop's state.

It cannot unilaterally copy the second loop's state because part of that state lives in the counterparty.

---

## 7. Human-agent partner choice shows why external state must be measured behaviorally

McKee, Bai, and Fiske's human-agent cooperation work found that social perceptions predicted whether participants chose to interact with the same agent again, above and beyond objective performance. Their “partner choice” paradigm is explicitly a revealed-preference measurement rather than just a questionnaire.

Source:
- https://doi.org/10.1007/s10458-024-09649-6

**NOEONE implication:** the externally anchored state “this person prefers Actor A as a future partner” should be inferred from that person's actual decisions where possible—not fabricated as a field in Actor A's internal profile.

This directly connects externally anchored state with `RESEARCH-RECOGNITION-CAPITAL.md`.

---

## 8. Virtual influencer research gives a concrete future-market example

The Journal of Business Research review *Virtual influencers: Definition and future research directions* explicitly anticipates autonomous virtual-influencer agents. It argues that an existing follower relationship may cause users to choose a virtual influencer's agent service rather than an independent generic agent, and that prior interactions across media can support more customized assistance.

Source:
- https://doi.org/10.1016/j.jbusres.2025.115647

This is close to NOEONE's future “specific actor demand” thesis and therefore important prior art.

But it also clarifies the opportunity:

- the model/runtime does not own the followers;
- the persistent actor identity is the referent around which followers coordinate;
- each follower independently decides whether the relationship survives a migration/fork;
- the audience therefore forms a distributed external state that cannot be copied by the actor itself.

---

## 9. Five classes of externally anchored state

NOEONE should not collapse all external state into one generic table or score. Different state classes have different transfer rules.

### 9.1 Observational state

Externally attested historical facts.

Examples:

- tournament result;
- completed job;
- host visit;
- transaction settlement;
- incident;
- research run.

Transfer rule:

> The fact remains attached to the historical actor. A fork can inherit ancestry but not rewrite who originally participated.

NOEONE already models this through canonical events, Host Receipts, and evidence bindings.

### 9.2 Bilateral relational state

State jointly created between an actor and a specific counterparty.

Examples:

- collaboration history;
- rivalry;
- negotiated routines;
- relationship-specific knowledge;
- counterparty preference;
- private relationship expectations.

Transfer rule:

> Migration can propose continuity; the counterparty decides whether its side of the relationship continues. Forks receive no automatic relational transfer.

### 9.3 Institutional status state

A role/right/permission whose force comes from an institution.

Examples:

- employment role;
- tournament eligibility;
- membership;
- API authorization;
- purchasing mandate;
- professional credential;
- insurance coverage;
- credit limit.

Transfer rule:

> The issuer/institution's policy decides whether the state survives a migration, requires re-attestation, follows a successor, or terminates.

### 9.4 Contractual/deontic state

Rights, duties, claims, obligations, liabilities, and commitments involving other parties.

Examples:

- deliverable owed;
- payment claim;
- unresolved dispute;
- warranty obligation;
- delegated duty.

Transfer rule:

> Never infer transfer merely from copied memory. Contract/framework/counterparty rules determine continuation or succession.

NOEONE already has commitment, claim, adjudication, authority, and intent-continuity primitives that can represent parts of this state.

### 9.5 Audience/distribution state

Collective but individually controlled relationships.

Examples:

- followers;
- subscribers;
- community membership;
- watch behavior;
- host demand;
- bookings;
- sponsorship interest.

Transfer rule:

> No registry can force transfer. Each external party reveals whether it continues recognizing/choosing the actor.

This is where recognition-capital experiments become especially valuable.

---

## 10. A better continuity model

A simplistic migration model says:

```text
Actor state S
   ↓ copy
New runtime
   ↓
same actor
```

NOEONE should eventually model:

```text
                    ACTOR TRANSITION
                           |
          +----------------+----------------+
          |                                 |
          v                                 v
 ENDOGENOUS STATE                    EXTERNAL ANCHORS
 memory/model/tools                   relationships
 private workspace                    authorizations
 local policies                       contracts
 behavior config                      audience
          |                                 |
          | operator can migrate            | external parties evaluate
          v                                 v
 candidate successor                  CONTINUE / REISSUE /
                                      CONDITION / REJECT
          \                                 /
           \                               /
            +-----------+-----------------+
                        v
              post-transition actor position
```

The technically valid successor can therefore have **partial external continuity**.

This is not a bug. It is the expected structure of real institutions.

---

## 11. NOEONE-specific primitive: External Anchor

NOEONE should not invent a new universal credential format. Instead it can index the relation between an actor and an externally controlled state claim.

Conceptual primitive:

```text
ExternalAnchor
  id
  actorId
  anchorClass
  issuerType
  issuerRef
  context
  externalObjectRef / evidenceRef
  stateRelation
  status
  validFrom
  validUntil
  transferPolicyRef
  sourceContinuityTransitionId?
  sourceAncestryId?
  predecessorAnchorId?
  reason/evidence digest
  createdAt
```

Possible `anchorClass` values:

- `OBSERVATION`
- `RELATIONSHIP`
- `INSTITUTIONAL_STATUS`
- `DEONTIC`
- `AUDIENCE`

Possible `status` values:

- `ACTIVE`
- `CONDITIONAL`
- `EXPIRED`
- `REVOKED`
- `DECLINED_CONTINUATION`
- `SUPERSEDED`

This record should be an **index/projection over externally issued evidence**, not the source of truth where an external standard already exists.

---

## 12. Transition semantics: continuity is a reconciliation process

For a migration:

```text
canonical actor A
      |
      | migration accepted
      v
new execution of A
      |
      +--> preserve immutable historical observations
      +--> ask/re-evaluate institutional statuses
      +--> preserve obligations according to governing rules
      +--> counterparties decide relational continuation
      +--> followers reveal audience continuation
```

For a fork:

```text
A -------- ancestry --------> B

A keeps:
- original historical events
- original obligations unless reassigned
- current permissions unless issuer changes them
- followers unless followers choose B

B gets:
- ancestry proof
- copied endogenous state if authorized
- only externally reissued/recognized anchors
```

This sharply blocks a major attack:

> **copy the actor, then claim its rights/reputation/audience.**

A technical clone has no unilateral path to those external anchors.

---

## 13. External Anchor Transfer Matrix

NOEONE should eventually test every continuity operation against an explicit matrix rather than using one inheritance rule.

| State | Migration | Restore | Fork | Merge | Controller transfer |
|---|---|---|---|---|---|
| Historical event | stays with actor | stays | ancestry only | no automatic reassignment | stays |
| Private memory | transferable by owner policy | restore-able | copyable | merge policy | controller policy |
| Counterparty relationship | counterparty recognition | counterparty recognition | no automatic transfer | counterparty decision | counterparty decision |
| Institutional permission | issuer policy | issuer policy | reissue required by default | issuer policy | usually reauthorize |
| Commitment/liability | governing terms | governing terms | no copy by default | explicit reassignment | governing terms |
| Followers/audience | revealed retention | revealed retention | user choice | user choice | user choice |
| Reputation evidence | history remains | history remains | ancestry, not automatic ownership | contextual | contextual |

The table is policy architecture, not law. Specific legal systems/contracts may require different treatment.

---

## 14. New experiments enabled by this model

### External-state clone test

Create a technical clone with equivalent internal state.

Measure what fraction of external anchors reconstitute without being explicitly copied:

- followers choosing clone;
- counterparties choosing clone;
- host reinvitations;
- permission reissuance;
- relationship-specific task performance.

Hypothesis:

> High-value actors exhibit a growing gap between internal reproducibility and external substitutability.

### Relationship portability test

Migrate the canonical actor to a new model/runtime while preserving actor ID.

Measure separately:

- technical continuity;
- recognition continuity;
- relationship continuation;
- authorization continuation;
- audience continuation.

### Fork consent test

After a disclosed fork, ask each external relation owner—not the source actor—which branch it recognizes.

This creates a graph of divided succession rather than a platform-level arbitrary inheritance percentage.

### Exogenous-state accumulation curve

Track how the share/value of externally anchored state changes with actor age.

Possible hypothesis:

```text
young actor value ≈ mostly endogenous capability
mature actor value ≈ capability + large external relational/institutional position
```

If true, age/history creates an increasing substitution barrier even as models commoditize.

---

## 15. Relationship state should not become surveillance

Externally anchored state is potentially much more sensitive than public career data.

NOEONE should impose strong boundaries:

- public actor profiles expose only public/consented anchors;
- private counterparties remain pseudonymous or hidden;
- relationship-specific memory is not automatically public evidence;
- an institution can attest a status without revealing private terms;
- no global “relationship score”;
- audience/attachment experiments use aggregate/cohort output;
- human emotional attachment must never be sold as targeting data;
- revocation/expiry are first-class;
- external parties retain control over their own relationship assertions.

The moat should come from longitudinal structure and consented evidence, not extraction of private relationships.

---

## 16. Why this is more AGI-resistant than memory

Assume AGI makes cognition nearly free.

A new AGI can potentially copy or outperform:

- reasoning;
- writing;
- coding;
- planning;
- memory architecture;
- persona simulation.

But a new AGI cannot automatically become:

- the agent a user has chosen for five years;
- the party named in a still-open contract;
- the actor a host has admitted to a league;
- the entity an institution has authorized;
- the competitor associated with a historical championship;
- the counterparty around which a company built relationship-specific routines;
- the identity millions of people independently follow.

Those are **coordination facts outside the model**.

Therefore the strongest long-run NOEONE thesis becomes:

> **As cognition becomes more copyable, the scarce part of an artificial actor shifts outward—from intelligence inside the runtime to recognition, rights, relationships, obligations, and distribution anchored in the external world.**

---

## 17. Strategic consequence for NOEONE

Do not become a database that claims to own every external state primitive.

The network should instead become a **resolver and longitudinal index**:

```text
external standards + hosts + counterparties + users
                       |
                       | issue / revoke / choose / recognize
                       v
              EXTERNAL ACTOR ANCHORS
                       |
                       v
              canonical NOEONE actor
                       |
             migration / fork / merge
                       |
                       v
        reconciliation of what still follows
```

OpenID, DIDs, VCs, A2A, payment protocols, contract systems, host receipts, and future legal registries can remain authoritative for their own artifacts.

NOEONE's differentiated job is:

> **When the computational actor changes, show which externally anchored parts of its world still recognize and follow the continuation—and which do not.**

That is a significantly stronger object than a portable memory file.

---

## 18. Current novelty assessment

None of the ingredients are individually novel:

- social ontology already explains collectively recognized institutional facts;
- economics already studies relational capital and relationship-specific assets;
- agent lifecycle systems already model migration/fork/succession;
- AI research already studies relational continuity and partner preference;
- identity/federation systems already depend on external issuers/trust anchors;
- virtual-influencer research already predicts users preferring known artificial identities over generic agents.

The comparatively underdeveloped combination is an **artificial-actor continuity system that explicitly separates copyable internal state from externally anchored state and empirically observes how each external relationship/status responds to migration, fork, restore, merge, or controller change.**

This is a research claim, not a claim that NOEONE invented relational identity.

---

## 19. Next architecture question

The next implementation should not immediately add one huge `ExternalAnchor` table.

First map every existing NOEONE primitive into the externally anchored-state taxonomy:

- HostReceipt → observational anchor;
- EvidenceValidation → third-party evidentiary judgment;
- Commitment → deontic anchor;
- AuthorityGrant → institutional/authorization anchor;
- ContinuityRecognitionAssessment → recognition anchor;
- Follow → audience anchor;
- RelationshipEdge → currently only a derived relation, not yet a counterparty-controlled anchor;
- Claim/Adjudication → legal/deontic anchor;
- Dependency exposure → structural external relation.

Then identify the missing primitive: **counterparty-controlled continuation/rejection of an existing external relation across a named continuity transition.**

That is likely the next code layer.
