# Phase 6O.23 — Provider Reconciliation & Operation

**Build marker:** `6O23`  
**Depends on:** Phase 6O.22 Provider Runtime

## Scope

Post-runtime provider operations: daily balance reconciliation, finance search/export, cost change audit, health monitoring, auto-protection, manual recovery, and finance dashboard.

**Unchanged (per spec):** Payment, Checkout, Provider adapter, Order snapshot, Ledger.

---

## Task 1 — Provider Daily Reconciliation

**Table:** `provider_reconciliation_reports`

| Field | Description |
|-------|-------------|
| `openingBalance` | Start-of-day balance (previous closing or cached balance) |
| `closingBalance` | Live `getBalance()` from provider API |
| `totalProviderCost` | Sum of successful transaction costs for the day |
| `expectedBalance` | `openingBalance - totalProviderCost` |
| `differenceAmount` | `closingBalance - expectedBalance` |
| `status` | `MATCHED` (≤1.000₫ tolerance), `DIFFERENCE`, `NEED_CHECK` |

**Services:**
- `ProviderDailyReconciliationService` — daily cron + manual run
- `POST /admin/finance/providers/reconciliation/run`
- `GET /admin/finance/providers/reconciliation`

---

## Task 2 — Provider Transaction Search

**Admin:** Finance → **NCC đối soát**

Filters: Provider, Date range, Status, Order ID, Provider Transaction ID.

Columns: Order, Customer paid, Provider cost, Profit, Provider response.

Export: `GET /admin/finance/export/providers/transactions` (CSV).

---

## Task 3 — Cost Change History

**Table:** `provider_cost_histories`

Recorded in `ProviderProductSyncService` when catalog sync detects mapping cost change. Old orders retain snapshot costs.

---

## Task 4 — Provider Health Monitor

**Table:** `provider_health_metrics`

Tracks success rate, error rate, average latency (EMA), operational status:

| Status | Rule |
|--------|------|
| `ONLINE` | Default |
| `SLOW` | avg latency ≥ 800ms |
| `ERROR` | error rate ≥ 50% |

Updated after each `buyCard` via `ProviderHealthMonitorService.recordApiCall`.

Admin Providers page shows success %, avg latency, last error.

---

## Task 5 — Provider Auto Protection

**Trigger:** error rate > 50% **and** last 20 transactions all failed.

**Action:** `provider.status = DEGRADED` — excluded from `ProviderRegistryService.listForVariant`.

**Alert:** Admin notification `PROVIDER_DEGRADED`.

---

## Task 6 — Manual Recovery Tools

**Endpoint:** `POST /admin/orders/:id/recovery`

| Action | Behavior |
|--------|----------|
| `retry` | Re-dispatch fulfillment |
| `switch_provider` | Skip failed providers / force alternate NCC |
| `refund` | Mark fulfillment `FAILED` (payment unchanged) |
| `mark_fulfilled` | Set `COMPLETED` when card records exist |

All actions write admin audit log.

Order detail UI shows recovery buttons for `NEED_MANUAL_REVIEW`.

---

## Task 7 — Provider Finance Dashboard

**Endpoint:** `GET /admin/finance/providers/dashboard`

Today summary: Revenue, Provider cost, Gateway fee, Gross profit.

Per provider: Orders, Cost, Success rate, Profit generated.

---

## Test Cases

1. **100 fake transactions + reconciliation** — run reconciliation cron/manual; verify `MATCHED` when balances align.
2. **Cost change** — sync catalog with new cost; `provider_cost_histories` row created; existing order profit unchanged.
3. **Provider API down** — 20 consecutive failures + high error rate → `DEGRADED`, no new routing.
4. **Manual retry** — `NEED_MANUAL_REVIEW` order → admin retry/switch → audit logged.

---

## Migration

`prisma/migrations/20250623210000_phase_6o23_provider_reconciliation`

```bash
docker exec cardon-local-full-api npx prisma migrate deploy
```

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d api admin web
```
