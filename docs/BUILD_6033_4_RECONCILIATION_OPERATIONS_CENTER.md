# BUILD 6033.4 — RECONCILIATION & OPERATIONS CENTER

**Build:** `6033.4 RECONCILIATION & OPERATIONS CENTER`  
**Prior build:** `6033.3.2 ARCHITECTURE STABILIZATION`  
**Scope:** Admin Operations layer only — no changes to Payment, Provider, Ledger, Webhook, or Order engines.

---

## 1. Purpose

Daily operations workspace for CardOn staff:

| Module | Vietnamese | Function |
|--------|------------|----------|
| Reconciliation | Đối soát | Compare Payment → Webhook → Order → Provider → PIN → Ledger |
| Exceptions | Ngoại lệ | Collect, assign, resolve operational exceptions |
| Manual Operations | Thao tác thủ công | Safe manual actions via existing services |
| Invoice Center | Hóa đơn | Foundation lookup (no accounting logic) |

This is **not** a monitoring dashboard — use Monitoring for queues/webhooks/activity streams.

---

## 2. Architecture

```
Admin UI (/operations/*)
        ↓
OperationsCenterController  (/admin/operations/*)
        ↓
OperationsCenterService     — aggregation, mismatch detection, exception state
OperationsManualService     — delegates to AdminOrderService, WebhookMonitorService
        ↓
Existing engines (read-only / delegated actions)
  Order, Payment, WebhookLog, ProviderTransaction, LedgerEntry, Invoice
```

**Module:** `src/modules/operations-center/`

| File | Role |
|------|------|
| `operations-center.module.ts` | Nest module wiring |
| `controllers/operations-center.controller.ts` | REST API |
| `services/operations-center.service.ts` | Dashboard, reconciliation, exceptions, search, invoices |
| `services/operations-manual.service.ts` | Manual action delegation |
| `entities/operations-center.constants.ts` | Permissions, enums |

---

## 3. Business Flow

```
Payment → Webhook → Order → Provider → PIN Delivery → Ledger → Reconciliation → Completed
```

Every transaction must be reconcilable. Mismatches surface in **Đối soát** and become **Ngoại lệ** for staff workflow.

---

## 4. Mismatch Types

| Type | Description | Typical severity |
|------|-------------|----------------|
| `PAYMENT_RECEIVED_NO_ORDER` | Paid, no order | CRITICAL |
| `ORDER_NO_PIN` | Completed order, PIN not delivered | CRITICAL |
| `PIN_DELIVERED_NO_LEDGER` | Agent order complete, no ledger entry | CRITICAL |
| `WEBHOOK_UNPROCESSED` | Webhook received, not processed | MEDIUM/HIGH |
| `PROVIDER_SUCCESS_ORDER_FAILED` | Provider OK, order failed | CRITICAL |
| `PROVIDER_TIMEOUT` | Provider timeout | HIGH |
| `PAYMENT_MISMATCH` | Gateway reconciliation ≠ MATCHED | HIGH |
| `DUPLICATE_PAYMENT` | Duplicate payment reference | HIGH |
| `DUPLICATE_WEBHOOK` | Duplicate webhook key | MEDIUM |
| `PENDING_TOO_LONG` | Paid/pending order stale > 30 min | HIGH |

Detection runs on-demand from aggregated queries (7-day window default). Background auto-reconciliation is a future enhancement.

---

## 5. Exception Flow

1. Mismatch detected → appears in **Ngoại lệ** with status `OPEN`
2. Staff assigns (in-memory state + Activity Log on update)
3. Status: `OPEN` → `INVESTIGATING` → `RESOLVED` | `IGNORED`
4. Notes appended per exception (in-memory; persisted via Activity Log events)

**Foundation limitation:** Exception assign/status/notes use an in-process `Map` (lost on API restart). Production should migrate to DB table in a future build.

---

## 6. Manual Operations

**RBAC:** `operations.manage` + role `SUPER_ADMIN` | `ADMIN` (service-level guard)

| Action | Delegates to |
|--------|--------------|
| `replay_webhook` | `WebhookMonitorService.retryWebhook` |
| `recheck_provider` / `cancel_safely` | `AdminOrderService.retryFulfillment` |
| `resend_pin` / `resend_email` | `AdminOrderService.resendDeliveryEmail` |
| `lock_order` / `unlock_order` | `order.invoiceMetadata.operationsLocked` |
| `mark_reconciled`, `rebuild_ledger_summary`, `send_telegram`, `create_note` | Activity log only (foundation) |

No direct database editing. All actions dispatch `SystemActivityLog` via `ActivityEventDispatcher`.

---

## 7. Invoice Foundation

- Lists invoices via `InvoiceService` (mapped DTO for admin client)
- Search by invoice number in global search
- Full invoice lifecycle remains in Finance module

---

## 8. API Endpoints

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/operations/dashboard` | `reconciliation.read` |
| GET | `/admin/operations/reconciliation/summary` | `reconciliation.read` |
| GET | `/admin/operations/reconciliation` | `reconciliation.read` |
| GET | `/admin/operations/exceptions` | `reconciliation.read` |
| PATCH | `/admin/operations/exceptions/:id` | `reconciliation.manage` |
| GET | `/admin/operations/search?q=` | `reconciliation.read` |
| GET | `/admin/operations/invoices` | `invoice.read` |
| GET | `/admin/operations/invoices/:id` | `invoice.read` |
| POST | `/admin/operations/manual/:action` | `operations.manage` |
| POST | `/admin/operations/audit` | `reconciliation.read` |

---

## 9. RBAC

| Permission | SUPER_ADMIN | ADMIN | ACCOUNTANT | SUPPORT |
|------------|:-----------:|:-----:|:----------:|:-------:|
| `reconciliation.read` | ✓ | ✓ | ✓ | ✓ |
| `reconciliation.manage` | ✓ | ✓ | ✓ | ✗ |
| `operations.manage` | ✓ | ✓ | ✗ | ✗ |
| `invoice.read` | ✓ | ✓ | ✓ | ✗ |
| `invoice.manage` | ✓ | ✓ | ✓ | ✗ |

Seed: `prisma/seed.mjs`, `scripts/create-admin-local.ts`

---

## 10. Admin UI

| Route | Page |
|-------|------|
| `/operations` | Dashboard + global search + hub |
| `/operations/reconciliation` | Đối soát |
| `/operations/exceptions` | Ngoại lệ |
| `/operations/manual` | Thao tác thủ công |
| `/operations/invoices` | Hóa đơn |

Nav label: **Vận hành** (Vietnamese). Skeleton loading, empty states, server-side pagination.

---

## 11. Notifications & Activity

- Reuses **Notification Center** infrastructure (critical mismatches can trigger existing notification rules in future)
- **Activity Log:** assign, resolve, manual actions via `ActivityEventDispatcher`
- **Audit Log:** configuration changes only (unchanged)

---

## 12. Future Auto-Reconciliation

- Scheduled BullMQ job running `detectMismatches` + persist to `reconcile_exceptions` table
- Auto-assign rules by severity/gateway
- Telegram/email on CRITICAL
- Exception state DB migration
- Ledger rebuild integration with Finance reconcile engine

---

## 13. Verification

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api admin
```

- Admin: `http://admin.localhost/operations`
- Login: `superadmin@cardon.vn` / `SuperAdmin2026!`
- Footer: **Build 6033.4 RECONCILIATION & OPERATIONS CENTER**

---

## 14. Acceptance Checklist

- [x] Reconciliation Center
- [x] Exception Center
- [x] Manual Operations
- [x] Invoice Foundation
- [x] Vietnamese UI
- [x] Activity Log integration
- [x] Notification Center (reuse path)
- [x] RBAC permissions seeded
- [ ] Docker Build PASS (run locally)
- [ ] Localhost PASS (run locally)
- [x] No engine regressions (aggregation layer only)

---

**Footer:** Build 6033.4 RECONCILIATION & OPERATIONS CENTER
