# eSIM Phase A Acceptance Audit — Per-order charge limits

**Audit date:** 2026-11-07  
**Scope:** Independent verification of Phase A only. No code changes, no migration, no commit/deploy, no production toggle, no Phase B, no live payments.  
**Verdict (initial audit):** **PASS WITH CONDITIONS**  
**Follow-up:** C1–C3 closed in `docs/esim/esim-order-amount-limit-phase-a-completion.md` (2026-11-07).

---

## 1. Files and code locations inspected

| Area | Path | Notes |
|------|------|--------|
| Phase A design note | `docs/esim/esim-order-amount-limit-phase-a.md` | Matches implementation at a high level |
| Charge-limit rules | `src/modules/esim/esim-charge-limit.rules.ts` | Defaults, resolve, evaluate, PayPal effective cap |
| Rules unit tests | `src/modules/esim/esim-charge-limit.rules.spec.ts` | Boundary + setting semantics |
| Order enforce | `src/modules/esim/esim-order.service.ts` (`create`, `assertEsimChargeWithinLimit`, ~L232–249, ~L344–391) | Single create path for customer + admin-test |
| Order enforce tests | `src/modules/esim/esim-charge-limit.order.spec.ts` | Block / allow / client amount ignored |
| PayPal limits | `src/modules/payment/entities/paypal-limits.rules.ts` | `Math.min` overall + new-account |
| PayPal limits tests | `src/modules/payment/entities/paypal-limits.rules.spec.ts` | Includes admin &lt; 30 |
| Error code | `src/common/constants/error-codes.constants.ts` | `ESIM_ORDER_AMOUNT_LIMIT` |
| Settings model | `src/modules/settings/entities/settings.constants.ts` (`StoredSystem`) | Separate from `StoredOrder` card limits |
| Settings resolve / admin view | `src/modules/settings/services/settings-store.service.ts` (`resolveEsimChargeLimits`, `getSystemAdminView`) | Invalid → resolved defaults on admin GET |
| Admin DTO | `src/modules/admin/dto/settings.dto.ts` (`UpdateSystemSettingsDto`) | `@Min(0)`, hard max, `@Type(() => Number)` |
| Admin persist + audit | `src/modules/admin/services/settings-admin.service.ts` (`updateSystem` → `persist`) | Fields in `updatedFields` audit list |
| Retail order limits (unchanged) | `src/modules/order/services/order.service.ts` | Still `guestMaxOrderAmount` / `customerMaxOrderAmount` only for non-eSIM |
| eSIM create entry | `OrderService.create` → `esimOrders.create` when lane `esim` | No second create path found |
| Admin-test entry | `EsimOpsAdminController` → `createAdminTest` | Same `create` + charge assert |
| Admin UI | `apps/admin/app/configuration/system/page.tsx` | Group «Giới hạn đơn hàng eSIM» |
| Admin i18n / types | `apps/admin/lib/i18n/vi.ts`, `apps/admin/types/api.ts` | Labels + `SystemSettings` fields |
| Web error mapping | `apps/web/lib/i18n/final-messages.ts`, `customer-error.ts` | Code + VI message mapped |

**Not modified by Phase A (spot-checked by path presence / no `esimMaxCharge` coupling):** PricingService formulas, FX `convertVndSellToUsd` / `selectCheckoutFx`, SePay eSIM IPN service, PayPal eSIM webhook service, Airalo adapter, queue workers, retail card/topup amount limits.

---

## 2. Requirements cross-check (evidence)

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | `esimMaxChargeAmountVnd` default 2_000_000 | **PASS** | `ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT`; `resolveEsimChargeLimitConfig({})` → 2_000_000; admin UI fallback `2_000_000` |
| 2 | `esimMaxChargeAmountUsd` default 80 | **PASS** | `ESIM_MAX_CHARGE_AMOUNT_USD_DEFAULT`; tests + admin UI fallback `80` |
| 3 | `0` disables corresponding **Admin** ceiling | **PASS** | VND: `configured <= 0` → allow; USD: admin `0` → overall falls back to PayPal hardcode 80 (new-account still applies) |
| 4 | Invalid setting must **not** become silent unlimited / `0` | **PASS** | `resolveEsimMaxChargeSetting`: missing / NaN / negative / over hard max → default; unit test covers `undefined`, `'nope'`, `-1`, explicit `0` |
| 5 | Currencies independent; not reuse card limits | **PASS** | Separate `StoredSystem` keys; retail still uses `StoredOrder` guest/customer max only |
| 6 | Enforce on server charge snapshot (not catalog / FE amount) | **PASS** | Assert uses `priceSnapshot.chargeAmount` / currency, or `adminTestCharge` for PayPal admin-test; `CreateOrderDto` has no charge fields; order test ignores fake `totalAmount`/`chargeAmount` |
| 7 | VND path = SePay charge VND | **PASS** | Non-INTL / non–customer-INTL uses `vndSnapshot`; assert currency from snapshot |
| 8 | USD path = server USD snapshot | **PASS** | Customer INTL: `lockIntlUsdPrice` then assert on USD charge |
| 9 | PayPal effective = lowest active ceiling | **PASS*** | `effectivePaypalUsdOrderCap` + `evaluatePaypalEsimLimits` take `Math.min(overall, newAccount?)`. Overall = admin if `>0` else hardcode 80. *See condition C1 if admin set **above** 80 |
| 10 | Preserve new-account 30 when admin=80 | **PASS** (rules) | Unit: age 1h → effective 30; 30.01 blocked |
| 11 | Admin USD &lt; 30 → use lower | **PASS** | Rules + paypal-limits.spec: admin 20 → block 20.01 |
| 12 | Admin-test PayPal uses `adminTestCharge.amount` | **PASS** | `limitChargeAmount = adminTestCharge.amount` when set |
| 13 | Admin-test: charge ceiling yes; age-30 no | **PASS** | `accountAgeHours: adminTest ? Number.POSITIVE_INFINITY : null`; admin-test accepts 80.00 in regression |
| 14 | No default bypass for admin-test amount | **PASS** | order.spec: USD admin limit 5 + test amount 10 → `ESIM_ORDER_AMOUNT_LIMIT`, no financial/order create |
| 15 | Error `ESIM_ORDER_AMOUNT_LIMIT` + customer message | **PASS** | `AppHttpException` + `ESIM_ORDER_AMOUNT_LIMIT_MESSAGE` |
| 16 | Block before order / payment / provider | **PASS** (unit) | Assert immediately before `createFinancialTransaction`; tests assert neither financial nor order create called; `create()` does not call SePay/PayPal APIs (payment is a later step) |
| 17 | Security log on block, no secrets | **PASS** | `Logger.warn` JSON: userId, market, gateway, chargeAmount/Currency, configured/effective limit, reason, paypalReason?, at — no tokens/secrets |
| 18 | Admin UI group + 0 hint + validation + SUPER_ADMIN | **PASS** | System page group + hints; client validation; page wrapped in `RequireRole SUPER_ADMIN` |
| 19 | Audit when settings change | **PASS** | `persist(..., ['…','esimMaxChargeAmountVnd','esimMaxChargeAmountUsd',…])` → `adminAudit.record` with `updatedFields` |
| 20 | Backend DTO validation | **PASS** | Int/number, Min 0, Max hard caps |
| 21 | No Phase B daily protection pretended | **PASS** | Comment + zeros for daily counters; no live PAID query |
| 22 | No migration / prod enable in Phase A | **PASS** | JSON settings only; sales flag unchanged by this feature |

---

## 3. Boundary values

| Case | Expected | Verified how | Result |
|------|----------|--------------|--------|
| VND 1_999_999 | allow | `esim-charge-limit.rules.spec.ts` | PASS |
| VND 2_000_000 | allow | same | PASS |
| VND 2_000_001 | block | same | PASS |
| VND setting `0` | allow large amount | same | PASS |
| USD 79.99 (mature) | allow | same (`accountAgeHours: 100`) | PASS |
| USD 80 (mature) | allow | same | PASS |
| USD 80.01 (mature) | block | same | PASS |
| New account 30 / 30.01 | allow / block | same | PASS |
| Admin USD 20 vs new account | effective 20 | same + `paypal-limits.rules.spec.ts` | PASS |
| Admin USD setting `0` (mature) | hardcode 80 still blocks 80.01 | rules.spec | PASS |
| Invalid setting | default, not unlimited | rules.spec | PASS |
| SePay order over limit | no financial/order write | `esim-charge-limit.order.spec.ts` | PASS |
| PayPal admin-test over admin USD | no financial/order write | order.spec | PASS |
| Client fake amount on create | still blocked by server charge | order.spec | PASS |

Live HTTP / DB integration boundaries were **not** exercised in this audit (by scope: no real payments, no DB reset/seed).

---

## 4. Atomicity (over-limit → no side effects)

| Check | Result | Evidence |
|-------|--------|----------|
| No `createFinancialTransaction` | **PASS** (unit) | order.spec: `not.toHaveBeenCalled()` on block |
| No `createWithTransaction` (order row) | **PASS** (unit) | same |
| No provider attempt at create | **PASS** (static) | `EsimOrderService.create` does not enqueue fulfill or call provider buy on create; provider work is post-payment |
| No SePay / PayPal API on create | **PASS** (static) | Gateway calls live in payment services after an order exists |
| Security log present | **PASS** | Nest WARN JSON observed during order.spec run |
| Existing orders unaffected | **PASS** (static / design) | Throw aborts Prisma transaction before writes; reuse path returns existing waiting order without re-asserting limit (no mutation of unrelated orders) |

**Gap:** No DB-level assertion that a rolled-back transaction left zero rows (unit harness mocks Prisma). Residual risk: low if Nest/Prisma abort behaves as usual.

---

## 5. Regression results (this audit run)

Command (audit machine, 2026-11-07):

```text
npx jest --testPathPattern="esim-charge-limit.rules.spec|esim-charge-limit.order.spec|paypal-limits.rules.spec|esim-admin-test-order.spec|esim-usd-snapshot.spec|esim-order-idempotency.spec|esim-sales-toggle.spec|esim-paypal-payment.spec|esim-sepay-payment.spec" --runInBand
```

| Suite | Tests | Result |
|-------|------:|--------|
| `esim-charge-limit.rules.spec.ts` | 7 | PASS |
| `esim-charge-limit.order.spec.ts` | 4 | PASS |
| `paypal-limits.rules.spec.ts` | 4 | PASS |
| `esim-admin-test-order.spec.ts` | 21 | PASS |
| `esim-usd-snapshot.spec.ts` | 7 | PASS |
| `esim-order-idempotency.spec.ts` | 10 | PASS |
| `esim-sales-toggle.spec.ts` | 6 | PASS |
| `esim-paypal-payment.spec.ts` | 13 | PASS |
| `esim-sepay-payment.spec.ts` | 20 | PASS |
| **Total executed** | **92** | **92 PASS** |

### Related suites **not** re-run in this audit

| Suite / area | Why noted |
|--------------|-----------|
| `order.service.spec.ts` | Retail card/topup create + `ORDER_AMOUNT_LIMIT` — static confirm only (still uses guest/customer max; eSIM delegated) |
| `payment.service.spec.ts` | Broad retail PaymentService |
| SePay **agent wallet** webhook / deposit specs | Unrelated path; no `esimMaxCharge` references found in order-limit wiring |
| Topup-specific suites | Unchanged by Phase A; not executed here |
| `esim.phase-a.spec.ts` / lifecycle / C-1 guards | Broader eSIM; C-1 had a pre-existing i18n string assert failure in an earlier session — **not** re-validated as part of charge-limit acceptance |
| Admin UI Vitest / Playwright | No automated UI test for new System fields |
| Production / staging E2E checkout | Out of scope (no real payment) |

**Retail payment isolation (static):** eSIM SePay/PayPal payment specs explicitly assert card/retail routing remains separate; Phase A gate sits on order create, not inside retail `PaymentService` amount math.

---

## 6. Unverified items and residual risks

### Conditions (do not block Phase A intent, but must be known)

**C1 — Admin USD above hardcode 80**  
Implementation: overall = `admin if > 0 else 80`, then min with new-account 30. If Admin sets `100`, mature effective is **100**, not `min(100, 80)`. Matches Phase A design text «thay thế/bọc trần hardcode bằng setting Admin», but differs from a literal three-way `min(Admin, 80, 30)`. Product should confirm whether Admin may raise above 80.

**C2 — Customer PayPal always `accountAgeHours: null` on create**  
Live `create()` passes `null` for non–admin-test (JWT has no `createdAt`). That means **every customer PayPal order is treated as new-account** → effective ≤ 30 unless Admin USD is lower. Mature-account 80 behaviour exists only when callers pass age (unit tests). This predates Phase A and was preserved; Phase A did not wire real account age. Risk: mature buyers cannot use 30–80 USD until age is loaded from DB.

**C3 — Atomicity proven in unit mocks only**  
No integration test against real Postgres proving zero rows after block.

**C4 — Security log fields**  
Has userId, market, gateway, amounts, limits, reason, timestamp. No `orderId` (correct: order not created). No dedicated structured audit table row for blocks (Logger only) — acceptable for Phase A if ops can scrape logs.

**C5 — Admin config audit is field-list based**  
`updatedFields` includes the new keys when `updateSystem` runs; no dedicated unit test asserting audit payload for these two fields alone.

**C6 — Daily stubs**  
`ordersPaidToday = 0` / `usdPaidToday = 0` still passed into PayPal rules. Documented as non-protective Phase A; must not be mistaken for live daily AML. Phase B remaining.

### Non-issues for this verdict

- Reuse of waiting eSIM order skips re-check: expected (order already created under prior check).
- Admin-test skipping new-account 30: intentional and documented.
- No migration: intentional (JSON settings).

---

## 7. Suggested fixes (record only — **not applied** in this audit)

1. Load `user.createdAt` (or account age hours) on customer PayPal create so mature accounts can use Admin/hardcode ceiling above 30 (addresses **C2**).
2. Optionally clamp Admin USD with `Math.min(adminSetting, DEFAULT_PAYPAL_ESIM_LIMITS.maxUsdPerOrder)` if product wants hardcode 80 as absolute ceiling even when Admin is higher (**C1**).
3. Add one Prisma integration test: over-limit create → assert zero new `orders` / `financial_transactions` / `payment_records` (**C3**).
4. Optional: structured security event sink beyond Nest logger for ops alerting (**C4**).

---

## 8. Conclusion

| | |
|--|--|
| **Verdict** | **PASS WITH CONDITIONS** |
| **Why not FAIL** | Defaults, validation fallback, server-side charge enforce, VND/USD independence, PayPal min-of-active-ceilings (admin OR hardcode + new-account), admin-test amount handling, error code/message, settings UI + audit fields, and 92/92 targeted regression tests all hold. No evidence of order/payment/provider creation on block in unit evidence. |
| **Why not unconditional PASS** | **C2** (customer age always null → 30 USD in practice), **C1** (Admin may raise above 80), **C3** (no DB integration proof), plus retail/agent-wallet suites not re-executed in this pass. |
| **Phase B** | Not started (correct). |
| **Next step** | Owner acceptance of conditions; optional follow-ups above before / during go-live hardening. |

*End of acceptance audit. No code was modified in this pass.*
