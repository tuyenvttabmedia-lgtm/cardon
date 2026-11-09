# 24 — W1 Email deny-list — implementation scope (await owner confirm)

**Wave:** W1  
**Design:** `16-email-policy-design.md`  
**Roadmap:** `22-security-implementation-roadmap.md` (owner-locked order)  
**Status:** §9 confirmed by owner; **W1 implemented on local** — awaiting owner nghiệm thu before W2.

---

## 1. Goal

Block new registrations that use RFC-reserved / curated disposable email domains (e.g. `@example.com`) on:

- `POST /auth/register` (customer)
- `POST /auth/agent-register` (agent)

Without requiring retail email verification, without schema/migration, without touching payment/orders/webhooks.

---

## 2. In scope (W1)

| Item | Detail |
|------|--------|
| Shared policy helper | Pure util (+ thin injectable wrapper if needed): normalize email, extract domain, check deny-list / allowlist |
| Domain lists | Static: RFC reserved (`example.com`, `example.org`, `example.net`, `invalid`, `localhost`, `test`, …) + curated disposable (~50–100 common) |
| Feature flag | `EMAIL_POLICY_ENABLED` (default **on** when unset, or explicit `true`; `false` = rollback) |
| Allowlist override | `EMAIL_DOMAIN_ALLOWLIST` — bypass **disposable** only; never RFC reserved |
| Enforce in services | After normalize, **before** DB uniqueness checks — `AuthService.register`, `AgentRegistrationService.registerPublic` |
| Error | `BadRequestException` generic: `Email is not supported` (same for all reject reasons; no rule id in client message) |
| Logging | Server log / audit-style warn with **hashed** email + `ruleId` (`reserved` \| `disposable`) — no bulk PII |
| Config wiring | Optional keys in `configuration.ts` for enabled + allowlist |
| Unit tests | Policy util + registration specs for denied/allowed domains |
| Docs touch | This file + short note in roadmap status after merge |

---

## 3. Out of scope (W1) — deferred

| Item | Defer to |
|------|----------|
| Guest `CreateOrderDto.guestEmail` deny | **W5** (Guest order protection) |
| Ticket / KYC / upload limits; KYC `@Roles` / auth path deep review | **W2** |
| Support upload public URL hardening | **W2** (review) / later wave if code change |
| Turnstile | **W3** |
| Cloudflare / nginx edge | **W4** |
| Abuse score / watchlist / admin / auto actions | **W6** (still **no** auto-suspend) |
| Force `emailVerifiedAt` null for customers / require verify | **Never** in this program |
| Suspend/ban existing `@example.com` users | **P0 ops** (owner), not W1 |
| Migration / Prisma schema | Not needed |
| Production config / deploy | Not in W1 |
| FE form pre-validation copy | Optional later; API reject is enough for W1 |
| `forgot-password` / `resend-verification` deny-list | **Out of W1** (low abuse value; avoid widening surface) |
| Remote disposable API | Not v1 |

---

## 4. Exact files (planned)

### Add

| Path | Role |
|------|------|
| `src/common/email-policy/email-policy.constants.ts` | Reserved + disposable domain sets |
| `src/common/email-policy/email-policy.ts` | `assertEmailAllowed(email, options)` / `isEmailDomainAllowed` |
| `src/common/email-policy/email-policy.spec.ts` | Unit tests for lists + allowlist + normalize |
| `src/common/email-policy/index.ts` | Re-exports |

### Modify

| Path | Change |
|------|--------|
| `src/modules/auth/auth.service.ts` | Call policy in `register()` after normalize |
| `src/modules/agent/services/agent-registration.service.ts` | Call policy in `registerPublic()` after normalize |
| `src/config/configuration.ts` | `emailPolicy.enabled`, `emailPolicy.allowlist` from ENV |
| `src/modules/auth/auth-registration.spec.ts` (and/or agent register spec) | Cases: `user@example.com` rejected; normal email still registers (mocked) |

### Explicitly not modified

- `order/**`, `payment/**`, `provider/**`, `esim/**`, `finance/**`, webhook controllers  
- `support/**`, `agent.controller.ts` (KYC)  
- Prisma schema / migrations  
- nginx / Cloudflare  
- `emailVerifiedAt` assignment logic for customers  

---

## 5. Behaviour matrix

| Input | `EMAIL_POLICY_ENABLED` | Allowlist | Result |
|-------|------------------------|-----------|--------|
| `a@example.com` | true / unset | — | 400 |
| `a@mailinator.com` (if on disposable list) | true | — | 400 |
| `a@gmail.com` | true | — | continue register |
| `a@example.com` | false | — | continue (legacy) |
| `a@example.com` | true | `example.com` | **400** (reserved never bypassed) |
| `a@mailinator.com` | true | `mailinator.com` | continue (disposable exception) |
| Existing DB user `@example.com` | any | — | **unchanged** (login still works until P0) |

Customer register still sets `emailVerifiedAt` as today — W1 only blocks bad domains at intake.

---

## 6. Test plan (W1)

### Automated

1. `email-policy.spec.ts`: reserved, disposable, subdomain of reserved (`foo.example.com` — **decision: reject suffix match for reserved multi-label domains**; single-label `test` as full domain only).  
2. Allowlist beats deny.  
3. Disabled policy always allows.  
4. `auth-registration.spec.ts`: register with `@example.com` → `BadRequestException`; happy path unchanged.  
5. Agent registration unit/spec: same deny on `registerPublic`.  
6. Run existing auth security / registration suites — no regression on login, refresh, agent verify gate.

### Manual local/staging (after code approved & implemented)

1. `POST /auth/register` body with `email=probe@example.com` → 400 + generic message.  
2. Register real-looking email (test mailbox) → 200/201.  
3. `POST /auth/agent-register` with `@example.org` → 400.  
4. Confirm create-order with `guestEmail=x@example.com` still behaves as **today** (W1 must not change it).  
5. Confirm no schema migrate step.

### Evidence to attach at W1 completion

- `git diff` / file list  
- Jest output (policy + registration)  
- HTTP log/screenshot of 400 vs success  

---

## 7. Rollback plan

1. Set `EMAIL_POLICY_ENABLED=false` on the environment → immediate bypass (no redeploy of lists required if flag read at runtime).  
2. Or revert W1 commit.  
3. No DB rollback (no migration).  
4. Existing accounts unaffected either way.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| False positive corp domain | `EMAIL_DOMAIN_ALLOWLIST` |
| Over-broad disposable list | Keep curated short list in W1; expand later via PR |
| Subdomain tricks (`evil.example.com`) | Match registrable/suffix rules for reserved set |
| Accidental order/payment touch | File allowlist above; PR review checklist |

---

## 9. Open decisions for owner (confirm before code)

Please confirm or adjust:

1. **Default flag:** `EMAIL_POLICY_ENABLED` default **ON** when unset — OK?  
2. **W1 surfaces:** only `register` + `agent-register` — OK (guest email → W5)?  
3. **Subdomains:** reject `*@*.example.com` and disposable base domains — OK?  
4. **Disposable list size:** start ~50–100 well-known — OK (not full public dump)?  
5. **Message language:** English API `Email is not supported` (consistent with many auth errors) vs Vietnamese — prefer which for API body?  
6. **Logging:** `Logger.warn` only in W1 (no new audit table) — OK?

---

## 10. Stop condition

After owner answers §9 / approves this scope → implement W1 on local only → deliver diff + test report + evidence → **stop for W1 nghiệm thu** before W2.
