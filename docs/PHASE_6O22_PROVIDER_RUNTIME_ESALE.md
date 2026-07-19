# Phase 6O.22 — Provider Runtime Completion (Esale Production)

**Build marker:** `6O22`  
**Scope:** Provider engine, Esale CARD adapter, balance cron, failover, admin monitoring.  
**Out of scope:** Payment gateway, ledger, order accounting snapshot, product architecture, customer checkout UI.

## Summary

Production-ready Esale provider runtime: dedicated CARD adapter, balance engine, immutable transaction ledger fields, multi-provider failover, scheduled timeout recovery, admin monitoring, and catalog cost sync.

## Task 1 — Esale CARD Adapter

**File:** `src/modules/provider/adapters/esale/esale-card.adapter.ts`

| Method | Esale API | Notes |
|--------|-----------|--------|
| `getCardList()` | `getcardlist` | Maps `unitPrice` → `faceValue`, `priceDiscount` → `providerCost` |
| `buyCard()` | `buycard` | Decrypt PIN via RSA; never persist plaintext |
| `checkTransaction()` | `checktransaction` | Used for PROCESSING / TIMEOUT / UNKNOWN |
| `getBalance()` | `getbalance` | Card wallet |

`ESaleProvider` delegates CARD to `EsaleCardAdapter`, TOPUP/DATA to `EsaleTopupAdapter`.  
`getBalance()` returns max(card, topup) balance.

## Task 2 — Provider Balance Engine

**Table:** `provider_balances`

| Field | Purpose |
|-------|---------|
| `balance`, `currency` | Last synced wallet |
| `lastSyncAt` | Last API sync |
| `status` | `NORMAL` / `LOW_BALANCE` / `ERROR` |
| `lowBalanceThreshold` | Default 5.000.000 VND |

**Cron:** `ProviderBalanceCronService` — every 5 minutes sync all active providers.  
**Manual:** Admin → Providers → "Đồng bộ số dư" (`POST /admin/providers/:id/check-balance`).

Legacy `providers.balance` kept in sync for backward compatibility.

## Task 3 — Provider Transaction Ledger

Extended `provider_transactions`:

- `orderItemId`, `type` (CARD/TOPUP/DATA)
- `faceValue`, `providerCost` (profit calculation)
- `errorCode`, `errorMessage`, `completedAt`

Financial outcomes written once at terminal status; request/response JSON preserved.

## Task 4 — CARD Fulfillment Runtime

Existing flow (unchanged entry point):

```
Order PAID → provider_queue → ProviderService.fulfillOrder()
  → ProviderRouter (priority mappings)
  → EsaleCardAdapter.buyCard()
  → decrypt PIN → AES encrypt → card_records
  → fulfillmentStatus COMPLETED + customer notification
```

## Task 5 — Provider Router + Failover

`ProviderRegistryService.listForVariant()` returns all ACTIVE mappings by priority.

Recoverable errors → try next provider:

- `OUT_OF_STOCK`
- `LOW_BALANCE`
- `MAINTENANCE`

Order fails only when all providers exhausted → `NEED_MANUAL_REVIEW` or `WAITING_ADMIN_RETRY`.

## Task 6 — Retry / Pending Handling

On `TIMEOUT` / pending after `checkTransaction()`:

1. Schedule BullMQ retry: **30s → 1m → 5m → 15m**
2. Same provider — `checkTransaction()` on retry job
3. After max retries → `NEED_MANUAL_REVIEW` + admin notification

## Task 7 — Admin Monitoring

**Admin → Providers → Monitoring**

- Health: ONLINE / ERROR / OFFLINE
- Balance + last sync
- Today: success / failed / success rate
- Last error message + time
- Sync products report (new / updated / disabled)

## Task 8 — Provider Sync Product

`ProviderProductSyncService.syncEsaleCardCatalog()`:

- Compare Esale `getCardList` vs existing mappings
- Update `providerCost` only — **never customer sell price**
- Disable mappings missing from catalog
- Report: New / Updated / Disabled counts

## Task 9 — Alerts

- Low balance: email via `notifyProviderLowBalance` when balance &lt; threshold
- Balance sync ERROR status on API failure
- Admin UI warning badge

## Task 10 — Security

- Credentials via encrypted settings store (unchanged)
- No PIN/plaintext in logs
- Admin password fields for secrets (unchanged)

## Migration

```bash
npx prisma migrate deploy
# or docker compose exec api npx prisma migrate deploy
```

Migration: `20250623200000_phase_6o22_provider_runtime`

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

## Test checklist

1. Payment success → Garena card → PIN delivered encrypted
2. Esale balance decreases after purchase
3. Out of stock → failover to next mapping
4. Timeout → checkTransaction retry schedule
5. Low balance admin alert (&lt; 5M VND default)
6. `providerCost` saved on transaction
7. Finance: `customerPaid - gatewayFee - providerCost = profit`

## Files changed (main)

| Area | Files |
|------|-------|
| CARD adapter | `esale-card.adapter.ts`, `esale.provider.ts` |
| Balance | `provider-balance.repository.ts`, `provider-balance-cron.service.ts`, `provider-health.service.ts` |
| Fulfillment | `provider.service.ts`, `provider-registry.service.ts`, `provider-failover.rules.ts` |
| Queue | `provider-retry.backoff.ts`, `provider.worker.ts`, `queue.module.ts` |
| Sync | `provider-product-sync.service.ts` |
| Admin | `admin-provider.service.ts`, `apps/admin/app/providers/page.tsx` |
| Schema | `prisma/schema.prisma`, migration `20250623200000_phase_6o22_provider_runtime` |
