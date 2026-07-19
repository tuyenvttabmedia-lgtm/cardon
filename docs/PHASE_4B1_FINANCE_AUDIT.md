# Phase 4B.1 — Finance Integrity Audit

> Date: 2026-06-19  
> Scope: Finance backend correctness audit (`src/modules/finance/`)  
> Not included: Frontend, tax API, new features

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:finance` | **PASS (33/33)** |
| Checks passed | **10/10** |
| Critical fixes | **4** |

---

## Audit Checks

### CHECK 1: Profit correctness — **PASS** (after fix)

**Scenario:** Revenue 100,000 − Provider cost 98,000 = Gross profit **2,000**

| Control | Before | After |
|---------|--------|-------|
| Only completed orders | `paymentStatus: PAID` only | **+ `fulfillmentStatus: COMPLETED`** |
| Exclude FAILED / REFUND / CANCEL | Partial (PAID filter) | REFUNDED/FAILED/EXPIRED excluded via PAID+COMPLETED |

**Fix:** `FinanceRepository.calculateProfit()` now requires `FulfillmentStatus.COMPLETED`.

---

### CHECK 2: Payment reconciliation safety — **PASS**

| Scenario | Result |
|----------|--------|
| Amount mismatch | `AMOUNT_MISMATCH` reconcile item only |
| Status mismatch | `STATUS_MISMATCH` reconcile item only |
| Missing gateway txn | `MISSING_GATEWAY` item only |

**Verified:** `PaymentReconcileService` only reads payments and writes `reconcile_reports` / `reconcile_items`. **No payment mutation.**

---

### CHECK 3: Provider reconciliation safety — **PASS**

**Scenario:** eSale charged, CardOn missing transaction.

| Expected | Result |
|----------|--------|
| `MISSING_INTERNAL` | `MISSING_LOCAL` → label `MISSING_INTERNAL` |
| Manual review required | Item stored with `resolution: OPEN` (default) |
| No automatic correction | Provider reconcile is read-only on `provider_transactions` |

---

### CHECK 4: Agent statement correctness — **PASS** (after fix)

| Control | Before | After |
|---------|--------|-------|
| Balance from `ledger_entries` | Partial | **Full** |
| No cached `agent.balance` fallback | **FAIL** — used when no ledger rows | **Removed** — returns `0.00` |

**Fix:** `AgentStatementService` opening/closing balance derived only from ledger entries (or zero when empty).

---

### CHECK 5: Invoice duplication — **PASS** (after fix)

| Scenario | Expected | Result |
|----------|----------|--------|
| Same order twice | Return existing or reject | **Returns existing non-VOID invoice** |
| Same agent ledger entry twice | Return existing or reject | **Returns existing non-VOID invoice** |

**Fix:** `findNonVoidInvoiceByOrderId()` + `findNonVoidAgentInvoiceByLedgerEntryId()` idempotency in `InvoiceService`.

---

### CHECK 6: Invoice immutability — **PASS**

| Control | Status |
|---------|--------|
| No API to edit amount/tax/customer after ISSUED | **PASS** — no update endpoint |
| Only VOID allowed after ISSUED | **PASS** — `updateInvoiceStatus()` status-only |
| Guard helper | `assertInvoiceMutableForFinancialEdit(ISSUED)` throws |

Financial fields (`subtotal`, `taxAmount`, `totalAmount`, `metadata`) have no repository update method.

---

### CHECK 7: CSV export security — **PASS** (after fix)

Export columns limited to:

- Reconciliation: reference, match_status, amounts, resolution
- Profit: aggregate metrics only
- Agent statement: ledger fields only

**Fix:** `assertExportCsvSafe()` blocks CSV containing `apiKeyHash`, `encryptedPin`, `secretKey`, etc.

---

### CHECK 8: Finance permissions — **PASS**

| Role | finance.view | finance.manage | Admin system |
|------|-------------|----------------|--------------|
| **SUPPORT** | ❌ | ❌ | ❌ |
| **ACCOUNTANT** | ✅ | ✅ | ❌ (`settings.manage`, `agents.manage`) |
| **ADMIN** | ✅ | ✅ | ✅ |

All finance routes protected by `PermissionsGuard`.

---

### CHECK 9: Large report safety — **PASS** (after fix)

| Control | Implementation |
|---------|----------------|
| Date range limit | `FINANCE_MAX_DATE_RANGE_DAYS = 366` via `assertFinanceDateRange()` |
| Pagination | `@Max(100)` on list DTOs + `resolvePagination()` |
| Reconcile input cap | `@ArrayMaxSize(5000)` on gateway/provider lines |
| Internal query cap | `take: 10000` on payment/provider/ledger queries |

---

### CHECK 10: Audit integrity — **PASS**

| Action | Audit code | Verified |
|--------|------------|----------|
| Reconcile create | `RECONCILE_CREATED` | ✅ |
| Invoice create | `INVOICE_CREATED` | ✅ |
| Invoice void | `INVOICE_VOIDED` | ✅ |

Note: Invoice **issue** (DRAFT→ISSUED) does not create audit — status transition only, no financial change.

---

## Critical Fixes Summary

1. **Profit** — require `fulfillmentStatus: COMPLETED` (not just PAID)
2. **Agent statement** — remove cached `agent.balance` fallback
3. **Invoice duplication** — idempotent return existing invoice
4. **Large report safety** — date range limits, array caps, query `take` bounds

---

## Test Coverage

```
src/modules/finance/finance.service.spec.ts           — 12 tests (Phase 4B core)
src/modules/finance/finance.integrity-audit.spec.ts   — 21 tests (Phase 4B.1 audit)
```

Run:

```powershell
npm run build
npm run test:finance
```

---

## Files Changed

| File | Change |
|------|--------|
| `repositories/finance.repository.ts` | COMPLETED filter, query caps, invoice duplicate finders |
| `services/agent-statement.service.ts` | Remove cached balance fallback |
| `services/invoice.service.ts` | Idempotent invoice create |
| `services/profit.service.ts` | Date range validation |
| `services/export.service.ts` | CSV safety assertions |
| `dto/finance.dto.ts` | `@ArrayMaxSize` on reconcile lines |
| `entities/finance.constants.ts` | Safety limit constants |
| `entities/export-safety.ts` | **NEW** — sensitive field guard |
| `utils/finance-date-range.util.ts` | **NEW** — max range validation |
| `finance.integrity-audit.spec.ts` | **NEW** — 21 audit tests |

---

## Out of Scope

- Frontend
- Tax authority API
- New finance features

---

## Next Phase

**Do not start frontend.** Phase 4B.1 complete — ready for owner review.
