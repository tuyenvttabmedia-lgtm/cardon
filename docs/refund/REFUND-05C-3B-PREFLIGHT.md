# REFUND-05C-3B-PREFLIGHT — Refund Test Fixture Preparation

**Date:** 2026-11-04  
**Environment surveyed:** localhost `cardon-local-full` (read-only)  
**Scope:** Survey + plan only. **No** DB writes, provider calls, rebuilds, password resets, RBAC changes, or source edits.  
**Verdict:** **BLOCKED** (authentication) — fixture design is ready pending owner approval.

Related: `docs/refund/REFUND-05C-3A-UI-PERMISSION-VERIFICATION.md` (PARTIAL — unauthenticated paths OK; authenticated smoke blocked).

---

## 1. Authenticated test plan

### 1.1 How Admin auth works (source)

| Step | Behavior |
|---|---|
| Login | `POST /api/v1/auth/login` with `{ identifier, password }` (`AuthService.login`) |
| Password check | `bcrypt.compare` against `users.password_hash` |
| Staff gate (UI) | Admin `AuthContext.login` rejects non-staff roles (`isAdminStaffRole`) |
| Tokens | `TokenService.generateAccessToken` (JWT) + opaque refresh token hashed into `refresh_tokens` |
| JWT payload | `{ sub, email, role }` (`JwtPayload`) |
| API auth | `Authorization: Bearer <accessToken>`; `JwtStrategy.validate` reloads user by `sub`, requires `ACTIVE` |
| Permissions | `PermissionsGuard` + `RbacService.roleHasAnyPermission` (OR for list/detail refund GETs) |
| Browser session | `localStorage`: `cardon_admin_access_token`, `cardon_admin_refresh_token`, `cardon_admin_user`, `cardon_admin_permissions` (`apps/admin/lib/auth-storage.ts`) |
| `/auth/me` | Refreshes user + permissions after login |

**Side effect of a successful login (DB writes):** `users.last_login_at`, `refresh_tokens` insert, security audit / activity events. Even “just logging in” is not read-only.

### 1.2 Existing E2E patterns

| Pattern | Location | How auth is obtained |
|---|---|---|
| Admin Playwright agent tabs | `apps/admin/e2e/agent-detail-tabs.spec.ts` | Env `ADMIN_E2E_EMAIL` + `ADMIN_E2E_PASSWORD`; UI fill login; **skips** if unset |
| Admin eSIM mock isolation | `apps/admin/e2e-esim-mock/*` | **No real API auth** — HTML harness + route mocking |
| Backend refund | `*.spec.ts` under `src/modules/admin/services` | In-memory mocks; no Docker/DB |

There is **no** checked-in refund Playwright suite and **no** committed storageState with tokens.

### 1.3 Local users (read-only inventory)

| Role | Active user present? | Notes |
|---|---|---|
| SUPER_ADMIN | Yes | Email exists; seed-env password from 05C-3A **did not** authenticate |
| ADMIN | Yes (`system@cardon.local`) | System/audit actor — not intended as interactive QA login |
| ACCOUNTANT | Yes | Exists; no approved credential path verified |
| SUPPORT | **No** | Cannot live-test SUPPORT-only UI without creating a user (forbidden in preflight; needs separate approval) |

### 1.4 Safe authentication options (ranked)

| Option | Description | Writes DB? | Needs owner? | Recommended? |
|---|---|---|---|---|
| **A. Owner-provided credentials** | Owner sets `ADMIN_E2E_EMAIL` / `ADMIN_E2E_PASSWORD` (or pastes password into a one-shot local shell, never logged) matching an existing staff user with refund permissions | Login writes refresh/audit | **Yes** | **Primary** |
| **B. Owner-provided access token** | Short-lived Bearer JWT for SUPER_ADMIN/ACCOUNTANT; used only for API GET/POST in later tickets; not printed in reports | None for token use; minting via login still writes | **Yes** | Good for API-only smoke |
| **C. Password reset / recreate user** | `reset:local-admin` / seed | Yes + RBAC risk | Explicit ticket | Out of scope until approved |
| **D. Agent mints JWT with `JWT_SECRET`** | Bypass password | May skip refresh row; still sensitive secret handling | Risky | **Avoid** unless owner explicitly approves |
| **E. Reuse arbitrary existing `refresh_tokens`** | 11k+ rows exist | Would need raw token (not stored) | Impossible without secret | **No** |

**Conclusion — auth:** Cannot proceed to authenticated 05C-3B/3C without owner-supplied **working** local staff password or access token. Do **not** print or commit secrets. Do **not** reset passwords in this preflight.

---

## 2. Fixture capability (schema + constraints)

### 2.1 Core models

**`refund_requests`**

- FK: `order_id` → `orders` (Restrict), `payment_id` → `payments` (Restrict)
- Actors: `requested_by_id` required; `approved_by_id` / `cancelled_by_id` optional → `users`
- Enums: `status` (`REQUESTED|APPROVED|PROCESSING|SUCCEEDED|MANUAL_REVIEW|CANCELLED`), `intended_method`, `esim_gate`, `currency` (`VND|USD`)
- Cover rule (service, not DB CHECK): reserved (`REQUESTED|APPROVED|PROCESSING|MANUAL_REVIEW`) + `SUCCEEDED` amounts ≤ `payments.amount`

**`refund_attempts`**

- FK: `request_id` → `refund_requests` (Restrict)
- **UNIQUE** `idempotency_key`
- **UNIQUE** `open_guard` (set to `request_id` while `SENT` or `UNCONFIRMED`; null when closed)
- `status`: `SENT|SUCCEEDED|FAILED|UNCONFIRMED`
- `recon_status`: `PENDING_VERIFY|VERIFIED|REJECTED` — **independent of** `payments.reconciliation_status`
- Payout evidence fields: `bank_transaction_reference`, `destination_hint` (masked), `transferred_at`, `statement_evidence_ref`
- Meta JSON: `safe_request_meta` / `safe_response_meta` (must stay free of secrets in tests)

**Payment / Order gates**

- Refund create (service): payment must be `PaymentRecordStatus.SUCCESS` and belong to the order.
- Order mark `OrderPaymentStatus.REFUNDED`: only via reconcile **VERIFIED** path when `evaluateOrderRefundCover.canMarkRefunded` and order currently `PAID`.
- `canMarkRefunded` requires every SUCCESS payment fully covered by **SUCCEEDED + VERIFIED** attempts, no open attempts, no active requests, no reserved remainder, no unverified SUCCEEDED, no mixed currency.

### 2.2 Local inventory (read-only counts)

| Slice | Count |
|---|---|
| `payments` SUCCESS + order `PAID` | 29 |
| Of which non-eSIM | **22** (gateway MEGAPAY) |
| Of which eSIM | **7** (gateway SEPAY) — **do not reuse** for refund fixtures per ticket rules |
| `refund_requests` / `refund_attempts` | **0 / 0** |
| EXPIRED payment pairs | 56 (not eligible for service create) |

### 2.3 Fixture strategies (for a later execute ticket)

| Strategy | Pros | Cons | Recommendation |
|---|---|---|---|
| **S1. Dedicated synthetic Order + Payment + Refund rows** via SQL/Prisma script, tagged `order_code` / `payment_reference` / `reason` prefix `RFD-05C3B-*` | Isolated; no eSIM; no provider; predictable cleanup | Bypasses checkout; must set consistent PAID/SUCCESS amounts | **Preferred for UI state matrix** |
| **S2. API create refund on existing non-eSIM SUCCESS/PAID** | Exercises real service validation | Touches live retail orders; partial cover can block future real refunds; still needs auth | Only if tagged and owner accepts mutating existing orders |
| **S3. Drive all states through API execute/complete/reconcile** | Highest fidelity | Requires auth + may imply payout UX; must **not** call SePay/PayPal/Airalo; bank complete is manual metadata only | Use for workflow tickets after fixtures exist |
| **S4. Unit/integration mocks only** | Already green in repo | Does not validate Docker UI/API | Keep as regression; not a substitute for 05C local smoke |

**Do not** attach fixtures to the 7 eSIM PAID/SUCCESS orders.

### 2.4 Cleanup plan (when writes are approved)

1. Select by marker: `reason LIKE 'RFD-05C3B%'` and/or `payment_reference LIKE 'RFD-05C3B%'` / `order_code LIKE 'RFD-05C3B%'`.
2. Delete order: `refund_attempts` → `refund_requests` → optional admin audit rows scoped to those order IDs → synthetic payments → order_items → orders (only synthetic trees).
3. Never `DELETE` unmarked production-like rows.
4. Never `compose down` / volume wipe for cleanup.
5. Confirm counts before/after in the execute report.

### 2.5 Audit

Service writes admin audit actions such as create/approve/execute/complete/recon/`REFUND_ORDER_MARKED_REFUNDED`. Direct SQL fixtures may omit audit; UI detail will show empty audit — acceptable for display-only cases, note in test plan.

---

## 3. Proposed test scenarios (no data created yet)

Distinguish **payout** (`attempt.status`) vs **reconciliation** (`attempt.recon_status`). Order `REFUNDED` ≠ payment gateway recon.

| # | Scenario | Request status | Attempt | Recon | Order `payment_status` | Notes |
|---|---|---|---|---|---|---|
| 1 | New request | `REQUESTED` | none | — | `PAID` | List/detail; SUPPORT can cancel; ACCOUNTANT can approve |
| 2 | Approved | `APPROVED` | none | — | `PAID` | Execute eligible if eSIM gate clear |
| 3 | Attempt SENT | `PROCESSING` | `SENT`, `open_guard=requestId` | `PENDING_VERIFY` | `PAID` | Payout **not** recorded; complete/fail/unconfirm visible |
| 4 | Attempt UNCONFIRMED | `PROCESSING` | `UNCONFIRMED`, open guard held | `PENDING_VERIFY` | `PAID` | Still reserved; **not** Order REFUNDED |
| 5 | Payout done, recon pending | `PROCESSING` or `SUCCEEDED`* | `SUCCEEDED` | `PENDING_VERIFY` | `PAID` | UI: payout recorded ≠ reconciled |
| 6 | Payout + verified (partial) | `SUCCEEDED` | `SUCCEEDED` | `VERIFIED` | **`PAID`** | Amount &lt; payment; Order stays PAID |
| 7 | Full cover + verified | `SUCCEEDED` | `SUCCEEDED` | `VERIFIED` | **`REFUNDED`** | Only after cover rules; dedicated full-amount fixture |
| 8 | MANUAL_REVIEW | `MANUAL_REVIEW` | usually `SUCCEEDED` + `REJECTED` recon | `REJECTED` | `PAID` | From recon reject path; reservation retained |
| 9 | CANCELLED | `CANCELLED` | none or closed | — | `PAID` | No open reservation |
| 10 | Partial refund | as #6 | verified partial | `VERIFIED` | `PAID` | Second request possible up to remainder |
| 11 | Full refund → Order REFUNDED | as #7 | verified full | `VERIFIED` | `REFUNDED` | Assert audit `REFUND_ORDER_MARKED_REFUNDED` if driven via service |

\*Exact request status after complete depends on remaining cover — service specs treat complete/recon transitions separately; fixture SQL should match the state the UI/API already document in unit tests.

### 3.1 Suggested API/UI checks per fixture (later)

- GET list filters: status, needsAction, orderId, paymentId.
- GET detail: warnings, cover numbers, attempt badges, **no** `gatewayResponse` / LPA / raw account numbers.
- Buttons via `visibleRefundActions` for SUPER_ADMIN vs ACCOUNTANT vs SUPPORT (SUPPORT user may need approved creation).
- **No** Execute/Complete/Reconcile clicks until a write-approved ticket; preflight only designs them.

### 3.2 Permission matrix to exercise (when auth exists)

| Role | Expect |
|---|---|
| SUPER_ADMIN | All refund actions (role bypass in UI `can`) |
| ACCOUNTANT | request/approve/execute/reconcile |
| ADMIN | request/approve/execute; **no** reconcile in DB matrix |
| SUPPORT | request (+ cancel when REQUESTED); no approve/execute/reconcile |

---

## 4. Data constraints checklist

- Payment for service create: `SUCCESS` only.
- One open attempt per request (`open_guard` unique).
- Unique `idempotency_key` per attempt (`RFD-05C3B-<case>-<n>`).
- `destination_hint` must be masked if present (`*` + no 9+ digit runs) for complete forms.
- Currency: MEGAPAY/SEPAY card fixtures → `VND`; do not mix currencies on one payment cover.
- eSIM gate: use `NONE` on synthetic non-eSIM orders unless intentionally testing review.
- Do not change `payments.reconciliation_status` to simulate refund recon.
- Do not call SePay / PayPal / MegaPay / Airalo for fixture creation.
- Prefer new synthetic orders over mutating the 22 existing non-eSIM PAID rows.

---

## 5. Risks & owner approvals required

| Risk | Mitigation | Owner decision needed |
|---|---|---|
| No working local staff password | Owner supplies password or Bearer token via secure channel / env (not chat logs) | **Yes — blocking** |
| Login itself writes `refresh_tokens` + audit | Accept as necessary for interactive QA; or use pre-minted short-lived access token | Confirm |
| SQL fixtures bypass service invariants | Document states; add one API-driven happy path later | Approve SQL fixture script ticket |
| Mutating real PAID orders | Prefer synthetic `RFD-05C3B-*` tree | Approve synthetic inserts |
| Order accidentally marked REFUNDED | Full-cover case only on synthetic order; cleanup restores/deletes tree | Approve |
| SUPPORT role missing | Optional create SUPPORT test user in a separate RBAC-safe ticket | Optional |
| Agent accidentally runs payout against gateway | Fixture `intended_method=BANK_PAYOUT` / manual complete only; forbid gateway refund methods in 05C | Explicit ban list |

---

## 6. Proposed ticket split after approval

1. **Auth unlock** — owner provides credentials/token; agent verifies GET list empty + GET fake id → 404 (read-mostly; login write acknowledged).
2. **05C-3B execute (fixture)** — insert synthetic Order/Payment/Refund matrix `RFD-05C3B-*`; no provider calls; no UI mutating buttons.
3. **05C-3C** — authenticated UI/API verification against fixtures; still no live gateway payout unless a later ticket explicitly allows BANK complete metadata only.

---

## 7. Safety confirmation (this preflight)

| Rule | Status |
|---|---|
| Local only | Yes |
| No production/SSH | Yes |
| No build/recreate/restart | Yes |
| No migration/seed | Yes |
| No DB writes | Yes |
| No refund create | Yes (`refund_requests` still 0) |
| No provider / money movement | Yes |
| No eSIM leftover order use | Yes (survey only; eSIM counts noted to avoid) |
| No source change / commit / reset | Yes |
| No password/token printed | Yes |

---

## 8. Conclusion

**BLOCKED**

- **Blocked by:** lack of a verified authenticated local staff session (05C-3A seed password mismatch; no SUPPORT user; no owner token).
- **Ready on paper:** fixture strategy (synthetic non-eSIM `RFD-05C3B-*` trees), cleanup markers, payout vs recon distinctions, Order `REFUNDED` cover rules, and the 10+ scenario matrix above.
- **Not READY to execute fixtures** until owner (1) supplies working auth and (2) explicitly approves DB writes for synthetic fixtures.

No database writes were performed in this ticket.
