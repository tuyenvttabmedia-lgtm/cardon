# Phase 6O.18.2 — Payment Settlement & Invoice Reconciliation

**Date:** 2026-06-18  
**Build marker:** `6O18.2`  
**Scope:** Settlement type on payment methods, order/payment snapshot, finance settlement report, gateway invoice tracking.  
**Out of scope:** checkout UI, payment callback/webhook, provider fulfillment, ledger.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Settlement type on methods | **PASS** | `DIRECT_TO_MERCHANT` / `GATEWAY_SETTLEMENT` per method |
| Order snapshot | **PASS** | `settlementType` saved with gateway + method |
| Payment snapshot | **PASS** | `methodCode` + `settlementType` copied from order on create |
| Payment settlement report | **PASS** | Finance → Đối soát settlement |
| Gateway invoice tracking | **PASS** | `payment_gateway_invoices` + admin compare |
| Checkout unchanged | **PASS** | No customer-facing changes |

---

## Settlement types

| Type | Meaning | Example |
|------|---------|---------|
| `DIRECT_TO_MERCHANT` | Funds land in company bank; gateway bills fees separately | VietQR via SePay |
| `GATEWAY_SETTLEMENT` | Gateway collects and settles net amount later | MegaPay Visa |

### Default mapping

| Method | Gateway | Settlement |
|--------|---------|------------|
| VIETQR | SEPAY | DIRECT_TO_MERCHANT |
| NAPAS_247 | SEPAY | DIRECT_TO_MERCHANT |
| ATM | MEGAPAY | GATEWAY_SETTLEMENT |
| VISA | MEGAPAY | GATEWAY_SETTLEMENT |
| WALLET | MEGAPAY | GATEWAY_SETTLEMENT |

Configurable in **Admin → Settings → Payments**.

---

## Order / payment snapshot

On order create:

```typescript
{
  paymentGateway: 'SEPAY',
  paymentMethodCode: 'VIETQR',
  settlementType: 'DIRECT_TO_MERCHANT',
  // ... fee snapshot from 6O.18
}
```

On payment create (unchanged callback flow — only extra fields):

```typescript
{
  gateway: 'SEPAY',
  methodCode: 'VIETQR',
  settlementType: 'DIRECT_TO_MERCHANT',
}
```

---

## Payment settlement report

`GET /admin/finance/payment-settlement`

Query: `dateFrom`, `dateTo`, optional `gateway`, optional `settlementType`

### DIRECT_TO_MERCHANT section

- **bankReceivedAmount** — sum of `sellAmount` (product revenue to bank)
- **gatewayFeeInvoice** — sum of `paymentFeeAmount` (fees to match gateway invoice)

### GATEWAY_SETTLEMENT section

- **gatewayCollected** — sum of `customerPaid`
- **gatewayFee** — sum of fees
- **expectedSettlement** — collected − fee
- **actualSettlement** — from matched gateway invoices in period (if any)
- **settlementGap** — expected − actual when both exist

---

## Gateway invoices

Table: `payment_gateway_invoices`

| Field | Description |
|-------|-------------|
| gatewayCode | SEPAY, MEGAPAY |
| period | e.g. `2026-06` |
| periodStart / periodEnd | Date range |
| totalTransactions | From gateway invoice |
| totalVolume | Invoice volume |
| totalFee | Invoice fee |
| vatAmount | VAT on invoice |
| invoiceNumber | Gateway invoice no. |
| systemTransactions / systemVolume / systemFee | Computed from paid orders |
| status | PENDING, MATCHED, DIFFERENCE |

### Admin API

- `GET /admin/finance/gateway-invoices` — list
- `GET /admin/finance/gateway-invoices/:id` — detail
- `POST /admin/finance/gateway-invoices` — input invoice + auto-compare

On upsert, system totals are calculated for the period and status is set:

- **MATCHED** — transactions, volume, and fee match system
- **DIFFERENCE** — mismatch vs system

### Example (SePay)

| Invoice | System |
|---------|--------|
| 10,000 tx | 10,000 tx |
| 1B volume | 1B volume |
| 3M fee | 3M fee |
| Status: **MATCHED** | |

---

## Admin UI

**Finance → Đối soát settlement** — settlement report by type  
**Finance → Hóa đơn cổng** — input gateway invoice, compare vs system  
**Settings → Payments** — settlement type column per method  
**Order detail** — internal panel shows `settlementType`

---

## Migration

`20250623160000_phase_6o18_2_settlement`

- Adds `PaymentSettlementType`, `PaymentGatewayInvoiceStatus` enums
- Adds `orders.settlement_type`, `payments.method_code`, `payments.settlement_type`
- Backfills SEPAY → DIRECT_TO_MERCHANT, MEGAPAY → GATEWAY_SETTLEMENT
- Creates `payment_gateway_invoices`

---

## Build

```bash
npm run build
npm run build:admin
```

Build marker: `6O18.2`

---

## Related

- Phase 6O.18: `docs/PHASE_6O18_TRANSPARENT_PAYMENT_FEE.md`
- Phase 6O.18.1: `docs/PHASE_6O18_1_PAYMENT_METHOD_DISPLAY.md`
