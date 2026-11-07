# REFUND-05C-3B-EXECUTE-PREFLIGHT — Synthetic Fixture Write Plan

**Date:** 2026-11-04  
**Environment:** localhost `cardon-local-full`, database `cardon`  
**Scope:** Plan only — **no INSERT/UPDATE/DELETE**, no provider calls, no source changes.  
**Marker:** `RFD-05C3B-*`  
**Verdict:** **READY** (awaiting explicit owner approval to execute writes)

Prerequisites satisfied:

- API/Admin activation: REFUND-05C-2V PASS  
- Authenticated SUPER_ADMIN smoke: REFUND-05C-3B-AUTH-SMOKE PASS  
- `refund_requests` / `refund_attempts` currently **0**  
- Marker `RFD-05C3B%` currently matches **0** orders  

---

## 1. Strategy overview

| Choice | Decision |
|---|---|
| Data origin | **100% synthetic** Order + Payment + Refund trees — **do not** reuse existing 85 orders / 85 payments / 7 eSIM PAID rows |
| Catalog reuse | May reference existing non-eSIM `product_variants` (e.g. CARD `ZING_10K`) for `order_items` only — catalog is not an order |
| Payment SUCCESS | Set **directly** on synthetic `payments.status = SUCCESS` — no webhook, SePay, MegaPay, PayPal, or Airalo |
| Intended method | `BANK_PAYOUT` for all fixtures (manual bank path; no PG void/refund methods) |
| Currency | `VND` |
| Gateway label | `MEGAPAY` on synthetic payments (label only; no API call) |
| eSIM gate | `NONE` except F08 (manual-review gate UI) |
| Actors | `requested_by` / optional `approved_by` / `executed_by` / `verified_by` = local `superadmin@cardon.vn` |
| Audit logs | **Do not insert fake `audit_logs`.** Detail Audit panel may be empty for SQL fixtures. Real audits only if a later ticket drives transitions via Refund APIs |
| Insert mechanism (execute ticket) | Single Prisma/SQL script in transaction(s), tagged throughout; not Admin UI create (UI create would attach to a real order id) |

### Shared constants (execute ticket will resolve live UUIDs)

| Key | Value / rule |
|---|---|
| Marker prefix | `RFD-05C3B` |
| Order code | `RFD-05C3B-F{nn}` |
| Payment reference | `RFD-05C3B-F{nn}-PAY` |
| Guest email | `rfd-05c3b@fixture.local` |
| Channel | `B2C`, `is_guest_order=true` |
| Order payment/fulfillment (default) | `PAID` / `COMPLETED` (non-eSIM card story) |
| Payment record | `SUCCESS`, `paid_at=now()`, `reconciliation_status=PENDING` (unrelated to refund recon) |
| Refund reason | `RFD-05C3B-F{nn} synthetic fixture — do not payout` |
| Idempotency key | `RFD-05C3B-F{nn}-ATT-1` (unique) |
| Destination hint (closed payouts) | `VCB ****1234 · RFD*` (masked) |
| Bank ref (closed payouts) | `RFD-05C3B-F{nn}-FT` |
| Statement evidence (verified/rejected) | `STMT-RFD-05C3B-F{nn}` |
| Actor email | `superadmin@cardon.vn` (id looked up at execute time) |
| Variant | existing CARD sku e.g. `ZING_10K` (non-ESIM) |

### Insert order (FK-safe)

For each fixture `Fnn`:

1. INSERT `orders` with `payment_id = NULL`, `order_code = RFD-05C3B-Fnn`, amounts as below.  
2. INSERT `payments` (`order_id`, `payment_reference = RFD-05C3B-Fnn-PAY`, `status=SUCCESS`).  
3. UPDATE `orders.payment_id` → that payment.  
4. INSERT `order_items` (1× CARD variant, qty 1, amounts aligned).  
5. INSERT `refund_requests`.  
6. INSERT `refund_attempts` if required (set `open_guard = request_id` only for `SENT` / `UNCONFIRMED`).  

No `ledger_entries`, no `provider_transactions`, no eSIM quote/attempt/profile rows.

---

## 2. Fixture catalog (A + B)

**Payout vs reconciliation (all rows):**

- **Payout recorded** ⇔ `refund_attempts.status = SUCCEEDED`  
- **Recon state** ⇔ `refund_attempts.recon_status` (`PENDING_VERIFY` / `VERIFIED` / `REJECTED`)  
- **`payments.reconciliation_status`** stays `PENDING` and is **not** used as refund recon  

Link IDs are generated at execute time; logical names below are stable.

### F01 — REQUESTED

| Entity | Planned fields |
|---|---|
| Order | `RFD-05C3B-F01`, `PAID`, total/customer_paid **100000** |
| Payment | `RFD-05C3B-F01-PAY`, **100000**, `SUCCESS` |
| RefundRequest | amount **100000**, status **`REQUESTED`**, `esim_gate=NONE`, no approver |
| Attempt | none |
| Expected UI | List/detail REQUESTED; SUPER_ADMIN can see Approve/Cancel (not clicked in execute) |
| Audit | none (SQL) |

### F02 — APPROVED

| Entity | Planned fields |
|---|---|
| Order / Payment | `F02`, **100000**, PAID / SUCCESS |
| RefundRequest | **100000**, **`APPROVED`**, `approved_by` + `approved_at` set |
| Attempt | none |
| Expected | Execute eligible (gate NONE); no open attempt |

### F03 — SENT (open payout)

| Entity | Planned fields |
|---|---|
| Order / Payment | `F03`, **100000** |
| RefundRequest | **100000**, **`PROCESSING`** |
| Attempt | amount **100000**, status **`SENT`**, recon **`PENDING_VERIFY`**, `open_guard = request_id`, method `BANK_PAYOUT`, `executed_by` set; bank/dest null |
| Expected | Payout **not** recorded; UI open attempt; Order remains **PAID** |

### F04 — UNCONFIRMED (open reservation)

| Entity | Planned fields |
|---|---|
| Order / Payment | `F04`, **100000** |
| RefundRequest | **100000**, **`PROCESSING`** |
| Attempt | **`UNCONFIRMED`**, recon **`PENDING_VERIFY`**, `open_guard = request_id` |
| Expected | Still reserved; **not** Order REFUNDED; distinct from SENT |

### F05 — SUCCEEDED + PENDING_VERIFY (payout done, recon open)

| Entity | Planned fields |
|---|---|
| Order / Payment | `F05`, **100000** |
| RefundRequest | **100000**, **`PROCESSING`** (or `SUCCEEDED` if execute script aligns with service after complete — prefer **`PROCESSING`** until verified to match “awaiting recon” UX) |
| Attempt | **`SUCCEEDED`**, recon **`PENDING_VERIFY`**, `open_guard=NULL`, bank ref + masked destination + `transferred_at` set |
| Expected | UI shows payout recorded **≠** reconciled; Order **PAID** (`hasUnverifiedSucceeded` blocks REFUNDED) |

### F06 — SUCCEEDED + VERIFIED (full cover → Order REFUNDED)

| Entity | Planned fields |
|---|---|
| Order | `F06`, payment_status **`REFUNDED`** (set only on this synthetic order) |
| Payment | **100000**, `SUCCESS` |
| RefundRequest | **100000**, **`SUCCEEDED`**, `completed_at` set |
| Attempt | **`SUCCEEDED`**, recon **`VERIFIED`**, `verified_by` / `verified_at` / `statement_evidence_ref` set, `open_guard=NULL` |
| Expected | Full cover: succeeded+verified = payment amount; no open attempt; no active reservation. Demonstrates Order **REFUNDED** without touching real orders |

### F07 — REJECTED reconciliation

| Entity | Planned fields |
|---|---|
| Order / Payment | `F07`, **100000**, Order stays **PAID** |
| RefundRequest | **100000**, **`MANUAL_REVIEW`** (service outcome after recon reject) |
| Attempt | **`SUCCEEDED`**, recon **`REJECTED`**, `open_guard=NULL`, payout fields present, statement ref present |
| Expected | Payout recorded; recon rejected; reservation retained via MANUAL_REVIEW; **not** Order REFUNDED |

### F08 — MANUAL_REVIEW (eSIM-gate style, non-eSIM catalog)

| Entity | Planned fields |
|---|---|
| Order / Payment | `F08`, **100000**, PAID / SUCCESS — still **CARD** item (not one of the 7 eSIM orders) |
| RefundRequest | **100000**, **`MANUAL_REVIEW`**, `esim_gate=HAS_REFERENCE`, `evidence={ "fixture":"RFD-05C3B-F08", "note":"synthetic gate for UI" }` (no `esimReviewCleared`) |
| Attempt | none |
| Expected | Distinct from F07: gate/review UX without payout attempt. Does **not** attach to real eSIM orders |

### F09 — Partial refund (verified)

| Entity | Planned fields |
|---|---|
| Order | `F09`, **PAID**, total **100000** |
| Payment | **100000**, `SUCCESS` |
| RefundRequest | amount **40000**, **`SUCCEEDED`** |
| Attempt | **40000**, **`SUCCEEDED`** + **`VERIFIED`**, closed |
| Expected | Partial cover; Order **remains PAID**; remaining refundable 60000 conceptually |

### F10 — Full refund (verified) — duplicate of cover rule with F06

| Entity | Planned fields |
|---|---|
| Same pattern as F06 | Dedicated tree `F10` also ends **Order REFUNDED** with full **100000** SUCCEEDED+VERIFIED |
| Purpose | Explicit “full refund” scenario id for test scripts; F06 can be treated as the primary REFUNDED showcase, F10 as regression twin **or** execute ticket may collapse F10≡F06 and skip duplicate insert |

**Execute recommendation:** Insert **F01–F09 + single full REFUNDED (F06)**; treat ticket item 10 as F06 to avoid two identical REFUNDED trees unless QA wants redundancy → then insert F10 as copy of F06 with new ids.

### Scenario ↔ fixture map

| # | Scenario | Fixture | Payout | Recon | Order payment_status |
|---|---|---|---|---|---|
| 1 | REQUESTED | F01 | — | — | PAID |
| 2 | APPROVED | F02 | — | — | PAID |
| 3 | SENT | F03 | no (`SENT`) | PENDING_VERIFY | PAID |
| 4 | UNCONFIRMED | F04 | no | PENDING_VERIFY | PAID |
| 5 | SUCCEEDED + PENDING_VERIFY | F05 | yes | PENDING_VERIFY | PAID |
| 6 | SUCCEEDED + VERIFIED | F06 | yes | VERIFIED | **REFUNDED** |
| 7 | REJECTED reconciliation | F07 | yes | REJECTED | PAID |
| 8 | MANUAL_REVIEW | F08 (gate) / F07 (recon) | F08 none / F07 yes | F07 REJECTED | PAID |
| 9 | Partial refund | F09 | yes | VERIFIED | **PAID** |
| 10 | Full refund | F06 (or F10) | yes | VERIFIED | **REFUNDED** |

---

## 3. Data rules (C)

1. Enums only from Prisma/DB: request / attempt / recon / currency / method / esim_gate / order payment / payment record.  
2. **No fake `audit_logs`** in SQL execute — audits are service-produced; empty Audit UI is acceptable for display fixtures.  
3. **No** payment SUCCESS via webhook/provider.  
4. **No** real money movement; bank fields are synthetic strings only.  
5. Marker on `order_code`, `payment_reference`, `reason`, `idempotency_key`, guest email domain.  
6. **No** UPDATE of pre-existing orders/payments (including the 7 eSIM PAID/SUCCESS rows and 22 non-eSIM PAID rows).  
7. Constraints: unique `payment_reference`, unique `order_code`, unique `idempotency_key`, unique `open_guard` when set; cover amounts ≤ payment amount.  
8. `payments.reconciliation_status` must not be used to fake refund recon.  
9. Do not create `RefundIntendedMethod` of `SEPAY_PG_*` / `PAYPAL_REFUND` in this batch.

---

## 4. Cleanup plan (D) — design only, not run

### 4.1 Identification queries

```sql
-- Primary marker sets
SELECT id, order_code FROM orders WHERE order_code LIKE 'RFD-05C3B%';
SELECT id, payment_reference FROM payments WHERE payment_reference LIKE 'RFD-05C3B%';
SELECT id, reason FROM refund_requests WHERE reason LIKE 'RFD-05C3B%';
SELECT id, idempotency_key FROM refund_attempts WHERE idempotency_key LIKE 'RFD-05C3B%';
```

Optional safety join: payments whose `order_id` is in marker orders.

### 4.2 Delete order (FK Restrict-aware)

Inside a transaction, for ids collected from markers only:

1. `DELETE FROM refund_attempts WHERE idempotency_key LIKE 'RFD-05C3B%' OR request_id IN (…marker requests…)`  
2. `DELETE FROM refund_requests WHERE reason LIKE 'RFD-05C3B%' OR order_id IN (…marker orders…)`  
3. `DELETE FROM audit_logs WHERE target_type = 'ORDER' AND target_id IN (…marker orders…) AND action LIKE 'REFUND_%'` — only if any were created later via API  
4. `DELETE FROM order_items WHERE order_id IN (…marker orders…)`  
5. `UPDATE orders SET payment_id = NULL WHERE order_code LIKE 'RFD-05C3B%'`  
6. `DELETE FROM payments WHERE payment_reference LIKE 'RFD-05C3B%'`  
7. `DELETE FROM orders WHERE order_code LIKE 'RFD-05C3B%'`  

**Do not** delete `product_variants`, users, or unmarked orders/payments.

### 4.3 Count reconciliation

Capture before execute, after execute, after cleanup:

| Counter | Expected after execute (F01–F09 + F06) | After cleanup |
|---|---|---|
| `orders` where `order_code LIKE 'RFD-05C3B%'` | 9 (or 10 if F10 added) | 0 |
| `payments` where `payment_reference LIKE 'RFD-05C3B%'` | same | 0 |
| `refund_requests` where `reason LIKE 'RFD-05C3B%'` | same | 0 |
| `refund_attempts` where `idempotency_key LIKE 'RFD-05C3B%'` | count of fixtures with attempts | 0 |
| Global `payments` / `orders` | baseline + N | **baseline restored** |
| Unmarked eSIM PAID rows | unchanged 7 | unchanged 7 |

Baseline at plan time: orders **85**, payments **85**, refund_requests **0**, refund_attempts **0**, ledger_entries **2**.

---

## 5. Risks & owner approvals

| Item | Need |
|---|---|
| Explicit approve to **write** synthetic trees on local DB | **Yes — blocking for execute** |
| Confirm F10 duplicate vs reuse F06 for “full refund” | Prefer reuse F06 |
| Confirm no API-driven execute/complete in same ticket as SQL insert | Recommended: SQL display fixtures first; API workflow later |
| Auth | Already PASS for SUPER_ADMIN |

---

## 6. Safety confirmation (this preflight)

| Rule | Status |
|---|---|
| Local only / no VPS | Yes |
| No INSERT/UPDATE/DELETE | Yes |
| No migration/seed/provider/payout | Yes |
| No rebuild/recreate | Yes |
| No source/commit changes | Yes |
| No use of existing retail/eSIM orders | Yes (plan forbids) |

---

## 7. Conclusion

**READY**

The write plan is complete: ten scenarios mapped to marker-isolated synthetic Order/Payment/Refund trees, payout vs recon distinguished, FK insert/cleanup order defined, and real orders/eSIM leftovers excluded.

**Do not execute inserts until owner opens an execute ticket** (e.g. REFUND-05C-3B-EXECUTE) that explicitly authorizes DB writes on `cardon-local-full`.
