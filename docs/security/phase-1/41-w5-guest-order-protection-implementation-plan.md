# 41 — W5 Guest Order Protection — Implementation Plan

**Status:** LOCAL implement after `#40`. **No prod/commit** unless owner orders.  
**Date:** 2026-11-09

---

## 1. Locked decisions

| Decision | Value |
|----------|--------|
| Surfaces | `POST /orders` only |
| Turnstile | **Guest only** (`!JWT user`); action `guest-order` |
| Email policy | Deny reserved/disposable on `guestEmail` when guest |
| Abuse | Bucket `order_create` 20/15m; IP+emailHash (**guest only**) / **userId only** (auth — no shared IP with guests); **fail-open** |
| Auth checkout | No Turnstile widget required |
| Payment paths | Zero Touch |
| Default flags | `TURNSTILE_ENABLED=false`; abuse enabled as today |
| Deploy | Owner batch after W5 LOCAL accept (+ optional W6) |

---

## 2. Backend

1. `AbuseBucket` += `order_create` + `consumeFailOpen()` (429 still thrown; Redis errors log+return).  
2. `TURNSTILE_ACTION_GUEST_ORDER = 'guest-order'`.  
3. `CreateOrderDto.captchaToken?`.  
4. `OrderController.createOrder`:  
   - if guest → `turnstile.verifyOrThrow` + `emailPolicy.assertRegistrationEmailAllowed(guestEmail)` when email present  
   - always → `abuse.consumeFailOpen({ bucket: 'order_create', ... })`  
   - then `orderService.createOrder`  
5. Guardrails: update W2 isolation + W3 turnstile-scope to allow order guest Turnstile / fail-open abuse; keep payment clean.

---

## 3. Frontend

1. `CreateOrderPayload.captchaToken?`  
2. `CheckoutPageClient`: show `TurnstileField` when `!isAuthenticated && siteKey`; pass token on create.  
3. `CheckoutShell` / eSIM auth paths: unchanged (no guest).

---

## 4. Tests

- Unit: consumeFailOpen redis-down does not throw; over-limit 429.  
- Controller/service: guest reserved email 400; guest turnstile when enabled.  
- Guardrail specs updated.  
- Regression: payment-skip-throttle still green.

---

## 5. Acceptance (LOCAL)

- [ ] Guest `@example.com` → 400  
- [ ] Guest create with Turnstile off → OK  
- [ ] Guest create with Turnstile on + bad token → 400  
- [ ] Auth create without captcha → OK  
- [ ] Abuse over limit → 429; Redis down → order still proceeds  
- [ ] Payment controller unchanged  

---

## 6. Out of wave

W6 detection; prod enable Turnstile; CF challenge on `/orders`.
