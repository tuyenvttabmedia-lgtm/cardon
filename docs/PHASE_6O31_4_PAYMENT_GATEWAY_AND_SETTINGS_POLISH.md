# Phase 6O31.4 HOTFIX — Payment Gateway Strategy & Settings UX Polish

Build marker: **6O31.4 HOTFIX**

## Scope

UX and runtime configuration polish only. No database schema changes, no migrations, and no changes to Payment Engine, Checkout flow, Provider runtime, Product Engine, CMS, or Marketing business logic.

## Delivered

### 1. Order amount limit message (TASK 1)

- API returns structured error `ORDER_AMOUNT_LIMIT` with `limit` and `current` (integer VND).
- Web checkout displays full message with formatted amounts (`10.000.000 đ`) via `OrderAmountLimitAlert`.
- Client-side preview uses the same component before submit.

**Endpoint behavior:** `POST /api/v1/orders` → HTTP 400

```json
{
  "success": false,
  "error": {
    "code": "ORDER_AMOUNT_LIMIT",
    "message": "Đơn hàng vượt quá giới hạn.",
    "limit": 10000000,
    "current": 11000000
  }
}
```

### 2. Payment gateway strategy MVP (TASK 2–3)

- **Active MVP gateways:** MegaPay (Primary), SePay (Secondary).
- **Coming Soon:** PayOS, VNPay, MoMo, ZaloPay, NowPayments — adapters/interfaces preserved.
- Admin **Settings → Payment** shows only MegaPay + SePay configuration forms.
- Coming Soon section lists future gateways without secret fields or runtime config.

Constants: `src/modules/settings/entities/payment-gateway.strategy.ts`

### 3. Default Payment Gateway (TASK 4)

- Runtime key: `settings.payment.runtime` (JSON in existing `system_setting` table — no migration).
- Admin UI: **Default Payment Gateway** selector (MegaPay / SePay active; others disabled Coming Soon).
- API:
  - `GET /admin/settings/payment/runtime`
  - `PUT /admin/settings/payment/runtime`

### 4. Payment health check (TASK 5)

- Operations dashboard lists MegaPay + SePay with role, enabled, secrets protected, API status, last check.
- Coming Soon gateways show badge only — **no ERROR** for unused gateways.

### 5. Runtime configuration UX (TASK 6–7)

- Replaced visible **Nguồn: ENV** with:
  - **Secrets: Được bảo vệ (Protected Secrets)**
  - **Runtime: Quản lý trong hệ thống (Runtime Configuration)**
- Developer mode (`NEXT_PUBLIC_SETTINGS_DEVELOPER_MODE=true` on localhost) shows actual source (Database/ENV).
- Provider settings: runtime badges + balance threshold, priority (mapping-level), maintenance status.

## Verify checklist

- Order over limit shows limit + current + guidance (checkout).
- Settings pages no longer show **Nguồn: ENV** (unless developer mode).
- Payment settings: MegaPay + SePay only; Coming Soon section present.
- Default gateway saves via runtime settings.
- Health check: no ERROR on Coming Soon gateways.

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d api admin web
```

- Admin: http://admin.localhost/settings/payment
- Health: http://admin.localhost/settings/health
- Checkout: http://localhost/checkout
