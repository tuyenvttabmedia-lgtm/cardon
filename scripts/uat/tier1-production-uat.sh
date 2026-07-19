#!/usr/bin/env bash
# Tier-1 UAT on production VPS — internal ops only (no payment/provider)
set -euo pipefail

cd /opt/cardon

read_env() {
  local key="$1"
  grep -m1 "^${key}=" .env.production | cut -d= -f2-
}

SEED_SUPER_ADMIN_EMAIL=$(read_env SEED_SUPER_ADMIN_EMAIL)
SEED_SUPER_ADMIN_PASSWORD=$(read_env SEED_SUPER_ADMIN_PASSWORD)

BASE_WEB="https://cardon.vn/api/v1"
BASE_ADMIN="https://admin.cardon.vn/api/v1"
BASE_PARTNER="https://partner.cardon.vn/api/v1"

PASS=0
FAIL=0
SKIP=0
WARN=0

pass() { echo "[PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "[FAIL] $1 — $2"; FAIL=$((FAIL+1)); }
skip() { echo "[SKIP] $1 — $2"; SKIP=$((SKIP+1)); }
warn() { echo "[WARN] $1 — $2"; WARN=$((WARN+1)); }

api_data() {
  python3 - "$1" <<'PY'
import json, sys
try:
    j = json.loads(sys.argv[1])
except Exception:
    print('{}', end='')
    raise SystemExit
print(json.dumps(j.get('data', j)), end='')
PY
}

json_get() {
  python3 - "$1" "$2" <<'PY'
import json, sys
raw, path = sys.argv[1], sys.argv[2].split('.')
try:
    v = json.loads(raw)
except Exception:
    print('', end='')
    raise SystemExit
for k in path:
    if not isinstance(v, dict):
        v = None
        break
    v = v.get(k)
print('' if v is None else v, end='')
PY
}

echo "=== TIER 1 UAT — $(date -Iseconds) ==="

# --- Infra ---
HEALTH=$(curl -sS "https://cardon.vn/health/ready" || true)
if echo "$HEALTH" | grep -q '"ready":true'; then pass "Health /health/ready"; else fail "Health /health/ready" "$HEALTH"; fi

HB=$(docker exec cardon-prod-redis redis-cli GET cardon:worker:heartbeat || true)
if [ -n "$HB" ]; then pass "Worker heartbeat in Redis"; else fail "Worker heartbeat" "empty"; fi

for svc in api worker web partner admin nginx postgres redis; do
  line=$(docker compose --env-file .env.production -f docker-compose.production.yml ps "$svc" 2>/dev/null | tail -1 || true)
  if echo "$line" | grep -qi '(healthy)'; then pass "Container $svc healthy"; else warn "Container $svc" "$(echo "$line" | awk '{print $(NF-1), $NF}')"; fi
done

if crontab -l 2>/dev/null | grep -qi cardon; then pass "Backup cron installed"; else warn "Backup cron" "not found"; fi
if [ -f infra/nginx/ssl/cardon.vn.pem ] && [ -f infra/nginx/ssl/cardon.vn.key ]; then pass "SSL cert files present"; else fail "SSL cert files" "missing"; fi

CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://cardon.vn/ 2>/dev/null || echo 000)
if [ "$CODE" = "301" ] || [ "$CODE" = "308" ]; then pass "HTTP→HTTPS redirect cardon.vn"; else warn "HTTP→HTTPS cardon.vn" "code=$CODE"; fi

# --- Admin auth + RBAC ---
ADMIN_LOGIN=$(curl -sS -X POST "$BASE_ADMIN/auth/login" -H 'Content-Type: application/json' -d "{\"identifier\":\"$SEED_SUPER_ADMIN_EMAIL\",\"password\":\"$SEED_SUPER_ADMIN_PASSWORD\"}" || true)
ADMIN_DATA=$(api_data "$ADMIN_LOGIN")
ADMIN_TOKEN=$(json_get "$ADMIN_DATA" accessToken)
if [ -n "$ADMIN_TOKEN" ]; then pass "Admin login API"; else fail "Admin login API" "$ADMIN_LOGIN"; fi

if [ -n "$ADMIN_TOKEN" ]; then
  ADMIN_ME=$(curl -sS "$BASE_ADMIN/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  ADMIN_ME_DATA=$(api_data "$ADMIN_ME")
  ROLE=$(json_get "$ADMIN_ME_DATA" role)
  if [ "$ROLE" = "SUPER_ADMIN" ]; then pass "Admin /auth/me role SUPER_ADMIN"; else fail "Admin /auth/me role" "$ROLE"; fi
  if echo "$ADMIN_ME_DATA" | grep -q configuration.read; then pass "Admin has configuration.read"; else fail "Admin configuration.read" "missing in permissions"; fi
  if echo "$ADMIN_ME_DATA" | grep -q settings.manage; then pass "Admin has settings.manage"; else warn "Admin settings.manage" "missing"; fi

  CFG=$(curl -sS -o /tmp/uat_cfg.json -w "%{http_code}" "$BASE_ADMIN/admin/configuration/modules" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  if [ "$CFG" = "200" ]; then pass "Configuration center modules API"; else fail "Configuration center modules API" "HTTP $CFG"; fi

  AGENTS=$(curl -sS -o /tmp/uat_agents.json -w "%{http_code}" "$BASE_ADMIN/admin/agents?take=5" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  if [ "$AGENTS" = "200" ]; then pass "Admin agents list API"; else fail "Admin agents list API" "HTTP $AGENTS"; fi

  AGENT_CENTER=$(curl -sS -o /tmp/uat_agent_center.json -w "%{http_code}" "$BASE_ADMIN/admin/agent-center/agents?take=5" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  if [ "$AGENT_CENTER" = "200" ]; then pass "Admin agent center list API"; else warn "Admin agent center list API" "HTTP $AGENT_CENTER"; fi

  CMS=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_ADMIN/admin/cms/pages" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  if [ "$CMS" = "200" ]; then pass "Admin CMS pages API"; else fail "Admin CMS pages API" "HTTP $CMS"; fi
fi

# --- Partner security: admin token must not access partner API ---
if [ -n "$ADMIN_TOKEN" ]; then
  PFORBIDDEN=$(curl -sS -o /tmp/uat_pforbid.json -w "%{http_code}" "$BASE_PARTNER/agents/me" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  if [ "$PFORBIDDEN" = "401" ] || [ "$PFORBIDDEN" = "403" ] || [ "$PFORBIDDEN" = "404" ]; then
    pass "Admin token blocked/absent on partner agent profile"
  else
    warn "Admin token on partner agents/me" "HTTP $PFORBIDDEN"
  fi
fi

# --- Create UAT agent ---
UAT_EMAIL="uat-tier1-$(date +%s)@cardon.vn"
UAT_PASS='UatTier1!2026'
REG=$(curl -sS -X POST "$BASE_WEB/auth/agent-register" -H 'Content-Type: application/json' -d "{\"email\":\"$UAT_EMAIL\",\"password\":\"$UAT_PASS\",\"confirmPassword\":\"$UAT_PASS\",\"phone\":\"0900000001\",\"accountType\":\"COMPANY\",\"acceptTerms\":true}" || true)
if echo "$REG" | grep -q requiresEmailVerification; then pass "Agent public registration"; else fail "Agent public registration" "$REG"; fi

if [ -n "$ADMIN_TOKEN" ]; then
  AGENTS2=$(curl -sS -o /tmp/uat_agents2.json -w "%{http_code}" "$BASE_ADMIN/admin/agents?take=20&q=$UAT_EMAIL" -H "Authorization: Bearer $ADMIN_TOKEN" || true)
  if [ "$AGENTS2" = "200" ] && grep -q "$UAT_EMAIL" /tmp/uat_agents2.json 2>/dev/null; then
    pass "UAT agent visible in admin agents list"
  else
    warn "UAT agent in admin list" "HTTP $AGENTS2 or email not found"
  fi
fi

AGENT_LOGIN=$(curl -sS -X POST "$BASE_PARTNER/auth/login" -H 'Content-Type: application/json' -d "{\"identifier\":\"$UAT_EMAIL\",\"password\":\"$UAT_PASS\"}" || true)
AGENT_DATA=$(api_data "$AGENT_LOGIN")
AGENT_TOKEN=$(json_get "$AGENT_DATA" accessToken)
AGENT_ROLE=$(json_get "$AGENT_DATA" user.role)
if [ -n "$AGENT_TOKEN" ] && [ "$AGENT_ROLE" = "AGENT" ]; then pass "Partner login API"; else fail "Partner login API" "$AGENT_LOGIN"; fi

if [ -n "$AGENT_TOKEN" ]; then
  ONB=$(curl -sS "$BASE_PARTNER/agents/me/onboarding-status" -H "Authorization: Bearer $AGENT_TOKEN" || true)
  ONB_DATA=$(api_data "$ONB")
  KYC_PATH=$(json_get "$ONB_DATA" kycPath)
  EMAIL_VERIFIED=$(json_get "$ONB_DATA" emailVerified)
  CAN_API=$(json_get "$ONB_DATA" gates.canUseApi)
  if [ "$KYC_PATH" = "/account/kyc" ]; then pass "Onboarding kycPath unified hub"; else fail "Onboarding kycPath" "$KYC_PATH"; fi
  if [ "$EMAIL_VERIFIED" = "false" ]; then pass "Onboarding email not verified yet"; else warn "Onboarding emailVerified" "$EMAIL_VERIFIED"; fi
  if [ "$CAN_API" = "false" ]; then pass "Onboarding gates block API before KYC"; else fail "Onboarding gates canUseApi" "$CAN_API"; fi

  KYC_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" "https://partner.cardon.vn/account/verify-email" || true)
  KYC_LOC=$(curl -sSI "https://partner.cardon.vn/account/verify-email" 2>/dev/null | tr -d '\r' | grep -i '^location:' | awk '{print $2}' || true)
  if echo "$KYC_LOC" | grep -q '/account/kyc'; then pass "Legacy verify-email redirects to KYC hub"; else fail "verify-email redirect" "loc=$KYC_LOC code=$KYC_HTTP"; fi

  AGENT_ME=$(curl -sS "$BASE_PARTNER/agents/me" -H "Authorization: Bearer $AGENT_TOKEN" || true)
  AGENT_ME_DATA=$(api_data "$AGENT_ME")
  if echo "$AGENT_ME_DATA" | grep -q companyName; then pass "Partner agent profile API"; else fail "Partner agent profile API" "$AGENT_ME"; fi

  KYC_GET=$(curl -sS -o /tmp/uat_kyc.json -w "%{http_code}" "$BASE_PARTNER/agents/me/kyc" -H "Authorization: Bearer $AGENT_TOKEN" || true)
  if [ "$KYC_GET" = "200" ]; then pass "Partner KYC detail API"; else fail "Partner KYC detail API" "HTTP $KYC_GET"; fi

  DASH_GUARD=$(curl -sS -o /dev/null -w "%{http_code}" "https://partner.cardon.vn/dashboard" || true)
  if [ "$DASH_GUARD" = "307" ] || [ "$DASH_GUARD" = "302" ]; then pass "Partner /dashboard requires session cookie"; else warn "Partner /dashboard guard" "HTTP $DASH_GUARD"; fi

  API_BUY=$(curl -sS -o /tmp/uat_buy.json -w "%{http_code}" "https://partner.cardon.vn/api/partner/v1/buy" -H "Authorization: Bearer $AGENT_TOKEN" -H 'Content-Type: application/json' -d '{}' || true)
  if [ "$API_BUY" = "401" ] || [ "$API_BUY" = "403" ] || [ "$API_BUY" = "400" ]; then pass "Agent buy API gated before full onboarding (HTTP $API_BUY)"; else warn "Agent buy API before KYC" "HTTP $API_BUY"; fi

  LOGOUT=$(curl -sS -X POST "$BASE_PARTNER/auth/logout" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$(json_get "$AGENT_DATA" refreshToken)\"}" || true)
  if echo "$LOGOUT" | grep -qi message; then pass "Partner logout API"; else warn "Partner logout API" "$LOGOUT"; fi
fi

# --- Customer web public ---
WEB_HOME=$(curl -sS -o /dev/null -w "%{http_code}" https://cardon.vn/ || true)
if [ "$WEB_HOME" = "200" ]; then pass "Customer web homepage"; else fail "Customer web homepage" "HTTP $WEB_HOME"; fi

LOGIN_PAGES="https://admin.cardon.vn/login https://partner.cardon.vn/login"
for u in $LOGIN_PAGES; do
  c=$(curl -sS -o /dev/null -w "%{http_code}" "$u" || true)
  if [ "$c" = "200" ]; then pass "Login page $u"; else fail "Login page $u" "HTTP $c"; fi
done

# --- DB sanity ---
PERMS=$(docker exec cardon-prod-postgres psql -U cardon -d cardon -tAc 'SELECT COUNT(1) FROM permissions' || true)
if [ "${PERMS:-0}" -ge 40 ]; then pass "RBAC permissions seeded ($PERMS)"; else warn "RBAC permissions count" "$PERMS"; fi

MODE=$(docker exec cardon-prod-postgres psql -U cardon -d cardon -tAc "SELECT value->>'agentRegistrationMode' FROM system_settings WHERE key='system'" || true)
if [ "$MODE" = "PUBLIC_APPROVAL" ]; then pass "agentRegistrationMode PUBLIC_APPROVAL"; else fail "agentRegistrationMode" "$MODE"; fi

echo "=== SUMMARY: PASS=$PASS FAIL=$FAIL WARN=$WARN SKIP=$SKIP ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
