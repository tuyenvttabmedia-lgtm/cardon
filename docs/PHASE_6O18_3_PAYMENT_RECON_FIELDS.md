# Phase 6O.18.3 — Payment Reconciliation Final Fields

**Date:** 2026-06-18  
**Build marker:** `6O18.3`  
**Scope:** Payment accounting columns for settlement tracking, bank references, reconciliation status; admin list + CSV export.  
**Out of scope:** checkout, webhook, provider, fulfillment, ledger — **no business logic changes**.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Payment schema fields | **PASS** | settlementDate, gateway/bank refs, reconciliationStatus |
| Migration backfill | **PASS** | gatewayTransactionId from JSON; settlementDate from paidAt |
| Admin payment list | **PASS** | Gateway ref, bank ref, settlement date, reconciliation |
| Finance CSV export | **PASS** | `GET /admin/finance/export/payments-reconciliation` |
| Webhook / callback | **UNCHANGED** | Fields ready for future population |

---

## New payment fields

| Field | Purpose |
|-------|---------|
| `settlementDate` | When funds reach company bank |
| `gatewayTransactionId` | Gateway transaction ID (SePay, MegaPay) |
| `bankTransactionId` | Bank-side transaction ID |
| `bankReference` | Bank trace / reference for disputes |
| `reconciliationStatus` | Accounting reconciliation state |

### reconciliationStatus values

| Value | Intended use |
|-------|----------------|
| `PENDING` | Default — not yet reconciled |
| `MATCHED` | Webhook / invoice matched (future automation) |
| `DIFFERENCE` | Amount or count mismatch |
| `MANUAL_REVIEW` | Requires accountant review |

---

## Settlement date examples

| Gateway | Payment date | Settlement date |
|---------|--------------|-----------------|
| SePay VA (direct) | 01/01 | 01/01 (same day) |
| MegaPay (gateway settlement) | 01/01 | 02/01 (T+1) |

Fields are nullable; populated by future settlement jobs or manual admin entry.

---

## Migration backfill

`20250623180000_phase_6o18_3_payment_recon_fields`

- `gateway_transaction_id` ← `gateway_response.gatewayTransactionId` where present
- `settlement_date` ← `paid_at` for existing successful payments
- `reconciliation_status` ← `PENDING` for all rows

---

## Admin payment list

**Payments** table columns added:

- Gateway ref (`gatewayTransactionId`)
- Bank ref (`bankReference` or `bankTransactionId`)
- Settlement date
- Reconciliation status

Display fallback: if `gatewayTransactionId` column is empty, admin UI reads legacy JSON field for display only.

---

## Finance CSV export

`GET /admin/finance/export/payments-reconciliation?dateFrom=&dateTo=&gateway=`

Columns:

```
gateway, method, amount, fee, bank_ref, settlement_date, reconciliation_status
```

- **method** — `methodCode` or order display name
- **fee** — order `paymentFeeAmount`
- **bank_ref** — `bankReference` or `bankTransactionId`

Admin UI: **Finance → Đối soát settlement → Export CSV payments**

---

## Files changed

- `prisma/schema.prisma` — `PaymentReconciliationStatus` enum + payment columns
- `prisma/migrations/20250623180000_phase_6o18_3_payment_recon_fields/`
- `src/modules/payment/entities/payment.mapper.ts` — `mapAdminPayment`
- `src/modules/admin/services/admin-payment.service.ts`
- `src/modules/finance/repositories/finance.repository.ts` — export query
- `src/modules/finance/services/export.service.ts`
- `src/modules/finance/controllers/finance.controller.ts`
- `apps/admin/app/payments/page.tsx`
- `apps/admin/app/finance/page.tsx`

---

## Build

```bash
npm run build
npm run build:admin
npx prisma migrate deploy
```

Build marker: `6O18.3`

---

## Related

- Phase 6O.18.2: `docs/PHASE_6O18_2_PAYMENT_RECONCILIATION.md`
