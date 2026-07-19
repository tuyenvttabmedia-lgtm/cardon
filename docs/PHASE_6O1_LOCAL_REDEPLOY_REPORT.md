# Phase 6O.1 — Local Full Redeployment Report

**Date:** 2026-06-22  
**Goal:** Rebuild and redeploy full CardOn stack on localhost for owner manual testing.  
**Constraint:** No new features — rebuild, migrate, seed, runtime wiring fixes only.

---

## Summary

| Item | Status |
|------|--------|
| Stop old stacks | **PASS** — `cardon-prod-*` and `cardon-local-full-*` removed |
| Clean rebuild | **PASS** — all images rebuilt, stack on port **80** |
| Migrations (15) | **PASS** — includes 6F, 6L, 6M |
| Seed + TOPUP catalog | **PASS** — 6 CARD + 3 TOPUP variants |
| Service health | **PASS** — API, worker, nginx, frontends |
| Smoke test (API) | **PASS** — CARD + TOPUP fulfillment, admin/partner login |

**Localhost is ready for manual testing.**

---

## URLs

| App | URL | HTTP |
|-----|-----|------|
| Customer web | http://localhost | 200 |
| Admin | http://admin.localhost | 200 |
| Partner | http://partner.localhost | 200 |
| API | http://localhost/api/v1 | via nginx |
| Health | http://localhost/health | ok |
| Ready | http://localhost/health/ready | ready: true |
| Uploads | http://localhost/uploads/{path} | nginx → API (proxy configured) |

**Hosts file:** ensure `127.0.0.1 admin.localhost partner.localhost`

---

## Test accounts

| Role | Email | Password |
|------|-------|----------|
| SUPER_ADMIN | superadmin@cardon.vn | SuperAdmin2026! |
| CUSTOMER | customer@test.local | LocalTest2026! |
| AGENT | agent@test.local | LocalTest2026! |
| SUPPORT | support@test.local | LocalTest2026! |
| MARKETING | marketing@test.local | LocalTest2026! |
| ACCOUNTANT | accountant@test.local | LocalTest2026! |

Agent API keys are regenerated each seed run — see container file `/app/scripts/.local-full-credentials.json`.

---

## Seed catalog

### CARD (100k)

| SKU | Product |
|-----|---------|
| VIETTEL-100K | Viettel Card |
| GARENA-100K | Garena Card |
| ZING-100K | Zing Card |

### TOPUP (50k)

| SKU | Network | Provider code |
|-----|---------|---------------|
| VIETTEL-TOPUP-50K | Viettel | `viettel:50000` |
| MOBIFONE-TOPUP-50K | Mobifone | `mobi:50000` |
| VINAPHONE-TOPUP-50K | Vinaphone | `vina:50000` |

---

## TASK 1 — Stop old containers

Stopped and removed:

- `cardon-prod-*` (production simulation stack)
- `cardon-local-full-*` (previous UAT stack on :8080)

Volumes **kept** (postgres/redis/uploads data preserved — safe with upsert seed).

Port **80** freed after prod stack down. No conflicts on 80, 5433, 8080 after redeploy.

---

## TASK 2 — Rebuild

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
```

| Service | Image | Status |
|---------|-------|--------|
| api | cardon-api:local-full | healthy |
| worker | cardon-api:local-full | healthy |
| web | cardon-web:local-full | running (healthcheck wget*) |
| admin | cardon-admin:local-full | running |
| partner | cardon-partner:local-full | running |
| nginx | nginx:1.27 | healthy |
| postgres | postgres:16 | healthy |
| redis | redis:7 | healthy |

\*Next.js containers may show `unhealthy` while HTTP returns 200 — known limitation.

---

## TASK 3 — Migrations

```
15 migrations found — Database schema is up to date!
```

| Migration | Phase |
|-----------|-------|
| `20250621120000_phase_6f_cms_completion` | 6F CMS |
| `20250621160000_cms_media_library` | 6F media |
| `20250621180000_phase_6l_contact_messages` | 6L contact |
| `20250621200000_phase_6m_support_tickets` | 6M support |

Topup persistence is in init schema + Phase 6N code (no separate migration file).

`prisma generate` runs at API image build time.

---

## TASK 4 — Seed

```powershell
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts
```

**Change in 6O.1:** Added TOPUP catalog (BUG-6O-007 fix from Phase 6O UAT).

---

## TASK 5 — Service verification

| Check | Result |
|-------|--------|
| `/health` | app, database, redis ok |
| `/health/ready` | workers ok |
| `ProviderWorker` | ready |
| `TopupWorker` | registered for `topup_queue` |
| `NotificationWorker` | processing jobs |
| Customer / Admin / Partner HTTP | all **200** |

---

## TASK 6 — Uploads / media

| Item | Status |
|------|--------|
| Nginx `uploads-proxy.conf` | **PASS** — present in `conf.d.local/snippets/` |
| `/uploads/` proxy | Configured → `cardon_api/uploads/` |
| Admin media upload UI | **Manual** — upload via Admin → Marketing → Media |

Empty uploads volume returns 404 on `/uploads/` root — expected until first upload.

---

## TASK 7 — Smoke test (API)

Automated smoke (inside stack, mock eSale + SePay webhook):

| Test | Result |
|------|--------|
| Customer login | PASS |
| Buy GARENA-100K + SePay | PASS → PIN in account |
| TOPUP MOBIFONE-50K + SePay | PASS → fulfillment COMPLETED |
| Admin login + CMS pages | PASS |
| Admin settings | PASS |
| Partner dashboard | PASS |

---

## TASK 8 — Runtime fixes applied

| Fix | File |
|-----|------|
| TOPUP seed catalog (6O.1) | `scripts/seed-local-full.ts` |
| Nginx uploads snippet (from 6O) | `infra/nginx/conf.d.local/snippets/uploads-proxy.conf` |
| Topup worker imports (from 6O) | `src/modules/provider/workers/topup.worker.ts` |
| Web build duplicate import (from 6O) | `apps/web/components/contact/ContactPageClient.tsx` |
| Jest reflect-metadata (from 6O) | `jest.config.js` |

No payment, provider, or ledger logic changed.

---

## Known issues (non-blocking for local manual test)

| Issue | Impact | Workaround |
|-------|--------|------------|
| SMTP host `smtp.local-test.invalid` | Email not delivered locally | Expected — check notification bell in-app |
| Next.js Docker healthcheck | Container shows unhealthy | Ignore if HTTP 200 |
| Auth login throttle (5 / 15 min) | Rapid automated login batches fail | Wait 15 min or test manually in browser |
| `cardon-prod` stack stopped | Production simulation offline | Restart with `docker compose -f docker-compose.production.yml --env-file .env.production up -d` when needed |

---

## Quick start (owner)

```powershell
# Stack should already be running. If not:
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d

# Re-seed anytime:
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts

# Open in browser:
#   http://localhost          — customer
#   http://admin.localhost    — admin
#   http://partner.localhost  — partner
```

Login as **customer@test.local** / **LocalTest2026!** → buy card or nạp cước.

---

**Phase 6O.1 complete — localhost operational.**
