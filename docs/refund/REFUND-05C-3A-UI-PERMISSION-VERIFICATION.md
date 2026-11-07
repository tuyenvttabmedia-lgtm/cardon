# REFUND-05C-3A — UI & Permission Verification (READ-ONLY)

**Date:** 2026-11-04  
**Environment:** localhost only — Compose project `cardon-local-full`  
**Verdict:** **PARTIAL**

## 1. Runtime / containers checked

| Container | Image ID | Health / status | Notes |
|---|---|---|---|
| `cardon-local-full-api` | `sha256:c4398f0e7dcb425c434a889340bd7c1a60b269f40a992cc9e08253922293ae1d` | healthy | Matches `cardon-api:local-full` from REFUND-05C-2V |
| `cardon-local-full-admin` | `sha256:efbbff766c1e1ae1ecee68ac86422924ea4907594757ff58dbb1e12297dcd4ad` | healthy | Matches `cardon-admin:local-full` from REFUND-05C-2V |
| `cardon-local-full-worker` | `sha256:14ef906cefc6b041a0f041c44171bcea5e6acc743eb2f8f13536aad8a062ae29` | running | Still old image; not recreated (expected) |

- Compose file: `docker-compose.local-full.yml`
- Env file: `.env.local-full`
- API `/health/ready` (in-container): **200** `{"app":"ok","database":"ok","redis":"ok","workers":"ok","ready":true}`
- No rebuild / recreate / restart performed in this ticket.

## 2. Admin URLs checked

| URL | Result |
|---|---|
| `http://admin.localhost/refunds` | **200** HTML shell served. Browser (no session) redirected to `http://admin.localhost/login`. SSR markers: title `CardOn Quản trị`, chunk `app/refunds/page-*.js`, `AuthGuard`, loading text `Đang tải...`. |
| `http://admin.localhost/refunds/00000000-0000-4000-8000-000000000001` | **200** HTML shell. Chunk `app/refunds/%5Bid%5D/page-*.js` present. No authenticated render (same AuthGuard). No live refund row exists in DB (`refund_requests=0`), so authenticated detail empty/error states were **not** observed. |
| `http://admin.localhost/login` | Login form renders (`Email`, `Mật khẩu`, `Đăng nhập`). No password attempted beyond one seed-env login attempt via API (failed; see §6). |

**Observed without session**

- Auth gate works: `/refunds` → login.
- Route registration works: list + detail bundles exist in the running Admin image.
- Authenticated empty state, filter apply, action button visibility, and JS runtime after login: **not verified live**.

**Source-backed UI expectations (not live-clicked)**

- List gated by `RequireAnyPermission([...REFUND_READ_PERMISSIONS])`.
- Create button only if `can('refund.request')`.
- Filters present in source: `q`, `orderId`, `paymentId`, request/attempt status, `esimGate`, date range, `needsAction`.
- Detail actions from `visibleRefundActions(...)` — unit tests **9/9 PASS**.
- Detail shows masked `destinationHint` only; audit metadata uses `sanitizeRefundAuditMetadata`; list/detail mappers strip `gatewayResponse` / secret-like keys.

## 3. GET APIs checked

| Call | Auth | Status | Body / notes |
|---|---|---|---|
| `GET /api/v1/admin/refund-requests` | none | **401** | `Unauthorized` |
| `GET /api/v1/admin/refund-requests/:id` (valid UUID, nonexistent) | none | **401** | Auth runs before NotFound |
| `GET /api/v1/admin/refund-requests/not-a-uuid` | none | **401** | Auth before ParseUUIDPipe |
| `GET /api/v1/admin/refund-requests` | seed SUPER_ADMIN | **not verified** | Login with `SEED_SUPER_ADMIN_PASSWORD` from `.env.local-full` → **401 Invalid email or password**. No further password attempts; no reset. |
| `GET /api/v1/admin/refund-requests/:id` with token | — | **not verified live** | Source: `NotFoundException('Refund request not found')` → expected **404** when authenticated and id missing. |
| Authenticated empty list | — | **not verified live** | Source returns `{ items, total, skip, take }`; DB currently `total` would be 0. |

Controller guards (source):

- Class: `@UseGuards(JwtAuthGuard, PermissionsGuard)`
- List/detail: `@Permissions(REFUND_REQUEST, REFUND_APPROVE, REFUND_EXECUTE, REFUND_RECONCILE)` — OR via `roleHasAnyPermission`
- Service also calls `requireAnyRefundPermission` again for list/detail

No POST/PUT/PATCH/DELETE refund calls were made.

## 4. Results by role / permission

### 4.1 Database RBAC (live SELECT, unchanged)

| Permission | Roles |
|---|---|
| `refund.request` | SUPPORT, ACCOUNTANT, ADMIN, SUPER_ADMIN |
| `refund.approve` | ACCOUNTANT, ADMIN, SUPER_ADMIN |
| `refund.execute` | ACCOUNTANT, ADMIN, SUPER_ADMIN |
| `refund.reconcile` | ACCOUNTANT, SUPER_ADMIN |

Matches REFUND-05B matrix. **12** role_permission rows.

### 4.2 Active staff users in local DB

| Role | Present? | Notes for this ticket |
|---|---|---|
| SUPER_ADMIN | yes (`superadmin@cardon.vn`) | Seed password from env **does not** authenticate |
| ADMIN | yes (`system@cardon.local`) | Audit/system actor; password not used |
| ACCOUNTANT | yes (`maint@keyon.vn`) | No usable test token without reset/guess |
| SUPPORT | **no** | Cannot live-test SUPPORT-only UI |

### 4.3 UI / API permission matrix

| Check | Evidence | Live? |
|---|---|---|
| List/detail require any of 4 refund permissions | Controller `@Permissions` + service `requireAnyRefundPermission` + UI `RequireAnyPermission` | Source yes / live auth no |
| Create button needs `refund.request` | `apps/admin/app/refunds/page.tsx` | Source yes |
| Approve / cancel / execute / complete / fail / unconfirm / reconcile gated | `visibleRefundActions` + unit tests | Unit yes / live UI no |
| Nav `/refunds` for ACCOUNTANT & SUPPORT | `apps/admin/lib/permissions.ts` | Source yes |
| 403 without refund permission | `PermissionsGuard` → `ForbiddenException('Insufficient permissions')`; UI amber 403 panel | Source yes / live no (no non-refund staff session) |

## 5. UI states observed

| State | Observed? |
|---|---|
| Unauthenticated → login redirect | **Yes** (browser) |
| Loading shell (`Đang tải...`) in SSR HTML | **Yes** |
| Authenticated empty list (`TableEmpty` / noData) | **No** — no session |
| Authenticated error banner | **No** |
| Filter controls interactive | **No** |
| Detail not-found (`vi.refunds.notFound` on 404) | **No** live; source handles `err.status === 404` |
| Action buttons by role | **No** live; unit matrix PASS |
| Sensitive leak in guest HTML | **None observed** (no LPA/PIN/gateway payload in refund shells) |

## 6. Not verified (missing usable token / data)

1. Authenticated `GET` list/detail responses (shape, empty list, sanitization).
2. Live **404** for missing refund id (blocked by 401 without token).
3. Live **403** for authenticated user lacking all refund permissions.
4. Role matrix in browser: SUPPORT / ACCOUNTANT / ADMIN / SUPER_ADMIN button visibility.
5. Detail page with real `refund_requests` row — table count is **0**; ticket forbids creating refunds.
6. Filter/search apply against real data.
7. Password for existing staff: `SEED_SUPER_ADMIN_PASSWORD` from `.env.local-full` rejected; did **not** reset password, create users, or guess further credentials.

## 7. Issues found

| Severity | Finding | Cause / note |
|---|---|---|
| Blocker for live auth QA | Cannot log in with seed env password for `superadmin@cardon.vn` | Local password hash out of sync with `.env.local-full` (user `updated_at` 2026-10-23). Out of scope to reset in 05C-3A. |
| Gap | No SUPPORT user; no refund fixture rows | Limits role UI and detail empty/error observation |
| Info | API cron log shows Airalo catalogue sync during window | Background API cron — **not** invoked by this ticket’s HTTP calls. No refund payout / SePay / PayPal / MegaPay calls from this verification. |

No source defect was proven against the running Refund list/detail routes. Guest/API-unauth path behaves as designed (401 / login redirect).

## 8. Safety confirmation

| Constraint | Status |
|---|---|
| Localhost `cardon-local-full` only | Yes |
| No production / SSH | Yes |
| No container rebuild / recreate / restart | Yes |
| No migration / seed / RBAC change | Yes |
| No refund request/attempt create | Yes (`refund_requests=0`, `refund_attempts=0` before and after) |
| No approve/execute/complete/fail/unconfirm/reconcile | Yes |
| No payout / money movement | Yes |
| No intentional SePay / PayPal / Airalo / MegaPay refund calls | Yes |
| No eSIM LPA/QR reveal | Yes |
| Orders / payments / ledger counts unchanged | Yes — payments **85**, orders **85**, ledger_entries **2** |
| No commit / reset / checkout / stash | Yes |
| No source edits | Yes (report-only) |

## 9. Conclusion

**PARTIAL**

**Pass subset**

- Runtime images match REFUND-05C-2V; API/Admin healthy.
- Unauthenticated refund GET APIs return **401** (not 404).
- Admin `/refunds` and `/refunds/[id]` routes are served by the new Admin image and protected by AuthGuard.
- DB refund RBAC matrix matches the approved four-permission mapping.
- UI permission helper unit tests pass; source guards align with OR-any refund permission for reads.

**Incomplete subset**

- Authenticated UI/API behaviour by role, empty/error detail states, and 403/404 live paths need a usable local staff session (password realignment or owner-provided token) and optionally a fixture refund row created under a later write-allowed ticket (e.g. REFUND-05C-3B+), not this read-only step.

## 10. Suggested next steps (separate tickets)

1. Owner confirms or resets local SUPER_ADMIN / ACCOUNTANT passwords against `.env.local-full` (or supplies a short-lived token) — **no agent guess/reset in 05C-3A**.
2. REFUND-05C-3B (or similar): authenticated read smoke with SUPER_ADMIN — empty list, fake-id 404, confirm sanitized payload.
3. Optional fixture refund for detail UI — only when write operations are explicitly approved; still avoid provider payouts until execute tickets.
4. Do **not** treat this PARTIAL as a source bug in Refund 04D routes; activation (05C-2V) remains intact.
