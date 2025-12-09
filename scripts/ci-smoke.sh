#!/usr/bin/env bash
set -euo pipefail
# Simple CI smoke script: login -> post a response -> fetch aggregates
BASE_URL=http://localhost:3000
COMPANY=test-ci
SURVEY=ci-s
# wait for server
for i in $(seq 1 30); do
  if curl -sSf "$BASE_URL/health" >/dev/null 2>&1; then break; fi
  echo "waiting for server... ($i)"; sleep 1
done
# login (cookie)
curl -s -c /tmp/ci_cookies -X POST "$BASE_URL/api/login" -H "Content-Type: application/json" -d "{\"companyId\":\"$COMPANY\"}" >/tmp/ci_login.out
# post a response
curl -s -b /tmp/ci_cookies -X POST "$BASE_URL/api/responses" -H "Content-Type: application/json" -d "{\"companyId\":\"$COMPANY\",\"surveyId\":\"$SURVEY\",\"answers\":{\"ai-1\":5}}" >/tmp/ci_post.out
# fetch aggregates
curl -s -b /tmp/ci_cookies "$BASE_URL/api/aggregates?surveyId=$SURVEY" >/tmp/ci_agg.out
# show results
echo "--- login ---"; sed -n '1,200p' /tmp/ci_login.out
echo "--- post ---"; sed -n '1,200p' /tmp/ci_post.out
echo "--- aggregates ---"; sed -n '1,200p' /tmp/ci_agg.out
# basic assertions
if ! grep -q '"ok":true' /tmp/ci_post.out; then echo "post failed"; exit 2; fi
if ! grep -q 'ai-1' /tmp/ci_agg.out; then echo "agg missing"; exit 3; fi
echo "SMOKE OK"
