# 23 — Security regression test plan

**Applies to:** Waves W1–W6 in `22-security-implementation-roadmap.md`.  
**Environments:** local → staging → prod smoke (read-only checks where possible).

---

## A. Must never break (business freezes)

| Case | Expect |
|------|--------|
| Customer register with normal email | Success; session issued; **no** forced verify gate |
| Customer login | Success |
| Guest or user create order → SePay/MegaPay happy path | Payment created |
| Webhook SePay / MegaPay / eSIM IPN | Signature OK → accepted; idempotent replay safe |
| Agent HOLD → DEBIT/RELEASE | Unchanged |
| Provider timeout recovery | `checkTransaction` path unchanged |
| eSIM reveal / lease | Existing LPA tests still pass |
| Agent API key auth (distribution) | Unaffected by Turnstile |

---

## B. Email policy (W1)

| Case | Expect |
|------|--------|
| Register `@example.com` / `@example.org` | 400 |
| Register known disposable (from list) | 400 |
| Register gmail/outlook | Success |
| Agent-register reserved domain | 400 |
| Duplicate email | Existing generic conflict message |

---

## C. Redis rate limit (W2)

| Case | Expect |
|------|--------|
| Exceed register limit same IP | 429 |
| Exceed ticket create / OPEN cap | 429/400 |
| Second API instance shares counter | 429 at global N (not N×instances) |
| Redis down + register | Fail-closed per policy |
| Redis down + create order | Fail-open + metric (if implemented) |
| Webhook under load | Not blocked by abuse keys |

---

## D. Ticket / KYC / upload (W2)

| Case | Expect |
|------|--------|
| 6th OPEN ticket | Blocked |
| Ticket with other user’s orderId | 400 |
| Upload &gt;5MB / `application/pdf` | 400 |
| KYC without AGENT role | 403 |
| KYC without emailVerifiedAt | 403/400 |
| KYC when already SUBMITTED | Conflict |
| Admin new-ticket notify | Still fires for allowed create |

---

## E. CAPTCHA (W3–W4)

| Case | Expect |
|------|--------|
| Missing token when enabled | 400 |
| Invalid token | 400 |
| Valid token | Pass |
| Replay same token | Reject |
| `TURNSTILE_ENABLED=false` | No token required |
| Webhook handlers | No captcha dependency |

---

## F. Edge (W5)

| Case | Expect |
|------|--------|
| Burst `/auth/register` | Challenge or 429 at edge |
| Valid payment webhook | 2xx |
| Normal browsing catalog | 200 |
| Partner API | Not broken by auth path rules |

---

## G. Detection (W6)

| Case | Expect |
|------|--------|
| High score user | Appears on watchlist |
| No auto status change to SUSPENDED | Confirmed |
| Alert fires on spike | Manual verify |
| Score job failure | Register/order still succeed |

---

## H. Performance smoke

- p95 register with captcha+redis &lt; 1.5s excluding cold start (staging guideline)  
- Checkout create-order p95 not regress &gt;10% when fail-open  

---

## I. Rollback drills

- Disable email policy flag → reserved domain registers again (proves flag works; re-enable after)  
- Disable Turnstile  
- Disable abuse limiter  
- Revert CF rule  

Document who can flip flags in prod runbook (owner).

---

## J. Test ownership

| Layer | Owner |
|-------|-------|
| Unit / integration Jest | Dev |
| Staging manual UAT checklist | Owner + support |
| CF rule verify | Ops / owner |
| Prod P0 suspend list | Owner only |
