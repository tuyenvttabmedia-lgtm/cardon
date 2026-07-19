# Phase 6O — Final UAT & Launch Freeze Report

**Date:** 2026-06-22  
**Scope:** Full acceptance test before VPS deployment. **Launch freeze** — no new features; only bug / UX / security / performance fixes permitted.  
**Environment:** `docker-compose.local-full.yml` + `.env.local-full` (mock eSale, staging `APP_ENV`)  
**Note:** `cardon-prod` stack occupied host ports **80** and **5433**; UAT ran on **8080** / **5434** via `docker-compose.local-full.uat-override.yml`.

---

## Executive verdict

| Gate | Result |
|------|--------|
| **Overall UAT** | **CONDITIONAL PASS** — core CARD commerce path green; 3 build blockers fixed during 6O |
| **Go-live readiness** | **NO-GO** until production secrets, SSL, live payment/provider webhooks, and TOPUP seed/UAT on staging |

---

## TASK 1 — Clean local rebuild

| Step | Result | Evidence |
|------|--------|----------|
| Remove old containers / volumes | **PASS** | `docker compose … down -v --remove-orphans` |
| Fresh `docker compose local-full` build | **PASS** (after fixes) | Initial build **FAIL** → fixed → rebuild **PASS** |
| Migrations | **PASS** | 15 migrations — `Database schema is up to date!` |
| Seed | **PASS** | `seed-local-full.ts` — RBAC, 6 accounts, CARD catalog, agent API keys |
| API health | **PASS** | `/health/ready` → `ready: true`, workers OK |
| Worker health | **PASS** | `cardon-local-full-worker` healthy, heartbeat OK |
| Web | **PASS** | HTTP 200 via nginx `:8080` (container healthcheck: unhealthy — known Next/wget issue) |
| Admin | **PASS** | HTTP 200 via nginx + `Host: admin.localhost` |
| Partner | **PASS** | HTTP 307→200 via nginx + `Host: partner.localhost` |
| Nginx | **PASS** (after fix) | Was crash-looping — missing `uploads-proxy.conf` in `conf.d.local/snippets/` |

### Build blockers fixed during 6O (bug fixes)

| ID | Issue | Fix |
|----|-------|-----|
| **BUG-6O-001** | `topup.worker.ts` wrong imports → Nest build fail | Corrected to `../services/topup-queue.producer` and `../services/topup.service` |
| **BUG-6O-002** | Duplicate `FaqSection` import in `ContactPageClient.tsx` → web build fail | Removed duplicate import |
| **BUG-6O-003** | Nginx local config includes missing `uploads-proxy.conf` | Added `infra/nginx/conf.d.local/snippets/uploads-proxy.conf` |
| **BUG-6O-004** | `topup-phone.util.spec.ts` wrong import path | Fixed to `./topup-phone.util` |

---

## TASK 2 — Customer journey test

| Flow | Result | Notes |
|------|--------|-------|
| Register | **PASS** | Auto-login token returned |
| Login (username + email) | **PASS** | |
| Logout | **PASS** | HTTP 201 |
| Update profile | **NOT RUN** | Blocked by auth throttle after batch regression (see BUG-6O-005) |
| **Buy CARD** — select product | **PASS** | GARENA-100K variant |
| Checkout + SePay payment | **PASS** | `PAY-*` reference created |
| SePay webhook | **PASS** | Order → `PAID` / `COMPLETED` |
| Provider fulfillment + PIN | **PASS** | Card visible in `/api/v1/account/cards` |
| Email | **NOT VERIFIED** | Local SMTP sink — no inbox inspection in this run |
| In-app notification | **NOT RUN** | Throttle blocked follow-up customer session |
| Account history | **PASS** | Orders list shows completed CARD order |
| **Topup** — network / phone / amount | **SKIP** | Seed catalog has **no TOPUP variant** (CARD-only: Viettel/Garena/Zing) |
| Topup payment + provider + history | **NOT RUN** | Depends on TOPUP seed |
| **Support** — create ticket | **NOT RUN** | Throttle |
| Upload image + reply flow | **NOT RUN** | Manual UI not exercised in agent env |

---

## TASK 3 — Admin operation test

| Role | Result | Notes |
|------|--------|-------|
| SUPER_ADMIN — orders / order detail | **PASS** | 5-tab detail incl. fraud trace |
| SUPER_ADMIN — CMS pages `?take=1` | **FAIL*** | HTTP 400 — invalid query param (see BUG-6O-006) |
| SUPPORT | **NOT RUN** | Login throttle (5 req / 15 min on `/auth/login`) |
| MARKETING | **NOT RUN** | Throttle |
| ACCOUNTANT | **NOT RUN** | Throttle |
| ADMIN (non-super) | **NOT RUN** | Throttle |

\* **Not a product defect:** `ListCmsPagesQueryDto` only allows `type` and `status`; `take` triggers `forbidNonWhitelisted: true` → 400. Admin UI uses correct params.

**Static permission matrix (from `admin.security-audit.spec.ts` + seed):** SUPPORT → orders/payments read, no finance; MARKETING → CMS, no orders; ACCOUNTANT → finance, no customer PII manage — **PASS** (unit/spec level, not re-run live due to throttle).

| Module | API smoke | UI |
|--------|-----------|-----|
| Orders | **PASS** | Not manually browsed |
| Payments | **NOT RUN** | — |
| Customers | **NOT RUN** | — |
| Agents | **NOT RUN** | Partner dashboard API **PASS** |
| Products | **PASS** | 3 products public |
| CMS | **PARTIAL** | Theme/blog public **PASS**; admin list query issue above |
| Media | **NOT RUN** | — |
| Settings | **NOT RUN** | — |
| Finance | **NOT RUN** | — |
| Support tickets | **NOT RUN** | Route exists (Phase 6M) |

---

## TASK 4 — Provider test

| Scenario | CARD | TOPUP |
|----------|------|-------|
| Success | **PASS** (live regression) | **NOT RUN** (no seed variant) |
| Timeout + recovery | **PASS** (spec) | **PASS** (spec — `topup.service.spec.ts`) |
| Provider error | **PASS** (spec) | **PASS** (spec) |
| Manual retry | **PASS** (spec) | **PASS** (spec) |
| Worker restart recovery | **PASS** (spec + `/health/ready` workers OK) | **PASS** (spec) |

Mock eSale (`ESALE_USE_MOCK=true`) active in local-full stack.

---

## TASK 5 — Payment test

| Scenario | Result | Evidence |
|----------|--------|----------|
| SePay success | **PASS** | Regression — order PAID + fulfilled |
| SePay duplicate webhook | **PASS** (spec) | `payment.sepay-webhook.spec.ts`, `payment.final-audit.spec.ts` |
| SePay wrong amount | **PASS** (spec) | Rejected in payment service validation |
| SePay late payment | **PASS** (spec) | Manual review path in `payment.final-audit.spec.ts` |
| MegaPay callback + signature | **PASS** (spec) | `payment.final-audit.spec.ts` |
| MegaPay cancel | **PASS** (spec) | Failure webhook handling |

Live duplicate/wrong-amount webhooks not re-fired after regression (throttle).

---

## TASK 6 — Security audit

| Check | Result | Notes |
|-------|--------|-------|
| Secret exposure in repo | **PASS** | `.env.local-full` / `.env.production` gitignored; example uses placeholders |
| PIN exposure | **PASS** (spec) | Encrypted at rest; admin/customer mappers audited in security specs |
| Role bypass | **PASS** (spec) | `PermissionsGuard` + matrix in `admin.security-audit.spec.ts` |
| Customer ownership | **PASS** (spec) | Account routes scoped to JWT user |
| Agent ownership | **PASS** (spec) | Agent API HMAC + agent id scoping |
| Upload security | **PASS** | `media-upload.security.spec.ts` — MIME/size/path checks |

**Fixes applied in 6O** improve deploy safety (nginx uploads proxy, build integrity).

---

## TASK 7 — Performance check

| Check | Result | Notes |
|-------|--------|-------|
| Homepage Lighthouse | **NOT RUN** | No headless Chrome/Lighthouse in agent env |
| Image optimize | **PARTIAL** | Next.js image pipeline + CMS media resize (Phase 6F) — not re-profiled |
| Bundle size (web) | **PASS** | Docker build: shared ~102 kB; homepage ~122 kB First Load JS |
| Bundle size (admin) | **PASS** | Shared ~102 kB; heaviest route ~242 kB (CMS editor) |
| API latency | **PASS** (informal) | Health + regression under 15s incl. fulfillment poll |

**Recommendation before launch:** Run Lighthouse on production build with CDN; target LCP &lt; 2.5s on 4G.

---

## TASK 8 — Production checklist

| Item | Result | Reference |
|------|--------|-----------|
| ENV template complete | **PASS** | `.env.production.example` |
| ENV production filled | **UNKNOWN** | `.env.production` exists locally — **not audited** (secrets) |
| SMTP | **NOT VERIFIED LIVE** | Checklist §4 in `launch/PRODUCTION_CHECKLIST.md` |
| Backup plan | **PASS** (documented) | `docs/BACKUP_RESTORE_PLAN.md` |
| Uploads volume | **PASS** | `cardon_uploads` volume mounted API + worker |
| Nginx | **PASS** (config) | Production conf in `infra/nginx/conf.d/`; local UAT conf fixed |
| SSL docs | **PASS** (documented) | `infra/nginx/ssl/README.md` — certs not mounted (expected pre-launch) |
| `ESALE_USE_MOCK=false` in prod | **PASS** (enforced) | `production-env.rules.ts` |
| MegaPay + SePay production webhooks | **NOT TESTED** | Requires live merchant accounts |

---

## Automated regression summary

Script: `scripts/run-local-full-regression.mjs` (via nginx, in API container)

```
PASS: 20 / FAIL: 2 / 22 total (1 SKIP counted as PASS)
```

| Result | Area |
|--------|------|
| **PASS** | Health, catalog, CMS public, auth, CARD E2E, admin orders/detail, partner login/credentials/ledger |
| **FAIL** | CMS admin `?take=1` (invalid param — script bug) |
| **FAIL** | Partner API `POST /api/partner/v1/orders` — **wrong path**; correct: `POST /api/partner/v1/cards/buy` |
| **ABORT** | Role probes — login throttle after rapid logins |

---

## BUG LIST

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| BUG-6O-001 | **P0** | **FIXED** | Topup worker import paths broke API/worker Docker build |
| BUG-6O-002 | **P0** | **FIXED** | Duplicate FaqSection import broke customer web build |
| BUG-6O-003 | **P0** | **FIXED** | Missing nginx uploads snippet broke local-full nginx |
| BUG-6O-004 | **P2** | **FIXED** | Wrong path in `topup-phone.util.spec.ts` |
| BUG-6O-005 | **P2** | **OPEN** | Auth login throttle (5/15min) blocks automated UAT batches — use `@SkipThrottle` in staging or separate test throttle profile |
| BUG-6O-006 | **P3** | **OPEN** | Regression script uses invalid CMS query `?take=1` and obsolete partner path `/orders` |
| BUG-6O-007 | **P1** | **OPEN** | `seed-local-full.ts` has no TOPUP catalog variant — blocks topup UAT on local-full |
| BUG-6O-008 | **P3** | **KNOWN** | Next.js frontend containers report `unhealthy` while HTTP 200 (wget healthcheck) |

---

## LAUNCH BLOCKERS

| # | Blocker | Owner action |
|---|---------|--------------|
| **LB-1** | Production payment + provider credentials not end-to-end tested on VPS | Fill `.env.production`, register webhooks, smoke test 1 CARD + 1 TOPUP |
| **LB-2** | SSL / HTTPS not enabled on origin | Mount Cloudflare origin cert per `infra/nginx/ssl/README.md` |
| **LB-3** | TOPUP not validated in local-full UAT | Add TOPUP variant to seed OR import live catalog before go-live |
| **LB-4** | SMTP deliverability not verified | Send test mail (payment success, fulfillment failed, low balance) |
| **LB-5** | Legal CMS pages + catalog pricing review | `launch/cms/`, `launch/catalog/` per Phase 6C |

**Resolved during 6O (deploy these fixes):** BUG-6O-001, 002, 003, 004.

---

## Sign-off matrix

| Task | PASS | FAIL | PARTIAL |
|------|------|------|---------|
| 1 Clean rebuild | ✓ | | |
| 2 Customer journey | | | ✓ |
| 3 Admin operations | | | ✓ |
| 4 Provider | | | ✓ |
| 5 Payment | ✓ | | |
| 6 Security | ✓ | | |
| 7 Performance | | | ✓ |
| 8 Production checklist | | | ✓ |
| 9 Report | ✓ | | |

---

## Recommended pre-VPS commands

```powershell
cd C:\Users\MyHome\Projects\cardon

# If cardon-prod uses ports 80/5433, either stop prod OR use UAT override:
docker compose -f docker-compose.local-full.yml -f docker-compose.local-full.uat-override.yml --env-file .env.local-full down -v
docker compose -f docker-compose.local-full.yml -f docker-compose.local-full.uat-override.yml --env-file .env.local-full up -d --build
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts

# Regression (copy script into container first):
docker cp scripts/run-local-full-regression.mjs cardon-local-full-api:/app/scripts/
docker exec -e REGRESSION_BASE_URL=http://nginx cardon-local-full-api node /app/scripts/run-local-full-regression.mjs

# Unit tests (inside repo with prisma generate):
npx prisma generate && npm test
```

---

**Phase 6O complete — launch freeze in effect.** Further changes limited to bug / UX / security / performance fixes until VPS go-live.
