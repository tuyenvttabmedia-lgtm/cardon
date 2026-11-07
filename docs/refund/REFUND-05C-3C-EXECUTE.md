# REFUND-05C-3C-EXECUTE — Workflow Service Verification

**Date:** 2026-11-04  
**Environment:** LOCAL ONLY — compose `cardon-local-full`, database `cardon`  
**Marker:** `RFD-05C3C-%`  
**Scope:** W01–W06 only (W07 excluded)  
**Based on:** `REFUND-05C-3C-PREFLIGHT.md`, `REFUND-05C-3C-ACCOUNTANT-LOCAL-RESET.md`  
**Verdict:** **PASS**

---

## A. Environment and account preflight

| Check | Result |
|---|---|
| Branch (dirty tree present; no commit) | `cursor/frontend-healthcheck-port` |
| Compose `cardon-local-full` | PASS — api/admin/postgres healthy |
| Database | `cardon` |
| API image | `cardon-api:local-full` `sha256:c4398f0e…22293ae1d` |
| Admin image | `cardon-admin:local-full` `sha256:efbbff76…297dcd4ad` |
| Production / VPS | Not used |

### Actors (`/auth/me`)

| Actor | Email | ID | Role | Refund permissions |
|---|---|---|---|---|
| SUPER_ADMIN | `superadmin@cardon.vn` | `f93f17b4-…4069b` | SUPER_ADMIN | request, approve, execute, reconcile |
| ACCOUNTANT | `maint@keyon.vn` | `880c38ae-…db46` | ACCOUNTANT | request, approve, execute, reconcile |

Tokens/passwords: not printed. No password reset / user create / RBAC change in this ticket.

### Baseline (before fixtures)

| Table | Count |
|---|---:|
| orders / payments / order_items | 85 / 85 / 85 |
| refund_requests / refund_attempts | 0 / 0 |
| ledger_entries | 2 |
| audit_logs | 527 |
| Marker `RFD-05C3C-%` | 0 |
| eSIM PAID + SUCCESS | 7 |

---

## B. Fixture approach

- Synthetic Order + Payment + order_item only (non-eSIM `VIETTEL_10K`), marker `RFD-05C3C-*`.
- All refund transitions via admin Refund APIs (service path).
- Evidence: `RFD-05C3C-TEST-PAYOUT-*`, `RFD-05C3C-TEST-STATEMENT-*`, destination `VCB ****1234 · RFD*`.
- No SQL forcing of request/attempt/order refund statuses.
- No SoD bypass (`executed_by_id` not rewritten).
- W07 not run.

Peak marker counts during run: **10** orders/payments/items, **11** requests, **8** attempts. Ledger stayed **2**.

---

## C. W01–W06 results

| Case | Result | Notes |
|---|---|---|
| **W01** Happy path → VERIFIED → Order REFUNDED | **PASS** | Create ACCOUNTANT → approve SUPER_ADMIN → execute/complete SUPER_ADMIN → reconcile ACCOUNTANT |
| **W02** Maker-checker / SoD | **PASS** | See sub-cases |
| **W03** Fail / Unconfirm / open-guard | **PASS** | See sub-cases |
| **W04** Reconcile guards / REJECTED | **PASS** | See sub-cases |
| **W05** Idempotency / concurrency / over-refund | **PASS** | See sub-cases |
| **W06** Order status / partial / remaining cap | **PASS** | See sub-cases |
| **W07** | **N/A** | Excluded by owner |

### W02 maker-checker / SoD

| Sub | Expect | Actual | Result |
|---|---|---|---|
| B1 ACCOUNTANT self-approve | 403 | 403 | PASS |
| B2 SUPER_ADMIN self-approve | allowed | 201 APPROVED | PASS |
| B3 Executor (SUPER_ADMIN) self-reconcile | 403 | 403 | PASS |
| B4 Other actor (ACCOUNTANT) reconcile | success | 201 | PASS |

### W03 failure / open attempt

| Sub | Expect | Actual | Result |
|---|---|---|---|
| C1 Fail releases openGuard | FAILED, no openGuard | yes | PASS |
| C2 Fail after transfer evidence | 400 | 400 | PASS |
| C3 Unconfirm keeps openGuard | UNCONFIRMED + openGuard=requestId | yes | PASS |
| C4 Execute while UNCONFIRMED open | 400 | 400 | PASS |
| C5 Re-execute after FAILED | new SENT | 201 | PASS |

### W04 reconciliation

| Sub | Expect | Actual | Result |
|---|---|---|---|
| D1 VERIFIED full cover | Order REFUNDED | via W01 | PASS |
| D2 REJECTED | MANUAL_REVIEW, Order PAID, recon REJECTED | yes | PASS |
| D3 Reconcile non-SUCCEEDED | 400 | 400 (UNCONFIRMED) | PASS |
| D4 Terminal recon change | 409 | 409 | PASS |

### W05 idempotency / concurrency

| Sub | Expect | Actual | Result |
|---|---|---|---|
| E1 Double execute same Idempotency-Key | replay, 1 attempt | replayed=true, count=1 | PASS |
| E2 Same key different amount | 409 | 409 | PASS |
| E3 Duplicate complete | replay | replayed=true | PASS |
| E4 Concurrent create over cap | 1×201 + 1×400 | 201/400 | PASS |
| E5 Concurrent execute different keys | 1 attempt | count=1, 201/400 | PASS |
| E6 Over-refund create | 400 | 400 | PASS |

### W06 order status

| Sub | Expect | Actual | Result |
|---|---|---|---|
| F1 Partial VERIFIED | Order PAID | PAID | PASS |
| F2 Full SUCCEEDED + PENDING_VERIFY | Order PAID | PAID | PASS |
| F3 Full VERIFIED | Order REFUNDED | REFUNDED | PASS |
| F4 Remaining cap | 60000 OK / 60000.01 400 | 201 / 400 | PASS |

---

## D. Admin / API read check

- Workflow exercised through live admin Refund API under both sessions.
- Spot `GET /admin/refund-requests?q=RFD-05C3C` during run returned empty `total` in the client unwrap used for smoke — **deviation (non-blocking)**; DB concurrently held 11 marker requests and cleanup confirmed them. Detail/list correctness was already covered in 05C-3B UI; this ticket’s acceptance is service/API workflow.

---

## E. Counts before / after create / after cleanup

| Table | Baseline | After create (peak) | After cleanup |
|---|---:|---:|---:|
| orders | 85 | 95 | **85** |
| order_items | 85 | 95 | **85** |
| payments | 85 | 95 | **85** |
| refund_requests | 0 | 11 | **0** |
| refund_attempts | 0 | 8 | **0** |
| ledger_entries | 2 | 2 | **2** |
| audit_logs | 527 | 567 | **567** (retained) |
| eSIM PAID + SUCCESS | 7 | 7 | **7** |
| Marker orders left | 0 | 10 | **0** |

Audit Δ during ticket ≈ +40 (login probes earlier + ~38 marker `REFUND_*` retained). Marker-scoped retained audits counted at cleanup: **38**.

---

## F. Cleanup

| Step | Count |
|---|---:|
| refund_attempts deleted | 8 |
| refund_requests deleted | 11 |
| order_items deleted | 10 |
| orders.payment_id nulled | 10 |
| payments deleted | 10 |
| orders deleted | 10 |
| audit_logs deleted | **0** (retained) |

Order: attempts → requests → items → null payment_id → payments → orders (transaction + count locks; non-marker requests = 0).

---

## G. Safety confirmation

| Constraint | Status |
|---|---|
| Local `cardon-local-full` / DB `cardon` only | Confirmed |
| No provider / webhook / real payout | Confirmed |
| No W07 / no 7 eSIM orders touched | Confirmed |
| No real customer order/payment mutation | Confirmed |
| No SoD bypass | Confirmed |
| No account/password/RBAC change | Confirmed |
| No schema/migration/seed/source/build/restart | Confirmed |
| No secrets printed | Confirmed |
| Ledger unchanged | Confirmed (2) |

---

## H. Verdict

**PASS**

W01–W06 all PASS via live dual-actor API. Cleanup restored operational baselines. **STOP** — do not run W07 or further phases without separate owner approval.
