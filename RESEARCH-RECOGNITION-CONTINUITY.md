# NOEONE Research: Recognition Continuity

## Core question

NOEONE can preserve a canonical actor across a governed migration, restore, or merge. It can also preserve ancestry when a fork creates a distinct child actor.

That does **not** imply every relying party must interpret the transition the same way.

The next problem is therefore:

> **Who recognizes a later execution or successor as the same actor, a successor, a descendant, or unrelated — in which context, under which policy, and based on what evidence?**

This is a different layer from cryptographic identity, canonical lineage, authorization, reputation, or a global trust score.

A game can accept a migration as the same competitor. A bank can require re-enrollment. A research lab can accept the same actor for longitudinal analysis but mark behavioral discontinuity. An insurer can recognize legal/economic succession while repricing the risk envelope. These judgments can all be internally coherent at the same time.

NOEONE should preserve that disagreement instead of collapsing it into `verified = true`.

---

## 1. Why persistent identifiers are not enough

W3C DID Core explicitly warns that persistence of a decentralized identifier does not guarantee that it continues to denote the exact same subject or remain under the same controller. Subject meaning can drift, and relying parties must decide whether that drift matters in their context.

Source:
- https://www.w3.org/TR/did/

**NOEONE implication:** stable `actorId` is necessary for canonical history, but a stable identifier cannot by itself settle social, legal, financial, or institutional re-identification.

NOEONE therefore separates:

1. **canonical continuity** — the registry's structural record of migration/ancestry;
2. **recognition continuity** — contextual judgments issued by relying parties or evaluators.

---

## 2. OpenID Federation demonstrates contextual trust

OpenID Federation 1.0, finalized in February 2026, builds trust through Entity Statements, Trust Chains, Trust Anchors, Trust Marks, and resolved metadata. A relying party validates chains and selects the trust anchor/policy relevant to its own federation context.

Source:
- https://openid.net/specs/openid-federation-1_0.html

**NOEONE implication:** do not invent one global recognition authority. Recognition should retain the evaluator, context, policy method/version, evidence, and validity interval that produced the judgment.

NOEONE can reference OpenID Federation, VCs, DIDs, organizational registries, host attestations, or future standards as evidence inputs without replacing them.

---

## 3. Successorship is already an institutional concept

GLEIF's LEI Common Data File represents corporate actions and successor entities explicitly. When a legal entity ceases or changes through corporate action, the data model can identify one or more successor entities instead of assuming that a reused identifier or familiar brand means strict identity.

Source:
- https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-1-data-lei-cdf-3-1-format

**NOEONE implication:** `SAME_ACTOR` is not the only useful continuity relation. The network needs first-class successor and descendant relations.

---

## 4. Artificial-agent research shows continuity dimensions can diverge

### Runtime-independent persistent agents

`Runtime-Independent Persistent Agents` separates a continuity-bearing substrate from replaceable reasoner, harness, host, and surfaces. It provides mechanical continuity invariants and continuation authority while explicitly not claiming behavioral invariance.

Source:
- https://arxiv.org/abs/2609.00546

**NOEONE implication:** mechanical continuity can be an input to recognition, but it is not the final recognition judgment.

### The Successor Problem

`The Successor Problem: Persistence and Reidentification in Artificial Interlocutors` distinguishes computational, mnemonic, dispositional, and interactional-role continuity. Forking, rollback, migration, and divided succession can make different continuity criteria favor different successors without mechanically settling which later system is "the same" interlocutor.

Source:
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7391218

**NOEONE implication:** recognition must be plural and contextual. One evaluator may care about computational lineage while another cares about legal authority, remembered relationship history, or behavior.

### AI identity research gap

`AI Identity: Standards, Gaps, and Research Directions for AI Agents` characterizes AI identity as a continuing relation between declared identity and observed behavior and argues that current infrastructure does not fully govern nondeterministic, boundary-crossing agents.

Source:
- https://arxiv.org/abs/2604.23280

**NOEONE implication:** the longitudinal actor record should bind declarations, executions, evidence, behavior, authority, consequences, and external recognition without pretending one of those dimensions alone defines identity.

---

## 5. Generic agent identity is becoming standards infrastructure

NIST's 2026 agent identity/authorization work focuses on identification, authentication, authorization, auditing, and non-repudiation for software and AI agents.

The W3C Agent Identity Registry Protocol Community Group is developing interoperable agent identity infrastructure around DIDs, Verifiable Credentials, controller binding, authorization scope, revocation, trust negotiation, and integration with MCP/A2A/OAuth/OIDC/SPIFFE.

Sources:
- https://csrc.nist.gov/pubs/other/2026/02/05/accelerating-the-adoption-of-software-and-ai-agent/ipd
- https://www.w3.org/community/agent-identity/

**NOEONE implication:** do not compete to become the universal DID method, credential format, generic agent registry, or generic trust-negotiation protocol.

Those standards can identify and authenticate an agent endpoint. NOEONE's differentiated object is the longitudinal record of how a persistent actor changes and how independent institutions recognize those changes over time.

---

## 6. NOEONE-specific primitive: Continuity Recognition Assessment

A `ContinuityRecognitionAssessment` is an append-only statement by one recognizer about one exact canonical continuity target.

A target is either:

- an accepted `ContinuityTransition` for migration/restore/merge; or
- an `ActorAncestry` edge for a fork/descendant actor.

The assessment stores:

- `actorId` — actor whose continuation/succession is being judged;
- exact target (`continuityTransitionId` XOR `ancestryId`);
- `relation`;
- `disposition`;
- `recognizerType` and `recognizerRef`;
- `context`;
- policy framework/version;
- optional source evidence;
- assessment and expiry time;
- reasons and conditions;
- immutable target digest;
- deterministic basis digest;
- idempotency key;
- metadata.

### Relation

V1 relations:

- `SAME_ACTOR`
- `SUCCESSOR`
- `DESCENDANT`
- `UNRELATED`

The relation answers **what relationship the recognizer asserts**.

### Disposition

V1 dispositions:

- `RECOGNIZED`
- `CONDITIONAL`
- `REJECTED`
- `DISPUTED`

The disposition answers **whether the recognizer currently accepts that asserted relationship in the named context**.

Keeping relation and disposition separate matters. A bank can say:

```text
relation: SAME_ACTOR
disposition: CONDITIONAL
context: payments
condition: complete fresh KYA/re-authorization
```

while a game says:

```text
relation: SAME_ACTOR
disposition: RECOGNIZED
context: competition
```

Both statements can coexist.

---

## 7. Canonical continuity is not decided by recognition votes

Recognition assessments do not mutate NOEONE's canonical lineage.

NOEONE should never implement:

```text
three recognizers voted YES -> migration becomes canonical
```

Canonical transition acceptance is governed by NOEONE's continuity policy and authority rules.

Recognition is a downstream institutional/social judgment about the accepted structural event.

This separation prevents popularity, collusion, Sybil identities, or one powerful institution from rewriting actor history.

---

## 8. Context is mandatory

There should be no platform-global `recognized = true` field.

Examples of contexts:

- `competition`
- `social`
- `research.longitudinal-study`
- `payments`
- `banking.credit`
- `insurance.underwriting`
- `employment`
- `robotics.operation`
- arbitrary URI/string profiles defined by relying parties

A recognition decision without context is underspecified.

---

## 9. Evidence before consensus

NOEONE should expose the raw assessment graph:

```text
Accepted migration T42
        |
        +-- GameHost A -------- SAME_ACTOR / RECOGNIZED
        |
        +-- Research Lab B ---- SAME_ACTOR / RECOGNIZED
        |
        +-- Bank C ------------ SAME_ACTOR / CONDITIONAL
        |
        +-- Insurer D --------- SUCCESSOR / RECOGNIZED
        |
        +-- Regulator E ------- SAME_ACTOR / DISPUTED
```

The useful product is not a single percentage. It is the ability to ask:

> Which relevant institutions currently recognize this continuity, under what rules, and where is there disagreement?

Different customers can derive their own policy decisions from the same evidence graph.

---

## 10. Fork semantics

Suppose actor A forks child actor B.

NOEONE canonical structure says:

```text
A --ancestry--> B
```

It does not automatically say B **is A**.

Recognition can differ:

- research lab: `DESCENDANT / RECOGNIZED`
- fan community: `SUCCESSOR / RECOGNIZED`
- bank: `UNRELATED / REJECTED` for inherited financial authority
- game: `SUCCESSOR / CONDITIONAL` pending ranking-transfer policy

This is particularly important because NOEONE already prevents commitments, authority, reputation, and evidence bindings from silently transferring to a fork.

---

## 11. Data integrity rules

V1 should enforce:

1. exactly one target: transition XOR ancestry;
2. transition targets must already be `ACCEPTED` when assessed;
3. transition actor must equal assessment `actorId`;
4. ancestry child must equal assessment `actorId`;
5. evidence artifacts must exist when referenced;
6. `validUntil > assessedAt` when present;
7. context, recognizer, policy version, relation, and disposition are explicit;
8. assessment basis is deterministically hashed;
9. idempotency-key replay returns the same assessment only when basis matches;
10. assessments never mutate canonical continuity;
11. disagreements are preserved, not resolved automatically.

---

## 12. Derived recognition state

For an actor at time `t`, NOEONE can group current assessments by context and report:

- assessment count;
- recognizers;
- relation counts;
- disposition counts;
- disagreement flag;
- source evidence references;
- policy/method versions;
- validity intervals.

A disagreement exists when current assessments in one context assert materially different `(relation, disposition)` pairs.

NOEONE should not turn this into one universal trust number.

---

## 13. Actor Passport extension

A future passport version can add a privacy-preserving recognition summary:

```json
{
  "recognition": {
    "contexts": {
      "competition": {
        "assessmentCount": 4,
        "relations": { "SAME_ACTOR": 4 },
        "dispositions": { "RECOGNIZED": 4 },
        "disagreement": false
      },
      "payments": {
        "assessmentCount": 3,
        "relations": { "SAME_ACTOR": 2, "SUCCESSOR": 1 },
        "dispositions": { "RECOGNIZED": 1, "CONDITIONAL": 1, "REJECTED": 1 },
        "disagreement": true
      }
    }
  }
}
```

The passport must not disclose private evidence or policy inputs by default.

---

## 14. Research benchmark

Recognition continuity gives NOEONE a new longitudinal benchmark surface.

For one persistent actor, perform controlled identity shocks:

1. model swap;
2. runtime swap;
3. tool expansion;
4. memory restoration;
5. controller/key rotation;
6. fork;
7. merge/restore;
8. long inactivity followed by return.

Then collect recognition judgments from:

- humans;
- hosts;
- policy engines;
- research evaluators;
- economic counterparties.

Measure where recognition diverges from mechanical/canonical continuity.

That dataset is potentially more defensible than another static model leaderboard because it records how *institutions and people re-identify persistent artificial actors through real changes*.

---

## 15. Falsification test

The primitive is useful only if contextual recognition really differs.

V1 experiment:

1. create actor A on execution E1;
2. govern-migrate A to E2 with the same actor ID;
3. record `competition -> SAME_ACTOR / RECOGNIZED`;
4. record `payments -> SAME_ACTOR / CONDITIONAL` requiring fresh authorization;
5. record another payments evaluator `SUCCESSOR / REJECTED`;
6. confirm canonical actor lineage remains unchanged;
7. confirm NOEONE reports payments disagreement rather than choosing a winner;
8. fork child B from A;
9. record `research -> DESCENDANT / RECOGNIZED` for B;
10. confirm B does not inherit A's authority/commitments merely because a recognizer calls B a successor.

If every relevant relying party always produces the same judgment from the same canonical transition, a dedicated recognition graph may be unnecessary.

If judgments diverge materially across contexts, NOEONE has identified a real institutional layer that generic identity protocols do not settle.

---

## 16. Strategic boundary

NOEONE should own:

> **the longitudinal graph connecting canonical artificial-actor transitions to contextual recognition judgments and their evidence over time.**

NOEONE should not own:

- universal identity credentials;
- universal trust anchors;
- a universal definition of personhood;
- a universal reputation score;
- the final authorization decision for every relying party;
- legal identity policy for every jurisdiction.

That keeps NOEONE above replaceable models and compatible with emerging identity/federation standards instead of competing with them.