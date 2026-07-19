# Build 6032.4 — Webhook Monitor

**Previous build:** 6032.3.1 QUEUE HOTFIX  
**Target:** Enterprise-grade Webhook Monitor (read + retry/cancel/export)  
**Status:** Complete

---

## Architecture

```
Admin UI (/monitoring/webhooks)
    ↓ REST (poll 5–60s)
WebhookMonitorController
    ↓
WebhookMonitorService
    ↓ reads webhook_logs + joins Payment
    ↓ retry → PaymentService.handleWebhook() (existing handler)
Existing webhook endpoints only — no new webhook architecture
```

- **Read layer** — dashboard, source health, paginated webhook table, statistics, 24h charts
- **Operations layer** — retry single/bulk/failed, cancel pending (monitor metadata only)
- **Alerts** — reuses `ActivityEventDispatcher` → Notification Center
- **Logging** — retry, cancel, export, copy → Activity Log; retry/cancel → Audit Log

### Modules

| Module | Path | Role |
|--------|------|------|
| WebhookMonitorModule | `src/modules/webhook-monitor/` | API, enrichment, masking, alerts, export |
| PaymentModule | `src/modules/payment/` | Existing webhook handlers (unchanged) |
| WebhookLogRepository | `src/modules/payment/repositories/` | Existing `webhook_logs` writes (unchanged) |

---

## Webhook Sources

| Source | Display | Endpoint |
|--------|---------|----------|
| `MEGAPAY` | MegaPay | `/api/v1/payments/webhook/megapay` |
| `SEPAY` | SePay | `/api/v1/payments/webhook/sepay` |
| `PROVIDER` | Provider | `/api/v1/provider/callback` |
| `PARTNER` | Partner | `/api/v1/partner/callback` |
| `INTERNAL` | Internal | `/api/v1/internal/callback` |

MegaPay/SePay are populated by existing payment flow. Provider/Partner/Internal appear in monitor UI for future traffic; no handler changes in this build.

---

## Data Model

Migration: `prisma/migrations/20250628140000_phase_6032_4_webhook_monitor/`

- Extends `WebhookSource` enum: `PROVIDER`, `PARTNER`, `INTERNAL`
- Adds `retry_count`, `cancelled_at`, `monitor_metadata` to `webhook_logs`
- Indexes on `source`, `created_at`

Status is **derived** at read time (no handler changes):

| Status | Rule |
|--------|------|
| `INVALID_SIGNATURE` | `signatureValid = false` |
| `DUPLICATE` | Not first webhook for `paymentReference` |
| `IGNORED` | `cancelledAt` set |
| `RETRY` | `retryCount > 0` and not processed |
| `SUCCESS` / `FAILED` / `PENDING` | From linked `Payment` record |

---

## API

Base path: `/api/v1/admin` (global prefix)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/webhooks` | `webhook.read` | Dashboard + paginated list |
| GET | `/webhooks/statistics` | `webhook.read` | 24h stats + hourly chart |
| GET | `/webhooks/history` | `webhook.read` | History buckets (24h/7d/30d/custom) |
| GET | `/webhooks/:id` | `webhook.read` | Detail (lazy payload, masked) |
| GET | `/webhooks/export/csv` | `webhook.export` | CSV export |
| GET | `/webhooks/export/excel` | `webhook.export` | Excel export |
| GET | `/webhooks/export/json` | `webhook.export` | JSON export |
| POST | `/webhooks/:id/retry` | `webhook.manage` | Retry via existing handler |
| POST | `/webhooks/retry-failed` | `webhook.manage` | Bulk retry (optional `ids`) |
| POST | `/webhooks/cancel` | `webhook.manage` | Cancel pending (`ids`) |
| POST | `/webhooks/:id/log-copy` | `webhook.read` | Activity log for copy actions |

GET `/admin/webhooks` is excluded from automatic activity interceptor noise.

---

## RBAC

| Permission | Roles |
|------------|-------|
| `webhook.read` | SUPER_ADMIN, ADMIN, SUPPORT |
| `webhook.manage` | SUPER_ADMIN, ADMIN |
| `webhook.export` | SUPER_ADMIN, ADMIN |

Seeded in `prisma/seed.mjs`.

---

## UI

Route: `/monitoring/webhooks`  
Menu: Monitoring → Webhook Monitor  
Footer: **6032.4 WEBHOOK MONITOR**

Features:

- Summary cards (today, success, failed, pending, duplicate, invalid signature, retry queue, avg response, 24h)
- Per-source health cards (Healthy / Warning / Critical)
- Filterable paginated table
- Detail drawer: Summary, Headers, Payload (masked, collapse >100KB), Response, Timeline, Retry History, Metadata
- Auto-refresh: Off, 5s, 10s, 30s, 60s with countdown
- Export: CSV, Excel, JSON
- Operations: Retry, Retry Selected, Retry Failed, Cancel Pending

---

## Statistics

- Webhook/min, Webhook/hour
- Average duration, retry rate, failure rate, duplicate rate, signature fail rate
- 24h chart: success, failed, retry, timeout, duplicate

---

## Retry Flow

1. Admin clicks Retry (single or bulk)
2. `WebhookMonitorService.retryWebhook()` loads stored payload from `webhook_logs`
3. Calls existing `PaymentService.handleWebhook(gateway, payload, …)` — **no new handler**
4. Increments `retry_count`, writes Activity + Audit logs
5. Retry limited to `MEGAPAY` / `SEPAY` with valid signature and not cancelled

---

## Security

- Payload/headers masked (PIN, API key, secret, password, token, authorization)
- Signature badge: Verified / Invalid
- Invalid signature webhooks cannot be retried
- Large payloads (>100KB) collapsed in UI; full payload loaded only on detail request

### Health rules (per source)

| Condition | Level |
|-----------|-------|
| Invalid signature > 0 today | CRITICAL |
| Failure rate > 10% | WARNING |
| Timeout rate > 5% | WARNING |
| No webhook > 30 minutes | WARNING |

---

## Deployment

```bash
# Migration + seed
npx prisma migrate deploy
node prisma/seed.mjs

# Docker (local full stack)
docker compose -f docker-compose.local-full.yml build api admin
docker compose -f docker-compose.local-full.yml up -d
```

Verify:

- http://admin.localhost/monitoring/webhooks
- Dashboard cards and source health
- Detail drawer tabs
- Retry / Export (ADMIN)
- Activity Log + Audit Log entries
- Footer: **6032.4 WEBHOOK MONITOR**

---

## Verification Checklist

- [ ] Page loads with `webhook.read`
- [ ] SUPPORT cannot retry/cancel/export
- [ ] Pagination works; payloads lazy-loaded on detail
- [ ] Retry invokes existing payment webhook handler
- [ ] Cancel sets `cancelled_at` (status → IGNORED)
- [ ] Export downloads CSV/Excel/JSON
- [ ] Notifications for failed/invalid signature spikes
- [ ] No changes to payment/order/provider/queue engines

---

## Do Not Modify

Payment Engine, Order Engine, Provider Engine, Queue Engine, Notification Engine, Activity Engine, Audit Engine, business logic, webhook handlers — monitoring layer only.
