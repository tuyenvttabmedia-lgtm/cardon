# Phase 6O31.5 — Order Limit UX & Payment Strategy Architecture HOTFIX

**Build marker:** `6O31.5 HOTFIX`  
**Date:** 2026-06-18  
**Scope:** UX polish + admin configuration architecture only — no DB schema, Prisma, Payment Engine, Checkout Flow, or Provider Runtime changes.

---

## Summary

Final pre-UAT hotfix addressing two areas:

1. **Order limit alert UX** on checkout — alert now resets when order summary changes and auto-hides when total falls under limit.
2. **Payment gateway configuration architecture** — replaced monolithic `settings.payment.runtime` with per-gateway runtime + Primary/Failover strategy model.

---

## TASK 1 — Order Limit UX

### Problem

After exceeding the order amount limit, changing card type, denomination, carrier, data package, quantity, or payment method left the stale alert visible.

### Solution

**File:** `apps/web/components/checkout/CheckoutShell.tsx`

- `setOrderLimitError(null)` on every order-summary change handler:
  - Category, product, variant, carrier, quantity, payment method
- `useEffect` clears `orderLimitError` when `orderLimitPreview` becomes `null` (total ≤ limit)
- Derived state:
  - `activeOrderLimit = orderLimitPreview ?? orderLimitError` (realtime preview + backend confirm)
  - `isOverOrderLimit = Boolean(orderLimitPreview)`
- Payment button when over limit:
  - **Disabled**
  - Label: `Đơn hàng vượt quá giới hạn` or `Giảm số lượng để tiếp tục` (when quantity > 1)
  - No price suffix on disabled limit button

**File:** `apps/web/components/checkout/CheckoutSummaryPanels.tsx`

- `isOverOrderLimit` prop controls button disabled state and price display

### Verify

| Case | Expected |
|------|----------|
| Total > limit | Alert shows immediately (client preview) |
| Change product/variant/qty/payment | Alert resets; re-evaluates |
| Total ≤ limit after change | Alert disappears without reload |
| Pay button over limit | Disabled with limit message |
| Submit over limit | Backend still validates; structured `ORDER_AMOUNT_LIMIT` error |

---

## TASK 2–4 — Payment Strategy Architecture

### Before

Single JSON key `settings.payment.runtime` with `{ defaultGateway }`.

### After

```
Payment
├── Strategy (settings.payment.strategy)
│   ├── primaryGateway   → MEGAPAY
│   ├── failoverGateway  → SEPAY
│   └── defaultGateway   → MEGAPAY
├── Gateway Runtime (per gateway)
│   ├── settings.payment.gateway.megapay
│   └── settings.payment.gateway.sepay
└── Credentials (unchanged)
    ├── settings.payment.megapay
    └── settings.payment.sepay
```

Each gateway runtime stores: `enabled`, `priority`, `displayName`, `percentageFee`, `fixedFee`.

**Migration:** Reads legacy `settings.payment.runtime.defaultGateway` when strategy key is absent. No migration file.

### New API Endpoints (admin)

| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/admin/settings/payment/strategy` | Primary / Failover / Default |
| GET/PUT | `/admin/settings/payment/gateways/:code/runtime` | Per-gateway runtime metadata |
| GET/PUT | `/admin/settings/payment/runtime` | **Deprecated alias** → strategy.defaultGateway |

### Admin UI

**File:** `apps/admin/app/settings/payment/page.tsx`

- **Payment Strategy** card: Primary ↓ MegaPay, Failover ↓ SePay, Default Gateway selector
- **MegaPay** + **SePay** credential forms (unchanged)
- **Coming Soon** list (PayOS, MoMo, ZaloPay, VNPay) — no forms

---

## TASK 5–7 — Coming Soon & Health Check

### Coming Soon

- Bullet list under “Coming Soon (Dự kiến hỗ trợ)”
- No red badge, no warning, no runtime validation, no configuration required
- Removed NowPayments from MVP coming-soon list (4 gateways per spec)

### Health Check

**File:** `src/modules/admin/services/operations-health-collector.service.ts`

Active gateways (MegaPay, SePay) only receive real checks:

- ✓ Enabled
- ✓ Primary Gateway / ✓ Secondary Gateway (from strategy)
- ✓ API OK
- ✓ Secret Protected
- Last Check timestamp

Coming Soon gateways: **Coming Soon badge only** — no checks, no warnings, no errors, no health score impact.

---

## TASK 6 — Runtime Configuration UX

Continues Phase 6O31.4 pattern:

- **Secrets · Được bảo vệ**
- **Runtime Configuration · Quản lý trong hệ thống**
- Source (ENV/Database) visible only in Developer Mode (`NEXT_PUBLIC_SETTINGS_DEVELOPER_MODE=true`)

---

## Files Changed

| Area | Files |
|------|-------|
| Order limit UX | `CheckoutShell.tsx`, `CheckoutSummaryPanels.tsx` |
| Payment strategy backend | `settings.constants.ts`, `payment-gateway.strategy.ts`, `settings-store.service.ts`, `settings-admin.service.ts`, `settings-admin.controller.ts`, `settings.dto.ts` |
| Health check | `operations-health-collector.service.ts`, `operations-health.types.ts` |
| Admin UI | `payment/page.tsx`, `payment-gateway.strategy.ts`, `api-client.ts`, `types/api.ts`, `vi.ts` |
| Build marker | `build-version.ts` (admin/web), `configuration.ts`, `docker-compose.local-full.yml`, `system-health.service.ts` |

---

## Build & Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build --no-cache api admin web worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

**URLs:**

- Admin: http://admin.localhost/settings/payment
- Checkout: http://localhost/checkout
- Health: http://admin.localhost/settings/health

---

## Future Extension

Architecture supports adding gateways (Stripe, Coinbase Commerce, Binance Pay, Apple Pay, Google Pay) by:

1. Adding gateway code to strategy types
2. Adding `settings.payment.gateway.{code}` runtime key
3. Adding credential key if needed
4. No changes to strategy model (Primary / Failover / future Load Balance / Round Robin)

Payment Engine and checkout flow remain untouched until explicit integration phase.

---

## Constraints Respected

- ✅ No database schema / Prisma / migration
- ✅ No Payment Engine changes
- ✅ No Checkout Flow / Provider Runtime changes
- ✅ Backend order limit validation unchanged
- ✅ Strategy is configuration-only (not wired into payment routing yet)
