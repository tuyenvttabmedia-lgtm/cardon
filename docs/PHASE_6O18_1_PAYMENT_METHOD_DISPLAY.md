# Phase 6O.18.1 — Payment Method Display & Gateway Separation

**Date:** 2026-06-18  
**Build marker:** `6O18.1`  
**Scope:** Separate internal payment gateway from customer-facing payment method; checkout UI, admin settings, order snapshot, finance grouping.  
**Out of scope:** payment webhook/callback logic, provider fulfillment, order lifecycle, wallet, ledger.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Data model | **PASS** | `gatewayCode` + `methodCode` + `displayName` on payment methods |
| Order snapshot | **PASS** | `paymentGateway`, `paymentMethodCode`, `methodDisplayName` + fee snapshot |
| Customer checkout | **PASS** | Shows VietQR / NAPAS 247 / Visa — never SePay / MegaPay |
| Admin payment settings | **PASS** | Full gateway + method + fee visibility |
| Admin order detail | **PASS** | Customer sees display name; internal sees gateway + method code |
| Finance report | **PASS** | Grouped by gateway → methods for invoice matching |
| Legacy migration | **PASS** | `SEPAY_VA_QR` → `VIETQR`, etc. |

---

## Concept

**Internal gateway** (admin/API/reconciliation):

- `SEPAY`, `MEGAPAY`, `VNPAY` (future)

**Customer payment method** (checkout UI):

- `VIETQR`, `NAPAS_247`, `ATM`, `VISA`, `WALLET`

One gateway can serve multiple methods. Visa/card is **not** routed through SePay — only MegaPay (or future card gateway).

---

## PaymentMethod config shape

```typescript
{
  gatewayCode: 'SEPAY' | 'MEGAPAY',
  methodCode: 'VIETQR' | 'NAPAS_247' | 'ATM' | 'VISA' | 'WALLET',
  displayName: string,      // "VietQR", "NAPAS 247", "Thẻ Visa/Mastercard"
  description?: string,
  iconUrl?: string | null,
  logoUrl?: string | null,
  enabled: boolean,
  percentageFee: number,
  fixedFee: number,
}
```

### Default methods

| methodCode | gatewayCode | displayName | Fee |
|------------|-------------|-------------|-----|
| VIETQR | SEPAY | VietQR | 0% + 300đ |
| NAPAS_247 | SEPAY | NAPAS 247 | 0.3% |
| ATM | MEGAPAY | ATM nội địa | — |
| VISA | MEGAPAY | Visa / Mastercard | 2.2% + 2200đ |
| WALLET | MEGAPAY | Ví điện tử | — |

---

## Public API (`GET /payment-methods`)

Customer-facing response — **no gateway branding in display fields**:

```json
{
  "methodCode": "VIETQR",
  "displayName": "VietQR",
  "description": "Chuyển khoản QR",
  "iconUrl": null,
  "logoUrl": null,
  "percentageFee": 0,
  "fixedFee": 300,
  "gatewayCode": "SEPAY"
}
```

`gatewayCode` is included for routing only; checkout UI does not render it.

Order create accepts `paymentMethodCode` (e.g. `VIETQR`). Legacy codes (`SEPAY_VA_QR`, …) are normalized server-side.

---

## Order snapshot

On order create:

| Field | Example | Audience |
|-------|---------|----------|
| `paymentGateway` | `SEPAY` | Internal reconciliation |
| `paymentMethodCode` | `VIETQR` | API / reports |
| `methodDisplayName` | `VietQR` | Customer receipt |

Fee fields (`paymentFeePercent`, `paymentFeeFixed`, `paymentFeeAmount`, `customerPaid`) remain immutable from Phase 6O.18.

---

## Customer checkout UI

- Payment cards show **logo/icon + displayName + optional fee hint** (`Phí 300đ`, `Phí 0.3%`)
- Does **not** show "SePay", "MegaPay", or "Powered by …"
- Mobile and desktop use `PaymentMethodPicker` / `MobilePaymentMethodButton`

---

## Admin UI

**Settings → Payments → Payment methods**

- Customer name (`displayName`), internal method code, gateway, fee summary, enable/disable

**Order detail**

- Customer panel: `methodDisplayName`
- Internal panel: `gatewayCode` + `methodCode`

**Finance → Phí cổng thanh toán**

Grouped structure:

```
SEPAY
  VietQR
  NAPAS 247
MEGAPAY
  Visa / Mastercard
  ATM nội địa
```

---

## Files changed

### Backend
- `prisma/schema.prisma` — `methodDisplayName` on Order
- `prisma/migrations/20250623140000_phase_6o18_1_method_display/`
- `src/modules/payment/entities/payment-method.constants.ts`
- `src/modules/settings/entities/settings.constants.ts`
- `src/modules/settings/services/settings-store.service.ts`
- `src/modules/order/services/order.service.ts`
- `src/modules/finance/repositories/finance.repository.ts`
- `src/modules/admin/dto/settings.dto.ts`
- `src/modules/admin/entities/admin-order-detail.mapper.ts`

### Web
- `apps/web/lib/payment-methods.ts`
- `apps/web/lib/payment-method-codes.ts`
- `apps/web/hooks/usePaymentMethods.ts`
- `apps/web/components/checkout/PaymentPanel.tsx`
- `apps/web/components/home/HomePageClient.tsx`
- `apps/web/components/topup/TopupPageClient.tsx`
- `apps/web/components/topup/DataPageClient.tsx`

### Admin
- `apps/admin/types/api.ts`
- `apps/admin/app/settings/payment/page.tsx`
- `apps/admin/app/orders/[id]/page.tsx`
- `apps/admin/app/finance/page.tsx`

---

## Build verification

```bash
npm run build
npm run build:web
npm run build:admin
```

Build marker: `6O18.1` (`apps/web/lib/build-version.ts`, `docker-compose.local-full.yml`).

---

## Related

- Phase 6O.18: `docs/PHASE_6O18_TRANSPARENT_PAYMENT_FEE.md`
