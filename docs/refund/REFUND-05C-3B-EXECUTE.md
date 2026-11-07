# REFUND-05C-3B-EXECUTE — Synthetic Refund Fixtures

**Date:** 2026-11-04  
**Environment:** LOCAL ONLY — compose `cardon-local-full`, database `cardon`  
**Marker:** `RFD-05C3B-%`  
**Authorization:** OWNER APPROVED  
**Verdict:** **PASS**

---

## A. Environment

| Item | Value |
|---|---|
| Compose project | `cardon-local-full` |
| Compose file | `docker-compose.local-full.yml` |
| Env file | `.env.local-full` |
| Database | `cardon` (PostgreSQL container `cardon-local-full-postgres`) |
| API image | `cardon-api:local-full` `sha256:c4398f0e…22293ae1d` (05C-2V) |
| Admin image | `cardon-admin:local-full` `sha256:efbbff76…297dcd4ad` (05C-2V) |
| Actor | SUPER_ADMIN local session (no token printed) |
| Execute window | ~2026-11-04 16:05–16:08 UTC |
| Production / VPS | Not used |

---

## B. Baseline / Delta

| Table | Baseline (pre) | After create | After cleanup | Delta vs baseline |
|---|---:|---:|---:|---|
| orders | 85 | 94 | 85 | 0 |
| order_items | 85 | 94 | 85 | 0 |
| payments | 85 | 94 | 85 | 0 |
| refund_requests | 0 | 9 | 0 | 0 |
| refund_attempts | 0 | 6 | 0 | 0 |
| ledger_entries | 2 | 2 | 2 | 0 |
| audit_logs | 491 | 523 | 523 | +32 retained service audits |

Notes:

- Create delta: +9 orders/items/payments, +9 requests, +6 attempts, +32 audit (~31 REFUND_* on marker orders; ledger unchanged).
- Cleanup restored operational tables to baseline. Audit retention kept service-generated REFUND_* rows (31 still present; target orders deleted — orphans by design for audit trail).
- eSIM PAID + payment SUCCESS: **7** before and after (unchanged).
- Non-marker `refund_requests` during run: **0**.

---

## C. Fixture matrix

F10 skipped — F01–F09 covered all required branches. Method: `BANK_PAYOUT` / `VND`. Amounts: 100.000 ₫ except F09 = 40.000 ₫ partial.

| Fixture | Order | Payment | Request | Attempt | Request status | Attempt / recon | Expected order | Actual order | Result |
|---|---|---|---|---|---|---|---|---|---|
| F01 | `7e2e197a-…1cd7` | `c8980860-…5af2` | `9238bef4-…935b` | — | REQUESTED | — | PAID | PAID | PASS |
| F02 | `32d10806-…9d07` | `2e13c8e7-…1d2f5` | `d69a3bfd-…40c1` | — | APPROVED | — | PAID | PAID | PASS |
| F03 | `29cd71b1-…5156` | `d5fec3ed-…1bc1b2` | `54f63b78-…0fd9` | `87691505-…67ad` | PROCESSING | SENT / PENDING_VERIFY | PAID | PAID | PASS |
| F04 | `6c3ddc86-…2904` | `3ce0b5dd-…1db85` | `183f8d9b-…a8c6` | `7bd81a08-…c913` | PROCESSING | UNCONFIRMED / PENDING_VERIFY | PAID | PAID | PASS |
| F05 | `54c871ea-…e532` | `fb8e26b8-…ce3f3` | `5b95bc17-…9ba1` | `53486e25-…e865b` | SUCCEEDED | SUCCEEDED / PENDING_VERIFY | PAID | PAID | PASS |
| F06 | `416862d2-…522b` | `bd51a31f-…157e` | `f0841b8e-…7628` | `bef9d3af-…2f35d` | SUCCEEDED | SUCCEEDED / VERIFIED | REFUNDED | REFUNDED | PASS |
| F07 | `398c8ee5-…621a` | `6c3f3554-…0a0599` | `f0538f20-…9e5a7` | `69fda122-…4497b9` | MANUAL_REVIEW | SUCCEEDED / REJECTED | PAID | PAID | PASS |
| F08 | `a84ecbf7-…3698` | `4ada302c-…988f412` | `437cea99-…4139` | — | MANUAL_REVIEW | (no attempt; esim_gate HAS_REFERENCE) | PAID | PAID | PASS |
| F09 | `2e70e7f1-…65b8f` | `e05ac9b9-…05fd4` | `b8f78a2e-…d7ed` | `561558c0-…8088e` | SUCCEEDED | SUCCEEDED / VERIFIED (partial) | PAID | PAID | PASS |

Creation path: synthetic Order/Payment/item INSERT + Refund admin APIs (create / approve / execute / complete / unconfirm / reconcile). F08 status/gate adjusted via local fixture SQL only. F06/F07/F09 reconcile used SoD reassignment of `executed_by_id` → `system@cardon.local` then reconcile API. Order REFUNDED on F06 came from reconcile service — not forced by SQL.

No secrets / LPA / QR / raw bank credentials recorded.

---

## D. Admin UI (read-only)

Session: SUPER_ADMIN on `http://admin.localhost`. No Approve / Execute / Complete / Fail / Unconfirm / Reconcile / Clear eSIM review clicks. No mutating POSTs in Phase D.

| Check | Result |
|---|---|
| `/refunds` list shows all 9 markers | PASS — “9 kết quả” |
| Search marker | PASS (list codes `RFD-05C3B-F01`…`F09`) |
| Status filter REQUESTED + Lọc | PASS — “1 kết quả” → F01 only |
| Detail Order / Payment / Request / Attempt | PASS (API + UI) |
| Payout vs recon separated | PASS (e.g. F05 SUCCEEDED + chưa đối soát; F06 Đã ghi nhận + Đã đối soát) |
| F01 actions | PASS — “Duyệt yêu cầu hoàn”, “Hủy yêu cầu hoàn” (not clicked) |
| F02 actions | PASS — “Claim payout thủ công”, “Hủy yêu cầu hoàn” (not clicked) |
| F03/F04 in-flight payout | PASS via API detail (SENT / UNCONFIRMED, PENDING_VERIFY) |
| F05 not shown as fully reconciled | PASS — PENDING_VERIFY, Order PAID |
| F06 full VERIFIED + Order REFUNDED | PASS — “Đã hoàn tiền”, “Đã đối soát”, no mutating actions |
| F07/F08 MANUAL_REVIEW | PASS (API + list/detail) |
| F09 partial + Order PAID | PASS — banner “Hoàn một phần…”, 40.000 ₫, còn được hoàn 60.000 ₫ |

Observation (non-blocking): list copy for F07 REJECTED may still read closer to “chưa đối soát” while detail/API correctly expose REJECTED + MANUAL_REVIEW. Follow-up UI copy ticket optional.

---

## E. Business invariants

| # | Invariant | Result |
|---|---|---|
| 1 | `attempt.status=SUCCEEDED` ≠ `recon_status=VERIFIED` | PASS (F05) |
| 2 | SUCCEEDED + PENDING_VERIFY → Order stays PAID | PASS (F05) |
| 3 | REJECTED recon → Request MANUAL_REVIEW | PASS (F07) |
| 4 | UNCONFIRMED keeps open reserve (`open_guard`) | PASS (F04; 2 open guards during run: F03+F04) |
| 5 | Partial refund → Order PAID | PASS (F09) |
| 6 | Full REFUNDED only after cover + all SUCCEEDED VERIFIED + reserved=0 + no open attempt | PASS (F06 via service) |
| 7 | No orphan FK / duplicate idempotency / open_guard | PASS |
| 8 | Ledger unchanged by B2C refund path | PASS (2 → 2) |
| 9 | No non-marker refund rows mutated | PASS |

---

## F. Cleanup

| Step | Count |
|---|---:|
| Deleted refund_attempts | 6 |
| Deleted refund_requests | 9 |
| Deleted order_items | 9 |
| Null `orders.payment_id` (marker only) | 9 |
| Deleted payments | 9 |
| Deleted orders | 9 |
| Audit REFUND_* retained | 31 |
| Ledger deleted | 0 |

Order: attempts → requests → items → null payment_id → payments → orders (transaction + count locks: expected 9/9/6/9/9, non-marker requests=0).

Post-cleanup: marker orders/payments/requests/attempts = **0**. Baseline operational counts restored. eSIM PAID SUCCESS still **7**.

---

## G. Safety confirmation

| Constraint | Status |
|---|---|
| No Airalo / PayPal / SePay / MegaPay provider calls | Confirmed |
| No payment webhook / IPN | Confirmed |
| No real bank payout / gateway refund API | Confirmed |
| No impact on 7 eSIM PAID SUCCESS orders | Confirmed |
| No mutation of non-marker business orders/payments | Confirmed |
| No RBAC / user changes in this ticket | Confirmed |
| No migration / seed / compose recreate | Confirmed |
| No production / VPS / remote DB | Confirmed |
| No source code changes in this ticket | Confirmed |
| No git commit / reset / checkout | Confirmed |
| No secrets printed | Confirmed |

---

## H. Verdict

**PASS**

Nine synthetic trees validated end-to-end (DB invariants + Admin read-only UI + cleanup). F10 not required. Optional follow-up: soften F07 list recon label when `recon_status=REJECTED`.
