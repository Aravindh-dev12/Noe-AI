-- Historical compatibility marker.
--
-- This migration was developed on a parallel branch to
-- 20260913002000_claims_adjudication_repair. Once those branches were merged,
-- both migrations attempted to create the same claims/adjudication schema.
--
-- The earlier repair migration is now history-compatible: it creates the schema
-- on a fresh database and safely verifies/no-ops when this later backfill was
-- already applied in an older branch history. Therefore this migration must not
-- create the schema a second time.
--
-- We still verify the expected objects exist so a missing/partial institutional
-- schema cannot be silently marked successful.

DO $claims_backfill_marker$
BEGIN
  IF to_regclass('"LegalContextSnapshot"') IS NULL
    OR to_regclass('"Claim"') IS NULL
    OR to_regclass('"ClaimParty"') IS NULL
    OR to_regclass('"ClaimActorLink"') IS NULL
    OR to_regclass('"ClaimEvidenceBinding"') IS NULL
    OR to_regclass('"ClaimTransition"') IS NULL
    OR to_regclass('"AdjudicationDecision"') IS NULL
    OR to_regclass('"RemedyOrder"') IS NULL
    OR to_regclass('"RemedyTransition"') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimStatus')
    OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimPartyRole')
    OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClaimActorRole')
    OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdjudicationDisposition')
    OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RemedyStatus')
  THEN
    RAISE EXCEPTION 'claims/adjudication schema missing before compatibility marker';
  END IF;
END
$claims_backfill_marker$;
