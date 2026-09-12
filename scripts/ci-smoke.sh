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

alpha_profile=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha")
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["id"] == os.environ["ALPHA_ID"]; assert d["executions"][0]["model"] == "echo-seed-v1"; assert any(e["type"] == "actor.continuity.transition.accepted" for e in d["events"])' <<<"$alpha_profile"

continuity_json=$(curl --fail --silent --show-error --max-time 5 "$api/v1/actors/smoke-alpha/continuity")
ALPHA_ID="$alpha_id" TRANSITION_ID="$transition_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["version"] == "noeone.continuity.v1"; assert d["actor"]["id"] == os.environ["ALPHA_ID"]; assert d["transitions"][0]["id"] == os.environ["TRANSITION_ID"]; assert d["transitions"][0]["status"] == "ACCEPTED"; assert d["currentExecution"]["model"] == "echo-seed-v1"' <<<"$continuity_json"

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
ALPHA_ID="$alpha_id" TRANSITION_ID="$transition_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["verificationVersion"] == "noeone.verify.v2"; assert d["actorId"] == os.environ["ALPHA_ID"]; assert d["valid"] is True; assert d["chain"]["valid"] is True; assert d["eventCount"] >= 3; assert d["registrySignatures"]["checked"] == d["registrySignatures"]["valid"]; assert d["registrySignatures"]["invalid"] == 0; assert d["registrySignatures"]["missing"] == 0; assert d["hostReceipts"]["invalid"] == 0; assert d["continuity"]["valid"] is True; assert d["continuity"]["coverage"] == "governed"; assert d["continuity"]["transitions"]["accepted"] >= 1' <<<"$verification_json"

passport_json=$(curl --fail --silent --show-error --max-time 10 "$api/v1/actors/smoke-alpha/passport")
ALPHA_ID="$alpha_id" python3 -c 'import json,sys,os; d=json.load(sys.stdin); assert d["passportVersion"] == "noeone.actor-passport.v2"; assert d["actor"]["id"] == os.environ["ALPHA_ID"]; assert d["verification"]["valid"] is True; assert d["verification"]["continuity"]["valid"] is True; assert d["career"]["canonicalEvents"] >= 3; assert d["continuity"]["transitionCount"] >= 1' <<<"$passport_json"

NODE_ENV=production pnpm --filter @onbae/web start >"$web_log" 2>&1 &
web_pid=$!
wait_for_url "$web/" "$web_pid"
curl --fail --silent --show-error --max-time 5 "$web/matches" >/dev/null
curl --fail --silent --show-error --max-time 5 "$web/account" >/dev/null

if grep -q "Rate limiting could not determine a client IP" "$api_log"; then
  echo "Better Auth did not receive a trusted client IP" >&2
  exit 1
fi

echo "NOEONE frozen install, authentication, ownership isolation, governed continuity, match execution, canonical verification, actor passport, and production web smoke tests passed."