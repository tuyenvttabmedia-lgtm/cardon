# REFUND-05C-3C-PREFLIGHT — Workflow Service Verification

**Date:** 2026-11-04  
**Environment surveyed:** localhost `cardon-local-full`, database `cardon` (read-only)  
**Scope:** Survey + test plan only. **No** DB writes, provider calls, rebuilds, RBAC changes, or source edits.  
**Marker (execute ticket):** `RFD-05C3C-%`  
**Prerequisite:** REFUND-05C-3B-EXECUTE **PASS**  
**Verdict:** **READY** (awaiting owner approval to execute writes + dual-actor sessions)

---

## 0. Local baseline (read-only)

| Item | Value |
|---|---|
| Compose | `cardon-local-full` — api/admin/postgres healthy |
| DB | `cardon` |
| orders / payments / order_items | 85 / 85 / 85 |
| refund_requests / refund_attempts | 0 / 0 |
| ledger_entries | 2 |
| audit_logs | 523 (includes 31 retained `REFUND_*` from 05C-3B) |
| eSIM PAID + SUCCESS | **7** (do not use) |
| Active staff users | `SUPER_ADMIN` (`superadmin@cardon.vn`), `ACCOUNTANT` (`maint@keyon.vn`) |
| SUPPORT / interactive ADMIN | **None** |

No `RFD-05C3C-%` rows surveyed as present (marker reserved for execute).

---

## 1. Service / API inventory

Base path: `/api/v1/admin/...`  
Guards: `JwtAuthGuard` + `PermissionsGuard`  
Implementation: `RefundRequestService` → `RefundRequestRepository` (Prisma transactions + `SELECT … FOR UPDATE` locks).  
**No payment provider / payout job / webhook** on these paths (BANK_PAYOUT is manual evidence only).

| Action | Method | Endpoint | Permission | Input | Audit |
|---|---|---|---|---|---|
| Create request | `POST` | `/admin/orders/:orderId/refunds` | `refund.request` | `paymentId`, `amount`, `reason`, optional `currency`, `intendedMethod` | `REFUND_REQUEST_CREATED` |
| List | `GET` | `/admin/refund-requests` | any of request/approve/execute/reconcile | query filters + pagination | — |
| Detail | `GET` | `/admin/refund-requests/:id` | any refund.* | — | — (reads audits) |
| Approve | `POST` | `/admin/refund-requests/:id/approve` | `refund.approve` | — | `REFUND_REQUEST_APPROVED` |
| Cancel | `POST` | `/admin/refund-requests/:id/cancel` | REQUESTED→`refund.request`; APPROVED→`refund.approve` | — | `REFUND_REQUEST_CANCELLED` |
| Clear eSIM review | `POST` | `/admin/refund-requests/:id/esim-review/clear` | `refund.approve` | — | `REFUND_ESIM_REVIEW_CLEARED` (if newly cleared) |
| Execute (claim) | `POST` | `/admin/refund-requests/:id/execute` | `refund.execute` | optional `amount`; header **`Idempotency-Key` required** | `REFUND_ATTEMPT_SENT` (skip if replay) |
| Complete | `POST` | `/admin/refund-attempts/:id/complete` | `refund.execute` | `bankTransactionReference`, `amount`, `currency`, `transferredAt`, `destinationHint` (masked) | `REFUND_ATTEMPT_SUCCEEDED` |
| Fail | `POST` | `/admin/refund-attempts/:id/fail` | `refund.execute` | `errorCode` ∈ safe fail set; optional `errorMessage` | `REFUND_ATTEMPT_FAILED` |
| Unconfirm | `POST` | `/admin/refund-attempts/:id/unconfirm` | `refund.execute` | optional `errorCode` ∈ safe unconfirm set | `REFUND_ATTEMPT_UNCONFIRMED` |
| Reconcile | `POST` | `/admin/refund-attempts/:id/reconcile` | `refund.reconcile` | `decision`=`VERIFIED`\|`REJECTED`, `statementEvidenceRef` | `REFUND_RECON_VERIFIED` / `REFUND_RECON_REJECTED`; optional `REFUND_ORDER_MARKED_REFUNDED` |

### 1.1 Per-action behavior (source)

#### Create
- Locks payment; only `SUCCESS` payment belonging to order.
- Currency inferred from gateway (`MEGAPAY`→VND); mismatch rejected.
- Amount > 0 and ≤ `remainingRefundable` (succeeded + reserved).
- Default method from gateway; v1 executable methods: `BANK_PAYOUT`, `MANUAL_OTHER` only.
- eSIM gate resolved from order items (profile / LPA audit / provider attempts). Non-eSIM → `NONE`.
- Status → `REQUESTED`. Does **not** mutate order/payment/ledger.

#### Approve
- Only from `REQUESTED`.
- Maker-checker: same actor as `requestedById` → `Forbidden`, **except** `SUPER_ADMIN` may self-approve.
- Status → `APPROVED`.

#### Cancel
- Blocked if open `SENT`/`UNCONFIRMED` attempt or any `SUCCEEDED` attempt.
- Only `REQUESTED` or `APPROVED`.

#### Clear eSIM review
- Requires `esimGate ≠ NONE`; blocked if `CANCELLED`/`SUCCEEDED`.
- Writes evidence `{ esimReviewCleared, esimReviewClearedAt, esimReviewClearedById }`.
- Idempotent if already cleared (no second audit).

#### Execute
- Request must be `APPROVED` or `PROCESSING`; method executable; eSIM review cleared if gated.
- Rejects if open `SENT`/`UNCONFIRMED` (`open_guard` unique = `requestId`).
- Attempt amount **must equal** remaining on request (no partial attempt split in v1 execute).
- Creates attempt `SENT`, `reconStatus=PENDING_VERIFY`, `openGuard=requestId`, fingerprint in `safeRequestMeta`.
- Request → `PROCESSING`.
- Idempotency: same key + same fingerprint → replay (no new attempt / no audit). Wrong payload or other request → `Conflict`.

#### Complete
- Only open statuses (`SENT`/`UNCONFIRMED`).
- Masked `destinationHint` (must contain `*`, no ≥9 consecutive digits).
- `bankTransactionReference` unique across attempts.
- Attempt → `SUCCEEDED`, `reconStatus=PENDING_VERIFY`, clears `openGuard`.
- If succeeded sum ≥ request amount and no open attempt → request `SUCCEEDED`.
- **Does not** set Order `REFUNDED` and **does not** set recon `VERIFIED`.
- Duplicate complete (same ref/amount/currency on already SUCCEEDED) → replay.

#### Fail
- Only open statuses; **blocked** if successful transfer evidence already present.
- Safe codes only: `TRANSFER_NOT_SENT`, `TRANSFER_CANCELLED`, `OPERATOR_CONFIRMED_NOT_SENT`.
- Attempt → `FAILED`, clears `openGuard` (releases reservation for that open hold).
- Request status **not** reset (typically stays `PROCESSING`) — re-execute allowed after fail.

#### Unconfirm
- Only from `SENT`; blocked if transfer evidence present.
- Attempt → `UNCONFIRMED`; **keeps** `openGuard=requestId` (reservation held).
- Blocks second execute while open.

#### Reconcile
- Only `SUCCEEDED` + `PENDING_VERIFY`.
- Terminal recon (`VERIFIED`/`REJECTED`) cannot change → `Conflict`.
- SoD: `executedById` missing or **same as actor** → `Forbidden` (**includes SUPER_ADMIN** — no bypass).
- `REJECTED` → request `MANUAL_REVIEW` (attempt stays SUCCEEDED).
- Then evaluates order cover; if fully covered + Order `PAID` → Order `REFUNDED` + audit `REFUND_ORDER_MARKED_REFUNDED`.
- Cover requires: all SUCCESS payments fully succeeded **and** VERIFIED, reserved=0, no open attempt, no active request, no over-refund, no mixed currency, no unverified SUCCEEDED.

### 1.2 Reservation / Order status

| Concept | Rule |
|---|---|
| Succeeded | Σ attempt `SUCCEEDED` |
| Reserved | Open SENT/UNCONFIRMED + remaining hold on REQUESTED\|APPROVED\|PROCESSING\|MANUAL_REVIEW (no double-count) |
| Committed | succeeded + reserved ≤ payment amount |
| Order `REFUNDED` | Only via reconcile cover evaluator — never via complete alone |
| Partial VERIFIED | Order stays `PAID` |
| `payments.reconciliation_status` | Independent; not refund recon |

### 1.3 Unit coverage already present (not a substitute for 3C live)

- `refund-request.service.spec.ts` — create/approve/cancel/reservation/eSIM gate  
- `refund-payout.service.spec.ts` — execute/complete/fail/unconfirm/idempotency  
- `refund-reconcile.service.spec.ts` — SoD, VERIFIED/REJECTED, partial, cover, concurrent reconcile  

**05C-3C goal:** live API + local DB against synthetic trees (service path), not re-run unit mocks only.

---

## 2. Permission matrix (local DB)

| Role | `refund.request` | `refund.approve` | `refund.execute` | `refund.reconcile` | Local user |
|---|---|---|---|---|---|
| SUPPORT | ✓ | — | — | — | **missing** |
| ACCOUNTANT | ✓ | ✓ | ✓ | ✓ | `maint@keyon.vn` |
| ADMIN | ✓ | ✓ | ✓ | **—** (seed) | **no interactive user** |
| SUPER_ADMIN | ✓ | ✓ | ✓ | ✓ | `superadmin@cardon.vn` |

Matches seed `ROLE_PERMISSION_MATRIX` and `refund-permissions.ts` reconcile roles (ACCOUNTANT + SUPER_ADMIN).

### Maker-checker (code)

| Rule | Behavior |
|---|---|
| Requester ≠ approver | Enforced for non-`SUPER_ADMIN` |
| `SUPER_ADMIN` self-approve | **Allowed** (explicit exception) |
| Executor ≠ reconciler | Enforced for **all** roles including `SUPER_ADMIN` |
| Approver may execute | Yes if role has `refund.execute` |

---

## 3. Workflow matrix (planned live cases)

Marker prefix: `RFD-05C3C-`. Evidence refs only: `RFD-05C3C-TEST-PAYOUT-*`, `RFD-05C3C-TEST-STATEMENT-*`, destination `VCB ****1234 · RFD*` (masked). Currency `VND`, method `BANK_PAYOUT`.

### A. Happy path — `W01`

`REQUESTED → APPROVED → SENT → SUCCEEDED → VERIFIED` → Order `REFUNDED`  
Actors: requester A, approver B (or SUPER_ADMIN self-approve noted), executor A/B, reconciler **other** user.

### B. Maker-checker — `W02`

| Case | Expect |
|---|---|
| B1 ACCOUNTANT create + same ACCOUNTANT approve | `403` cannot approve own |
| B2 SUPER_ADMIN create + self-approve | `200` allowed |
| B3 Executor reconciles own attempt | `403` even as SUPER_ADMIN |
| B4 Other ACCOUNTANT/SUPER_ADMIN reconciles | `200` |
| B5 Role without `refund.reconcile` (if available) | `403` — ADMIN user absent → document as N/A or skip |

### C. Failure / open attempt — `W03`

| Case | Expect |
|---|---|
| C1 Fail from SENT with safe code | `FAILED`, openGuard null, reservation released for that open |
| C2 Fail after complete evidence | `400` blocked |
| C3 Unconfirm from SENT | `UNCONFIRMED`, openGuard kept |
| C4 Execute while UNCONFIRMED open | `400` / unique open_guard |
| C5 Re-execute after FAILED | New SENT allowed (PROCESSING + remaining) |

### D. Reconciliation — `W04`

| Case | Expect |
|---|---|
| D1 VERIFIED full cover | Order `REFUNDED` |
| D2 REJECTED | Request `MANUAL_REVIEW`; Order `PAID`; attempt SUCCEEDED+REJECTED |
| D3 Reconcile SENT/UNCONFIRMED/FAILED | `400` |
| D4 Reconcile already VERIFIED/REJECTED | `409` |

### E. Idempotency / concurrency / reservation — `W05`

| Case | Expect |
|---|---|
| E1 Double execute same Idempotency-Key + payload | replay, 1 attempt |
| E2 Same key different amount/request | `409` |
| E3 Duplicate complete identical payload | replay |
| E4 Concurrent create on same payment over cap | serialized lock; second rejected |
| E5 Concurrent execute on same request | one SENT; other fail/open-guard |
| E6 Over-refund create | `400` exceeds remaining |

### F. Order status — `W06`

| Case | Expect |
|---|---|
| F1 Partial amount VERIFIED | Order `PAID` |
| F2 Full SUCCEEDED but PENDING_VERIFY | Order `PAID` |
| F3 Full VERIFIED after cover | Order `REFUNDED` |
| F4 Second request exceeding remaining | `400` |

### G. eSIM review clear — `W07` (optional branch)

Synthetic **non-production** eSIM-shaped order (eSIM variant + minimal CREATE/UNCONFIRMED attempt **without** LPA/QR/secrets) → gate `CREATE_UNCLEAR` → clear → execute.  
**Never** attach to the 7 live eSIM PAID orders.

---

## 4. Test fixture design (execute ticket)

### 4.1 Synthetic payment trees (preferred)

Same pattern as 05C-3B:

1. INSERT synthetic `orders` (`order_code=RFD-05C3C-Wxx`, PAID, non-eSIM CARD variant).  
2. INSERT `payments` SUCCESS + marker `payment_reference`.  
3. Link `orders.payment_id`; INSERT `order_items`.  
4. Drive all transitions via **admin Refund APIs** (audit real).  
5. No webhook, no gateway, no provider CREATE/GET.

### 4.2 Actors

| Actor | Role | Use |
|---|---|---|
| A | SUPER_ADMIN | primary ops; self-approve case |
| B | ACCOUNTANT | SoD approve / reconcile counterpart |

**Gate:** ACCOUNTANT password/session not verified in this preflight. Execute requires owner-supplied working ACCOUNTANT login **or** explicit approval to reset local ACCOUNTANT password (local-only).  
Do **not** weaken SoD by SQL-rewriting `executed_by_id` except as documented last-resort (05C-3B did this for fixture states — 3C should prove live SoD with two sessions).

### 4.3 Evidence markers (fake only)

| Field | Example |
|---|---|
| bankTransactionReference | `RFD-05C3C-TEST-PAYOUT-W01` |
| statementEvidenceRef | `RFD-05C3C-TEST-STATEMENT-W01` |
| destinationHint | `VCB ****1234 · RFD*` |
| Idempotency-Key | `RFD-05C3C-W01-EXEC-1` |

### 4.4 Out of scope for fixtures

- Real bank accounts / FT numbers  
- PayPal / SePay / MegaPay / Airalo calls  
- The 7 eSIM PAID SUCCESS orders  
- Ledger fake refund rows  
- Fake audit INSERT (audits must come from service)

---

## 5. Idempotency / concurrency strategy

| Mechanism | How to test live |
|---|---|
| Payment row lock | Parallel `POST .../refunds` over remaining capacity |
| Request + payment lock on execute | Parallel execute with different idempotency keys |
| `idempotency_key` UNIQUE | Replay + conflict cases |
| `open_guard` UNIQUE | Second execute while SENT/UNCONFIRMED |
| Attempt row lock on complete/fail/unconfirm/reconcile | Duplicate complete / concurrent reconcile |
| Order lock on reconcile | Concurrent VERIFIED vs cover evaluation |

Recommended harness: small Node script inside API network (or host→nginx) using two Bearer sessions; assert HTTP status + DB counts; no browser mutate required for core workflow (UI optional smoke).

---

## 6. Cleanup plan (execute ticket)

Marker: `RFD-05C3C%` only.

1. Count marker rows; abort if unexpected non-marker refunds appear.  
2. Delete order: `refund_attempts` → `refund_requests` → `order_items` → null `orders.payment_id` → `payments` → `orders`.  
3. Retain service `audit_logs` (`REFUND_*`); report count retained.  
4. Confirm: orders/payments/items back to **85**, refunds **0/0**, ledger **2**, eSIM PAID SUCCESS **7**.  
5. No broad DELETE; no production.

---

## 7. Risks & approvals required before EXECUTE

| Risk / gate | Severity | Owner decision needed? |
|---|---|---|
| ACCOUNTANT session for SoD | High for B/D goals | **Yes** — credentials or local password reset |
| Synthetic Order/Payment INSERT | Medium | **Yes** — same class as 05C-3B |
| Optional synthetic eSIM gate rows (no LPA) | Medium | **Yes** if W07 included |
| SUPER_ADMIN self-approve is product exception | Low | Confirm expected in acceptance |
| Fail leaves request `PROCESSING` | Low | Confirm expected (re-execute path) |
| No SUPPORT user for request-only role live test | Low | Optional separate user ticket |
| Concurrent scripts may leave partial trees if aborted | Medium | Cleanup must be marker-scoped + transactional |
| Existing 31 audits from 05C-3B | Info | Do not delete |

### Explicitly forbidden (unchanged)

- Production / VPS / remote DB  
- Provider / webhook / real payout  
- Touching 7 eSIM orders  
- Source/schema/migration/RBAC edits in 3C execute (unless new ticket)  
- Compose recreate/restart/build  
- Git commit/reset/checkout/clean  

---

## 8. Proposed execute ticket shape

`REFUND-05C-3C-EXECUTE` (after owner approval):

1. Preflight re-check env + baseline + marker empty.  
2. Obtain SUPER_ADMIN + ACCOUNTANT sessions.  
3. Create synthetic trees `W01`–`W06` (+ optional `W07`).  
4. Run workflow matrix via API; record HTTP + DB + audit actions.  
5. Assert invariants (reservation, Order status, SoD, idempotency).  
6. Cleanup marker; write `docs/refund/REFUND-05C-3C-EXECUTE.md`.

---

## 9. Verdict

**READY**

Service/API surface, permissions, SoD rules, reservation/cover, and idempotency are clear from source; local DB is clean for a new marker; dual-actor ACCOUNTANT exists.

**Do not start writes** until owner approves:

1. Synthetic fixture inserts under `RFD-05C3C-%`.  
2. Dual-actor auth (ACCOUNTANT usable session).  
3. Whether W07 (synthetic eSIM gate) is in or out of scope.
