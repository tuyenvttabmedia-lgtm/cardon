# 15 — Abuse findings evidence

**Scope:** Evidence-only (code + infra in repo). No production DB/log mutation.  
**Incident signal:** Many `@example.com` accounts → orders, agent signup, tickets, KYC (suspected automation / vulnerability probing).  
**Status:** Design freeze — no implement until owner acceptance.

---

## Summary of root causes

| # | Finding | Severity | Confirmed in code |
|---|---------|----------|-------------------|
| F1 | Customer register marks email verified immediately | High (abuse enabler) | Yes |
| F2 | No email domain deny-list (`@example.com` valid) | High | Yes |
| F3 | Nest Throttler default in-memory; IP-centric | Medium–High | Yes |
| F4 | `POST /orders` create has no dedicated `@Throttle` | Medium | Yes |
| F5 | Support ticket/message/upload: no rate limit / OPEN cap | Medium–High | Yes |
| F6 | Agent registration default mode `PUBLIC_APPROVAL` | Medium (prod mode unknown) | Default yes; prod value needs owner check |
| F7 | KYC submit / KYC upload: auth only, no abuse throttle | Medium | Yes |
| F8 | Nginx: Cloudflare real IP configured; no `limit_req` in conf | Medium | Yes |
| F9 | Support upload returns public `/uploads/support/...` URL | Low–Medium | Yes |

---

## A. Customer registration

### Evidence

| Item | Location |
|------|----------|
| Endpoint | `POST /auth/register` — `src/modules/auth/auth.controller.ts` L48–53 |
| Throttle | `@Throttle({ default: AUTH_REGISTER_THROTTLE })` — same file L49 |
| Limits | `src/modules/auth/auth-throttle.constants.ts` L26–28 — default **5 / 15 min** (`AUTH_REGISTER_THROTTLE_*` ENV override) |
| DTO email | `@IsEmail()` only — `src/modules/auth/dto/register.dto.ts` L27–28 |
| `emailVerifiedAt` set on create | `src/modules/auth/auth.service.ts` L97–101 — comment: retail customers do **not** require verification; value = `acceptedTermsAt` |
| Session issued immediately | `register()` returns `this.issueAuthResult(user, …)` — L128 |
| Duplicate handling | Conflict if email/username/phone exists — L64–78; Prisma P2002 — L105–110; generic message (no field leak) |
| Agent login email gate (contrast) | `auth.service.ts` L191 — `AGENT && emailVerifiedAt == null` blocked |
| Welcome/verify token still sent | L114–126 — optional notify; failure only warns |

**Conclusion:** Customer path **skips** effective email verification. RFC reserved domains (e.g. `example.com`) pass `@IsEmail` and become fully usable accounts.

### Post-register usable surfaces (relevant to incident)

With JWT from register: account APIs, orders (also guest), `POST /account/support/tickets`, etc. Agent path is separate (`agent-register` + role AGENT).

---

## B. Agent registration / KYC

### Evidence

| Item | Location |
|------|----------|
| Public register | `POST /auth/agent-register` — `auth.controller.ts` L55–59 → `AgentRegistrationService.registerPublic` |
| Mode resolution | `src/modules/agent/services/agent-invite.service.ts` L13–18 — default **`PUBLIC_APPROVAL`** if unset |
| Invite enforcement | `requireInviteForMode` L57–72 — invite **required only** when `INVITE_ONLY` |
| Agent user create | `agent-registration.service.ts` L60–72 — `emailVerifiedAt` **not** set on create (unlike customer) |
| KYC submit API | `POST /agents/kyc` — `agent.controller.ts` L64–66 → `submitKyc` |
| KYC guards | Class: `JwtAuthGuard` only (`agent.controller.ts` L37–38). Method `submitKyc` has **no** `@Roles(AGENT)` (unlike `changePassword` L52–54) — ownership enforced in service via `requireOwnAgent` |
| Status / duplicate KYC | `agent.service.ts` L91–106 — only `PENDING_KYC` / `REJECTED`; conflict if already `SUBMITTED` / `APPROVED` |
| KYC document upload | `POST /agents/me/kyc/documents` — L74–79+ |
| Concurrent submit | Upsert path L126–132 — last-write / upsert semantics; **no** distributed lock / rate limit |

**Production mode:** Not readable from repo alone. Owner must confirm `system.agentRegistrationMode` (settings store) on prod. If unset → code default `PUBLIC_APPROVAL`.

---

## C. Orders

### Evidence

| Item | Location |
|------|----------|
| Create | `POST /orders` — `order.controller.ts` L75–108 |
| Auth | `OptionalJwtAuthGuard` — guest + logged-in |
| Throttle on create | **Absent** |
| Guest lookup throttle | `lookup*` L125–157 — 5 / 15 min |
| eSIM reveal throttle | L215–217 — 5 / 15 min |
| Client IP capture | `extractClientIp` — `src/common/utils/request-client.util.ts` L3–12 (`X-Forwarded-For` first hop) |
| Idempotency | Payment layer / `payment_reference` (system rules) — **not** a substitute for create-order abuse throttle |

**CAPTCHA/throttle impact:** May slow scripted unpaid order spam; must not touch webhook/IPN or fulfillment workers. Guest checkout UX needs Turnstile invisible/managed mode if rolled out.

---

## D. Ticket / upload

### Evidence

| Item | Location |
|------|----------|
| Controller | `src/modules/support/controllers/support-account.controller.ts` — JWT + `Roles(CUSTOMER)` L23–25 |
| Create ticket | `POST .../tickets` L42–44 — **no** `@Throttle` |
| Messages | `POST .../tickets/:id/messages` L47–58 — **no** `@Throttle` |
| Upload | `POST .../upload` L61–64 — **no** `@Throttle`; does not bind file to userId in service |
| OPEN status | Repository sets `OPEN` on create — `support.repository.ts` (~L28) |
| OPEN cap | **None** in `createTicket` |
| MIME / size | `support.constants.ts` — 5MB; jpeg/png/webp/gif |
| Storage | Local disk `uploads/support/` — `support-upload.service.ts` L13–35 |
| Notification | `notifyAdminNewTicket` on create — `support.service.ts` L39–44 (admin noise vector) |

---

## E. Redis / Throttler

### Evidence

| Item | Location |
|------|----------|
| Global Throttler | `src/app.module.ts` L57–61 — 100 / 60s; L114–116 `APP_GUARD` = `ThrottlerGuard` |
| Custom storage | **Not configured** → Nest default **in-memory** |
| Redis usage | BullMQ — `src/queue/queue.module.ts` L52–62 (`redis.url`); health checks; eSIM lease helpers |
| Multi-instance | In-memory counters **do not share** across API replicas → effective limit × N |
| Key namespace for abuse | **None** today |

**Risk if Redis abused for rate-limit:** Must use **separate key prefix** and fail policy that does not stall BullMQ payment/fulfillment queues (see `17-redis-rate-limit-design.md`).

---

## F. Cloudflare / Nginx

### Evidence

| Item | Location |
|------|----------|
| CF real IP | `infra/nginx/conf.d/00-cloudflare-real-ip.conf` — `real_ip_header CF-Connecting-IP` |
| Country header used in app | `extractClientCountryCode` reads `cf-ipcountry` — `request-client.util.ts` L19–26 |
| `limit_req` | **Not found** under `infra/nginx/conf.d*` |
| API proxy | `infra/nginx/conf.d/cardon.vn.conf` — `/api/` → `cardon_api` |
| SePay webhook alias | Same file ~L24–26 — must stay exempt from aggressive challenge |
| Uploads | `infra/nginx/conf.d/snippets/uploads-proxy.conf` → `/uploads/` |

**Origin exposure / live WAF rules:** Not fully auditable from repo; owner/ops must confirm CF plan rules and whether origin IP is firewalled to Cloudflare only.

---

## Mapping to incident narrative

```
Register (@example.com) → JWT (emailVerifiedAt set)
  → Create orders (no create throttle)
  and/or agent-register (if PUBLIC_APPROVAL)
  → Tickets (notify admin) + KYC submit/upload
```

This matches **surface probing / ops noise**, not necessarily payment/ledger compromise. Payment webhook + HOLD model remain out of this finding set unless separate evidence appears.

---

## Gaps requiring owner / prod read (not done here)

1. Confirm prod `agentRegistrationMode`.  
2. Sample IPs/ASNs and timing from access logs for `@example.com` users.  
3. Confirm number of API replicas (multiplies in-memory throttle).  
4. Confirm Cloudflare Bot Fight / WAF status.

---

## Dependencies for later implementation

- Owner approval of roadmap (`22-security-implementation-roadmap.md`)  
- No code/config change in this phase
