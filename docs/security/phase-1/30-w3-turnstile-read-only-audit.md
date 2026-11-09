# 30 — W3 Turnstile Register/Ticket — READ-ONLY AUDIT

**Mode:** READ-ONLY AUDIT & PLANNING — no source/env/migration/Docker/prod changes in this phase.  
**Basis:** Working tree after W2-Hardening (doc `29`) + design refs `18`, `19`, `22`, `23`.  
**Scope:** W3 only (Register + Ticket + agent-register). **Not** W4 Edge, W5 guest order, W6 detection.

---

## Verdict (executive)

| Area | Status |
|------|--------|
| Turnstile code / package / ENV wiring | **Absent** — Confirmed |
| CF widget / Site Key / Secret in repo | **Not present** — Confirmed (no invented keys) |
| `POST /auth/register` bot surface | **Confirmed** gap — public + throttle/abuse only |
| `POST /auth/agent-register` bot surface | **Confirmed** gap — same pattern |
| `POST /account/support/tickets` bot surface | **Confirmed** residual — JWT + W2 limits; no human proof |
| Support message / upload | Auth + W2; Turnstile **optional / lower priority** |
| W1/W2 compatibility risk if implemented carefully | **Low** (additive layer) |
| Live CF account / hostname allowlist | **Not Verified** (ops; no CF API calls in audit) |

**Conclusion:** W3 is greenfield relative to application code. Design intent exists in `18-captcha-integration-design.md`. Implementation must not replace W1/W2; must verify tokens **server-side** only.

---

## 1. Files inspected

### Backend (API)

| Path | Relevance |
|------|-----------|
| `src/modules/auth/auth.controller.ts` | `register`, `agent-register`, throttle + abuse |
| `src/modules/auth/dto/register.dto.ts` | No captcha field |
| `src/modules/auth/dto/agent-register.dto.ts` | No captcha field |
| `src/modules/auth/auth.service.ts` | Register + W1 email policy |
| `src/modules/auth/auth-throttle.constants.ts` | Nest `@Throttle` limits |
| `src/modules/agent/services/agent-registration.service.ts` | Agent public register + W1 |
| `src/modules/support/controllers/support-account.controller.ts` | Ticket/message/upload/download |
| `src/modules/support/dto/support.dto.ts` | Create/message DTOs |
| `src/modules/support/services/support.service.ts` | OPEN cap + ownership |
| `src/modules/support/repositories/support.repository.ts` | OPEN lock + attachment ownership |
| `src/common/abuse-rate-limit/abuse-rate-limit.constants.ts` | W2 buckets |
| `src/common/email-policy/**` | W1 |
| `src/config/env.validation.ts` | No TURNSTILE_* keys |
| `src/config/configuration.ts` | No turnstile config block |
| `src/modules/contact/controllers/contact-public.controller.ts` | Public contact — **out of W3** note |
| `package.json` / apps package manifests | No Turnstile SDK dependency |

### Frontend (web)

| Path | Relevance |
|------|-----------|
| `apps/web/app/register/RegisterPageClient.tsx` | Customer register form |
| `apps/web/app/dang-ky-dai-ly/AgentRegisterPageClient.tsx` | Agent register form |
| `apps/web/app/account/support/page.tsx` | Ticket create / message / upload |
| `apps/web/services/api-client.ts` | `authApi` / `supportApi` payloads |
| `apps/web/types/api.ts` | `RegisterPayload` — no captcha |
| `apps/web/contexts/AuthContext.tsx` | `register()` wrapper |

### Docs / examples

| Path | Relevance |
|------|-----------|
| `docs/security/phase-1/18-captcha-integration-design.md` | Target architecture |
| `docs/security/phase-1/19-ticket-kyc-upload-protection.md` | Ticket captcha intent |
| `docs/security/phase-1/22-security-implementation-roadmap.md` | W3 scope lock |
| `docs/security/phase-1/23-security-regression-test-plan.md` | Captcha regression stubs |
| `.env.example`, `.env.production.example` | No TURNSTILE_* |

### Grep coverage (repo)

Searched: `turnstile`, `siteverify`, `cf-turnstile-response`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `captcha`, `hcaptcha`, `recaptcha`.  
**Hits in application source (`src/`, `apps/`):** **none**.  
**Hits:** security phase-1 docs only.

---

## 2. APIs & frontend related to W3

### A. Authentication

| Endpoint | Auth | Current anti-abuse | FE |
|----------|------|--------------------|-----|
| `POST /auth/register` | `@Public()` | Nest `@Throttle(AUTH_REGISTER_THROTTLE)` + W2 `auth_register` (ip, emailHash) + W1 email policy in service | `/register` → `authApi.register` |
| `POST /auth/agent-register` | `@Public()` | Same throttle + W2 `auth_agent_register` + W1 in `AgentRegistrationService` | `/dang-ky-dai-ly` → `authApi.agentRegister` |

**DTO fields today:** credentials/profile/terms only — **no** `captchaToken` / `cf-turnstile-response`.

**Error surface to FE:** Nest exceptions (400 validation, 409 conflict copy, 429 throttle/abuse, 503 abuse Redis fail-closed). FE maps via `customerFacingError` / `ApiClientError.message`.

**Out of W3 (explicit):** `login`, `forgot-password`, `reset-password`, `verify-email`, `resend-verification` — throttle only; roadmap reserves login captcha for later.

### B. Support / Ticket

| Endpoint | Auth | Current anti-abuse | Turnstile need (audit) |
|----------|------|--------------------|-------------------------|
| `POST /account/support/tickets` | JWT + `CUSTOMER` | W2 `support_ticket_create` (userId, ip) + OPEN cap ≤5 | **Yes — primary** |
| `POST /account/support/tickets/:id/messages` | JWT + ownership | W2 `support_message` (userId) | **Optional** (doc 19) |
| `POST /account/support/upload` | JWT + CUSTOMER | W2 `support_upload` + magic/MIME | **No (v1)** — already gated; captcha on create covers intent |
| `GET .../files/:filename` | JWT + ownership | Exact ownership (W2-H) | **No** |
| Admin reply / admin files | Admin perms | RBAC | **No** |

FE: `apps/web/app/account/support/page.tsx` — create ticket, reply, upload then attach URL.

### C. Related but **out of W3**

| Endpoint | Note |
|----------|------|
| `POST /contact` | Public; Nest throttle 5/min only — residual spam surface → later wave / owner decision |
| `POST /orders` | Guest order → **W5** |
| Agent distribution API | Must **never** require Turnstile |
| Payment webhook / eSIM IPN | Must **never** call Turnstile |

---

## 3. Current Turnstile integration status

| Item | Status | Classification |
|------|--------|----------------|
| npm / FE widget package | Absent | **Confirmed** |
| Nest `TurnstileService` / siteverify client | Absent | **Confirmed** |
| ENV `TURNSTILE_*` in validation/config/examples | Absent | **Confirmed** |
| Endpoint requiring captcha token | None | **Confirmed** |
| Design doc (`18`) | Present | **Confirmed** |
| Cloudflare widget created in account | Unknown | **Not Verified** |
| Production hostname allowlist | Unknown | **Not Verified** |

**No Site Key / Secret Key values exist in repo; audit does not invent them.**

---

## 4. Request flow (current)

### Register (customer)

```text
Browser RegisterPageClient
  → POST /auth/register (JSON, no captcha)
    → Nest ValidationPipe (RegisterDto)
    → @Throttle (in-memory)
    → AbuseRateLimitService.consumeOrThrow(auth_register)
    → AuthService.register
         → EmailPolicy.assertRegistrationEmailAllowed (W1)
         → uniqueness checks → create user → issue session
```

### Agent register

```text
Browser AgentRegisterPageClient
  → POST /auth/agent-register
    → Throttle + Abuse(auth_agent_register)
    → AgentRegistrationService.registerPublic
         → EmailPolicy (W1) → invite mode → create AGENT user
         → email verification required (no session)
```

### Support ticket create

```text
Authenticated Customer support page
  → POST /account/support/tickets
    → JwtAuthGuard + RolesGuard(CUSTOMER)
    → Abuse(support_ticket_create)
    → SupportService.createTicket
         → order ownership check (optional)
         → createTicketWithOpenCap (FOR UPDATE + OPEN≤5)
         → notify admin
```

**Gap:** No human-verification step on any of the three primary abuse entry points.

---

## 5. Weaknesses / findings

| ID | Severity | Classification | Evidence | Impact | Root cause | Remediation (plan only) |
|----|----------|----------------|----------|--------|------------|-------------------------|
| W3-A1 | High | **Confirmed** | Public register/agent-register; no captcha field/service | Scripted account creation via rotating IPs/emails beyond W1/W2 alone | Captcha not implemented | Server siteverify on register + agent-register |
| W3-A2 | Medium | **Confirmed** | Ticket create JWT-only + W2 limits | Compromised/cheap accounts still open tickets until cap | No human proof on create | Turnstile on ticket create |
| W3-A3 | Medium | **Confirmed** | `apps/` + `src/` grep empty; no package | Bots can hit API directly without UI | No backend token gate | Backend-mandatory token when flag on |
| W3-A4 | Low | **Confirmed** | DTOs lack `captchaToken` | FE cannot send token even if widget added alone | Contract incomplete | Add optional/required DTO field under flag |
| W3-A5 | Low | **Suspected** | Contact `POST /contact` public + light throttle | Contact spam unrelated to W3 forms | Out of W3 scope | Owner backlog; not W3 implement |
| W3-A6 | Info | **Not Verified** | No CF dashboard access | Wrong hostname/action config could lock users | Ops | Owner creates widget; document hostnames |
| W3-A7 | Low | **Confirmed** (design debt) | Doc 18 suggests Redis replay hash | Relying only on CF single-use may be enough; dual-write needs Redis | Not coded | Decide replay Redis vs CF-only in plan |
| W3-A8 | Info | **Confirmed** | Abuse runs **before** business today | If captcha checked after `consumeOrThrow`, invalid bots burn quotas | Ordering | Prefer: validate captcha **before** abuse consume when enabled |

---

## 6. Endpoints recommended for Turnstile (W3)

| Priority | Endpoint | Require when `TURNSTILE_ENABLED=true` | Rationale |
|----------|----------|----------------------------------------|-----------|
| P0 | `POST /auth/register` | Yes | Primary abuse vector (doc 15/18) |
| P0 | `POST /auth/agent-register` | Yes | Same; agent spam |
| P0 | `POST /account/support/tickets` | Yes | Ticket flood; complements OPEN cap |
| P1 optional | `POST /account/support/tickets/:id/messages` | Owner decision | Doc 19 “optionally first message”; JWT+rate already |
| Skip W3 | upload, download, admin, login*, orders, webhooks, Agent API | — | W2/RBAC/W5/out of scope |

\*Login captcha only after N failures → future phase (doc 18).

---

## 7. Backend security design assessment (as-is Nest)

Observed patterns suitable for integration **without new packaging assumption**:

- Controllers already inject cross-cutting services (`AbuseRateLimitService`).
- Outbound HTTP elsewhere uses native `fetch` + timeouts (Telegram, CMS revalidate, etc.) — **no** mandatory `@nestjs/axios` for Turnstile.
- Config via `ConfigService` + `env.validation.ts` Joi — extend with optional `TURNSTILE_*`.
- Fail-closed precedent: W2 abuse Redis errors → 503 on auth/ticket paths.

**Required properties (from doc 18 + this audit):**

1. FE obtains widget token only; never “trust client success”.
2. API calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` with **secret from ENV**.
3. Verify **before** mutating business state (user create / ticket create).
4. Check at least: `success`, `hostname` allowlist, optional `action`, `challenge_ts` skew.
5. Never log raw token or secret; never return secret in errors.
6. Feature flag skip when disabled (local/dev without keys).
7. Do not wire into payment/webhook/IPN/order create in W3.

**Replay:** Cloudflare tokens are single-use at siteverify. Extra Redis `cardon:captcha:used:{sha256}` is defense-in-depth (doc 18) — **owner decision** (see questions).

---

## 8. Compatibility with W1 / W2

| Control | Interaction with Turnstile | Risk if careful |
|---------|----------------------------|-----------------|
| W1 EmailPolicy | Remains inside register services **after** captcha+abuse | None — additive |
| W2 Abuse limiter | Keep; captcha does not replace | Ordering: captcha before consume preferred |
| W2 Nest `@Throttle` | Keep | None |
| W2 Ticket OPEN cap | Keep after captcha | None |
| W2 Support upload private + ownership | Unchanged; no Turnstile on download | None |
| W2 SkipThrottle webhooks | Must not import captcha into payment controllers | Regression test required |
| POST `/orders` | **Do not** attach Turnstile in W3 | Explicit exclusion |

Turnstile = **additional** human proof layer, not a substitute for rate limits or email policy.

---

## 9. Error / failure matrix (analysis only)

| # | Case | Recommended behavior when enabled | Fail mode |
|---|------|-----------------------------------|-----------|
| 1 | Missing token | 400 Bad Request | Fail-closed |
| 2 | Invalid token | 400 | Fail-closed |
| 3 | Expired token | 400 (CF `timeout-or-duplicate` / error codes) | Fail-closed |
| 4 | Already used token | 400 | Fail-closed (CF + optional Redis) |
| 5 | Hostname mismatch | 400 | Fail-closed |
| 6 | Action mismatch (if configured) | 400 | Fail-closed |
| 7 | Cloudflare timeout | 503 Service Unavailable | **Fail-closed** for register/ticket (doc 18) |
| 8 | Cloudflare 5xx / network error | 503 | Fail-closed |
| 9 | Secret not configured while enabled | 503 (misconfig) — do not skip silently | Fail-closed |
| 10 | FE widget fails to load | Block submit client-side; show retry; API still rejects missing token | Fail-closed API |
| 11 | Direct API without FE | 400 missing/invalid token | Fail-closed |
| 12 | Bot flood with stolen/cheap solves | Captcha + W2 abuse + OPEN cap still apply | Layered |

**When `TURNSTILE_ENABLED=false`:** skip verification; current W1/W2 behavior unchanged (rollback path).

**Owner must approve** fail-closed vs any fail-open exception before implement — audit does **not** change production behavior.

---

## 10. Env configuration needed (planned; not applied)

| Variable | Where | Notes |
|----------|-------|-------|
| `TURNSTILE_ENABLED` | API | `true`/`false`; default false until keys ready |
| `TURNSTILE_SECRET_KEY` | API ENV only | Never FE / never commit |
| `TURNSTILE_SITE_KEY` or `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Web public | Widget render only |
| `TURNSTILE_ALLOWED_HOSTNAMES` | API | e.g. `cardon.vn,www.cardon.vn,localhost` |
| `TURNSTILE_EXPECTED_ACTIONS` (optional) | API | Per-endpoint action names |
| `TURNSTILE_TIMEOUT_MS` | API | e.g. 3000–5000 |
| `TURNSTILE_MAX_AGE_SEC` | API | challenge_ts skew, e.g. 300 |

No keys invented or written into `.env` during this audit.

---

## 11. Test / regression expectations (for later implement)

- Unit: siteverify mock success / fail / timeout / hostname / action / missing secret.
- Unit: flag off → register without token succeeds (existing tests still green).
- HTTP/controller: register/agent-register/ticket reject without token when enabled.
- Regression: W1 email-policy, W2 abuse, payment SkipThrottle, order-create-unchanged, support ownership.
- FE: widget present on three forms; submit disabled until token (managed mode).

---

## 12. Rollback (design)

1. `TURNSTILE_ENABLED=false` on API.  
2. Hide/remove FE widgets independently.  
3. No schema/migration to roll back.

---

## 13. Risks & owner decisions required

See plan doc `31` § decisions. Critical:

1. Fail-closed on CF outage for register/ticket — confirm.  
2. Whether ticket **messages** need Turnstile in W3 v1.  
3. Redis replay hash vs CF single-use only.  
4. Captcha **before** vs after abuse `consumeOrThrow`.  
5. Widget mode: managed vs invisible.  
6. Hostname list for staging/local.  
7. Whether `POST /contact` enters a later wave (not W3).

---

## 14. Stop conditions (this phase)

- [x] No source code modified by this audit task  
- [x] No migration / schema / DB ops  
- [x] No Docker / VPS / production changes  
- [x] No Cloudflare config API calls  
- [x] No commit  
- [x] Deliverables `30` + `31`  
- [x] **STOP — await owner approve W3 implementation**

---

## 15. Git hygiene note

Working tree already contains **prior** W1/W2/W2-H local changes (unrelated to this audit). This phase only **adds** documentation under `docs/security/phase-1/30-*.md` and `31-*.md`. No application source edits were made for W3.
