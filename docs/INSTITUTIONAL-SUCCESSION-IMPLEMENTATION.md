# Institutional Succession Implementation Notes

This note records implementation constraints that are easy to weaken accidentally during later refactors.

## Authority reissuance

`AUTHORITY_REISSUANCE` is linkage to a separately issued successor grant, never a copy operation.

When activation occurs, NOEONE verifies both temporal validity and structural non-amplification:

- source and successor grants must be active at the succession effective time;
- the successor grant cannot begin before the source grant's `notBefore`;
- if the source expires, the successor grant cannot outlive it;
- actions and resources must be subsets of the source scope;
- delegation depth cannot increase;
- a capped monetary grant cannot become uncapped or increase its cap;
- capped currency cannot change;
- the recorded grantor identity must remain the same.

Historical verification is intentionally different from activation-time admissibility. Later revocation or expiry must not retroactively invalidate the historical fact that the succession activation was structurally valid when it occurred. Verification therefore recomputes the frozen scope relationship and activation basis rather than requiring the grants to still be active today.

## Time model

`AuthorityGrant.notBefore` is the canonical start boundary in the current schema. There is no separate `issuedAt` field. The succession layer must use the authority model as it exists rather than inventing an alias that could diverge from the source of truth.

## Evidence and commitments

A resulting commitment must retain evidence that is bound to its debtor. If the predecessor's evidence cannot safely support the successor position, the succession agreement's evidence is used only when it is explicitly bound to the resulting debtor.

## Invariant

Recognition, ancestry, or a successful continuity assessment never transfers institutional state by itself. Succession remains an explicit, item-level, consent-backed operation.
