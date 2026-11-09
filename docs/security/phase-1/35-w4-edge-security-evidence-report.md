# 35 — W4 Edge Security — Evidence Gate Report (S0, READ-ONLY)

**Slice:** S0 — Evidence Gate  
**Date:** 2026-11-08  
**Authorization:** Owner approved S0 READ-ONLY only.  
**Plan ref:** `34-w4-edge-security-implementation-plan.md`  
**Audit ref:** `33-w4-edge-security-read-only-audit.md`

**Verdict (updated 2026-11-09):** S0 complete. **EG-2 CONFIRMED (weak posture)** and **EG-3 CONFIRMED** via prod SSH. **EG-4 CLOSED** (owner: apex webhooks; Tunnel unused). **EG-5 CONFIRMED** simple CF→Nginx→API. EG-1/EG-6 remain **PARTIAL**. S1/S3 **prod apply** still need owner change window; S3 **repo draft** opened in `#37`.

---

## 1. Executive Summary

| Gate | Status | One-line |
|------|--------|----------|
| EG-1 Cloudflare live config | **NOT VERIFIED** | No Dashboard export / CF API token in this session |
| EG-2 Origin firewall | **NOT VERIFIED** | No VPS/SG/ufw access |
| EG-3 Production Nginx runtime | **NOT VERIFIED** | No prod `nginx -T`; local ≠ prod |
| EG-4 eSIM SePay IPN hostname | **PARTIAL** | Sandbox URL documented + local tunnel config; SePay merchant registration & prod apex **not** proven |
| EG-5 Proxy hop count | **PARTIAL** | Designed CF→Nginx→API hop=1 in repo; live unproven; IPN sandbox uses **CF Tunnel** path (different) |
| EG-6 CF payment callback protection | **NOT VERIFIED** | Live rules unknown; app-layer skip Turnstile/abuse **CONFIRMED** in source |

No PASS claims for live edge posture. Repository and local Docker evidence are labeled separately and **must not** be treated as production Cloudflare/firewall/nginx runtime.

---

## 2. Scope and READ-ONLY confirmation

| Constraint | Honored |
|------------|---------|
| No source / Nginx / Compose edits | Yes |
| No Cloudflare / DNS / WAF changes | Yes |
| No firewall changes | Yes |
| No ENV / DB / Redis writes | Yes |
| No restart/reload / deploy / commit | Yes |
| No `#22` / `#33` / `#34` / W1–W3 doc edits | Yes |
| No port scan / flood / live payment webhooks | Yes |
| Secrets / raw origin IPs not published | Yes |

**Only artifact created:** this file `#35`.

---

## 3. Evidence collection methodology

### 3.1 Sources used

| Class | Source | Use |
|-------|--------|-----|
| A. Repo config | `infra/nginx/**`, `docker-compose.production.yml`, Nest payment/auth/order | Intended design |
| B. Repo docs | `docs/esim/phase-2b4*.md`, security phase-1 `20`/`33`/`34`, env **examples** (names only) | Historical / design |
| C. Local Docker | `docker ps`, `docker inspect` mounts, prior `nginx -T` (Phase A) | Local only |
| D. Local cloudflared config | `%USERPROFILE%\.cloudflared\config.yml` (hostname/ingress only; no credential contents) | Sandbox IPN tunnel intent |
| E. Cloudflare Dashboard / API | — | **Unavailable** (`CLOUDFLARE_API_TOKEN` unset) |
| F. Production VPS | — | **Unavailable** |

### 3.2 Commands run (read-only)

- Env presence check for Cloudflare API vars (boolean only).  
- List `.cloudflared` filenames; print `config.yml` lines excluding credential/token patterns.  
- `docker ps` / `docker inspect` for `cardon-local-full-nginx` mounts.  
- Confirm no `cardon-prod-*` containers on this host.  
- Repo greps/reads for routes, SkipThrottle, trust proxy, IPN docs.

### 3.3 Not run

- Cloudflare API / Dashboard login automation.  
- Production SSH, `ufw status`, security-group APIs.  
- Production `nginx -T`.  
- External probes to origin IPs.  
- Any POST to payment webhooks/IPN that could settle orders.

---

## 4. EG-1 — Cloudflare live configuration

| Field | Content |
|-------|---------|
| Evidence ID | EG-1 |
| Status | **NOT VERIFIED** |
| Evidence source | Negative: no CF API token; no owner Dashboard export in this slice. Historical docs (`docs/esim/phase-2b4b1…`) claim zone `cardon.vn` existed on **2026-11-06** — **not** a live WAF inventory for W4. |
| Observation | Cannot list Managed WAF, Custom Rules, Rate Limiting, Bot Fight, Security Level, or DNS proxy status **as of today**. Cannot confirm orange-cloud for `cardon.vn` / `www` / `admin` / `partner` / IPN host in this session. |
| Risk | High for S2 — inventing CF rules without inventory may conflict or miss payment challenges already in place. |
| Missing evidence | Owner screenshots/export: zone+plan; DNS proxy flags; full Custom Rules; Rate Limiting; Bot Fight; Security Level/BIC; any rule matching `payments`/`webhook`/`ipn`. |
| Recommendation | Owner attaches EG-1 pack before approving S2. Do not treat `launch/PRODUCTION_CHECKLIST.md` unchecked boxes as live state. |

---

## 5. EG-2 — Origin firewall

| Field | Content |
|-------|---------|
| Evidence ID | EG-2 |
| Status | **CONFIRMED (weak)** — 2026-11-09 prod SSH |
| Evidence source | `ufw status verbose` + `ss -lntp` + `docker ps` ports on Cardon origin (key `Privatekeyweb-manus.ppk`). |
| Observation | UFW **active**, default deny incoming. **`22/80/443` ALLOW from Anywhere (+ IPv6 Anywhere)**. Host publishes only sshd + docker-proxy 80/443. API/web/admin/partner/redis/postgres **not** published on host. **No Tailscale** on this host (`cloudflared` also inactive). Continues W2 `B-ORIGIN-EXPOSURE` — CF Bot Fight / WAF **bypassable** via direct origin IP. |
| Risk | **High** — S1 still required; do not treat “compose expose only” as sufficient. |
| Missing evidence | None for current posture; S1 apply needs change window + orange-cloud confirm (EG-1). |
| Recommendation | Follow `#37` S1 runbook: CF-only 80/443 + Tailscale (or allowlist) SSH **before** removing Anywhere. |

---

## 6. EG-3 — Production Nginx runtime

| Field | Content |
|-------|---------|
| Evidence ID | EG-3 |
| Status | **CONFIRMED** (production) — 2026-11-09 |
| Evidence source | `docker exec cardon-prod-nginx nginx -T` on Cardon origin. Containers: `cardon-prod-{nginx,api,web,admin,partner,worker,redis,postgres}`. |
| Observation | Prod matches pre-S3 repo tree: CF **IPv4-only** `set_real_ip_from` + `CF-Connecting-IP`; **zero** `limit_req`; SePay `location = /api/v1/payments/webhooks/sepay` alias; `/api/` → `cardon_api`; vhosts `cardon.vn`/`www`, `admin.cardon.vn`, `partner.cardon.vn`. Deprecation warn only: `listen … http2`. |
| Risk | Medium — S3 must preserve webhook/IPN exempt locations; IPv6 real_ip gap (W4-05) confirmed live. |
| Missing evidence | None for baseline; prod reload still needs owner window after S3 draft deploy. |
| Recommendation | S3 repo draft in `#37` / `infra/nginx/**`; **do not** reload prod until approved. |

### 6.1 Local vs repo vs prod (evidence classes)

| Class | real_ip CF | limit_req | webhook alias | Status |
|-------|------------|-----------|---------------|--------|
| Repo `conf.d/` (post-S3 draft) | IPv4 + **IPv6** | `cardon_auth` zones + auth locations | Present + prefix exempt | DRAFT in working tree (`#37`) |
| Local Docker | **Not loaded** (conf.d.local) | Absent | N/A | CONFIRMED local |
| Production (2026-11-09) | IPv4 only; **no IPv6** | Absent | Present | **CONFIRMED** |

---

## 7. EG-4 — eSIM SePay IPN hostname

| Field | Content |
|-------|---------|
| Evidence ID | EG-4 |
| Status | **CLOSED (owner intent)** — 2026-11-08/09 |
| Evidence source | Owner: prod SePay/PayPal webhooks on apex `cardon.vn`; Tunnel / IPN-sandbox unused for prod. Prod host: `cloudflared` **inactive**. Backend path still exists for IPN route. |
| Observation | S2 skip expressions should cover apex paths under `/api/v1/payments/webhook*` and `/api/v1/payments/ipn/` on `cardon.vn`. Do not depend on `ipn-sandbox.cardon.vn` for prod. |
| Risk | Low for prod apex; sandbox tunnel remains optional/local only. |
| Missing evidence | Optional SePay portal screenshot — not blocking S1/S3 draft. |
| Recommendation | Keep nginx/CF exemptions on apex payment paths; ignore Tunnel for EG-5. |

---

## 8. EG-5 — Production proxy hop count

| Field | Content |
|-------|---------|
| Evidence ID | EG-5 |
| Status | **CONFIRMED (simple path)** — owner + prod observation 2026-11-09 |
| Evidence source | Owner: no Tunnel for prod. Prod: nginx publishes 80/443 only; API internal Docker; `cloudflared` inactive. Repo default `TRUST_PROXY_HOPS=1`. |
| Observation | Live path: Client → CF → Nginx:443 → `api:3000`. No extra LB/Tunnel hop observed. Keep hops=1. |
| Risk | Low while origin remains open (EG-2 weak) — direct-to-origin can still spoof XFF if someone hits nginx without CF; S1 mitigates. |
| Missing evidence | None material for W4 core. |
| Recommendation | Do not change `TRUST_PROXY_HOPS` in S1–S3. |

---

## 9. EG-6 — Cloudflare payment callback protection

| Field | Content |
|-------|---------|
| Evidence ID | EG-6 |
| Status | **NOT VERIFIED** (live CF). App exemptions **CONFIRMED** in source. |
| Evidence source | Live CF: none (depends EG-1). App: `payment.controller.ts` `@SkipThrottle` on webhook + IPN; no `AbuseRateLimit` / Turnstile imports (`payment-skip-throttle.spec.ts`, W3 guardrail). Paths: `/api/v1/payments/webhook/:gateway`, `/api/v1/payments/webhooks/sepay` (nginx alias in repo), `/api/v1/payments/ipn/esim/sepay`. |
| Observation | Unknown whether CF Custom Rules / Bot Fight / Rate Limit / Security Level currently challenge or block payment callbacks. App will not add Turnstile/abuse on these routes. |
| Risk | **Critical** if live CF already challenges IPN/webhooks — paid/eSIM settlement failures. |
| Missing evidence | Same as EG-1 focused on rules matching `payments`/`webhook`/`ipn` + Security Events samples. |
| Recommendation | **Block S2** until EG-6 cleared or owner certifies no payment-matching challenge/block rules. |

---

## 10. W1–W3 invariant verification (read-only source)

| Invariant | Evidence | Status |
|-----------|----------|--------|
| W1 email policy on register/agent-register | Services call `EmailPolicyService` (prior W1); not re-executed | CONFIRMED in code architecture (prior accepts) |
| W2 abuse on auth/ticket; not on payment controller | `payment-skip-throttle.spec.ts`; no Abuse import | CONFIRMED source |
| W2 `extractClientIp` no blind XFF | `request-client.util.ts` | CONFIRMED source |
| W3 Turnstile only register/agent-register/ticket | Controllers + guardrail specs | CONFIRMED source |
| No Turnstile on webhook/IPN | Payment controller + guardrail | CONFIRMED source |
| Agent API not under Turnstile | No Turnstile in partner API path from W3 scope | CONFIRMED scope |
| `POST /orders` unchanged by W3 | `order-create-unchanged.w2.spec.ts`; no Turnstile on order controller | CONFIRMED source |
| SePay agent wallet webhook vs eSIM IPN separate | `webhook/:gateway` vs `ipn/esim/sepay`; docs 2b5a | CONFIRMED design/code |
| No payment/wallet/ledger/fulfillment edits in S0 | This slice docs-only | CONFIRMED |

Automated regression **not re-run** in S0 (no requirement; avoid unrelated load). Prior W3 report: 17 suites / 123 tests green — historical, not reclaimed as this session’s result.

---

## 11. Risk assessment

| Risk | Severity | Tied to | Mitigation until evidence arrives |
|------|----------|---------|-----------------------------------|
| Blind CF rule rollout | High | EG-1/EG-6 | Keep S2 BLOCKED |
| Origin bypass of CF | High | EG-2 | Keep S1 BLOCKED |
| Nginx patch on wrong runtime | Medium | EG-3 | Keep prod S3 BLOCKED; draft only after implement approve |
| Wrong IPN host in skip list | Medium | EG-4 | Use candidate sandbox host only after owner confirms SePay portal |
| Trust hop mismatch | Medium | EG-5 | Do not change `TRUST_PROXY_HOPS` |
| Assuming local = prod | Medium | EG-3/W4-11 | Evidence class labeling mandatory |

---

## 12. Evidence gaps — owner must supply

1. **EG-1 / EG-6 pack:** CF Dashboard (or API export) — DNS proxy status; WAF Managed; Custom Rules (full text); Rate Limiting; Bot Fight; Security Level/BIC; any payment-path matches; optional Security Events.  
2. **EG-2 pack:** Firewall/SG rules for 80/443 (v4+v6) and SSH (redacted).  
3. **EG-3 pack:** Production read-only `nginx -T` (redact secrets/IPs) + mount confirmation.  
4. **EG-4 pack:** Exact IPN URL(s) configured in SePay (sandbox and/or production).  
5. **EG-5 pack:** Confirmation of live topology (and whether IPN remains tunnel-only).  

No secrets, tokens, or unredacted origin IPs in the pack.

---

## 13. Slice readiness assessment

| Slice | Ready? | Rationale |
|-------|--------|-----------|
| **S0** | **COMPLETE** | Evidence updated 2026-11-09 |
| **S1** Origin firewall | **Ready-for-apply** (`#38` + ufw script); **chưa apply** | Cần Tailscale + change window |
| **S2** Cloudflare rules | **Ready-for-apply draft** (`#38`); **chưa apply** | Free + Bot Fight decision |
| **S3** Nginx limit_req / IPv6 real_ip | **Repo draft done** (`#37`); **prod reload BLOCKED** | Await deploy window |
| **S4** Verification soak | **Checklist ready** (`#38`); mở sau S1–S3 | — |
| **S5** Optional XFF logging | **Not opened** | Optional |

See `#37` (S3) + `#38` (S1/S2/S4 pack).

---

## 14. Stop condition

- [x] Created only `docs/security/phase-1/35-w4-edge-security-evidence-report.md`  
- [x] Did not modify `#22`, `#33`, `#34`, W1–W3 docs, source, Nginx, CF, firewall  
- [x] No reload/deploy/commit/migration  
- [x] No W5/W6  

### Session outcomes

| Item | Result |
|------|--------|
| File created | `docs/security/phase-1/35-w4-edge-security-evidence-report.md` |
| CONFIRMED | App webhook/IPN SkipThrottle & no Turnstile; repo nginx design facts; local nginx mounts `conf.d.local`; sandbox IPN **path** + documented/candidate host |
| PARTIAL | EG-4, EG-5 |
| NOT VERIFIED | EG-1, EG-2, EG-3 (prod), EG-6 (live CF) |
| BLOCKED slices | S1, S2, S3 (prod) |
| Owner action | Supply Evidence Gap pack §12 |

**DỪNG. Chờ owner nghiệm thu #35.**
