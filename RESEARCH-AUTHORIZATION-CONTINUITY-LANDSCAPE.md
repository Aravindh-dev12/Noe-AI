# Authorization Continuity Landscape — What NOEONE Does Not Own

Date: 2026-09-12

This note is intentionally adversarial. Its purpose is to prevent NOEONE from claiming novelty over authorization problems that the 2026 research and standards ecosystem is already actively solving.

## Conclusion

**Authorization continuity is not a new NOEONE invention.**

Several current research projects already formalize whether a standing grant remains valid as an agent evolves, whether earlier authorization evidence is still valid when a durable effect is committed, and whether the current workload/tool execution remains the one a relying party intended to trust.

NOEONE should therefore avoid positioning itself as:

- the first dynamic authorization system for agents;
- the first system to revalidate permissions after a model/tool change;
- the first capability-manifest or drift-detection layer;
- a universal policy engine;
- the authority that decides one globally correct risk/trust score.

The more defensible layer is **longitudinal institutional attribution**:

> Which continuing actor, exact execution, grant, capability evidence, evaluator assessment, authority exercise, consequence, claim, and later adjudication belong to the same historical chain across independent systems and years of migrations?

---

## Closest prior art

### Are You Still the Agent I Authorized? — authorization continuity

Zhaoxi Zhang and Xiaomei Zhang, July 2026, explicitly formulate **authorization continuity** for evolving long-lived agents.

Their central question is almost exactly the one NOEONE reached independently: when an agent retains experience, gains tools/skills, changes workflow, delegates work, or changes task phase, when does an old grant remain valid?

They propose two controls:

1. a **transition envelope** that determines whether a grant survives a mutation;
2. an immutable **effect ceiling** that bounds the maximum authority a user-issued grant can ever activate.

They map six mutation classes to authorization consequences and prove a non-amplification property under explicit assumptions.

Source:
- https://arxiv.org/abs/2607.23586

**Impact on NOEONE:** do not claim to invent authorization continuity. Where implementations adopt transition envelopes/effect ceilings, NOEONE should be able to store references/evidence/results from those systems.

### Temporary Authority, Permanent Effects — commit-time authorization

Santos-Grueiro, July 2026, identifies a different stale-authority boundary: an approval or witness can be valid earlier in execution but invalid by the time a durable external effect is committed.

The paper defines **commit-time authorization**: the evidence licensing a durable effect must remain fresh, causally prior, effect-bound, and eligible at the durability boundary.

Source:
- https://arxiv.org/abs/2607.10487

**Impact:** NOEONE should preserve evidence about the authorization/effect relationship but must not pretend that historical recordkeeping itself enforces live commit-time validity.

### ACLE-MCP — execution-time workload trust

ACLE-MCP, September 2026, defines the **post-authorization execution trust gap**. OAuth can still authorize an endpoint while the provider-side workload changed, appraisal state became stale, authority moved to another sender, or an undeclared downstream component appeared.

It uses short-lived sender-constrained capability leases checked immediately before protected tool execution.

Source:
- https://arxiv.org/abs/2609.02690

**Impact:** execution-time enforcement is another separate plane. NOEONE can record which lease/evidence/execution was involved but should not duplicate the lease protocol.

### Authorization Evidence Challenge

An August 2026 IETF draft defines a machine-readable challenge when authorization evidence for a high-risk action is missing, stale, or unverifiable. It explicitly says the challenge authorizes nothing; satisfying it merely causes a relying party to evaluate a new presentation under live local policy.

Source:
- https://www.ietf.org/archive/id/draft-schrock-ae-challenge-04.html

**Impact:** NOEONE's structural states such as missing evidence / review required should compose with such challenge protocols rather than create an incompatible retry vocabulary.

### Contextual Agent Authorization Mesh

The CAAM draft requires freshness checks for context/attestation evidence and sender-constrained authorization.

Source:
- https://datatracker.ietf.org/doc/draft-barney-caam/

**Impact:** freshness policy belongs to verifiers/resource servers; NOEONE should retain timestamped evidence and assessment history.

### Microsoft Entra Agent ID

Microsoft's 2026 Agent ID platform is explicitly adding identity, Conditional Access, lifecycle management, audit trails, and controls so agents do not accumulate stale permissions.

Source:
- https://learn.microsoft.com/en-us/entra/agent-id/migrate-custom-app-registrations-to-agent-id

**Impact:** enterprise identity/governance vendors will own substantial parts of agent IAM. NOEONE should interoperate and preserve cross-system longitudinal evidence rather than fight them for directory/IAM ownership.

### Runtime-independent persistent agents

Zhao and Zhao, September 2026, distinguish a continuity-bearing persistent agent substrate from a replaceable reasoner/harness/host. Their migration protocol includes continuation authority and an explicit invariant that capability deltas must remain visible rather than masquerade as identity changes.

Source:
- https://arxiv.org/abs/2609.00546

**Impact:** even persistent-agent migration research recognizes the identity/capability separation. NOEONE's opportunity lies above one runtime: a public/cross-institutional historical record around independently operated persistent actors.

### Institutional authority / authority continuity systems

Other 2026 systems and analyses are already discussing authority continuity, approval freshness, typed authority spines, and institutional authority surviving failure/retry/migration/executor substitution.

Examples:
- https://www.govkm.com/articles/ai-agent-authority-needs-continuity
- https://www.govkm.com/articles/continuity-of-execution-ai-decisions-institutional-actions
- https://www.preprints.org/manuscript/202609.0878

These are adjacent warning signs: the language of continuity + authority will become common.

---

## The distinction NOEONE should defend

Most neighboring systems choose one enforcement boundary:

```text
identity provider
policy engine
agent runtime
resource server
MCP gateway
host organization
```

NOEONE should assume these will remain plural.

Its differentiated object is the **continuing actor history across boundaries**:

```text
ACTOR A
  |
  +-- execution E1
  |     +-- capability evidence M1
  |     +-- grant G
  |     +-- evaluator X: admissible
  |     +-- authority exercise X1
  |     +-- host receipt H1
  |     +-- consequence C1
  |
  +-- governed migration
  |
  +-- execution E2
        +-- new capability evidence M2
        +-- same historical grant G
        +-- evaluator X: admissible
        +-- evaluator Y: suspended
        +-- authority exercise X2
        +-- consequence C2
              +-- claim
              +-- adjudication
```

No single policy engine needs to be declared the global truth. NOEONE's value is that an external relying party can reconstruct the history without treating model/runtime identity as the persistent actor identity.

---

## A stronger candidate primitive: migration consequence inventory

The next object worth testing is not another policy decision. It is a **migration consequence inventory**.

When an accepted continuity transition changes execution from E1 to E2, NOEONE can deterministically identify classes of execution-bound evidence that *do not automatically carry forward*:

- capability manifests;
- admissibility assessments;
- workload/runtime attestations;
- dependency snapshots;
- execution-scoped credentials or leases (references only);
- host-specific approvals where the host contract says they are execution-bound.

Example:

```json
{
  "actorContinues": true,
  "transition": "E1 -> E2",
  "historicalAuthorityPreserved": true,
  "refreshRequired": [
    "capability-evidence",
    "authority-admissibility",
    "runtime-attestation",
    "dependency-snapshot"
  ]
}
```

This should **not** mean NOEONE globally revokes the grant. It means the record distinguishes:

- what is actor-level and continued;
- what is execution-level and stale/unproven for the new execution;
- which external systems are expected to make the live enforcement decision.

### Novelty status

This is still adjacent to authorization-continuity and migration research. We cannot claim nobody has done it.

The more specific potential white space is:

> a cross-domain, evidence-backed inventory of *which historical institutional facts survive a persistent-agent migration and which execution-bound facts require refresh*, tied to one canonical actor history and consumed by multiple independent institutions.

That is the hypothesis to falsify next.

---

## Strategic implication

The more standards mature, the less NOEONE should own low-level auth mechanics.

That is positive if NOEONE becomes the neutral longitudinal data/evidence plane above them:

```text
OAuth / AuthZEN / Entra / CAAM / MCP leases
                  |
                  v
         live authorization
                  |
                  v
             real action
                  |
        receipts / evidence
                  |
                  v
             NOEONE
  canonical actor + longitudinal chain
                  |
      consequences / disputes / risk
```

The startup survives standardization only if the scarce asset is **accumulated externally corroborated actor history**, not a proprietary token format.