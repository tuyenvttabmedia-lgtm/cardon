# REFUND-07-W07-EXECUTE — Synthetic eSIM Gate Runtime Verification

**Date:** 2026-11-04  
**Environment:** LOCAL ONLY — compose `cardon-local-full`, database `cardon`  
**Marker:** `RFD-07W07-*`  
**Based on:** `docs/refund/REFUND-07-W07-PREFLIGHT.md`  
**Scope:** W07-A … W07-F (ISSUED live deferred; SUPPORT live N/A)  
**Verdict:** **PASS**

---

## 1. Environment / identity

| Item | Value |
|---|---|
| Compose | `cardon-local-full` — api/admin/postgres healthy |
| Database | `cardon` |
| API image | `sha256:c4398f0e7dcb425c434a889340bd7c1a60b269f40a992cc9e08253922293ae1d` (match preflight) |
| Admin image | `sha256:efbbff766c1e1ae1ecee68ac86422924ea4907594757ff58dbb1e12297dcd4ad` (match preflight) |
| Branch / dirty tree | `cursor/frontend-healthcheck-port` with existing dirty files — **preserved** (no commit/reset/clean) |
| Production / VPS | Not used |

### Actors

| Actor | Email | Role | Permissions used |
|---|---|---|---|
| A | `superadmin@cardon.vn` | SUPER_ADMIN | approve, clear, execute |
| B | `maint@keyon.vn` | ACCOUNTANT | create, clear (W07-B) |

No password reset / RBAC change. Tokens not printed.

---

## 2. Baseline (Phase 0, before writes)

| Resource | Count |
|---|---:|
| orders / payments / order_items | 85 / 85 / 85 |
| refund_requests / refund_attempts | 0 / 0 |
| ledger_entries | 2 |
| esim_order_quotes / attempts / profiles | 27 / 19 / 3 |
| audit_logs | 567 |
| Marker `RFD-07W07-%` | 0 |
| eSIM PAID + SUCCESS (real) | 7 |

---

## 3. Fixture inventory

| Marker | Order ID (short) | Shape | Synthetic eSIM rows |
|---|---|---|---|
| `RFD-07W07-W07A` | `36a324b1-…` | ESIM variant + MOCK quote + CREATE/UNCONFIRMED attempt (`RFD-07W07-W07A-REQ`, open_guard=item) | quote+attempt |
| `RFD-07W07-W07B` | `0b5d5508-…` | ESIM variant + MOCK quote + CREATE/CONFIRMED_CREATED + `provider_reference=RFD-07W07-SYN-REF-B` | quote+attempt |
| `RFD-07W07-W07F` | `26c4280c-…` | CARD variant only | none |

- `provider_mode=MOCK` only; **no** Airalo/provider HTTP calls.  
- **0** profiles / LPA / QR / install secrets.  
- Gate persisted only via API `createForOrder → resolveGate` (not SQL overwrite of `esim_gate`).

---

## 4. Case results

### W07-A CREATE_UNCLEAR — **PASS**

| Step | Result |
|---|---|
| B create | 201; `esimGate=CREATE_UNCLEAR` (response + DB); `requiresManualReview=true` |
| A approve | OK |
| A execute (before clear) | **400**; refund attempts = 0 |
| A clear | 201; evidence cleared (byId/at set) |
| A execute (after clear) | 201; attempt **SENT** |

### W07-B HAS_REFERENCE — **PASS**

| Step | Result |
|---|---|
| B create | 201; `esimGate=HAS_REFERENCE` (response + DB) |
| A execute (before clear) | **400**; attempts = 0 |
| B clear | 201; evidence cleared |
| A execute (after clear) | 201; attempt **SENT** |

### W07-C Permission denial

| Sub | Result | Notes |
|---|---|---|
| C1 unauthenticated clear | **PASS** — HTTP **401**; evidence unchanged | |
| C2 unauthorized bearer | **PASS** — HTTP **401** | Invalid JWT; no CUSTOMER/AGENT password session used (no new users). Unauthorized clear blocked. |
| C3 SUPPORT | **N/A** | No SUPPORT user locally; unit `refund-payout.service.spec.ts` #7 covers SUPPORT Forbidden |

### W07-D Clear audit — **PASS**

- Exactly **1** `REFUND_ESIM_REVIEW_CLEARED` per cleared order (A and B).  
- Metadata includes `esimReviewCleared=true` + `requestId` (via service builder).  
- Sensitive scan (lpa/qr/installSecret/9+ digits) on those audits: **0** hits.

### W07-E Clear idempotency — **PASS** (on W07-A)

- Second clear: 201.  
- Clear audit count unchanged (1→1).  
- `esimReviewClearedById` / `ClearedAt` unchanged.

### W07-F NONE regression — **PASS**

| Step | Result |
|---|---|
| B create | 201; `esimGate=NONE` |
| A approve | OK |
| A execute **without** clear | 201; attempt **SENT** |

### Deferred

- **ISSUED live:** deferred (preflight / owner).  
- **Complete / reconcile / payout:** not run (out of scope).

---

## 5. Safety confirmation

| Constraint | Status |
|---|---|
| No Airalo / eSIM Go / provider API | Confirmed |
| No webhook/IPN / real payment / bank payout | Confirmed |
| No LPA/QR/reveal/profile fixture | Confirmed |
| 7 real eSIM PAID+SUCCESS unchanged | Confirmed (count 7 before & after; marker excluded during run) |
| No source/schema/migration/build/restart | Confirmed |
| Dirty working tree preserved | Confirmed |
| Ledger unchanged | 2 → 2 |

---

## 6. Cleanup

FK order executed: refund_attempts → refund_requests → esim_profiles(0) → esim_provider_attempts → esim_order_quotes → order_items → null payment_id → payments → orders.

| Deleted | Count |
|---|---:|
| refund_attempts | 3 |
| refund_requests | 3 |
| esim_provider_attempts | 2 |
| esim_order_quotes | 2 |
| order_items / payments / orders | 3 / 3 / 3 |
| audit_logs | **0** (retained; 2 clear audits kept) |

### Post-cleanup vs Phase 0 baseline

| Resource | Baseline | After |
|---|---:|---:|
| orders / payments / items | 85 | **85** |
| refund_requests / attempts | 0 | **0** |
| ledger_entries | 2 | **2** |
| esim_order_quotes / attempts / profiles | 27 / 19 / 3 | **27 / 19 / 3** |
| eSIM PAID + SUCCESS | 7 | **7** |
| Marker rows | 0 | **0** |
| audit_logs | 567 | **580** (retained login + refund/clear audits) |

---

## 7. Verdict

**PASS**

W07-A/B prove `resolveGate` → execute block → clear → SENT. W07-D/E audit + idempotency OK. W07-F NONE regression OK. C1/C2 unauthorized clear blocked; C3 SUPPORT N/A; ISSUED deferred.

**STOP.** Do not start REFUND-08, SePay PG, PayPal, ISSUED live, or production deploy without separate owner approval.
