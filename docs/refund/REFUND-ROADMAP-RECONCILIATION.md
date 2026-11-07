# REFUND-ROADMAP-RECONCILIATION

**Date:** 2026-11-04  
**Mode:** READ-ONLY (no source/DB/provider/fixture writes)  
**Environment surveyed:** local `cardon-local-full` / DB `cardon` + repository source + `docs/refund/` + agent transcript history  

---

## 1. Executive summary

CardOn’s **manual BANK_PAYOUT refund v1** is implemented in source, present in local images (`REFUND-05C-2V`), RBAC-synced locally (`REFUND-05B`), and **runtime-verified** through synthetic fixtures + dual-actor API workflows (`REFUND-05C-3B/3C` **PASS**).

**Numbering collision (critical):** original roadmap tickets **REFUND-05 / 06 / 07 / 08** meant SePay PG / PayPal / eSIM gate / Admin UI. Later tickets **REFUND-05A → 05C-3C** reused the `05` prefix for **local activation & verification of the BANK_PAYOUT stack**, not SePay PG. They are **not** the same work.

| Original intent | Current state |
|---|---|
| Schema + request APIs + manual bank payout + recon + Order REFUNDED + Admin UI | **DONE** locally for BANK_PAYOUT / MANUAL_OTHER |
| SePay PG void/refund (original REFUND-05) | **BLOCKED_EXTERNAL** — enum reserved; execute blocked; provider stub |
| PayPal refund (original REFUND-06) | **BLOCKED_EXTERNAL** — PayPal checkout/capture not live; provider stub |
| eSIM gate (original REFUND-07) | **PARTIAL** — gate/clear/execute rules in source + unit tests; live W07 deferred |
| Admin UI (original REFUND-08) | **PARTIAL→near DONE** — delivered mainly as REFUND-04D + 05C activation; small UX gaps remain |

Approved business invariants (Payment stays SUCCESS; Order REFUNDED only on full VERIFIED cover; no ledger/wallet; SoD executor≠verifier incl. SUPER_ADMIN; no full account numbers) are still encoded in service rules and were exercised in 05C-3C.

**Recommended next ticket:** `REFUND-07-W07-EXECUTE` (synthetic eSIM-gate only).  
**Do not start:** SePay PG refund, PayPal refund, production deploy of refund module, or touching the 7 real eSIM orders.

---

## 2. Original roadmap → actual ticket mapping

```
Original roadmap                         Actual delivery path
─────────────────                        ────────────────────
REFUND-01 / 01B (design)                 Design in chat (Oct 27); no docs/refund file
REFUND-02 schema                         REFUND-02 (migration on disk + local applied)
REFUND-03 create/approve/cancel          REFUND-03 (+ recovery action=refund → createForOrder)
REFUND-04 manual BANK_PAYOUT + REFUNDED  Split:
                                           REFUND-04A design (read-only)
                                           REFUND-04B execute/complete/fail/unconfirm + eSIM clear
                                           REFUND-04C reconcile + Order REFUNDED cover
                                           REFUND-04D Admin list/detail UI + read APIs
REFUND-05 SePay PG void/refund           NOT started as SePay work
                                           ⚠ Prefix reused:
                                           REFUND-05A local activation preflight
                                           REFUND-05B local RBAC sync (execute/reconcile)
                                           REFUND-05C-* build/activate/verify BANK_PAYOUT runtime
REFUND-06 PayPal refund                  NOT started (blocked on live PayPal)
REFUND-07 eSIM gate                      Implemented inside 03/04B (resolveGate + clear + block execute)
                                           Runtime W07 deferred from REFUND-05C-3C
REFUND-08 Admin UI / Ops                 Largely REFUND-04D + nav/permissions + 05C UI smokes
```

### Why `REFUND-05*` ≠ original REFUND-05

| ID | Meaning |
|---|---|
| **Original REFUND-05** | SePay **payment-gateway** void/refund API integration (conditional on merchant confirmation) |
| **REFUND-05A…05C** | Bring already-built BANK_PAYOUT refund module into **local runtime** and verify it |

Do not close original REFUND-05 based on 05C-3C PASS.

---

## 3. Ticket-by-ticket status

Status legend (exactly one per row):  
`DONE` · `PARTIAL` · `READY` · `BLOCKED_EXTERNAL` · `BLOCKED_OWNER` · `DEFERRED` · `NOT_APPLICABLE`

### 3.1 Original roadmap

| Ticket | Planned scope | Status | Source | Migration | API/RBAC | Admin UI | Automated tests | Local runtime evidence | Gaps |
|---|---|---|---|---|---|---|---|---|---|
| **REFUND-02** | `refund_requests` / `refund_attempts` + enums | **DONE** | `prisma/schema.prisma` | `20261027160000_refund_request_attempt` **applied** on local `cardon` | N/A (schema only) | N/A | `src/modules/payment/refund-schema.spec.ts` | Tables exist; rr/ra counts 0 post-cleanup | No standalone `docs/refund/REFUND-02*.md` (transcript only) |
| **REFUND-03** | Create / approve / cancel; recovery→request | **DONE** | `refund-request.service.ts`, controller, `AdminOrderService` | none | Endpoints + `refund.request`/`approve` | Recovery button still thin | `refund-request.service.spec.ts`, security-audit | Exercised in 05C-3B/3C | Order detail “Hoàn tiền” does not collect amount/paymentId UI |
| **REFUND-04** (umbrella) | Manual BANK_PAYOUT + evidence + Order REFUNDED | **DONE** (via 04A–04C) | see 04A–04C | none beyond 02 | execute/complete/fail/unconfirm/reconcile | via 04D | payout + reconcile specs | 05C-3B/3C PASS | SePay/PayPal methods reserved but rejected at execute |
| **REFUND-05** (SePay PG) | PG void/refund if API confirmed | **BLOCKED_EXTERNAL** | Enum + blocked set; `sepay.provider.refund()` stub | N/A | Not executable | N/A | stub unit expectations | **Not tested** as PG refund | No confirmed SePay void/refund merchant API in repo docs |
| **REFUND-06** (PayPal) | Refund after live capture/webhook | **BLOCKED_EXTERNAL** | `paypal.provider.refund()` stub; createPayment gated off | N/A | Not executable | N/A | stub | **Not tested** | `docs/ESIM_AIRALO_PAYPAL_PLAN.md`: PayPal not live |
| **REFUND-07** (eSIM gate) | Gate + provider-state handling | **PARTIAL** | `refund-esim-gate.ts`, clear review, execute block | N/A | clear endpoint + gate on create | Detail clear action exists | gate/review/payout specs | Gate NONE path live-tested; **W07 not run** | No Airalo; no use of 7 real eSIM; CREATE_UNCLEAR/HAS_REFERENCE/ISSUED live path deferred |
| **REFUND-08** (Admin UI/Ops) | Refund UI + Ops integration | **PARTIAL** | `/refunds`, `/refunds/[id]`, nav, actions | N/A | Read APIs in 04D | Built into admin image 05C-2V | `refund-admin-*.test.ts` | 05C-3A/3B UI smokes; 3C API-first | Search `q` smoke anomaly; REJECTED list copy nuance; order recovery UX incomplete; no duplicate Finance ledger UI (correctly avoided) |

### 3.2 Implementation sub-phases (actual)

| Ticket | Scope | Status | Evidence |
|---|---|---|---|
| **REFUND-01 / 01B** | Policy & concurrency design | **DONE** (design) | Agent transcript Oct 27; not filed under `docs/refund/` |
| **REFUND-04A** | Payout/recon design | **DONE** (design) | Transcript Oct 28; read-only |
| **REFUND-04B** | Execute / complete / fail / unconfirm / eSIM clear | **DONE** (source + unit; later runtime) | Source + `refund-payout.service.spec.ts`; runtime via 05C-3C |
| **REFUND-04C** | Reconcile VERIFIED/REJECTED + Order REFUNDED | **DONE** | Source + `refund-reconcile.service.spec.ts`; 05C-3B F06, 05C-3C W01 |
| **REFUND-04D** | List/detail APIs + Admin UI | **DONE** (source + image) | `apps/admin/app/refunds/*`; activated 05C-2V |
| **REFUND-05A** | Local activation preflight | **DONE** | Transcript; readiness for 05B/05C |
| **REFUND-05B** | Minimal local RBAC sync | **DONE** | Local DB: SUPPORT 1, ADMIN 3, ACCOUNTANT/SUPER_ADMIN 4 refund perms |
| **REFUND-05C-1** | Runtime activation preflight | **DONE** | Transcript |
| **REFUND-05C-2** … **2U** | Build blockers | **DONE** (build eventually PASS) | Type/tsconfig fixes; no recreate until 2V |
| **REFUND-05C-2V** | Activate API/Admin images | **DONE** | Images `c4398f0e…` / `efbbff76…`; still running |
| **REFUND-05C-3A** | UI/permission read-only | **PARTIAL** | `docs/refund/REFUND-05C-3A-…md` |
| **REFUND-05C-3B-*** | Auth smoke + fixtures | **DONE** | Auth-smoke PASS; Execute PASS |
| **REFUND-05C-3C-*** | Dual-actor workflow W01–W06 | **DONE** | Execute PASS; W07 N/A |
| **REFUND-05C-3C ACCOUNTANT reset** | Local password restore | **DONE** | Reset report PASS |

---

## 4. Evidence references

### Reports on disk (`docs/refund/`)

- `REFUND-05C-3A-UI-PERMISSION-VERIFICATION.md`
- `REFUND-05C-3B-PREFLIGHT.md` / `AUTH-SMOKE.md` / `EXECUTE-PREFLIGHT.md` / `EXECUTE.md`
- `REFUND-05C-3C-PREFLIGHT.md` / `ACCOUNTANT-LOCAL-RESET.md` / `EXECUTE.md`
- This file: `REFUND-ROADMAP-RECONCILIATION.md`

### Source / schema / tests (representative)

| Area | Paths |
|---|---|
| Schema/migration | `prisma/schema.prisma`, `prisma/migrations/20261027160000_refund_request_attempt/` |
| Service | `src/modules/admin/services/refund-request.service.ts` |
| Repo/DTO/rules | `refund-request.repository.ts`, `dto/refund-request.dto.ts`, `entities/refund-*.ts` |
| Controller | `src/modules/admin/controllers/admin.controller.ts` |
| RBAC seed matrix | `prisma/seed.mjs`, `entities/refund-permissions.ts` |
| Unit specs | `refund-request/payout/reconcile*.spec.ts`, `refund-schema.spec.ts`, `admin.security-audit.spec.ts` |
| Admin UI | `apps/admin/app/refunds/page.tsx`, `[id]/page.tsx`, `lib/refund-admin-actions.ts` |
| Providers | `sepay.provider.ts` (`refund` stub), `paypal.provider.ts` (stub), MegaPay PG cancel helpers (config-gated; **not** wired as RefundAttempt method in v1) |

### Local runtime snapshot (read-only, this survey)

| Item | Value |
|---|---|
| Compose | `cardon-local-full` healthy api/admin/postgres |
| Migration refund | applied (`20261027160000_refund_request_attempt`) |
| Tables | `refund_requests`, `refund_attempts` present |
| Current refund rows | 0 / 0 (post 05C-3C cleanup) |
| API/Admin images | 05C-2V digests still in use |
| eSIM PAID+SUCCESS | 7 (untouched by refund tickets after cleanup) |

### Transcript

Design/implementation narrative for REFUND-01…05C-2V lives primarily in agent transcript `7dca54fa-…` (Oct 27–29, Nov 4). Early tickets lack dedicated markdown under `docs/refund/`.

---

## 5. External dependencies and blockers

### SePay PG (original REFUND-05)

| Question | Finding |
|---|---|
| Methods in source | Checkout/webhook/query for QR / bank transfer paths; **`refund()` returns not implemented** |
| Confirmed void/refund API for KEYON merchant? | **No confirmation in repo docs** |
| Contract / fee / window / settlement | **Not documented** for PG refund |
| Manual SePay QR bank payout | Correctly treated as **BANK_PAYOUT** (company STK), **not** provider refund |
| Queue status | Keep **BLOCKED_EXTERNAL**; do not invent capabilities |

### PayPal (original REFUND-06)

| Question | Finding |
|---|---|
| Live checkout/capture/webhook? | Plan doc: stub / createPayment off; **not live** |
| Capture ID refund workflow? | Unavailable |
| Eligibility | **Not eligible** → `BLOCKED_EXTERNAL` |

### eSIM (original REFUND-07)

| Question | Finding |
|---|---|
| Gate implementation | `NONE` / `CREATE_UNCLEAR` / `HAS_REFERENCE` / `ISSUED`; create resolves gate; execute requires clear if ≠ NONE |
| Clear review | `POST .../esim-review/clear` + audit |
| W07 | Intentionally **excluded** from 05C-3C owner approval |
| 7 real eSIM orders | Must remain unused |
| Airalo | No refund ticket called Airalo |

### Admin UI / Ops (original REFUND-08)

| REFUND-04D delivered | Remaining gaps |
|---|---|
| `/refunds` list + `/refunds/[id]` actions | Order detail recovery “Hoàn tiền” still thin (no amount/payment picker) |
| Server pagination/filters | `q=RFD-05C3C` client smoke returned empty once (needs confirmation) |
| Payout vs recon labels | F07 REJECTED list copy nuance (05C-3B observation) |
| No duplicate Finance/ledger refund UI | Correct — do not add |

---

## 6. Approved decisions — still respected?

| Decision | Status in source / runtime checks |
|---|---|
| `Payment.status` stays SUCCESS after refund | Yes — complete/reconcile do not flip payment to REFUNDED |
| Order REFUNDED only on full VERIFIED cover | Yes — `evaluateOrderRefundCover`; proven 05C-3B F06 / 05C-3C W01 |
| Partial ≠ Order REFUNDED | Yes — 05C-3B F09 / 05C-3C W06 |
| `payments.reconciliation_status` ≠ refund recon | Yes — separate `RefundAttempt.reconStatus` |
| No agent wallet/ledger mutation | Ledger count stayed 2 across 05C-3B/3C |
| No legacy GAME_CARD/PHONE_CARD/TOPUP/DATA fulfillment rewrite | Refund path does not alter fulfillment machine for those |
| Manual SePay QR ≠ SePay PG refund | Execute rejects `SEPAY_PG_*` |
| No auto-retry after ambiguous payout | UNCONFIRMED keeps openGuard; no second execute |
| Executor ≠ verifier (incl. SUPER_ADMIN) | Enforced; 05C-3C W02 B3/B4 PASS |
| No full bank account / eSIM secrets in audit/UI | Masked destination + statement ref rules; 05C fixtures used markers |

---

## 7. Scope deferred / excluded

| Item | Classification |
|---|---|
| SePay PG void/refund implementation | Deferred until external confirmation |
| PayPal refund implementation | Deferred until live capture/webhook |
| MegaPay PG cancel as RefundAttempt method | Out of BANK_PAYOUT v1; config helpers exist but not Refund execute path |
| W07 live eSIM-gate synthetic tree | Deferred (owner excluded from 05C-3C) |
| Production/VPS deploy of refund module | Not part of local 05C series |
| SUPPORT interactive user for role-only UI | Missing locally; optional |
| Persisting REFUND-01…04D markdown under `docs/refund/` | Documentation debt only |

---

## 8. Remaining work (dependency order)

1. **Optional docs backfill** — archive REFUND-01…04D summaries into `docs/refund/` (no code).  
2. **`REFUND-07-W07-EXECUTE`** — synthetic eSIM-shaped order (no Airalo, no 7 real eSIM) to prove CREATE_UNCLEAR/HAS_REFERENCE → clear → execute.  
3. **`REFUND-08-UI-POLISH`** (optional) — order recovery create UX; confirm list search; REJECTED list copy.  
4. **Only after external proof:** reopen original **REFUND-05** (SePay PG) or **REFUND-06** (PayPal) as new design tickets.  
5. **Separate deploy ticket** if/when owner wants refund module on VPS (migration + RBAC + images) — not implied by local PASS.

---

## 9. Recommended next ticket

### `REFUND-07-W07-EXECUTE` — Synthetic eSIM gate verification (local only)

**Why now:** BANK_PAYOUT core (02–04 + 05C activation/verification) is DONE. The intentional remaining hole inside the approved refund design is **live proof of eSIM gate ≠ NONE** (clear → execute), which 05C-3C explicitly skipped. Source and unit tests already exist; runtime path does not.

**Acceptance criteria (draft):**

1. Local `cardon-local-full` / DB `cardon` only; marker e.g. `RFD-07W07-*`.  
2. Synthetic trees only — **forbid** the 7 real eSIM PAID/SUCCESS orders; **no** Airalo/LPA/QR/reveal.  
3. At least one request with `esimGate` ∈ {`CREATE_UNCLEAR`,`HAS_REFERENCE`} created via service resolveGate (or owner-approved minimal synthetic attempt rows **without secrets**).  
4. Execute blocked before clear; clear with `refund.approve` audits `REFUND_ESIM_REVIEW_CLEARED`; execute then succeeds.  
5. No provider/webhook/payout; cleanup marker; retain audits.  
6. Report `docs/refund/REFUND-07-W07-EXECUTE.md` with PASS/FAIL.

**Requires separate owner approval** before any write.

---

## 10. Must NOT start yet

- Original **REFUND-05** SePay PG void/refund implementation or provider calls.  
- Original **REFUND-06** PayPal refund / capture-dependent flows.  
- Any work that **uses or modifies the 7 real eSIM orders**.  
- Airalo CREATE/GET/QUERY or LPA reveal for refund testing.  
- Real bank payout / webhook / IPN.  
- Production/VPS migration or RBAC sync for refund (unless a dedicated deploy ticket).  
- Schema changes to add PaymentRecordStatus.REFUNDED or reuse `payments.reconciliation_status` as refund state.  
- Duplicate Finance/ledger “refund” UIs.  
- Broadening execute methods to `SEPAY_PG_*` / `PAYPAL_REFUND` without a new design ticket.  
- Automatically starting `REFUND-07-W07-EXECUTE` from this reconciliation.

---

## 11. Verdict of this reconciliation

Roadmap vs reality is reconciled:

- **Manual BANK_PAYOUT refund v1 is complete and locally verified.**  
- **Original provider refund tickets remain blocked externally.**  
- **eSIM gate runtime proof and minor UI polish are the only near-term in-scope leftovers.**

Stop. Await owner review before any next ticket.
