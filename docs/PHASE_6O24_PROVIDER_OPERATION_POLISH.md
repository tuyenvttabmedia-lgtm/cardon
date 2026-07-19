# Phase 6O.24 — Provider Operation Polish

**Build marker:** `6O24`  
**Depends on:** Phase 6O.22/6O.23 Provider Runtime & Reconciliation

## Scope

Practical NCC operations tooling: connection test, maintenance mode, product availability, customer-facing order status, fulfillment timeline, and admin support tools.

**Unchanged:** Provider adapter, Payment, Ledger, Pricing, Checkout flow.

---

## Task 1 — Provider Test Connection

**Admin:** Providers → Detail → **Kiểm tra kết nối**

`POST /admin/providers/:id/test-connection`

Calls `getBalance()` via existing adapter (no credentials exposed).

**Success response:**
- ✓ API Connected
- Balance
- Response time (ms)

**Failure response:**
- `errorCode`, `message`, `responseTimeMs`

---

## Task 2 — Provider Maintenance Mode

**Table:** `provider_runtime_settings`

| Field | Description |
|-------|-------------|
| `maintenanceMode` | Skip provider in routing when active |
| `reason` | Admin note (e.g. "Esale bảo trì") |
| `startAt` / `endAt` | Optional maintenance window |

**API:**
- `GET/PUT /admin/providers/:id/runtime-settings`

When enabled, `ProviderRegistryService` skips provider; active mappings marked `MAINTENANCE`.

---

## Task 3 — Product Availability Sync

**Field on `provider_product_mappings`:** `availability`

| Value | Meaning |
|-------|---------|
| `AVAILABLE` | Routable |
| `OUT_OF_STOCK` | Not in provider catalog |
| `MAINTENANCE` | Provider/product maintenance |

Updated during catalog sync in `ProviderProductSyncService`. Routing ignores non-`AVAILABLE` mappings.

**Admin:** Products → variant mappings show status + availability badge.

---

## Task 4 — Customer Order Status

Computed customer-facing status (no internal enum change):

| Status | Condition |
|--------|-----------|
| `WAITING_PAYMENT` | Unpaid |
| `PAID` | Paid, pending fulfillment |
| `PROCESSING_PROVIDER` | Paid + processing |
| `DELIVERED` | Completed |
| `NEED_SUPPORT` | Manual review / failed |

Exposed as `customerStatus` + `customerStatusLabel` on order API. Web order pages show Vietnamese labels.

---

## Task 5 — Fulfillment Timeline

**Table:** `order_events`

| Event | Trigger |
|-------|---------|
| `PAYMENT_SUCCESS` | Payment notification service |
| `PROVIDER_REQUEST` | Provider buy attempt |
| `PROVIDER_SUCCESS` | Provider confirms cards |
| `CARD_DELIVERED` | Cards persisted |
| `EMAIL_SENT` | Card delivery email queued |

**Admin:** Order detail → **Timeline giao hàng** tab.

---

## Task 6 — Support Tools

**Admin order actions (audit logged):**

| Action | Endpoint |
|--------|----------|
| Resend email | `POST /admin/orders/:id/resend-email` |
| Copy serial | `POST /admin/orders/:id/copy-serial` |
| Retry delivery | `POST /admin/orders/:id/retry-delivery` |
| View provider tx | Existing provider trace tab |

---

## Test Cases

1. Wrong Esale credential → test connection fails with error
2. Enable maintenance → orders skip Esale, failover to next NCC
3. Unavailable mapping → routing uses next provider
4. Order detail shows fulfillment timeline events

---

## Migration

`prisma/migrations/20250623220000_phase_6o24_provider_operation_polish`

```powershell
docker exec cardon-local-full-api npx prisma migrate deploy
```

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d api admin web
```
