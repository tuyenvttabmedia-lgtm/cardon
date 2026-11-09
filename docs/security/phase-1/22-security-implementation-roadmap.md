# 22 — Security implementation roadmap

**Status:** Design accepted by owner (2026-11-08). Implementation gated per wave.  
**Hard stop (docs phase):** done. **W1+:** local/staging code only after owner confirms each wave scope; no prod/deploy until separately approved.

---

## Wave acceptance log (LOCAL working tree)

| Wave | Local code | Owner decision | Date | Notes |
|------|------------|----------------|------|-------|
| W1 | Implemented (email policy) | Accepted (prior) | 2026-11-08 | Docs `24` + code in tree; no prod deploy from this program step |
| W2 | Implemented + hardening | Accepted conditional → hardening done (`27`–`29`) | 2026-11-08 | Residual ops (nginx cache purge, origin firewall) still **NOT VERIFIED** for prod |
| W3 | Implemented Turnstile (`30`–`32`) | **ACCEPT W3 LOCAL** | 2026-11-08 | `TURNSTILE_ENABLED` remains **false** by default; live keys may be configured per env |
| W4 | Edge S1–S3 applied prod; S2 CF rules applied; S4 soak partial (`33`–`39`) | **APPLIED (edge)** | 2026-11-09 | Origin CF-only + nginx limit_req + CF custom rules; 24h soak / sandbox webhook residual |
| W5 | Guest order LOCAL (`40`–`42`) | In progress LOCAL | 2026-11-09 | **No prod deploy** until owner batch |
| W6 | Not started | — | — | — |

**Standing constraints after W3 ACCEPT LOCAL:** keep W1/W2/W3 source in working tree; no commit/deploy unless separately ordered; do not enable production Turnstile; do not modify Cloudflare config from this program without new owner order.

---

## Evaluation note (vs prior verbal plan)

| Prior plan | This roadmap (GPT-aligned) |
|------------|----------------------------|
| P0 containment ops | Remains **owner-executed** after approval — agents design only |
| P1 email + throttle + captcha + ticket/KYC | Split into docs `16–19` |
| P2 edge | Doc `20` |
| P3 detection | Doc `21` — **no auto-suspend v1** |

Business freezes unchanged: no global customer email verify; no payment/webhook/ledger/fulfillment/eSIM payment changes; no Agent API distribution changes outside approved scope.

---

## P0 — Incident containment (owner / ops only when approved)

### Classify suspicious accounts

1. Email domain ∈ reserved/disposable list (start: `example.com`, `example.org`, `example.net`).  
2. Created in burst windows with shared IP/UA.  
3. Linked: unpaid orders + tickets + agent KYC without paid history.  

### Preserve evidence (before mass suspend)

- Export user ids, emails, IPs, timestamps, ticket ids, KYC ids, order codes.  
- Snapshot relevant nginx/API logs for the window.  
- Do **not** delete rows; prefer `SUSPENDED`/`BANNED` + soft-close tickets.

### Owner review checklist

- [ ] Confirm prod `agentRegistrationMode`  
- [ ] Approve temporary `INVITE_ONLY` or `DISABLED` for agent registration  
- [ ] Approve bulk suspend of `@example.*` (and list)  
- [ ] Approve reject pending KYC / close spam tickets from that set  
- [ ] Confirm CF access for edge rules later  

### Temporary AgentRegistrationMode

- If prod is `PUBLIC_APPROVAL` → switch to `INVITE_ONLY` (settings) during incident.  
- Rollback: restore previous mode after CAPTCHA + email policy live.

**This phase’s deliverable:** procedure only — execution needs explicit owner order.

---

## Implementation waves (owner-locked order)

| Wave | Docs | Deliverable | Effort | Risk to checkout | LOCAL status |
|------|------|-------------|--------|------------------|--------------|
| W1 | 16, `24-w1-…` | Email deny-list (register + agent-register) | S | Very low | **ACCEPTED LOCAL** |
| W2 | 17 + 19 | Redis rate limit + Ticket/KYC protection | M | Low (`POST /orders` fail-open) | **ACCEPTED LOCAL** (hardening `29`) |
| W3 | 18, `30`–`32` | Turnstile Register/Ticket (agent-register included) | M | Low | **ACCEPTED LOCAL** (flag default off; live CF keys **NOT VERIFIED**) |
| W4 | 20, `33`–`39` | Cloudflare / Edge (`limit_req` / WAF; webhook exempt) | S–M | Medium | **Prod applied** (S1–S3 + S2); soak residual |
| W5 | 16/17/18, `40`–`42` | Guest order protection | S–M | Medium — soak | **LOCAL implement** — no prod until owner |
| W6 | 21 | Abuse detection & admin (no auto-suspend/ban) | M–L | Very low | Not started |

**Order:** W1 → W2 → W3 → W4 → W5 → W6.  
**Mandatory constraints:** orders fail-open + metric/alert on Redis down; auth/ticket/KYC fail-closed; no BullMQ counters; no payment/webhook/wallet/ledger/fulfillment/eSIM impact; no auto-suspend; no retail global email verify; KYC auth path reviewed in W2 (not Roles-only); support upload public URL reviewed in W2/W5 as scoped.

P0 ops can run **in parallel** once owner approves, independent of W1 deploy.

---

## Definition of done (program)

- Reserved/disposable domains cannot register.  
- Ticket/KYC floods rate-limited; OPEN capped.  
- Distributed limits work across API replicas.  
- Turnstile on primary abuse forms.  
- Edge challenges on auth paths; webhooks healthy.  
- Watchlist + alert without auto-suspend.  
- Regression plan `23` green on staging.

---

## Out of scope

- Rewriting payment state machines  
- Mandatory retail email verification  
- Auto-refund on probe  
- Full disposable-email SaaS integration (v1)
