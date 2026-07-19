# Phase 6I — Manual Test Findings

**Date:** 2026-06-21  
**Stack:** `cardon-prod-*` (local production simulation via nginx on port 80)  
**Reset command used:** `docker exec cardon-prod-api node --experimental-strip-types /app/scripts/reset-local-admin.ts`

---

## Summary

| Area | Status |
|------|--------|
| SUPER_ADMIN login (`superadmin@cardon.vn` / `SuperAdmin2026!`) | **Fixed & verified** |
| Customer login (`customer@test.local` / `LocalTest2026!`) | **Fixed & verified** |
| Partner login (`agent@test.local` / `LocalTest2026!`) | **Fixed & verified** |
| Admin UI pages (HTTP 200 shell) | **Pass** |
| Admin API (authenticated) | **Pass** |
| Customer / Partner API (authenticated) | **Pass** |

---

## Fixes Applied (Phase 6I)

1. **`scripts/create-admin-local.ts`**
   - Default password aligned to `SuperAdmin2026!` (was `ChangeMe123!`).
   - Added missing RBAC permissions: `customers.read`, `customers.manage`, `users.manage`, `cards.reveal`.
   - Updated `ADMIN` / `SUPPORT` role matrices to match `prisma/seed.mjs`.
   - Exported `ensurePermissions` / `ensureSuperAdmin` for reuse.

2. **`prisma/seed.mjs`**
   - Default `SEED_SUPER_ADMIN_PASSWORD` aligned to `SuperAdmin2026!`.

3. **`.env.local-production`**
   - `LOCAL_ADMIN_PASSWORD=SuperAdmin2026!`.

4. **`scripts/reset-local-admin.ts`** (new)
   - Resets SUPER_ADMIN password, ACTIVE status, full RBAC.
   - Upserts portal test accounts: `customer@test.local`, `agent@test.local` (+ agent profile/KYC).

5. **`package.json`**
   - Added `"reset:local-admin": "node --experimental-strip-types scripts/reset-local-admin.ts"`.

6. **`scripts/run-e2e-smoke.mjs`**
   - Login payload uses `identifier` (was `email` → 400/401 on auth API).

---

## Manual UI Checklist

### Admin (`http://admin.localhost`)

| Page | Route | HTTP | API backing | Notes |
|------|-------|------|-------------|-------|
| Login | `/login` | 200 | `POST /api/v1/auth/login` | Form uses `identifier` via api-client ✅ |
| Dashboard | `/dashboard` | 200 | `GET /admin/dashboard` | 200 ✅ |
| Orders | `/orders` | 200 | `GET /admin/orders?take=50` | 200 ✅ |
| Products | `/products` | 200 | `GET /admin/products` | 200 ✅ |
| CMS (Articles) | `/marketing/articles` | 200 | `GET /admin/cms/pages` | 200 ✅ |
| SEO | `/marketing/seo` | 200 | `GET /admin/cms/seo-settings` | 200 ✅ |
| Media | `/marketing/media` | 200 | `GET /admin/cms/media` | 200 ✅ |
| Settings | `/settings/payment` | 200 | `GET /admin/settings/system` | 200 ✅ |
| Staff | `/staff` | 200 | `GET /admin/staff` | 200 ✅ |

SUPER_ADMIN permissions after reset: **24** (includes `users.manage`, `customers.read`, `cms.manage`, `admin.dashboard`).

### Customer (`http://localhost`)

| Page | Route | HTTP | API backing | Notes |
|------|-------|------|-------------|-------|
| Homepage | `/` | 200 | `GET /products/categories` | 200 ✅ |
| Account | `/account` | 200 | Client auth gate | Shell loads; login required in browser |
| Checkout | `/checkout` | 200 | — | Shell loads |

### Partner (`http://partner.localhost`)

| Page | Route | HTTP | API backing | Notes |
|------|-------|------|-------------|-------|
| Dashboard | `/dashboard` | 200 | `GET /agents/me` | 200 ✅ |
| API Keys | `/api-keys` | 200 | `GET /agents/me/credentials` | 200 ✅ |

**Login verification:** All three accounts authenticate via API through nginx (`admin.localhost`, `127.0.0.1`) without hard refresh. Admin login page renders correctly; session flow uses `identifier` + `/auth/me` for permissions.

---

## Bug Register

| ID | Bug | Severity | Status | Notes |
|----|-----|----------|--------|-------|
| 6I-01 | SUPER_ADMIN password mismatch: docs/tests expect `SuperAdmin2026!`, bootstrap used `ChangeMe123!` | **Critical** | **Fixed** | `create-admin-local`, `seed.mjs`, `.env.local-production` |
| 6I-02 | SUPER_ADMIN missing RBAC permissions (`customers.read`, `users.manage`, etc.) on prod-sim bootstrap | **High** | **Fixed** | Staff/Customers nav hidden before fix |
| 6I-03 | Portal test accounts missing on prod-sim stack (`customer@test.local`, `agent@test.local`) | **High** | **Fixed** | `reset-local-admin.ts` upserts accounts |
| 6I-04 | No one-command local admin reset before Phase 6I | **Medium** | **Fixed** | `npm run reset:local-admin` |
| 6I-05 | `run-e2e-smoke.mjs` sends `{ email }` instead of `{ identifier }` on login | **Medium** | **Fixed** | Broke automated smoke login |
| 6I-06 | Auth login throttle (5 req / 15 min per IP) blocks batch login tests → 429 | **Medium** | **Open** | Restart `cardon-prod-api` to clear in-memory limiter; consider higher limit for `APP_ENV=development` |
| 6I-07 | RBAC permission cache TTL 60s — `/auth/me` may return stale permissions briefly after reset | **Low** | **Open** | Wait ≤60s or restart API after permission changes |
| 6I-08 | Reset script changes on host not in running Docker image until rebuild or `docker cp` | **Low** | **Open** | Workaround: `docker cp scripts/*.ts cardon-prod-api:/app/scripts/` before exec |
| 6I-09 | Windows host has no `npm` in PATH — `npm run reset:local-admin` must run inside container or after Node install | **Low** | **Open** | Use `docker exec cardon-prod-api node --experimental-strip-types /app/scripts/reset-local-admin.ts` |
| 6I-10 | SMTP still uses invalid sim host — test email in Admin Settings will fail | **Medium** | **Open** | Expected on local prod sim; not a login blocker |
| 6I-11 | eSale credentials invalid PEM — fulfillment uses mock provider | **Medium** | **Open** | Expected on local prod sim |
| 6I-12 | Partner API secret key not shown after reset (encrypted at rest) — user must use admin KYC flow or re-run `seed-local-full` for one-time creds file | **Low** | **Open** | API Keys page loads; credentials status 200 |

---

## How to Reset Local Admin (post-deploy)

**Inside running API container (recommended on Windows):**

```bash
docker exec cardon-prod-api node --experimental-strip-types /app/scripts/reset-local-admin.ts
```

**From project root (requires Node 22+):**

```bash
npm run reset:local-admin
```

**Credentials after reset:**

| Portal | Email | Password |
|--------|-------|----------|
| Admin | `superadmin@cardon.vn` | `SuperAdmin2026!` |
| Customer | `customer@test.local` | `LocalTest2026!` |
| Partner | `agent@test.local` | `LocalTest2026!` |

---

## Verdict

**Local admin / customer / partner login: PASS** after Phase 6I fixes.  
Remaining open items are environmental (SMTP, eSale, throttling, Docker script sync) — not blockers for manual UI acceptance of the three portals.
