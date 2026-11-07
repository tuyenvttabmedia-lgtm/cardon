# eSIM Security Phase A — Per-order charge limit

Status: implemented locally — awaiting acceptance.  
Scope: per-order eSIM charge ceilings only. **No Phase B daily limits. No production enablement. No commit/deploy in this phase.**

## Settings

Stored under `settings.system` (`StoredSystem`):

| Key | Default | Meaning |
|-----|---------|---------|
| `esimMaxChargeAmountVnd` | `2_000_000` | Max SePay eSIM `charge_amount` (VND). `0` = admin VND ceiling off. |
| `esimMaxChargeAmountUsd` | `80` | Max PayPal eSIM `charge_amount` (USD). `0` = admin USD ceiling off (PayPal hardcode 80 / new-account 30 still apply). |

Rules:

- Value `> 0` → active ceiling for that currency.
- Value `= 0` → disable **that** admin setting only.
- Missing / NaN / negative / over hard max → fall back to default (**never** silent unlimited via invalid data).
- Currencies are independent.
- **Not** reused: `guestMaxOrderAmount`, `customerMaxOrderAmount` (cards / topup retail).

Hard max (DTO + resolve): VND `500_000_000`, USD `10_000`.

## Enforce logic

File: `src/modules/esim/esim-order.service.ts` → `assertEsimChargeWithinLimit` after server price snapshot, **before** `createFinancialTransaction` / order rows.

1. Resolve market + supported gateway (existing).
2. Build charge snapshot (VND SePay or USD INTL FX lock).
3. Charge under test:
   - Customer / SePay / non–admin-test PayPal: `priceSnapshot.chargeAmount` + `chargeCurrency`.
   - Admin-test PayPal: `adminTestCharge.amount` (sandbox USD actually charged), not catalog VND.
4. `resolveEsimChargeLimitConfig` + `evaluateEsimChargeLimit` (`esim-charge-limit.rules.ts`).
5. Over limit → `AppHttpException` `ESIM_ORDER_AMOUNT_LIMIT` + security log; no order / payment / provider attempt.

Admin-test still enforces the admin/overall charge ceiling (no amount bypass). It does **not** apply the customer new-account 30 USD age rule (SUPER_ADMIN sandbox is not a new retail buyer).

PayPal effective per-order USD (after C1/C2 completion):

- `overallCap = min(adminCap, 80)` when admin &gt; 0; else hard **80** (Admin cannot raise above 80).
- `effectiveCap = min(overallCap, 30)` when account is new (`accountAgeHours` null or &lt; 48h from **DB** `createdAt`).
- Admin-test: overall/hard caps apply; new-account 30 does not.

See `docs/esim/esim-order-amount-limit-phase-a-completion.md`.

Phase B daily counters are **not** implemented; zeros are still passed into PayPal rules and must not be treated as live protection.

Customer message:

> Đơn vượt giới hạn thanh toán eSIM. Vui lòng chọn gói có giá trị thấp hơn hoặc liên hệ bộ phận hỗ trợ.

## Files changed

| Area | Path |
|------|------|
| Rules | `src/modules/esim/esim-charge-limit.rules.ts` |
| Rules tests | `src/modules/esim/esim-charge-limit.rules.spec.ts` |
| Order enforce tests | `src/modules/esim/esim-charge-limit.order.spec.ts` |
| Order service | `src/modules/esim/esim-order.service.ts` |
| PayPal min-cap | `src/modules/payment/entities/paypal-limits.rules.ts` (+ `.spec.ts`) |
| Error code | `src/common/constants/error-codes.constants.ts` |
| Settings model | `src/modules/settings/entities/settings.constants.ts` |
| Settings store | `src/modules/settings/services/settings-store.service.ts` (`resolveEsimChargeLimits`, admin view) |
| Admin DTO | `src/modules/admin/dto/settings.dto.ts` |
| Admin persist + audit fields | `src/modules/admin/services/settings-admin.service.ts` |
| Admin UI | `apps/admin/app/configuration/system/page.tsx` |
| Admin i18n / types | `apps/admin/lib/i18n/vi.ts`, `apps/admin/types/api.ts` |
| Web error mapping | `apps/web/lib/i18n/final-messages.ts`, `customer-error.ts` |
| This report | `docs/esim/esim-order-amount-limit-phase-a.md` |

## Admin UI

Configuration → System → group **Giới hạn đơn hàng eSIM**:

- Max per order VND / USD.
- Copy: applies only to eSIM; does not affect game cards, phone cards, topup.
- `0` meaning documented in hints.
- Client validation before save; SUPER_ADMIN page.
- Persist via existing `updateSystem` audit (`esimMaxChargeAmountVnd` / `Usd` in audited field list).

## Audit / security event

On block, `EsimOrderService` logs JSON (warn) with:

`event`, `userId`, `market`, `gateway`, `chargeAmount`, `chargeCurrency`, `configuredLimit`, `effectiveLimit`, `reason`, optional `paypalReason`, `at`.

No secrets, tokens, or payment instrument data. No order row created solely for audit.

## Migration

None. Settings are JSON on existing `settings` row (`SYSTEM` key). No production migration, no backfill of old orders.

## Tests run (local)

```text
npx jest --testPathPattern="esim-charge-limit|paypal-limits.rules|esim-admin-test-order" --runInBand
→ 4 suites, 36 tests passed
```

- `esim-charge-limit.rules.spec.ts` — VND/USD boundaries, setting `0`, new-account 30, admin &lt; 30, invalid → default.
- `esim-charge-limit.order.spec.ts` — SePay block / allow, PayPal admin-test USD block, client amount ignored.
- `paypal-limits.rules.spec.ts` — includes lower overall USD vs new-account.
- `esim-admin-test-order.spec.ts` — regression including PayPal sandbox up to `80.00`.

## Confirmations

| Item | Status |
|------|--------|
| Retail card/topup `ORDER_AMOUNT_LIMIT` unchanged | Yes |
| PricingService / FX formula unchanged | Yes |
| SePay IPN / agent wallet / PayPal webhook / fulfillment / Airalo / queue | Untouched |
| No Phase B daily limit / no fake daily stubs as protection | Yes |
| No eSIM production enable, no prod settings change, no commit | Yes |
