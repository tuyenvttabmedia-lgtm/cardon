# 33 — W4 Edge Security — READ-ONLY AUDIT (Phase A)

**Wave:** W4 Phase A — **AUDIT ONLY** (Phương án A / Edge Security).  
**Date:** 2026-11-08  
**Authorization:** Owner opened W4 Phase A only; **no Implementation**.  
**Design refs:** `20-edge-security-design.md`, roadmap `22`, W2 trust notes `28`/`29`, W3 docs `30`–`32`.

---

## 1. Executive summary

| Area | Verdict |
|------|---------|
| Cloudflare WAF / Bot Fight / Rate Limiting (live) | **NOT VERIFIED** — no Dashboard export/screenshots from owner; no CF API access in this audit |
| Nginx `limit_req` / `limit_conn` (repo + local runtime) | **CONFIRMED absent** in repo `infra/nginx/**`; local container `nginx -T` also has none |
| CF → Nginx real IP (repo) | **CONFIRMED present** (`00-cloudflare-real-ip.conf`); **IPv4-only ranges**; **IPv6 CF ranges absent** in file |
| Origin firewall / direct-to-origin | **NOT VERIFIED** (no VPS/SSH/security-group evidence) — continues W2 finding `B-ORIGIN-EXPOSURE` |
| Webhook/IPN app routes | **CONFIRMED** in Nest; Nginx aliases for SePay plural path **CONFIRMED** in prod-oriented vhost file |
| Turnstile on webhooks | **CONFIRMED not wired** (W3 scope) |
| Production topology vs local Docker | **Must not equate** — local nginx mounts `conf.d.local`, **not** prod `conf.d` with CF real_ip |

**Overall:** App-layer W1–W3 exist in working tree; **edge layer (W4) is largely unimplemented in repo nginx and unverified on live Cloudflare/origin**. Highest actionable design gaps in repo: no `limit_req`, incomplete CF IPv6 trust list, origin exposure unproven, payment controller still parses raw XFF for webhook **logging** IP. Highest operational risk for a future W4 implement: mis-scoped CF challenge/block on payment callbacks.

**No changes were made** to source, Nginx, Cloudflare, firewall, ENV, Docker runtime, or roadmap docs.

---

## 2. Scope and hard restrictions

**In scope:** Read-only inspection of repo configs, Nest payment/webhook routes, local Docker nginx dump (`nginx -T`), design docs.

**Out of scope / forbidden (honored):**

- Edit source/Nginx/CF/firewall/ENV  
- Enable/disable CF rules  
- Deploy/commit/migration/seed  
- Stress/flood/port-scan/prod probes  
- Live webhook posts that could mutate payments  
- W4 Implementation / W5 / W6  

---

## 3. Evidence inventory

### 3.1 Files read (non-exhaustive but primary)

| Path | Role |
|------|------|
| `docs/security/phase-1/20-edge-security-design.md` | Target design |
| `docs/security/phase-1/22`, `28`, `29`, `30`–`32` | Program context / residuals |
| `infra/nginx/nginx.conf` | Upstreams, cache, includes |
| `infra/nginx/conf.d/00-cloudflare-real-ip.conf` | CF IPv4 trust + `CF-Connecting-IP` |
| `infra/nginx/conf.d/cardon.vn.conf` | Customer + API + SePay alias |
| `infra/nginx/conf.d/admin.cardon.vn.conf` | Admin vhost |
| `infra/nginx/conf.d/partner.cardon.vn.conf` | Partner + Agent API proxy |
| `infra/nginx/conf.d/snippets/proxy-headers.conf` | X-Real-IP / XFF |
| `infra/nginx/conf.d/snippets/uploads-proxy.conf` | Uploads cache headers |
| `infra/nginx/conf.d.local/*` | Local-only nginx (incl. eSIM IPN :8081) |
| `docker-compose.production.yml` | Published ports (compose design) |
| `src/main.ts` | `trust proxy` |
| `src/config/configuration.ts` | `TRUST_PROXY_HOPS` default 1 |
| `src/common/utils/request-client.util.ts` (+ spec) | Abuse IP extraction |
| `src/modules/payment/controllers/payment.controller.ts` | Webhook/IPN + SkipThrottle |
| `src/modules/agent-api/guards/agent-api-auth.guard.ts` | Raw XFF for agent API IP |
| `launch/PRODUCTION_CHECKLIST.md` §6 | CF checklist (unchecked boxes in doc) |

### 3.2 Read-only commands run

| Command | Purpose | Result |
|---------|---------|--------|
| `docker ps --format …` | List local containers/ports | Local stack present (`cardon-local-full-*`); **not** production |
| `docker exec cardon-local-full-nginx nginx -T` | Dump **local** effective nginx | No `limit_req`; local confs only (`00-local-production.conf`, `10-esim-ipn-sandbox.conf`); **no** `00-cloudflare-real-ip.conf` mounted |

### 3.3 Commands / probes skipped

| Item | Reason |
|------|--------|
| Production SSH / `ufw` / `iptables` / security groups | No prod access; would be ops |
| Cloudflare Dashboard / API | No owner evidence; forbidden to change; cannot invent |
| External origin reachability / port scan | Forbidden; risk & no authorization |
| POST live webhook/IPN | Could mutate payment state |
| `nginx -s reload` / compose restart | Forbidden |
| Flood / load tests | Forbidden |

### 3.4 Owner evidence still needed

1. Cloudflare zone screenshots/exports: DNS proxy status, WAF Managed, Custom Rules, Rate Limiting, Bot Fight, Security Level.  
2. VPS firewall / cloud security group rules (IPv4 + IPv6) showing origin locked to Cloudflare (or not).  
3. Confirmation whether production nginx mounts `infra/nginx/conf.d` as in `docker-compose.production.yml`.  
4. Live path of SePay eSIM IPN (public `cardon.vn` vs tunnel `ipn-sandbox`).  
5. Any historical CF false-positive logs (optional).

---

## 4. Current architecture / data flow

### 4.1 Intended production path (from repo design)

```text
Client → Cloudflare (proxy) → VPS :80/:443 Nginx → Docker upstreams
                                      ├─ cardon_api:3000   (/api/, /health, /uploads/)
                                      ├─ cardon_web:3001
                                      ├─ cardon_partner:3002
                                      └─ cardon_admin:3003
```

`docker-compose.production.yml`: host publishes **only** nginx `80/443`; API has `expose: 3000` on internal network (not host-published in compose file). **Whether the live VPS matches this** = **NOT VERIFIED**.

### 4.2 Local Docker observed (this machine)

```text
Host :80 → cardon-local-full-nginx (conf.d.local)
Host 127.0.0.1:8081 → eSIM IPN sandbox vhost
API/web/partner/admin: internal only (no host publish except via nginx)
Postgres local: 127.0.0.1:5433
```

Local nginx **does not** include Cloudflare real_ip file. Do **not** treat local as production edge proof.

### 4.3 Nest trust

- `TRUST_PROXY_HOPS` default **1** → Express `trust proxy` = 1.  
- Intended: Nginx is the single trusted hop into API after CF real_ip rewrite at Nginx.

---

## 5. Cloudflare WAF audit

| Check | Repo | Dashboard | Prod effective |
|-------|------|-----------|----------------|
| Zone `cardon.vn` | Mentions in docs/checklist | **NOT VERIFIED** | **NOT VERIFIED** |
| DNS orange-cloud proxy | Assumed by design/`00-cloudflare-real-ip` | **NOT VERIFIED** | **NOT VERIFIED** |
| WAF Managed Rules | Not in repo as code | **NOT VERIFIED** | **NOT VERIFIED** |
| Custom Rules (auth/support) | Design only (`20`) | **NOT VERIFIED** | **NOT VERIFIED** |
| Rate Limiting Rules | Design only | **NOT VERIFIED** | **NOT VERIFIED** |
| Bot Fight / Super Bot Fight | Design warns false positives | **NOT VERIFIED** | **NOT VERIFIED** |
| Security Level / BIC | Checklist item unchecked | **NOT VERIFIED** | **NOT VERIFIED** |
| Webhook exemption rules | Design list in `20` §C | **NOT VERIFIED** | **NOT VERIFIED** |
| False-positive event logs | — | **NOT VERIFIED** | **NOT VERIFIED** |

`launch/PRODUCTION_CHECKLIST.md` §6.1–6.11 are **unchecked** in the document — that is checklist status in git, **not** proof of live CF state.

**Finding W4-01** — High · **NOT VERIFIED** — Live Cloudflare security posture unknown.  
**Impact:** Cannot confirm whether edge already protects auth paths or already risks payment challenges.  
**Mitigation (propose only):** Owner export CF Security rules before any W4 implement; staged path-scoped rules with webhook allowlist.

---

## 6. Origin firewall audit

| Check | Evidence | Status |
|-------|----------|--------|
| Public origin IPs | Not collected (would need ops; would mask if known) | **NOT VERIFIED** |
| Host firewall / SG | No access | **NOT VERIFIED** |
| Compose intent: API not published on host | `docker-compose.production.yml` api `expose: 3000` only | **CONFIRMED in compose file** |
| Nginx published 80/443 | Same compose | **CONFIRMED in compose file** |
| DB/Redis host publish (prod compose) | Not host-mapped in reviewed prod compose snippet | **PARTIAL** (compose only) |
| Direct origin bypass of Cloudflare | Requires live probe — **not run** | **NOT VERIFIED** |
| IPv6 parity | Repo nginx listens `80`/`443` without `[::]` in prod vhosts; CF IPv6 trust list missing | **PARTIAL** (repo) / live **NOT VERIFIED** |
| SSH exposure | No access | **NOT VERIFIED** |

**Finding W4-02** (maps to W2 `B-ORIGIN-EXPOSURE`) — High · **NOT VERIFIED** — Origin may be reachable without Cloudflare.  
**Attack:** Client hits origin IP:443 → spoof/forge headers → abuse limiter keys wrong; bypass any future CF rules.  
**Mitigation (propose):** Firewall allow Cloudflare IP ranges (v4+v6) only to 80/443; verify with controlled external check by ops.

**Finding W4-03** — Medium · **PARTIAL** — Production compose suggests good isolation, but runtime VPS binding unproven.

---

## 7. Nginx audit

### 7.1 Evidence classes

| Class | What we know |
|-------|----------------|
| A. Working-tree prod-oriented configs | `infra/nginx/conf.d/*` |
| B. Local running container | `nginx -T` → `conf.d.local` only |
| C. Production running | **NOT VERIFIED** |

### 7.2 Rate limiting

Search across `infra/nginx/**`: **no** `limit_req_zone`, `limit_req`, `limit_conn_zone`, `limit_conn`.  
Local `nginx -T`: **no** matches.

**Finding W4-04** — Medium · **CONFIRMED (repo + local runtime)** / prod runtime **NOT VERIFIED** — Nginx lacks app-path rate limits described in doc `20`.  
**Impact:** Edge/app throttle gap at nginx layer; relies on Nest throttle + W2 Redis + (future) CF.  
**Mitigation:** Implement path-scoped `limit_req` with webhook/health exemptions (Implementation Phase).

### 7.3 Locations (prod-oriented `cardon.vn.conf`)

| Location | Behavior |
|----------|----------|
| `/health` | → API |
| `=/api/v1/payments/webhooks/sepay` | Exact alias → `/api/v1/payments/webhook/sepay` |
| `/api/` | → API (covers register, tickets, webhooks, IPN under same prefix) |
| `/uploads/` | → API + `Cache-Control: public, max-age=604800` |
| Marketing exact paths | → web + short HTML cache |
| `/` | → web |

**No** dedicated nginx `limit_req` on auth/register/login/support/orders.  
**No** separate webhook location with different rate policy — webhooks share `/api/` (except SePay plural alias).

Admin/partner: `/api/` or `/api/v1/` + `/api/partner/` → API; no limit_req.

### 7.4 Real IP

`00-cloudflare-real-ip.conf`:

- Many `set_real_ip_from` **IPv4** CF ranges  
- `real_ip_header CF-Connecting-IP;`  
- `real_ip_recursive on;`  
- Comment cites https://www.cloudflare.com/ips-v4  
- **No** Cloudflare **IPv6** `set_real_ip_from` entries in file

**Finding W4-05** — Medium · **CONFIRMED (repo)** — CF IPv6 ranges not trusted in nginx real_ip file.  
**Impact:** If clients or CF egress via IPv6 to origin, `$remote_addr` may remain CF edge IPv6 → wrong client IP for logs/limits.  
**Mitigation:** Add current CF IPv6 ranges; keep ranges updated (ops process).

### 7.5 Proxy headers

`proxy-headers.conf`:

- `X-Real-IP $remote_addr`  
- `X-Forwarded-For $proxy_add_x_forwarded_for` (append)  
- `X-Forwarded-Proto $scheme`

With CF real_ip working, `$remote_addr` should be client IP before append.

### 7.6 Listen / default server

Prod-oriented vhosts: `listen 80` / `listen 443 ssl http2` — **no** explicit `[::]` in reviewed files.  
`00-localhost-sim.conf` has `default_server` for local sim — prod default unmatched host behavior **NOT VERIFIED** on live.

### 7.7 Cache

- HTML cache snippet only on selected marketing locations (not `/api/`).  
- `/uploads/` Cache-Control public 7d — known W2 residual for legacy support objects (**A-NGINX-CACHE**, still **NOT VERIFIED** purge).

**Finding W4-06** — Low · **CONFIRMED (repo)** — `/api/` not included in page-cache snippet (good). Uploads still publicly cacheable at nginx header layer.

### 7.8 Location precedence / exemption bypass

SePay plural path uses **exact** `location =` before prefix `/api/` — correct precedence for alias.  
Other webhooks rely on `/api/` prefix only — fine for routing; **does not** create a stronger nginx exemption from future `limit_req` unless implemented carefully.

---

## 8. Webhook / IPN exemption matrix

API prefix: Nest `API_PREFIX` default `api/v1` → full paths below.

| Method | Path | Handler | Nginx match (repo prod vhost) | CF rule | Nest throttle | App authz | Status |
|--------|------|---------|-------------------------------|---------|---------------|-----------|--------|
| POST | `/api/v1/payments/webhook/:gateway` | `PaymentController.handleWebhook` | `/api/` | **NOT VERIFIED** | `@SkipThrottle` | `@Public` + provider `verifyWebhook` / signature; idempotent duplicate handling in service | **CONFIRMED** app |
| POST | `/api/v1/payments/webhooks/sepay` | Alias → `webhook/sepay` | `location =` rewrite | **NOT VERIFIED** | same after alias | same | **CONFIRMED** nginx alias in repo |
| POST | `/api/v1/payments/ipn/esim/sepay` | `esimSepayIpn` | `/api/` (prod vhost); dedicated `=/…` on **local** `:8081` sandbox conf | **NOT VERIFIED** live host | `@SkipThrottle` | `@Public` + IPN secret (`X-Secret-Key` design) | **CONFIRMED** app; live URL **PARTIAL** |
| POST | `/api/v1/payments/webhook/megapay` | same `:gateway` | `/api/` | **NOT VERIFIED** | SkipThrottle | MegaPay notify signature path | **CONFIRMED** app |
| POST | `/api/v1/payments/webhook/sepay` | same | `/api/` (+ alias) | **NOT VERIFIED** | SkipThrottle | SePay HMAC / secrets | **CONFIRMED** app |
| POST | `/api/v1/payments/webhook/paypal` | same param (PayPal provider tests exist) | `/api/` | **NOT VERIFIED** | SkipThrottle | PayPal webhook verify in provider | **CONFIRMED** code paths exist |
| PayOS callback | — | **No PayOS module/routes found** in `src/modules/payment` | — | — | — | — | **NOT APPLICABLE** (codebase) |
| Airalo inbound webhook | — | **No Airalo webhook controller** found | — | — | — | Outbound provider API | **NOT APPLICABLE** (inbound) |
| Turnstile | — | Not on payment controller | — | — | — | W3 only register/agent-register/ticket | **CONFIRMED** exempt |

**Design invariants (must hold in any W4 implement):**

- Do **not** CF-challenge/block these payment callbacks.  
- Do **not** put ordinary nginx `limit_req` on them (or use far higher dedicated zone).  
- Do **not** require Turnstile.  
- Do **not** weaken signature verification / idempotency.

**Finding W4-07** — High (if CF misconfigured) · **NOT VERIFIED** — Unknown whether live CF already challenges `/api/v1/payments/**`.  
**Finding W4-08** — Informational · **CONFIRMED** — App already SkipThrottle + signature layer for webhook/IPN.

---

## 9. Trusted proxy / client IP audit

| Layer | Behavior (repo) | Status |
|-------|-----------------|--------|
| CF `CF-Connecting-IP` | Consumed by nginx real_ip | Repo **CONFIRMED**; live **NOT VERIFIED** |
| Nginx `set_real_ip_from` | CF IPv4 list | **CONFIRMED**; IPv6 missing (**W4-05**) |
| `real_ip_recursive on` | On | **CONFIRMED** |
| `$remote_addr` after real_ip | Should be client | Design **PARTIAL** without live proof |
| `X-Real-IP` | Set to `$remote_addr` | **CONFIRMED** |
| `X-Forwarded-For` | Append via `$proxy_add_x_forwarded_for` | **CONFIRMED** |
| `TRUST_PROXY_HOPS` | Default 1 | **CONFIRMED** |
| Express trust proxy | `main.ts` | **CONFIRMED** |
| `extractClientIp()` | Uses `req.ip` only (no blind XFF) | **CONFIRMED** + unit tests |
| Payment webhook IP log | Parses `X-Forwarded-For[0]` then `req.ip` | **CONFIRMED** (`payment.controller.ts` L88–90) — W2 `B-PAYMENT-XFF` |
| Agent API guard IP | Parses raw XFF[0] | **CONFIRMED** (`agent-api-auth.guard.ts`) |
| Activity/audit interceptors | Some still read raw XFF | **CONFIRMED** (logging paths) |

**Intended client IP for abuse limiter:** Express `req.ip` after trusting 1 hop (Nginx), with Nginx having already applied CF real_ip.

**Spoof if origin direct + trust=1:** Still plausible — **W4-02** / W2 `B-ORIGIN-EXPOSURE`.

**Finding W4-09** — Low · **CONFIRMED** — Divergent IP extraction: abuse uses hardened `extractClientIp`; payment webhook + agent-api (+ some audit) still prefer raw XFF. Affects **logging/attribution**, not W2 consume keys for auth (those use extractClientIp).  
**Mitigation (propose):** Align non-abuse logging to `extractClientIp` in a later hardening slice (not required to open edge rules).

**Finding W4-10** — Medium · **PARTIAL** — `TRUST_PROXY_HOPS=1` matches designed CF→Nginx→API hop count **if** no extra proxy; live hop count **NOT VERIFIED**.

---

## 10. Customer / business impact

| Surface | Edge risk if W4 implemented poorly | Notes |
|---------|--------------------------------------|-------|
| VN mobile / CGNAT | Shared IP → many users hit same CF/nginx rate key | Prefer generous burst; path-scoped; monitor 403/429 |
| Register / login | Primary targets for challenge/limit | Align with W3 Turnstile (still default **off**) |
| Support tickets | Secondary | Already W2 capped |
| Checkout / `POST /orders` | **Must stay fail-open** at app; avoid hard edge block | Program invariant |
| Agent API (`/api/partner/`) | Must not inherit auth HTML challenge | Path allow/exclude carefully |
| Admin / Partner portals | Optional IP allowlist later | Checklist 6.11 optional |
| SePay / MegaPay / PayPal | **Critical false-positive** if challenged | Hard exemption list |
| eSIM IPN | Same as payments | Confirm public hostname before rules |
| PayOS / Airalo inbound | N/A in codebase | — |

**Do not** propose global hard block or global Bot Fight hard-block without CF metrics (none available this audit).

---

## 11. Findings register

| ID | Title | Severity | Status | Component | Evidence | Attack / failure | Business impact | FP risk | Recommended mitigation | Verify before implement |
|----|-------|----------|--------|-----------|----------|------------------|-----------------|---------|------------------------|-------------------------|
| W4-01 | Live CF security posture unknown | High | NOT VERIFIED | Cloudflare | No dashboard export | Blind implement may duplicate/conflict | Wrong protection or outage | High if guessing | Export rules; inventory first | Owner CF screenshots |
| W4-02 | Origin may bypass Cloudflare | High | NOT VERIFIED | VPS firewall | Continues `B-ORIGIN-EXPOSURE` | Direct hit spoofs trust path | Bypass future CF; abuse IP spoof | Low | CF-only allowlist 80/443 v4+v6 | Ops firewall dump |
| W4-03 | Prod port isolation only proven in compose | Medium | PARTIAL | Docker compose | `docker-compose.production.yml` | Mis-publish API on host | Edge bypass | Low | Confirm live `docker ps` / SG | Prod read-only |
| W4-04 | Nginx has no limit_req | Medium | CONFIRMED (repo/local) | Nginx | Grep + `nginx -T` local | Flood hits Node earlier | CPU/cost; weaker defense-in-depth | Med if too tight later | Path zones + webhook exempt | Staging soak |
| W4-05 | CF IPv6 ranges missing in real_ip | Medium | CONFIRMED | Nginx real_ip | `00-cloudflare-real-ip.conf` | Wrong client IP on v6 path | Bad rate keys / audit | Low | Add CF IPv6 ranges | CF IPs doc + test |
| W4-06 | Uploads Cache-Control public | Low | CONFIRMED | Nginx uploads | `uploads-proxy.conf` | Cache stale public objects | Support file residual | Low | Keep W2 API 401; purge CDN | Ops purge check |
| W4-07 | CF may challenge payment paths | High | NOT VERIFIED | Cloudflare | No rules evidence | Gateway IPN fails | Paid orders stuck | Critical if true | Explicit skip for webhook/IPN | CF rule review |
| W4-08 | App webhook SkipThrottle + verify | Info | CONFIRMED | Nest payment | `payment.controller.ts` | — | Control present | — | Keep; never weaken | Regression suite |
| W4-09 | Raw XFF still used in some paths | Low | CONFIRMED | Payment / Agent API | controller + guard | Log IP spoof if direct origin | Forensics noise | Low | Standardize on extractClientIp | Unit tests |
| W4-10 | Trust hop count vs live topology | Medium | PARTIAL | Nest + Nginx | config default 1 | Too many hops → spoof; too few → CF IP as client | Wrong abuse keys | Med | Confirm hop diagram then set | Prod trace |
| W4-11 | Local ≠ prod nginx config | Info | CONFIRMED | Local Docker | `nginx -T` lists conf.d.local | False confidence from local | Bad ops decisions | — | Always label evidence class | — |
| W4-12 | No edge auth path rules in repo | Medium | CONFIRMED | CF/Nginx | Design `20` unimplemented | Register bots hit app only | Relies on W1–W3 | — | W4 implement outline §15 | Owner approve plan |

---

## 12. Confirmed controls (repo / local)

1. Nginx CF IPv4 real_ip module config exists for prod-oriented tree.  
2. SePay `/webhooks/sepay` → `/webhook/sepay` exact alias.  
3. Payment webhook + eSIM IPN are `@Public` + `@SkipThrottle`.  
4. Signature / provider verify + duplicate handling exist at application layer (not re-audited line-by-line here; see payment specs).  
5. W3 Turnstile **not** attached to webhooks.  
6. `extractClientIp` does not blindly trust XFF (abuse path).  
7. Production compose design publishes nginx only on 80/443.  
8. Local nginx has no `limit_req` (matches repo absence).

---

## 13. NOT VERIFIED items (explicit)

1. Live Cloudflare WAF Managed / Custom / Rate Limit / Bot Fight / Security Level.  
2. DNS proxy status for all hostnames (`cardon.vn`, `www`, `admin`, `partner`, IPN host).  
3. Production nginx process config (`nginx -T` on VPS).  
4. VPS/cloud firewall, SSH, IPv6 exposure, direct origin access.  
5. Whether CF currently challenges any `/api/v1/payments/**` path.  
6. Live eSIM IPN public URL (apex vs tunnel sandbox).  
7. CF false-positive history.  
8. PayOS (no code) / Airalo inbound webhook (none found).  
9. Effectiveness of W3 Turnstile live (keys still NOT VERIFIED from W3 accept).  

---

## 14. Recommended remediation priorities (proposal only)

| Priority | Action | Depends on |
|----------|--------|------------|
| P0 | Owner provides CF + firewall evidence packs | Ops access |
| P0 | Confirm webhook/IPN not challenged in CF today | CF export |
| P1 | Origin allowlist Cloudflare IPs (v4+v6) | Firewall change window |
| P1 | Add CF IPv6 to `set_real_ip_from` | Nginx change + reload (future implement) |
| P2 | CF path-scoped rate/challenge for auth register/agent-register/login (managed challenge) | Exemptions for payments + partner API |
| P2 | Nginx `limit_req` defense-in-depth with webhook/health exempt | Staging |
| P3 | Align payment/agent-api IP logging to `extractClientIp` | Small code PR (optional; separate from edge) |
| P3 | CDN purge review for `/uploads/support` legacy | Ops |

---

## 15. Proposed W4 Implementation Plan outline (NOT approved)

1. **Evidence gate:** CF export + firewall dump accepted.  
2. **Inventory live rules** vs desired exemptions.  
3. **Origin lock** (firewall) before aggressive CF blocks.  
4. **CF Custom Rules** — challenge/rate on `/api/v1/auth/register`, `agent-register`, optional login; **skip** `/api/v1/payments/webhook`, `/webhooks/sepay`, `/api/v1/payments/ipn/**`, health.  
5. **Bot Fight** — start challenge/low; never global hard block without metrics.  
6. **Nginx** — add `limit_req` zones; exempt webhook/IPN/health; update CF IPv6 real_ip; reload with change window.  
7. **Verify:** synthetic signed webhook 2xx; register clean IP OK; burst register limited; partner API OK; VN mobile spot-check.  
8. **Rollback:** disable CF rules; remove nginx limit stanzas; firewall rollback procedure.  

**This outline is not authorization to implement.**

---

## 16. Regression / verification plan (for future implement)

- Payment SkipThrottle + signature unit/integration suites green.  
- Order-create unchanged (no edge hard-block on orders).  
- W1/W2/W3 suites still green.  
- Manual: SePay/MegaPay/PayPal webhook sandbox 2xx.  
- Manual: eSIM IPN path reachable from SePay.  
- Manual: register + ticket with Turnstile flag still off by default.  
- Monitor CF 403/429 and gateway failure alerts 24–72h.

---

## 17. Rollback considerations (future)

- CF: toggle rules off in Dashboard.  
- Nginx: revert conf → reload.  
- Firewall: restore previous SG with change ticket.  
- No DB migration expected for pure edge work.

---

## 18. Explicit confirmation — no changes made

| Action | Done? |
|--------|-------|
| Modified application source | **No** |
| Modified Nginx / Docker / ENV | **No** |
| Cloudflare Dashboard / API changes | **No** |
| Firewall / iptables / ufw changes | **No** |
| Service reload/restart | **No** |
| Migration / seed / DB write | **No** |
| Commit / deploy | **No** |
| Modified roadmap `22` or W1–W3 docs | **No** |
| Started W5/W6 | **No** |
| Created only | `docs/security/phase-1/33-w4-edge-security-read-only-audit.md` |

### Read-only commands executed

- `docker ps` (local inventory)  
- `docker exec cardon-local-full-nginx nginx -T` (local config dump; filtered locally)

### Not run

- Production access, CF API, port scans, flood tests, live payment webhooks, nginx reload.

---

## 19. Stop

**W4 Phase A complete.**  
Await owner nghiệm thu of this audit before any W4 Implementation, Cloudflare rule change, Nginx edit, or firewall change.
