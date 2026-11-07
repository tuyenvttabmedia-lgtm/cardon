# REFUND-07-W07-PREFLIGHT — Synthetic eSIM Gate

**Date:** 2026-11-04  
**Mode:** READ-ONLY (no fixture writes, no API mutations, no provider calls)  
**Environment surveyed:** `cardon-local-full` / DB `cardon`  
**Marker (execute ticket):** `RFD-07W07-*`  
**References:** `REFUND-ROADMAP-RECONCILIATION.md`, `REFUND-05C-3C-EXECUTE.md`, gate unit specs  
**Verdict:** **READY** (awaiting separate owner approval for EXECUTE)

---

## 1. Source & test evidence

### 1.1 Gate resolution (`resolveRefundEsimGate`)

File: `src/modules/admin/entities/refund-esim-gate.ts`

| Rank | Gate | Trigger |
|---|---|---|
| 0 | `NONE` | No eSIM risk signals |
| 1 | `CREATE_UNCLEAR` | CREATE attempt with `openGuard` **or** outcome `UNCONFIRMED`/`SENT` **or** `CONFIRMED_CREATED` without `providerReference` |
| 2 | `HAS_REFERENCE` | Any attempt with non-empty `providerReference` |
| 3 | `ISSUED` | `hasProfile` **or** `hasLpaRevealAudit` |

Highest rank wins. Fulfillment FAILED is ignored.

Unit: `refund-esim-gate.spec.ts` (NONE / CREATE_UNCLEAR / HAS_REFERENCE / ISSUED via profile / ISSUED via LPA audit).

### 1.2 Call site — persisted only at request create

`RefundRequestService.createForOrder` → private `resolveGate(orderId, tx)`:

1. `repository.loadEsimGateSources(orderId)` loads per `order_item`:
   - `variant.type`
   - `esimProfile.id` (presence only)
   - `esimAttempts` fields: `operation`, `outcome`, `providerReference`, `openGuard`
   - LPA signal: any `audit_logs` row `action=ESIM_LPA_REVEALED`, `targetType=ORDER`, `targetId=orderId` (id only)
2. Item counts as eSIM-shaped if `variant.type=ESIM` **OR** profile present **OR** attempts length > 0.
3. If no eSIM-shaped items → gate `NONE`.
4. Else `resolveRefundEsimGate(...)`; result stored on `refund_requests.esim_gate`.

**Implication:** Setting `refund_requests.esim_gate` by SQL alone does **not** exercise `resolveGate`. EXECUTE must create request via API after synthetic order-shape rows exist.

### 1.3 Clear review

| Item | Detail |
|---|---|
| Endpoint | `POST /api/v1/admin/refund-requests/:id/esim-review/clear` |
| Permission | `refund.approve` only |
| Blocks | `esimGate=NONE`; status `CANCELLED`/`SUCCEEDED` |
| Effect | Writes `evidence.esimReviewCleared` / `ClearedAt` / `ClearedById` |
| Idempotent | Already cleared → no second audit (`newlyCleared=false`) |
| Audit | `REFUND_ESIM_REVIEW_CLEARED` (safe metadata; no LPA/secrets) |

Helpers: `refund-esim-review.ts` — `canExecuteEsimGate`, `isEsimReviewCleared`, `buildClearedEsimReviewEvidence`.  
Unit: `refund-esim-review.spec.ts`, `refund-payout.service.spec.ts` #6–#7.

### 1.4 Execute guard

In `execute()`: if `!canExecuteEsimGate(request.esimGate, request.evidence)` → `400`  
`eSIM review must be cleared before executing this refund`.

`NONE` → always executable (subject to other execute rules).

### 1.5 Schema relations required for synthetic gate inputs

```
orders → order_items (variant.type = ESIM)
       → esim_order_quotes (FK provider, product code, cost, mode)
       → esim_provider_attempts (operation/outcome/open_guard/provider_reference)
       → esim_profiles (optional; requires install_secret_enc NOT NULL — avoid for W07)
```

There is **no** admin service API that inserts quote/attempt without going through eSIM fulfillment/provider. Therefore CREATE_UNCLEAR / HAS_REFERENCE live proof requires **local SQL fixtures** feeding `loadEsimGateSources`, then **API create** to persist gate.

---

## 2. Critical safety — how to create gate states

### Preferred path (hybrid)

| Step | Mechanism | Exercises |
|---|---|---|
| A | INSERT synthetic Order + Payment + ESIM `order_item` + `esim_order_quotes` + `esim_provider_attempts` (MOCK, marker refs) | DB shape for `loadEsimGateSources` |
| B | `POST /admin/orders/:id/refunds` (service) | **`resolveGate` live** + gate persistence |
| C | approve / clear / execute via API | Clear + execute guards |
| D | Cleanup marker trees only | No leftover synthetic eSIM rows |

### Forbidden

- Airalo / eSIM Go CREATE/GET/QUERY  
- Webhook/IPN  
- Real LPA / QR / activation / Setup URL / tokens in any column or audit metadata  
- Using or modifying the **7** real eSIM PAID+SUCCESS orders  
- Revealing install secrets  
- Treating SQL `UPDATE refund_requests.esim_gate=…` as W07 proof of `resolveGate`

### Field recipe (synthetic only)

**Shared order tree** (`RFD-07W07-Wxx`):

- `orders.order_code = RFD-07W07-Wxx`
- Payment SUCCESS / VND / MEGAPAY label / amount `100000.00` (same pattern as 05C-3C)
- `order_items.variant_id` = local ESIM catalog variant (e.g. existing `ESIM_AL_*` sku — catalog reuse only, not a real sold eSIM order)
- Guest email `rfd-07w07@fixture.local`

**`esim_order_quotes` (required FK for attempts):**

| Column | Value |
|---|---|
| `provider_id` | local `AIRALO` provider UUID (label only; **no API call**) |
| `provider_product_code` | `RFD-07W07-SYN-PKG` |
| `provider_cost` | `0` or nominal |
| `provider_mode` | `MOCK` |

**W07-A CREATE_UNCLEAR — `esim_provider_attempts`:**

| Column | Value |
|---|---|
| `request_id` | `RFD-07W07-W07A-REQ` (unique) |
| `operation` | `CREATE` |
| `outcome` | `UNCONFIRMED` |
| `provider_reference` | `NULL` |
| `open_guard` | `order_item_id` (unresolved shape) |
| `safe_*_meta` | `{"fixture":"RFD-07W07","synthetic":true}` only |

**W07-B HAS_REFERENCE:**

| Column | Value |
|---|---|
| `request_id` | `RFD-07W07-W07B-REQ` |
| `operation` | `CREATE` |
| `outcome` | `CONFIRMED_CREATED` |
| `provider_reference` | `RFD-07W07-SYN-REF-B` (synthetic; not a real Airalo id) |
| `open_guard` | `NULL` |
| meta | fixture marker only |

**ISSUED (W07 optional):**

| Option | Risk | Recommendation |
|---|---|---|
| Insert `esim_profiles.install_secret_enc` | Forces secret-shaped column; must never reveal | **Defer** unless owner approves opaque non-decryptable placeholder + no reveal UI |
| Insert `audit_logs` `ESIM_LPA_REVEALED` | Fake audit signal; no LPA in metadata possible | **Defer** — conflicts with “no fake audit” preference |
| Unit-only ISSUED | Already covered in `refund-esim-gate.spec.ts` | **Use for EXECUTE scope** |

**EXECUTE scope recommendation:** W07-A, B, C′, D, E, F. **ISSUED live = out of scope** unless separate owner approval.

---

## 3. Test matrix W07-A … W07-F

Actors (same as 05C-3C):

| Actor | Email | Role | Use |
|---|---|---|---|
| A | `superadmin@cardon.vn` | SUPER_ADMIN | approve / execute / clear |
| B | `maint@keyon.vn` | ACCOUNTANT | create / clear / SoD as needed |

No password reset in EXECUTE (account already restored).

### W07-A — CREATE_UNCLEAR

| Step | Action | Expected |
|---|---|---|
| 1 | Fixture tree + UNCONFIRMED CREATE attempt | rows marker-scoped |
| 2 | B: create refund request | `201`, `esimGate=CREATE_UNCLEAR`, `requiresManualReview=true` |
| 3 | A: approve | `APPROVED` |
| 4 | A: execute (Idempotency-Key) | `400` review must be cleared |
| 5 | A or B: clear | `200`, evidence cleared, audit `REFUND_ESIM_REVIEW_CLEARED` |
| 6 | A: execute | `201`, attempt `SENT` |

### W07-B — HAS_REFERENCE

Same steps; create must persist `esimGate=HAS_REFERENCE`. Execute blocked → clear → execute allowed.

### W07-C — Insufficient permission to clear

| Live option | Expected | Notes |
|---|---|---|
| C1 Unauthenticated clear | `401` | Always available |
| C2 Non-admin JWT (e.g. CUSTOMER/AGENT) on clear | `401/403` | No `refund.approve` |
| C3 SUPPORT clear | `403` | **No SUPPORT user locally** — cannot live-test without new account (forbidden unless owner ticket) |

**Unit evidence already PASS:** `refund-payout.service.spec.ts` #7 (SUPPORT → Forbidden).  
EXECUTE: run C1+C2; mark C3 **N/A (no SUPPORT)** unless owner adds SUPPORT.

### W07-D — Clear audit

After first successful clear on A or B: exactly one new `REFUND_ESIM_REVIEW_CLEARED` for that request/order; metadata has `esimReviewCleared=true`, `requestId`; no LPA/account digits.

### W07-E — Clear idempotency

Second clear on same request: `200`, `esimReviewCleared=true`, **no** additional `REFUND_ESIM_REVIEW_CLEARED` audit.

### W07-F — Gate NONE regression

Non-eSIM CARD variant tree (no quote/attempt): create → `esimGate=NONE` → approve → execute **without** clear (same as 05C-3C BANK_PAYOUT). Confirms gate path does not break NONE.

---

## 4. Identities, permissions, expected HTTP

| Action | Permission | Expected HTTP |
|---|---|---|
| Create | `refund.request` | 201 |
| Approve | `refund.approve` | 201 |
| Clear | `refund.approve` | 200/201; 400 if NONE; 403 if no perm |
| Execute blocked | `refund.execute` | 400 until cleared |
| Execute after clear | `refund.execute` | 201 + attempt SENT |

Stop after execute claim for A/B (optional). Full complete/reconcile **not required** for gate acceptance (already proven in 05C-3C). If complete used, synthetic bank refs only (`RFD-07W07-TEST-PAYOUT-*`).

---

## 5. Environment baseline (read-only now)

| Item | Value |
|---|---|
| Compose | `cardon-local-full` — api/admin/postgres healthy |
| DB | `cardon` |
| API image | `sha256:c4398f0e…22293ae1d` (05C-2V) |
| Admin image | `sha256:efbbff76…297dcd4ad` (05C-2V) |
| orders / payments / items | 85 / 85 / 85 |
| refund_requests / attempts | 0 / 0 |
| ledger_entries | 2 |
| esim_order_quotes / attempts / profiles | 27 / 19 / 3 (existing real/local eSIM data — **do not touch**) |
| Marker `RFD-07W07-%` | **0** |
| eSIM PAID + SUCCESS | **7** (immutable) |

Catalog reuse allowed: ESIM `product_variants` + `providers.AIRALO` id for FK only.

---

## 6. Cleanup plan (EXECUTE only)

Marker: `RFD-07W07%` only. Abort if any non-marker refund appears unexpectedly.

**FK-safe order:**

1. `refund_attempts` (marker requests)  
2. `refund_requests`  
3. `esim_profiles` (should be 0 if ISSUED deferred)  
4. `esim_provider_attempts` (marker `request_id` / order_item of marker orders)  
5. `esim_order_quotes` (marker order_items)  
6. `order_items`  
7. Null `orders.payment_id`  
8. `payments`  
9. `orders`  

**Retain** all `audit_logs` (`REFUND_*`, and do not delete any `ESIM_LPA_*`).  

**Assert after cleanup:** orders/payments/items **85**; refunds **0/0**; ledger **2**; eSIM PAID SUCCESS **7**; existing quote/attempt/profile totals return to pre-execute baseline (Δ only marker inserts).

---

## 7. Risks & blockers

| Risk | Severity | Mitigation |
|---|---|---|
| SQL quote/attempt mistaken for real provider work | High | `provider_mode=MOCK`, marker refs only, no Airalo calls |
| Accidental use of 7 real eSIM orders | High | New order_codes only; assert order_code prefix before mutate |
| ISSUED requiring `install_secret_enc` | High | Defer ISSUED live |
| No SUPPORT for W07-C3 | Medium | Unit + C1/C2; document N/A |
| Cleanup misses esim_* rows | Medium | Explicit steps 3–5 + count locks |
| Setting `esim_gate` via SQL | High | Forbidden — fails acceptance |
| Dirty working tree / unrelated changes | Info | Preserve; no commit |

**Owner approvals required before EXECUTE:**

1. Synthetic SQL inserts for quote/attempt under `RFD-07W07-*` (no provider calls).  
2. Dual-actor sessions (existing SUPER_ADMIN + ACCOUNTANT).  
3. Confirm ISSUED live **out of scope**.  
4. Confirm W07-C SUPPORT live **N/A**.

---

## 8. Proposed EXECUTE shape (not authorized yet)

`REFUND-07-W07-EXECUTE`:

1. Re-check env + baseline + marker empty + eSIM 7.  
2. Create trees W07-A, W07-B, W07-F (+ shared actors).  
3. Run matrix A–F (C′ without SUPPORT).  
4. Assert gates from **API create response / DB `esim_gate`**, not from SQL overwrite.  
5. Cleanup; write `docs/refund/REFUND-07-W07-EXECUTE.md`.  
6. STOP — no SePay/PayPal/W07 ISSUED expansion.

---

## 9. Verdict

**READY**

Gate resolution, clear/execute guards, and unit coverage are clear. Local catalog/provider FKs exist to build synthetic eSIM-shaped trees without Airalo. Safety path is defined (MOCK attempts + API `resolveGate`).

**Do not create fixtures or call clear/execute until a separate owner EXECUTE approval.**
