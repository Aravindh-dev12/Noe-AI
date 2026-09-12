#!/usr/bin/env bash
set -euo pipefail

# Internal filenames keep the historical prefix so older CI diagnostics remain easy
# to compare across the NOEONE brand migration.
api_log=/tmp/onbae-api.log
worker_log=/tmp/onbae-worker.log
web_log=/tmp/onbae-web.log
api_pid=""
worker_pid=""
web_pid=""
owner_cookies=/tmp/onbae-owner.cookies
stranger_cookies=/tmp/onbae-stranger.cookies
origin=${SMOKE_ORIGIN:-http://localhost:3000}
api=${SMOKE_API_URL:-http://localhost:4000}
web=${SMOKE_WEB_URL:-http://localhost:3000}

cleanup() {
  for pid in "${web_pid:-}" "${worker_pid:-}" "${api_pid:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${web_pid:-}" "${worker_pid:-}" "${api_pid:-}"; do
    if [ -n "$pid" ]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}

diagnostics() {
  echo "--- API log ---"
  cat "$api_log" 2>/dev/null || true
  echo "--- Worker log ---"
  cat "$worker_log" 2>/dev/null || true
  echo "--- Web log ---"
  cat "$web_log" 2>/dev/null || true
}

on_exit() {
  status=$?
  if [ "$status" -ne 0 ]; then diagnostics; fi
  cleanup
  exit "$status"
}
trap on_exit EXIT

wait_for_url() {
  local url=$1
  local process_pid=${2:-}
  for _ in $(seq 1 60); do
    if [ -n "$process_pid" ] && ! kill -0 "$process_pid" 2>/dev/null; then
      echo "Process ${process_pid} exited while waiting for ${url}" >&2
      return 1
    fi
    if curl --fail --silent --show-error --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

json_field() {
  local field=$1
  python3 -c 'import json,sys; field=sys.argv[1]; print(json.load(sys.stdin)[field])' "$field"
}

poll_match() {
  local match_id=$1
  local match_status=""
  local match_json=""
  for _ in $(seq 1 60); do
    match_json=$(curl --fail --silent --show-error --max-time 5 "$api/v1/matches/${match_id}")
    match_status=$(json_field status <<<"$match_json")
    if [ "$match_status" = "COMPLETED" ]; then return 0; fi
    if [ "$match_status" = "FAILED" ] || [ "$match_status" = "CANCELLED" ]; then
      echo "Match ${match_id} ended with status ${match_status}" >&2
      echo "$match_json" >&2
      return 1
    fi
    sleep 1
  done
  echo "Match ${match_id} did not complete in time" >&2
  return 1
}

assert_status() {
  local expected=$1
  local actual=$2
  local context=$3
  if [ "$actual" != "$expected" ]; then
    echo "Expected ${context} status ${expected}, received ${actual}" >&2
    return 1
  fi
}

rm -f "$owner_cookies" "$stranger_cookies" "$api_log" "$worker_log" "$web_log"

pnpm db:seed

NODE_ENV=production pnpm --filter @onbae/api start >"$api_log" 2>&1 &
api_pid=$!
NODE_ENV=production pnpm --filter @onbae/worker start >"$worker_log" 2>&1 &
worker_pid=$!

wait_for_url "$api/health/ready" "$api_pid"
curl --fail --silent --show-error --max-time 5 "$api/health/live" >/dev/null
kill -0 "$worker_pid"

admin_match=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/matches" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data '{"actorAId":"act_nova","actorBId":"act_echo","environmentId":"env_triad_v1"}')
admin_match_id=$(json_field id <<<"$admin_match")
poll_match "$admin_match_id"

curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/api/auth/sign-up/email" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"name":"Smoke Owner","email":"smoke-owner@noeone.test","password":"SmokeOwner-2026-Strong"}' >/tmp/signup-owner.json

curl --fail-with-body --silent --show-error --max-time 10 \
  -c "$owner_cookies" \
  -b "$owner_cookies" \
  -X POST "$api/api/auth/sign-in/email" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"email":"smoke-owner@noeone.test","password":"SmokeOwner-2026-Strong","rememberMe":true}' >/tmp/signin-owner.json

me_json=$(curl --fail --silent --show-error --max-time 5 -b "$owner_cookies" "$api/v1/me")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["authenticated"] is True; assert d["user"]["email"] == "smoke-owner@noeone.test"' <<<"$me_json"

alpha_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -b "$owner_cookies" \
  -X POST "$api/v1/actors" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"handle":"smoke-alpha","displayName":"Smoke Alpha","description":"CI-owned persistent actor","actorType":"user","provider":"mock","model":"nova-seed-v1","runtime":"noeone-worker"}')
alpha_id=$(json_field id <<<"$alpha_json")

beta_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -b "$owner_cookies" \
  -X POST "$api/v1/actors" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"handle":"smoke-beta","displayName":"Smoke Beta","description":"CI-owned persistent actor","actorType":"user","provider":"mock","model":"echo-seed-v1","runtime":"noeone-worker"}')
beta_id=$(json_field id <<<"$beta_json")

owned_json=$(curl --fail --silent --show-error --max-time 5 -b "$owner_cookies" "$api/v1/me/actors")
python3 -c 'import json,sys; d=json.load(sys.stdin); handles={a["handle"] for a in d}; assert {"smoke-alpha","smoke-beta"}.issubset(handles)' <<<"$owned_json"

# Authority belongs to the persistent actor, not its current execution. Alpha
# receives broad root authority and delegates a strict subset to Beta.
authority_expiry=$(python3 -c 'from datetime import datetime,timezone,timedelta; print((datetime.now(timezone.utc)+timedelta(hours=1)).isoformat().replace("+00:00","Z"))')
root_authority_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/authority/grants" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"subjectActorId\":\"${alpha_id}\",\"grantor\":{\"type\":\"external\",\"ref\":\"smoke-human-principal\"},\"actions\":[\"read\",\"purchase\"],\"resources\":[\"catalog\",\"checkout\"],\"canRedelegate\":true,\"remainingDelegationDepth\":2,\"maxAmountMinor\":\"10000\",\"currency\":\"USD\",\"expiresAt\":\"${authority_expiry}\",\"externalFramework\":\"oauth\",\"externalReference\":\"digest:smoke-root-authority\",\"idempotencyKey\":\"smoke-root-authority-v1\"}")
root_authority_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["grant"]["id"])' <<<"$root_authority_json")

child_authority_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/authority/grants" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"subjectActorId\":\"${beta_id}\",\"parentGrantId\":\"${root_authority_id}\",\"actions\":[\"purchase\"],\"resources\":[\"checkout\"],\"canRedelegate\":false,\"remainingDelegationDepth\":0,\"maxAmountMinor\":\"2000\",\"currency\":\"USD\",\"expiresAt\":\"${authority_expiry}\",\"idempotencyKey\":\"smoke-child-authority-v1\"}")
child_authority_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["grant"]["id"])' <<<"$child_authority_json")
ROOT_AUTHORITY_ID="$root_authority_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["grant"]["parentGrantId"] == os.environ["ROOT_AUTHORITY_ID"]; assert d["grant"]["grantorType"] == "actor"; assert d["grant"]["maxAmountMinor"] == "2000"' <<<"$child_authority_json"

authority_allowed=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/authority/evaluate" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"actorId\":\"${beta_id}\",\"action\":\"purchase\",\"resource\":\"checkout\",\"amountMinor\":\"1500\",\"currency\":\"USD\"}")
CHILD_AUTHORITY_ID="$child_authority_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["allowed"] is True; assert d["matchedGrantId"] == os.environ["CHILD_AUTHORITY_ID"]' <<<"$authority_allowed"

amplification_status=$(curl --silent --show-error --max-time 10 \
  -o /tmp/authority-amplification.json -w '%{http_code}' \
  -X POST "$api/v1/authority/grants" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"subjectActorId\":\"${beta_id}\",\"parentGrantId\":\"${root_authority_id}\",\"actions\":[\"purchase\",\"delete\"],\"resources\":[\"checkout\"],\"canRedelegate\":false,\"remainingDelegationDepth\":0,\"maxAmountMinor\":\"2000\",\"currency\":\"USD\",\"expiresAt\":\"${authority_expiry}\",\"idempotencyKey\":\"smoke-authority-amplification-v1\"}")
assert_status "409" "$amplification_status" "authority scope amplification"

# One immutable artifact may concern multiple actors. Bind the same digest to
# Alpha (debtor) and Beta (counterparty), then record independent validation.
evidence_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/evidence" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"actorId\":\"${alpha_id}\",\"role\":\"debtor\",\"kind\":\"smoke.contract.offer\",\"issuer\":\"smoke-counterparty\",\"digest\":\"sha256:1111111111111111111111111111111111111111111111111111111111111111\",\"artifactMetadata\":{\"privateNote\":\"must-not-leak-publicly\"},\"bindingMetadata\":{\"side\":\"alpha\"}}")
evidence_artifact_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["artifact"]["id"])' <<<"$evidence_json")

beta_evidence_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/evidence" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"actorId\":\"${beta_id}\",\"role\":\"creditor\",\"kind\":\"smoke.contract.offer\",\"issuer\":\"smoke-counterparty\",\"digest\":\"sha256:1111111111111111111111111111111111111111111111111111111111111111\",\"artifactMetadata\":{\"privateNote\":\"must-not-leak-publicly\"},\"bindingMetadata\":{\"side\":\"beta\"}}")
EVIDENCE_ARTIFACT_ID="$evidence_artifact_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["artifact"]["id"] == os.environ["EVIDENCE_ARTIFACT_ID"]; assert d["replayed"] is False' <<<"$beta_evidence_json"

evidence_validation_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/evidence/${evidence_artifact_id}/validations" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data '{"validator":"noeone-smoke-validator","status":"verified","method":"digest-and-issuer","idempotencyKey":"smoke-evidence-validation-v1"}')
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["validation"]["status"] == "VERIFIED"; assert d["replayed"] is False' <<<"$evidence_validation_json"

public_evidence=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha/evidence")
EVIDENCE_ARTIFACT_ID="$evidence_artifact_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); b=d["data"][0]; a=b["artifact"]; assert d["version"] == "noeone.evidence.v2"; assert b["role"] == "debtor"; assert a["id"] == os.environ["EVIDENCE_ARTIFACT_ID"]; assert a["validations"][0]["status"] == "VERIFIED"; assert "metadata" not in a; assert "uri" not in a; assert "externalId" not in a; assert "metadata" not in b' <<<"$public_evidence"

commitment_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/commitments" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"debtorActorId\":\"${alpha_id}\",\"creditorActorId\":\"${beta_id}\",\"kind\":\"smoke.delivery\",\"termsDigest\":\"sha256:2222222222222222222222222222222222222222222222222222222222222222\",\"sourceEvidenceArtifactId\":\"${evidence_artifact_id}\",\"externalFramework\":\"smoke-contract-v1\",\"idempotencyKey\":\"smoke-alpha-beta-delivery-v1\",\"metadata\":{\"privateTerms\":\"not-public\"}}")
commitment_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["commitment"]["id"])' <<<"$commitment_json")

private_commitment_status=$(curl --silent --show-error --max-time 5 \
  -o /tmp/private-commitment.json -w '%{http_code}' "$api/v1/commitments/${commitment_id}")
assert_status "401" "$private_commitment_status" "private commitment read without admin"

pre_migration_commitments=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha/commitments")
COMMITMENT_ID="$commitment_id" EVIDENCE_ARTIFACT_ID="$evidence_artifact_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert len(d["data"]) == 1; c=d["data"][0]; assert c["id"] == os.environ["COMMITMENT_ID"]; assert c["status"] == "OPEN"; assert c["sourceEvidence"]["id"] == os.environ["EVIDENCE_ARTIFACT_ID"]; assert "metadata" not in c; assert "creditorExternalRef" not in c' <<<"$pre_migration_commitments"

migration_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -b "$owner_cookies" \
  -X POST "$api/v1/actors/${alpha_id}/continuity/migrations" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"provider":"mock","model":"echo-seed-v1","runtime":"noeone-worker","reason":"ci continuity test"}')
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["actorId"] == os.environ["ALPHA_ID"]; assert d["transitionStatus"] == "accepted"; assert d["executionId"]; assert d["lineageId"]' <<<"$migration_json"
transition_id=$(json_field transitionId <<<"$migration_json")

transition_json=$(curl --fail --silent --show-error --max-time 5 "$api/v1/continuity/${transition_id}")
TRANSITION_ID="$transition_id" ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["id"] == os.environ["TRANSITION_ID"]; assert d["actorId"] == os.environ["ALPHA_ID"]; assert d["status"] == "ACCEPTED"; assert d["resultingExecutionId"]; assert d["resultingLineageId"]' <<<"$transition_json"

post_migration_commitments=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha/commitments")
COMMITMENT_ID="$commitment_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert len(d["data"]) == 1; assert d["data"][0]["id"] == os.environ["COMMITMENT_ID"]; assert d["data"][0]["status"] == "OPEN"' <<<"$post_migration_commitments"

# Migration changes the execution but not the actor-bound authority grant.
root_after_migration=$(curl --fail --silent --show-error --max-time 5 \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" "$api/v1/authority/grants/${root_authority_id}")
ALPHA_ID="$alpha_id" ROOT_AUTHORITY_ID="$root_authority_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["id"] == os.environ["ROOT_AUTHORITY_ID"]; assert d["subjectActorId"] == os.environ["ALPHA_ID"]; assert d["status"] == "ACTIVE"' <<<"$root_after_migration"

alpha_profile=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha")
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["id"] == os.environ["ALPHA_ID"]; assert d["executions"][0]["model"] == "echo-seed-v1"; assert any(e["type"] == "actor.continuity.transition.accepted" for e in d["events"])' <<<"$alpha_profile"

continuity_json=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha/continuity")
ALPHA_ID="$alpha_id" TRANSITION_ID="$transition_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["version"] == "noeone.continuity.v1"; assert d["actor"]["id"] == os.environ["ALPHA_ID"]; assert d["transitions"][0]["id"] == os.environ["TRANSITION_ID"]; assert d["transitions"][0]["status"] == "ACCEPTED"; assert d["currentExecution"]["model"] == "echo-seed-v1"' <<<"$continuity_json"

# A fork is ancestry, not continuation. The child must start with zero inherited
# commitments, evidence bindings, and authority grants even though it originates from Alpha.
fork_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/actors/${alpha_id}/forks" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data '{"handle":"smoke-alpha-fork","displayName":"Smoke Alpha Fork","reason":"ci fork liability test"}')
fork_child_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["child"]["id"])' <<<"$fork_json")
fork_commitments=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha-fork/commitments")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["data"] == []' <<<"$fork_commitments"
fork_evidence=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha-fork/evidence")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["data"] == []' <<<"$fork_evidence"
fork_authority=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha-fork/authority")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["version"] == "noeone.authority.public.v1"; assert d["data"] == []' <<<"$fork_authority"
fork_passport=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-alpha-fork/passport")
FORK_ID="$fork_child_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["passportVersion"] == "noeone.actor-passport.v4"; assert d["actor"]["id"] == os.environ["FORK_ID"]; assert d["continuity"]["ancestry"] is not None; assert d["institutional"]["commitmentCount"] == 0; assert d["institutional"]["evidenceArtifactCount"] == 0; assert d["authority"]["grantCount"] == 0; assert d["authority"]["effectiveActiveCount"] == 0' <<<"$fork_passport"

# Revocation of Alpha's root authority invalidates Beta's delegated authority
# without mutating Beta's historical child-grant row.
revoke_authority_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/authority/grants/${root_authority_id}/revoke" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data '{"reason":"ci principal revocation","idempotencyKey":"smoke-root-authority-revoke-v1"}')
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["grant"]["status"] == "REVOKED"; assert d["transition"]["toStatus"] == "REVOKED"' <<<"$revoke_authority_json"

authority_denied=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/authority/evaluate" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"actorId\":\"${beta_id}\",\"action\":\"purchase\",\"resource\":\"checkout\",\"amountMinor\":\"100\",\"currency\":\"USD\"}")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["allowed"] is False; assert any("revoked" in " ".join(e["reasons"]).lower() for e in d["evaluations"])' <<<"$authority_denied"

beta_authority_verify=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-beta/authority/verify")
BETA_ID="$beta_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["version"] == "noeone.authority.verify.v1"; assert d["actorId"] == os.environ["BETA_ID"]; assert d["valid"] is True; assert d["activeRowCount"] == 1; assert d["effectiveActiveCount"] == 0; assert d["issues"] == []' <<<"$beta_authority_verify"

# Resolve the parent's obligation with linked evidence. The append-only
# transition and materialized status must agree under independent verification.
commitment_transition_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/v1/commitments/${commitment_id}/transitions" \
  -H 'content-type: application/json' \
  -H "x-noeone-admin-key: ${ADMIN_API_KEY}" \
  --data "{\"toStatus\":\"fulfilled\",\"evidenceArtifactId\":\"${evidence_artifact_id}\",\"reason\":\"ci fulfillment\",\"idempotencyKey\":\"smoke-alpha-beta-fulfilled-v1\"}")
COMMITMENT_ID="$commitment_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["commitment"]["id"] == os.environ["COMMITMENT_ID"]; assert d["commitment"]["status"] == "FULFILLED"; assert d["transition"]["toStatus"] == "FULFILLED"' <<<"$commitment_transition_json"

institutional_verify=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-alpha/institutional/verify")
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["version"] == "noeone.institutional-verification.v1"; assert d["actorId"] == os.environ["ALPHA_ID"]; assert d["valid"] is True; assert d["evidenceArtifactCount"] == 1; assert d["evidenceValidationCount"] == 1; assert d["commitmentCount"] == 1; assert d["transitionCount"] == 2; assert d["errors"] == []' <<<"$institutional_verify"

authority_verify=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-alpha/authority/verify")
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["version"] == "noeone.authority.verify.v1"; assert d["actorId"] == os.environ["ALPHA_ID"]; assert d["valid"] is True; assert d["grantCount"] == 1; assert d["activeRowCount"] == 0; assert d["effectiveActiveCount"] == 0; assert d["issues"] == []' <<<"$authority_verify"

curl --fail-with-body --silent --show-error --max-time 10 \
  -X POST "$api/api/auth/sign-up/email" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"name":"Smoke Stranger","email":"smoke-stranger@noeone.test","password":"SmokeStranger-2026-Strong"}' >/tmp/signup-stranger.json
curl --fail-with-body --silent --show-error --max-time 10 \
  -c "$stranger_cookies" \
  -b "$stranger_cookies" \
  -X POST "$api/api/auth/sign-in/email" \
  -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"email":"smoke-stranger@noeone.test","password":"SmokeStranger-2026-Strong","rememberMe":true}' >/tmp/signin-stranger.json

forbidden_status=$(curl --silent --show-error --max-time 10 \
  -o /tmp/forbidden.json -w '%{http_code}' -b "$stranger_cookies" \
  -X POST "$api/v1/actors/${alpha_id}/continuity/migrations" -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"provider":"mock","model":"nova-seed-v1","runtime":"noeone-worker"}')
assert_status "403" "$forbidden_status" "cross-owner migration"

unauthenticated_status=$(curl --silent --show-error --max-time 10 \
  -o /tmp/unauthenticated.json -w '%{http_code}' \
  -X POST "$api/v1/actors/${alpha_id}/continuity/migrations" -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data '{"provider":"mock","model":"nova-seed-v1","runtime":"noeone-worker"}')
assert_status "401" "$unauthenticated_status" "unauthenticated migration"

match_json=$(curl --fail-with-body --silent --show-error --max-time 10 \
  -b "$owner_cookies" -X POST "$api/v1/matches" -H "origin: ${origin}" \
  -H 'content-type: application/json' \
  --data "{\"actorAId\":\"${alpha_id}\",\"actorBId\":\"${beta_id}\",\"environmentId\":\"env_triad_v1\"}")
match_id=$(json_field id <<<"$match_json")
poll_match "$match_id"

alpha_after_match=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha")
python3 -c 'import json,sys; d=json.load(sys.stdin); assert any(e["type"] == "competition.result" for e in d["events"])' <<<"$alpha_after_match"

verification_json=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-alpha/verify")
ALPHA_ID="$alpha_id" TRANSITION_ID="$transition_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["verificationVersion"] == "noeone.verify.v2"; assert d["actorId"] == os.environ["ALPHA_ID"]; assert d["valid"] is True; assert d["chain"]["valid"] is True; assert d["eventCount"] >= 9; assert d["registrySignatures"]["checked"] == d["registrySignatures"]["valid"]; assert d["registrySignatures"]["invalid"] == 0; assert d["registrySignatures"]["missing"] == 0; assert d["hostReceipts"]["invalid"] == 0; assert d["continuity"]["valid"] is True; assert d["continuity"]["coverage"] == "governed"; assert d["continuity"]["transitions"]["accepted"] >= 1' <<<"$verification_json"

passport_json=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-alpha/passport")
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["passportVersion"] == "noeone.actor-passport.v4"; assert d["actor"]["id"] == os.environ["ALPHA_ID"]; assert d["verification"]["valid"] is True; assert d["verification"]["continuity"]["valid"] is True; assert d["career"]["canonicalEvents"] >= 9; assert d["continuity"]["transitionCount"] >= 1; assert d["institutional"]["verification"]["valid"] is True; assert d["institutional"]["evidenceArtifactCount"] == 1; assert d["institutional"]["evidenceBindingCount"] == 1; assert d["institutional"]["evidenceValidationCount"] == 1; assert d["institutional"]["evidenceValidationsByStatus"]["verified"] == 1; assert d["institutional"]["commitmentCount"] == 1; assert d["institutional"]["commitmentsByStatus"]["fulfilled"] == 1; assert d["authority"]["grantCount"] == 1; assert d["authority"]["grantsByStatus"]["revoked"] == 1; assert d["authority"]["effectiveActiveCount"] == 0; assert d["authority"]["verification"]["valid"] is True' <<<"$passport_json"

NODE_ENV=production pnpm --filter @onbae/web start >"$web_log" 2>&1 &
web_pid=$!
wait_for_url "$web/" "$web_pid"
curl --fail --silent --show-error --max-time 5 "$web/matches" >/dev/null
curl --fail --silent --show-error --max-time 5 "$web/account" >/dev/null

if grep -q "Rate limiting could not determine a client IP" "$api_log"; then
  echo "Better Auth did not receive a trusted client IP" >&2
  exit 1
fi

echo "NOEONE frozen install, authentication, ownership isolation, delegated authority, scope attenuation, cascade revocation, governed continuity, normalized evidence, institutional commitments, fork non-inheritance, match execution, canonical verification, actor passport v4, and production web smoke tests passed."