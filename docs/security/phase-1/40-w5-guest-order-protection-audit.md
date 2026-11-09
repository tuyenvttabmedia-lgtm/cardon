# 40 — W5 Guest Order Protection — Read-only Audit

**Date:** 2026-11-09  
**Mode:** READ-ONLY audit → plan `#41` → LOCAL implement. **No prod deploy** in this wave (owner: xong hết mới update prod).  
**Basis:** Roadmap `#22` W5; designs `#16`/`#17`/`#18`; W1–W4 accepted/applied posture.

---

## 1. Goal

Reduce unpaid guest-order spam / scripted checkout without breaking authenticated checkout or payments.

---

## 2. Current surface (CONFIRMED)

| Item | Finding |
|------|---------|
| `POST /orders` | `OrderController.createOrder` + `OptionalJwtAuthGuard` — no Turnstile, no AbuseRateLimit, no EmailPolicy |
| Guest fields | `CreateOrderDto.guestEmail` / `guestPhone` — `@IsEmail` only |
| W2 guardrail | `order-create-unchanged.w2.spec.ts` forbids AbuseRateLimit on order controller (intentional defer → W5) |
| W3 guardrail | Turnstile scope forbids order controller Turnstile (defer → W5 guest) |
| FE guest checkout | `CheckoutPageClient` posts `guestEmail` when unauthenticated |
| FE shell checkout | `CheckoutShell` requires login — out of guest Turnstile scope |
| eSIM create | Login required — skip guest Turnstile |
| Payments / webhooks | Untouched — must stay exempt |

---

## 3. W5 controls (from design)

| Control | Guest | Authenticated | Redis down |
|---------|-------|---------------|------------|
| Email deny-list on `guestEmail` | Yes (reserved/disposable) | N/A (account email) | N/A (local) |
| Turnstile | Yes when `TURNSTILE_ENABLED` | Skip | Fail-closed when enabled (same W3) |
| Abuse rate limit `order_create` | IP + emailHash | **userId only** (no shared guest IP) | **Fail-open** + metric |

Suggested limit: **20 / 15m** (ENV tunable) — design `#17`.

---

## 4. Non-goals

- Payment/webhook/wallet/ledger/fulfillment/eSIM IPN  
- Mandatory retail email verify  
- W6 auto-suspend  
- CF Custom Rule on `POST /orders` (edge challenge deferred — checkout risk)  
- Prod deploy / Turnstile force-enable  

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| Checkout blocked on Redis blip | Fail-open abuse bucket |
| Double friction (CF Managed Challenge + Turnstile) | No CF challenge on `/orders` in W4; Turnstile flag default off |
| Auth checkout regression | Turnstile only when `!user` |
| W2/W3 guardrail tests fail | Update specs to W5-allowed scope |

---

## 6. Verification follow-up (2026-11-09)

See **`#42` §1–§8** for file/line evidence, 103 PASS LOCAL suite, and STAGING SOAK not run.  
Auth abuse dimensions corrected during verification (no shared IP with guests).

## 7. Stop

- [x] Audit  
- [x] LOCAL implement + verification report `#42`  
- **DỪNG** — chờ owner ACCEPT W5 LOCAL (no prod)  
