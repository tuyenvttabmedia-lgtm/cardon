# Phase 6O.18 — Transparent Payment Fee + Pricing Accounting

**Date:** 2026-06-18 (updated 2026-09-10 — merchant-absorbed fee)  
**Build marker:** `6O18`  
**Scope:** Payment fee engine, order pricing snapshot, customer transparent pricing, admin config & reports.  
**Out of scope:** payment webhook/callback logic, provider fulfillment, order lifecycle state machine, wallet, ledger.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Payment fee engine | **PASS** | Merchant absorbs gateway fee; customer pays sell only |
| Order snapshot | **PASS** | faceValue, sellAmount, fees, customerPaid, providerCost, profit |
| Customer UI | **PASS** | Mệnh giá / Giá bán / Giảm giá / **Phí giao dịch: Miễn phí** / Tổng = giá bán |
| Admin payment methods | **PASS** | Settings → Payments → Payment methods table (fee % still for accounting) |
| Admin order accounting | **PASS** | Customer + internal breakdown on order detail |
| Finance gateway fees | **PASS** | Finance → Phí cổng thanh toán |
| Future-ready methods | **PASS** | SEPAY_VA_QR, SEPAY_NAPAS_QR, MEGAPAY_* via admin only |

---

## Payment Fee Formula (merchant-absorbed)

Gateways such as MegaPay take **% fee on the charged amount**. CardOn charges the
customer the **website sell price only** and absorbs the settlement fee (partially
offset by reducing retail CK 0.5pp on discounted SKUs).

```
rate = percentageFee / 100
totalPayment = round(sellPrice)                 // what MegaPay / SePay receives
paymentFee   = round(sellPrice × rate) + round(fixedFee)   // CardOn cost estimate
profit       = customerPaid − paymentFee − providerCost
```

Example MegaPay 0.77% on sell 99.500đ (after CK 0.5%):

| | Value |
|--|-------|
| customerPaid / Mega amount | 99.500 |
| paymentFee (estimate) | round(99.500×0.77%)=766 |
| Net after Mega (approx) | ≈98.734 |

Do **not** gross-up the charged amount — that still leaves settlement fee after pay and confuses checkout vs Mega confirmation.

### Examples (verified in unit tests)

| Method | Sell | Fee config | paymentFee (absorbed) | customerPaid |
|--------|------|------------|----------------------|--------------|
| SePay VA QR | 99.000 | 0% + 300đ | 300 | 99.000 |
| SePay Napas | 99.000 | 0.3% + 0 | 297 | 99.000 |
| MegaPay VietQR | 99.000 | 0.77% + 0 | 762 | 99.000 |
| MegaPay Visa | 99.000 | 2.2% + 2200đ | 4.378 | 99.000 |
| DATA Napas | 14.100 | 0.3% + 0 | 42 | 14.100 |

---

## Retail CK offset (−0.5pp)

To partially fund absorbed Mega fees (~0.77%):

| Old CK | New CK | Formula |
|--------|--------|---------|
| ~1% | 0.5% | `sell = round(face × 0.995)` |
| ~2% | 1.5% | `sell = round(face × 0.985)` |
| 0% (sell = face) | unchanged | — |

Deploy script: `scripts/deploy/adjust-retail-sell-discount-absorb-fee.mjs`

---

## Order Snapshot (immutable)

On order create, persisted on `orders`:

- `face_value`, `sell_amount`, `discount_amount`
- `payment_method_code`, `payment_gateway`
- `payment_fee_percent`, `payment_fee_fixed`, `payment_fee_amount`
- `customer_paid`, `provider_cost`, `profit`
- `total_amount` = `customer_paid` (gateway webhook compares this)

Old orders keep migration defaults (0) — never recalculated when admin changes fees.

---

## Admin Config

**Settings → Cổng thanh toán → Phương thức thanh toán**

Fee % / fixed on methods remain for **internal** snapshots and finance. They are
**not** added to the customer checkout total.

---

## Customer UI

- **Summary:** `CustomerPriceBreakdown` — always shows **Phí giao dịch: Miễn phí**; total = sell
- **Payment picker:** always **Miễn phí giao dịch**
- **Checkout:** sends `paymentMethodCode` on order create; payment amount = sell

---

## API

| Endpoint | Change |
|----------|--------|
| `GET /payment-methods` | Returns fee config + gateway per method |
| `POST /orders` | Optional `paymentMethodCode`; snapshots pricing; `customerPaid` = sell |
| `GET /admin/settings/payment/methods` | Admin CRUD |
| `GET /admin/finance/gateway-fees` | Aggregated fee report |

---

## Key Files

| Area | Path |
|------|------|
| Fee engine | `src/modules/payment/entities/payment-fee.engine.ts` |
| Order create snapshot | `src/modules/order/services/order.service.ts` |
| Settings methods | `src/modules/settings/entities/settings.constants.ts` |
| Web pricing | `apps/web/lib/customer-price.ts` |
| Admin methods UI | `apps/admin/app/settings/payment/page.tsx` |
| Finance report | `apps/admin/app/finance/page.tsx` |
| CK adjust script | `scripts/deploy/adjust-retail-sell-discount-absorb-fee.mjs` |
| Migration | `prisma/migrations/20250623120000_phase_6o18_payment_fee_snapshot/` |

---

## Manual QA

1. Homepage product with CK → sell reflects −0.5pp (e.g. 100k @ 0.5% → 99.500)
2. Checkout summary: Phí giao dịch **Miễn phí**, Tổng = giá bán
3. MegaPay page confirms **same** amount as Tổng (no +768)
4. Admin order detail: `paymentFeeAmount` ≈ sell × method %, `customerPaid` = sell
5. SKU with sell = face (0% CK) unchanged by adjust script

---

## Verdict

**Phase 6O.18: PASS** — Merchant-absorbed gateway fee; customer pays sell; CK −0.5pp offset on discounted retail SKUs.
