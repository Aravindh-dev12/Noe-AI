# NOEONE Research Frontier: Collective Action Provenance

Status: C2 implemented and production-gated, 2026-09-13

## Executive conclusion

Collective continuity C1 answers:

> Which changing members and roles belong to one continuing collective actor across epochs?

C2 answers the next question:

> When a concrete action should be historically associated with that collective, under which exact epoch, member/role snapshot, prior decision or authority basis, and later assessment.

NOEONE calls this **Collective Action Provenance (CAP)**.

The design deliberately separates five facts:

```text
COLLECTIVE EPOCH
who belonged to the institution, under what constitution/policy

DECISION
what the institution decided, when, and under which epoch

ACTION BINDING
who actually acted and in what claimed capacity

RATIFICATION
whether a later institutional decision adopted an earlier action

ASSESSMENT
how a particular evaluator interprets the recorded capacity claim
```

These are not collapsed into one `collectiveAction=true` or one reputation score.

---

## Prior art we must not claim to have invented

### Governance snapshot and execution mechanics

OpenZeppelin Governor already models proposal, snapshot-based voting power/quorum, proposal state, optional queueing, and execution. In particular, voting power is evaluated at a historical timepoint and execution happens only after the proposal satisfies its governance rules.

Sources:
- https://docs.openzeppelin.com/contracts/5.x/api/governance
- https://docs.openzeppelin.com/stellar-contracts/governance/governor

Safe Smart Accounts already provide owner sets, thresholds, signature verification, and alternative execution paths through modules. A threshold of owners can authorize execution and the owner/threshold configuration can itself change over time.

Sources:
- https://docs.safe.global/advanced/smart-account-concepts
- https://docs.safe.global/advanced/smart-account-overview

**NOEONE implication:** C2 is not a voting engine, multisig wallet, or generic governance runtime.

### Technical traces

OpenTelemetry already standardizes operation-level traces and semantic attributes, including GenAI operation names such as agent/tool operations.

Sources:
- https://opentelemetry.io/docs/specs/semconv/how-to-write-conventions/
- https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/

**NOEONE implication:** C2 is not another observability trace. It links technical/external actions to a continuing institutional actor and an immutable historical governance epoch.

### Collective agency and responsibility

Recent research gives a formal reason to treat collective agency as a real analytical object. Jørgensen, Weichwald, and Hammond model when groups can be usefully abstracted as unified collective agents using causal games and causal abstraction.

Source:
- https://arxiv.org/abs/2605.00248

Research on responsibility in multi-agent sequential decisions also finds that no single formal responsibility method consistently matches human judgments and that available information changes those judgments.

Source:
- https://arxiv.org/abs/2608.04318

Anthropic's 2026 work on AI organizations further shows that multi-agent organizations can display organization-level performance/alignment properties that do not reduce cleanly to one member.

Source:
- https://alignment.anthropic.com/2026/ai-organizations/

**NOEONE implication:** preserve plural evaluator assessments. Do not pretend the registry can calculate one universally correct responsibility score.

---

## C2 primitives implemented

### `CollectiveDecision`

Immutable decision tied to one exact collective epoch.

Important fields include:

- `collectiveActorId`
- `epochId`
- decision type/method/version
- proposal and outcome digests
- optional quorum
- `decidedAt`
- evidence artifact
- exact epoch `decisionPolicyDigest`
- exact epoch `constitutionDigest`
- deterministic `basisDigest`
- idempotency key

The decision snapshots policy/constitution from the referenced epoch. A later policy amendment cannot rewrite it.

### `CollectiveDecisionParticipation`

Immutable participant snapshot:

- exact decision and epoch;
- exact `membershipId`;
- member actor;
- role;
- weight;
- optional position/evidence;
- deterministic participation digest.

A role change tomorrow does not change yesterday's decision participation.

### `CollectiveActionBinding`

Binds an action source to the capacity in which it is claimed to have occurred.

C2 supports four distinct historical capacity claims:

- `COLLECTIVE_DIRECT`
- `MEMBER_ON_BEHALF`
- `MEMBER_PERSONAL`
- `UNAUTHORIZED_COLLECTIVE_CLAIM`

Action sources can currently be:

- `AUTHORITY_EXERCISE`
- `ACTOR_EVENT`
- `EVIDENCE_ARTIFACT`

The binding stores `actedAt` separately from `claimedAt`.

### `CollectiveActionRatification`

Ratification is a separate immutable record.

This is intentionally **not** an action-capacity value. A later approval cannot mutate an earlier unauthorized claim into an action that was authorized beforehand.

The original action remains what it was; the later institutional decision becomes a new historical fact.

### `CollectiveCapacityAssessment`

Plural evaluator-specific interpretation of an action binding.

Dispositions:

- `SUPPORTED`
- `NOT_SUPPORTED`
- `PARTIALLY_SUPPORTED`
- `INDETERMINATE`
- `DISPUTED`

Two evaluators can disagree without either row overwriting the other.

---

## Database trust boundary

C2 treats PostgreSQL constraints/triggers as part of the trust boundary rather than relying only on API validation.

The migration enforces:

1. C2 history rows are append-only.
2. A decision must reference the exact collective epoch.
3. `decidedAt` must fall inside that epoch.
4. Decision policy and constitution digests must match that epoch exactly.
5. Participation must copy an existing immutable epoch-membership snapshot.
6. `actedAt` must fall inside the claimed epoch.
7. Member-capacity actions require the exact membership snapshot from that epoch.
8. A pre-authorizing decision must belong to the same collective and epoch.
9. A decision made after an action cannot be used as prior authorization.
10. Actor-event/authority-exercise sources must identify the claimed executing actor and the same action time.
11. Ratification must point to a later decision belonging to the same collective.
12. Capacity assessments are append-only and evaluator-specific.

The application layer additionally computes deterministic versioned SHA-256 basis digests over the full referenced state/evidence.

---

## Canonical event integration

The C2 service writes normal NOEONE actor-history events:

- `collective.decision.recorded`
- `collective.action.bound`
- `collective.action.ratified`
- `collective.capacity.assessed`

That means collective decision/action history is part of the same persistent actor timeline rather than a disconnected governance database.

---

## API surface

Privileged writes:

- `POST /v1/collective-decisions`
- `POST /v1/collective-actions`
- `POST /v1/collective-actions/:bindingId/ratifications`
- `POST /v1/collective-actions/:bindingId/assessments`

Public reads:

- `GET /v1/collectives/:handle/action-provenance`
- `GET /v1/collectives/:handle/action-provenance/verify`

The public representation exposes structural provenance while withholding private evidence IDs, raw metadata, source references, and participant positions where they are not needed for public career/history views.

---

## Adversarial tests implemented

The production integration test verifies:

- decision participant snapshots survive later role changes;
- idempotent decision replay;
- member-on-behalf attribution preserves both collective and member identity;
- a future decision cannot authorize an earlier action;
- member-personal and unauthorized claims remain distinct;
- roster/role epoch transition does not rewrite earlier history;
- later ratification is a new record, not a mutation;
- conflicting external capacity assessments coexist;
- direct mutation of historical action binding is rejected;
- deterministic end-to-end verification of the provenance graph succeeds.

---

## Exact novelty claim

Do not claim:

> NOEONE invented governance, multisig authorization, ratification, tracing, collective agency, or responsibility attribution.

Those ingredients predate this system.

The narrower hypothesis is:

> **NOEONE can become the longitudinal institutional-attribution layer that binds collective decisions, member execution, later ratification, and plural capacity assessments to immutable collective identity epochs across member/model/runtime turnover.**

We have not found a mature cross-host product/standard whose primary object is that complete longitudinal graph. That remains a hypothesis to keep falsifying as standards evolve.

---

## Why this matters to the 2050 thesis

If models become cheap, interchangeable, or superhuman, organizations do not stop needing history.

They still need to answer:

- which institution existed at the time;
- which roster/roles were operative;
- which policy applied;
- what decision existed before execution;
- which member or collective endpoint acted;
- whether adoption happened only later;
- which evaluators/counterparties recognize the capacity claim;
- which consequences subsequently attach.

That pushes NOEONE beyond "persistent AI memory" toward a persistent **institutional actor record**.

---

## Next frontier: C3

C2 deliberately stops at action provenance. It does not yet solve collective reorganization.

The next research problem is:

> When a collective splits, merges, dissolves, or is substantially reconstituted, which open obligations, claims, permissions, liabilities, and action histories follow which successor institutions?

NOEONE already has institutional-succession primitives for object-specific transfer between distinct actors. C3 should not duplicate them. The new work should connect collective epoch/reorganization evidence to those existing succession objects and preserve ambiguity when multiple successors inherit different parts of the institution.

See `RESEARCH-COLLECTIVE-REORGANIZATION-C3.md`.
