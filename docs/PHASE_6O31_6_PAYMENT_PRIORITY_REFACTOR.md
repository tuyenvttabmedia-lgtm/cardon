# Phase 6O31.6 — Payment Priority Refactor & Version Health HOTFIX

**Build marker:** `6O31.6 HOTFIX`  
**Date:** 2026-06-18

---

## Summary

Refactored Payment Strategy from Primary/Failover to **Gateway Priority** model, and added **System Version Health** across API, WEB, ADMIN, and WORKER services.

No changes to Payment Engine, Checkout Flow, Provider Adapter, or Prisma schema.

---

## Gateway Priority Architecture

### Removed

- Primary Gateway
- Failover Gateway
- `primaryGateway` / `failoverGateway` persistence (read-only for migration)

### New Model

Each active gateway stores runtime in existing JSON keys:

| Key | Fields |
|-----|--------|
| `settings.payment.gateway.sepay` | `enabled`, `priority`, `displayName`, fees |
| `settings.payment.gateway.megapay` | `enabled`, `priority`, `displayName`, fees |

**Default priority:**

| Priority | Gateway |
|----------|---------|
| 1 | SePay |
| 2 | MegaPay |

**Rule:** Lower priority number = higher precedence.

### Runtime Selection Flow

```
Enabled gateways
    ↓
Sort by priority ASC
    ↓
Try gateway #1 → timeout/fail → gateway #2 → … → Pending Review
```

Implemented in `SettingsStoreService`:

- `resolveOrderedPaymentGateways()`
- `resolvePaymentGatewaySelectionOrder()`
- `resolveDefaultPaymentGateway()` → lowest priority enabled gateway

Payment Engine is **not** modified — selection order is available for future wiring via settings layer.

---

## Validation Rules

Server + client validation (`validateGatewayPriorities`):

| Rule | Message |
|------|---------|
| Empty priority | Priority không được để trống. |
| Priority ≤ 0 | Priority phải lớn hơn 0. |
| Duplicate priority | Priority đã được sử dụng bởi Gateway khác. |

---

## Backward Compatibility

### Legacy Primary/Failover (6O31.5)

If DB contains:

```json
{ "primaryGateway": "MEGAPAY", "failoverGateway": "SEPAY" }
```

Migration on read:

- MegaPay → Priority **1**
- SePay → Priority **2**

### Legacy `settings.payment.runtime`

If `{ "defaultGateway": "MEGAPAY" }`:

- MegaPay → Priority **1**
- SePay → Priority **2**

### API alias `/admin/settings/payment/runtime`

Still works:

- `PUT { defaultGateway: "MEGAPAY" }` → MegaPay priority=1, SePay priority=2
- Engine interprets MegaPay as first without Primary/Failover code

---

## Admin UI

**Settings → Payment**

- **Gateway Priority** card with ① SePay, ② MegaPay
- Enabled checkbox + Priority input (+/−)
- No Primary/Failover selectors
- MegaPay / SePay credential forms unchanged
- Coming Soon block unchanged (no priority, no health impact)

---

## Payment Health

**Settings → System Health → Payment Strategy**

```
① SePay — Enabled — Healthy
② MegaPay — Enabled — Healthy
```

Coming Soon gateways: badge only, no checks, no score impact.

---

## System Version Health

New `SystemVersionService` collects:

| Field | Source |
|-------|--------|
| Build | `BUILD_VERSION` env |
| Database Migration | `_prisma_migrations` count |
| API | `BUILD_VERSION` |
| WEB | HTML comment `<!-- CardOn build X -->` via `WEB_INTERNAL_URL` |
| ADMIN | HTML comment via `ADMIN_INTERNAL_URL` |
| WORKER | Redis `cardon:worker:buildVersion` (set on heartbeat) |
| Git Commit | `GIT_COMMIT` env (optional) |
| Deploy Time | `DEPLOY_TIME` env (optional) |

**Version mismatch:** yellow badge when any service version ≠ canonical build.

Displayed in:

- Settings → System Health (System Version block)
- Dashboard → System Health widget

---

## Future Gateway Expansion

Add gateway by:

1. Extend `MvpPaymentGatewayCode` / active gateway list
2. Add `settings.payment.gateway.{code}` runtime key
3. Assign unique priority integer
4. No architecture change required

Planned: Stripe, Coinbase Commerce, Binance Pay, Apple Pay, Google Pay.

---

## Files Changed

| Area | Key files |
|------|-----------|
| Priority core | `payment-gateway-priority.ts`, `settings-store.service.ts`, `settings-admin.service.ts` |
| Health | `operations-health-collector.service.ts`, `system-version.service.ts` |
| Worker version | `worker-heartbeat.service.ts` |
| Admin UI | `payment/page.tsx`, `health/page.tsx`, `dashboard/page.tsx` |
| Build | `build-version.ts`, `docker-compose.local-full.yml`, `configuration.ts` |

---

## Verify

### Payment Settings (`/settings/payment`)

- [ ] No Primary / Failover UI
- [ ] SePay Priority = 1, MegaPay = 2 by default
- [ ] Can change priority; duplicate blocked
- [ ] Swap to MegaPay=1, SePay=2 → runtime alias treats MegaPay as first

### Health (`/settings/health`)

- [ ] System Version block with Build, Migration, API/WEB/ADMIN/WORKER
- [ ] Payment Strategy shows priority order
- [ ] Version mismatch badge when services diverge

### Dashboard

- [ ] System Health widget shows Current Version + services status

---

## Build & Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

Build marker: **6O31.6 HOTFIX**
