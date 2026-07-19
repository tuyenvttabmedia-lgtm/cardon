# Phase 6O.18 — Transparent Payment Fee + Pricing Accounting

**Date:** 2026-06-18  
**Build marker:** `6O18`  
**Scope:** Payment fee engine, order pricing snapshot, customer transparent pricing, admin config & reports.  
**Out of scope:** payment webhook/callback logic, provider fulfillment, order lifecycle state machine, wallet, ledger.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Payment fee engine | **PASS** | Fixed + percent + combined; VND integer rounding |
| Order snapshot | **PASS** | faceValue, sellAmount, fees, customerPaid, providerCost, profit |
| Customer UI | **PASS** | Mệnh giá / Giá bán / Giảm giá / Phí thanh toán / Tổng thanh toán |
| Admin payment methods | **PASS** | Settings → Payments → Payment methods table |
| Admin order accounting | **PASS** | Customer + internal breakdown on order detail |
| Finance gateway fees | **PASS** | Finance → Phí cổng thanh toán |
| Future-ready methods | **PASS** | SEPAY_VA_QR, SEPAY_NAPAS_QR, MEGAPAY_* via admin only |

---

## Payment Fee Formula

```
paymentFee = round(sellPrice × percentageFee / 100 + fixedFee)
totalPayment = sellPrice + paymentFee
profit = customerPaid - paymentFee - providerCost
```

### Examples (verified in unit tests)

| Method | Sell | Fee config | paymentFee | customerPaid |
|--------|------|------------|------------|--------------|
| SePay VA QR | 99.000 | 0% + 300đ | 300 | 99.300 |
| SePay Napas | 99.000 | 0.3% + 0 | 297 | 99.297 |
| MegaPay Visa | 99.000 | 2.2% + 2200đ | 4.378 | 103.378 |
| DATA Napas | 14.100 | 0.3% + 0 | 42 | 14.142 |

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

Default methods (editable):

| Code | Gateway | % | Fixed |
|------|---------|---|-------|
| SEPAY_VA_QR | SEPAY | 0 | 300 |
| SEPAY_NAPAS_QR | SEPAY | 0.3 | 0 |
| MEGAPAY_ATM | MEGAPAY | 0 | 0 |
| MEGAPAY_VISA | MEGAPAY | 2.2 | 2200 |
| MEGAPAY_WALLET | MEGAPAY | 0 | 0 |

Method visible to customers only when: method `enabled` + parent gateway configured & enabled.

---

## Customer UI

- **Summary:** `CustomerPriceBreakdown` — hides discount/fee rows when 0
- **Product selectors:** face value / package value as primary; `Giá bán` secondary
- **Checkout:** sends `paymentMethodCode` on order create; payment still uses gateway (`SEPAY` / `MEGAPAY`)

---

## API

| Endpoint | Change |
|----------|--------|
| `GET /payment-methods` | Returns fee config + gateway per method |
| `POST /orders` | Optional `paymentMethodCode`; snapshots pricing |
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
| Migration | `prisma/migrations/20250623120000_phase_6o18_payment_fee_snapshot/` |

---

## Deploy (local-full)

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api web admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate nginx
```

---

## Manual QA

1. Admin → enable SePay + SEPAY_VA_QR (300đ fixed)
2. Homepage Garena 100k / sell 99k → summary shows 99.300 total
3. Create order → admin order detail shows profit breakdown
4. Finance → Phí cổng thanh toán → row for SEPAY / SEPAY_VA_QR
5. Change fee to 500đ → new orders reflect 99.500; old orders unchanged

---

## Verdict

**Phase 6O.18: PASS** — Transparent payment fee model with immutable order snapshots and admin reconciliation tooling.
