# 18 — CAPTCHA integration design (Cloudflare Turnstile)

**Depends on:** email policy + rate limit designs; Cloudflare already in front (`00-cloudflare-real-ip.conf`).  
**Constraint:** No payment webhook changes; retail UX must stay usable on mobile.

---

## Root cause

Throttle alone is weak against rotating proxies/bots. Register → ticket → KYC chains are scriptable without human proof.

---

## Proposed solution

### Provider

**Cloudflare Turnstile** (fits existing CF edge; low friction / managed/invisible modes).

### Backend verification

1. Client obtains `cf-turnstile-response` token.  
2. API accepts token in body/header (e.g. `captchaToken`).  
3. Server `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, optional `remoteip`.  
4. Validate:
   - `success === true`
   - `hostname` in allowlist (`cardon.vn`, `www`, partner host if needed)
   - `action` matches expected (if widget configured with action)
   - `challenge_ts` within skew (e.g. 5 minutes)
5. **Replay:** treat token as single-use — store hash in Redis `cardon:captcha:used:{hash}` TTL 10m (reuse abuse Redis prefix family).

### Timeout / error behavior

| Condition | Auth register / ticket / agent-register | Guest create-order |
|-----------|------------------------------------------|--------------------|
| Turnstile API timeout | Fail-closed 503 | Fail-open **or** fail-closed behind flag (prefer fail-closed after soak) |
| Invalid token | 400 | 400 |
| Missing token when required | 400 | 400 |
| Feature flag off | Skip | Skip |

Never call Turnstile from webhook/IPN paths.

### Rollout sequence (endpoints)

1. `POST /auth/register`  
2. `POST /auth/agent-register`  
3. `POST /account/support/tickets` (+ optional upload)  
4. `POST /orders` (guest only first; authenticated optional)  
5. Login — only after N failed attempts (phase 2), not v1 mandatory  

### Frontend

- Web app widgets on forms above.  
- Partner/admin: out of scope unless agent public register UI.  
- Accessibility: Turnstile managed mode.

### Secrets

- `TURNSTILE_SITE_KEY` (public)  
- `TURNSTILE_SECRET_KEY` (ENV only)  
- Admin settings optional later; v1 ENV.

---

## Business impact

- Strong bot reduction on signup/support spam.  
- Slight friction; managed/invisible minimizes drop-off.

## Performance impact

- +1 HTTP call to Cloudflare on guarded requests (~50–200ms). Cache nothing about success beyond replay key.

## False-positive risk

- Rare CF false negatives → user retries.  
- API clients / partners: do not require Turnstile on Agent API distribution endpoints.

## Rollback

- `TURNSTILE_ENABLED=false`  
- Remove FE widgets independently  

## Regression tests

- Mock siteverify success/fail  
- Replay token rejected  
- Webhook paths never import CaptchaService  
- Feature flag off → register works without token  

## Dependencies

- Redis for replay (optional in-memory single-node only for staging)  
- CF account Turnstile widget  

## Effort

- **M** (2–3 days) API + web forms + tests.
