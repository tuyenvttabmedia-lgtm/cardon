# eSIM Phase A Completion — C1 / C2 / C3

**Date:** 2026-11-07  
**Input:** `docs/esim/esim-order-amount-limit-phase-a-acceptance.md` (PASS WITH CONDITIONS)  
**Owner acceptance:** **PASS** (confirmed 2026-11-07) — C1/C2/C3 closed with required evidence.  
**Status:** Phase A complete. Code/config frozen pending further owner instruction.  
**Out of scope / frozen:** Phase B, Phase 5, commit, deploy, production eSIM enable, live payments, feature migrations.

---

## 1. Summary of changes

| Condition | Fix |
|-----------|-----|
| **C1** Hard cap 80 USD | `overallCap = min(adminCap, 80)` always. Admin cannot raise above 80. Setting `0` turns off Admin layer only; hard 80 remains. DTO/UI max = 80. Stale DB values &gt; 80 resolve to default 80; enforce path also clamps. |
| **C2** Account age from DB | Customer create loads `User.createdAt` by authenticated `userId`. Age = `max(0, (now - createdAt) / 3600000)`. Missing/invalid/DB error → `null` (fail-closed = new-account 30). Never from JWT/FE. Admin-test still skips age-30 (uses `+Infinity`) but keeps hard/Admin caps. |
| **C3** PostgreSQL zero-row | New IT `test/integration/esim-charge-limit-zero-row.it.ts` on isolated `cardon-it` (127.0.0.1:5434). VND + USD over-limit → `ESIM_ORDER_AMOUNT_LIMIT` and zero new orders / financial / payments / provider tx / attempts / quotes for that user. |

---

## 2. Files changed

| File | Why |
|------|-----|
| `src/modules/esim/esim-charge-limit.rules.ts` | C1 `resolvePaypalOverallUsdCap`, USD hard max 80; C2 `accountAgeHoursFromCreatedAt`; effective cap formula |
| `src/modules/esim/esim-charge-limit.rules.spec.ts` | C1/C2 boundary + hard-cap tests |
| `src/modules/esim/esim-order.service.ts` | C2 `resolveCustomerAccountAgeHours`; pass age into assert |
| `src/modules/esim/esim-charge-limit.order.spec.ts` | C2 DB lookup / admin-test skip age |
| `src/modules/payment/entities/paypal-limits.rules.ts` | Clamp overall USD ≤ 80 inside `evaluatePaypalEsimLimits` |
| `src/modules/payment/entities/paypal-limits.rules.spec.ts` | Admin 100 → still cap 80 |
| `src/modules/admin/dto/settings.dto.ts` | `@Max(80)` for USD |
| `src/modules/settings/entities/settings.constants.ts` | Comment: absolute hard max 80 |
| `apps/admin/app/configuration/system/page.tsx` | UI max 80 + validation copy |
| `apps/admin/lib/i18n/vi.ts` | Hint: hard cap 80 |
| `apps/admin/types/api.ts` | Type comment |
| `test/integration/esim-charge-limit-zero-row.it.ts` | **New** C3 IT |
| `docs/esim/esim-order-amount-limit-phase-a-completion.md` | This report |

No Prisma migration. Settings remain JSON on `settings.system`.

---

## 3. PayPal effective cap formula (after C1)

```text
hardCap     = 80 USD          // DEFAULT_PAYPAL_ESIM_LIMITS.maxUsdPerOrder
adminCap    = setting if > 0 and ≤ 80 after resolve; else “off”
overallCap  = adminCap > 0 ? min(adminCap, hardCap) : hardCap
              // always ≤ 80

isNew       = accountAgeHours == null
              OR accountAgeHours < newAccountMaxAgeHours (48)

effectiveCap =
  isNew ? min(overallCap, 30) : overallCap
```

Examples:

| Admin | Age | Effective |
|------:|----:|----------:|
| 100 (invalid → resolve 80) | mature | 80 |
| 80 | mature | 80 |
| 50 | mature | 50 |
| 0 | mature | 80 |
| 80 | new | 30 |
| 20 | new | 20 |
| any | admin-test | overallCap (no 30) |

---

## 4. Evidence — customer account age from DB (C2)

In `EsimOrderService.create` (non–admin-test):

1. `resolveCustomerAccountAgeHours(user.id)` → `prisma.user.findUnique({ where: { id }, select: { createdAt: true } })`.
2. `accountAgeHoursFromCreatedAt(createdAt)`.
3. On miss/invalid/throw → warn `ESIM_ACCOUNT_AGE_FALLBACK` with reason `USER_NOT_FOUND` | `INVALID_CREATED_AT` | `DB_LOOKUP_FAILED`, return `null`.
4. Value passed into `assertEsimChargeWithinLimit` → `evaluateEsimChargeLimit` / PayPal rules.

Unit proof:

- `esim-charge-limit.order.spec.ts`: customer create calls `findUnique` with `{ id, select: { createdAt } }`; admin-test does **not** call it.
- `esim-charge-limit.rules.spec.ts`: age helper + boundary at 48h (`<` = new, `==` = mature).

---

## 5. Boundary / error cases

| Case | Result | Covered by |
|------|--------|------------|
| Admin 100 / stored &gt; 80 | overall 80 | rules + paypal-limits.spec |
| Admin 80 / 50 / 0 | 80 / 50 / 80 | rules.spec |
| Invalid setting | default 80 | rules.spec |
| New account 30 / 30.01 | allow / block | rules.spec |
| Admin 20 + new | 20 | rules.spec |
| Mature 80 / 80.01 | allow / block | rules.spec |
| Admin-test 80 / 80.01 | allow / block (parse + limit) | admin-test-order + order.spec |
| createdAt null / invalid | age null → 30 path | rules.spec + order.spec USER_NOT_FOUND |
| DB lookup failure | fail-closed null | order service catch + usd-snapshot harness logs |

---

## 6. C3 PostgreSQL integration (zero-row)

**Environment:** existing container `cardon-it-postgres` started (not recreated; no volume wipe).  
`CARDON_IT_DATABASE_URL` → `127.0.0.1:5434/cardon_it` only.  
Guarded migrate deploy applied pending migrations onto **cardon_it** only (not local-full :5433).

**Suite:** `test/integration/esim-charge-limit-zero-row.it.ts`

| Test | Before → after (per user) | Error |
|------|---------------------------|-------|
| SePay VND over limit (charge 100000, max 50000) | orders/financial/payments/providerTx/attempts/quotes/orphanFinancial unchanged at 0 | `ESIM_ORDER_AMOUNT_LIMIT` |
| PayPal USD over limit (2100000 VND → 84.00 USD, hard 80, mature user) | same zero-row assertions | `ESIM_ORDER_AMOUNT_LIMIT` |

Run (audit machine):

```text
npx jest --config jest.integration.config.js --runInBand --testPathPattern=esim-charge-limit-zero-row
→ 1 suite, 2 tests PASS
```

Security logs observed with chargeAmount/configuredLimit/effectiveLimit (no secrets).

---

## 7. Test suite totals

### Unit / component regression (this completion)

```text
npx jest --testPathPattern="esim-charge-limit|paypal-limits.rules|esim-admin-test-order|esim-usd-snapshot|esim-order-idempotency|esim-sales-toggle|esim-paypal-payment|esim-sepay-payment" --runInBand
→ 9 suites, 97 tests PASS
```

| Suite | Tests |
|-------|------:|
| esim-charge-limit.rules.spec.ts | 9 |
| esim-charge-limit.order.spec.ts | 6 |
| paypal-limits.rules.spec.ts | 5 |
| esim-admin-test-order.spec.ts | 21 |
| esim-usd-snapshot.spec.ts | 7 |
| esim-order-idempotency.spec.ts | 10 |
| esim-sales-toggle.spec.ts | 6 |
| esim-paypal-payment.spec.ts | 13 |
| esim-sepay-payment.spec.ts | 20 |
| **Subtotal** | **97** |

### Integration

| Suite | Tests | Result |
|-------|------:|--------|
| esim-charge-limit-zero-row.it.ts | 2 | PASS |

**Combined targeted:** 99 PASS.

---

## 8. Regression / isolation

- eSIM PayPal webhook + SePay IPN suites PASS (unchanged behaviour aside from shared PayPal overall clamp ≤ 80).
- USD snapshot + admin-test + idempotency + sales-toggle PASS.
- Retail `guestMaxOrderAmount` / `customerMaxOrderAmount` untouched.
- No edits to PricingService, FX convert formula, Airalo adapter, queue, agent wallet, or retail PaymentService beyond the shared `paypal-limits.rules` clamp used by eSIM.
- Spot-check: no new references to eSIM charge limits in agent-deposit / topup modules.

**Not re-run:** full `order.service.spec.ts`, `payment.service.spec.ts`, agent-wallet deposit suites (static isolation only).

---

## 9. Migration / DB

| Item | Status |
|------|--------|
| Feature migration | **None** (JSON settings) |
| IT `cardon_it` migrate deploy | Applied pending migrations on isolated IT DB only |
| Production / local-full DB | **Not** migrated / not touched |
| Docker volume reset | **Not** done |

---

## 10. Residual risks / unverified

1. Full retail/agent-wallet Jest suites not re-executed in this pass.
2. Admin UI has no dedicated Vitest for the new max-80 field (client validation present).
3. Customer mature path now works when `createdAt` exists; accounts with corrupted `createdAt` stay on 30 USD by design (fail-closed).
4. IT does not assert Bull/Redis job absence (create path does not enqueue before payment; no Redis in IT).
5. `cardon-it-postgres` was started from an existing stopped container; credentials remain local ops concern (not committed).

---

## 11. Acceptance criteria checklist

| Criterion | Result |
|-----------|--------|
| C1: hard cap 80 cannot be raised by Admin | **PASS** |
| C2: age from DB + fail-closed | **PASS** |
| C3: PostgreSQL zero-row IT | **PASS** |
| Related regression PASS | **PASS** (97 + 2) |
| No Phase B / no commit / no prod enable | **PASS** |

**Owner verdict:** **PASS** (C1–C3 closed).

### Pre-production rollout checklist (residual — not blocking Phase A)

Run or spot-check before production eSIM rollout (separate from Phase A scope):

- [ ] Retail `PaymentService` / `order.service` regression suites (card + topup amount limits unchanged).
- [ ] SePay agent-wallet / deposit webhook isolation.
- [ ] Redis / BullMQ: confirm blocked over-limit create enqueues no fulfillment / eSIM queue jobs (IT covered DB zero-row; job bus not asserted in C3).

*Stop. Do not commit, deploy, enable eSIM production, or start Phase B / Phase 5 without a new owner instruction.*
