# 34 — W4 Edge Security — IMPLEMENTATION PLAN (Phương án A)

**Status:** PLAN ONLY — **chưa implement**.  
**Basis:** Owner nghiệm thu Phase A audit `33-w4-edge-security-read-only-audit.md` + design `20` + program constraints W1–W3.  
**Mode:** Documentation only. No source/Nginx/CF/firewall/ENV/deploy/commit changes in this phase.

---

## 0. Executive decisions (locked for this plan)

| Decision | Value |
|----------|--------|
| Wave content | **W4 = Edge Security** (CF + origin firewall + nginx defense-in-depth) |
| Primary edge | Cloudflare rules (path-scoped) |
| Secondary | Nginx `limit_req` (defense-in-depth) |
| Webhooks/IPN | Hard exemption — no CF challenge/block, no Turnstile, no ordinary nginx `limit_req` |
| `POST /orders` | No new edge hard-block; app fail-open invariant unchanged |
| Bot Fight | Prefer **off or challenge-only**; no global hard block without metrics |
| Trust proxy / Nest code | **No** `TRUST_PROXY_HOPS` or XFF code changes in core W4 slices (optional later slice) |
| W5/W6 | Not opened |

### Roadmap discrepancy (recorded, not edited)

Roadmap `22` table still shows W4 as “Cloudflare / Edge” and W5 as “Guest order protection”. Owner has confirmed **current W4 work = Phương án A Edge Security** (this plan).  
**This task does not modify `22`.** Any roadmap status update is a separate owner-ordered docs edit after plan accept / implement.

---

## 1. Goals & non-goals

### Goals

1. Cut scripted abuse at the edge before Nest (register / agent-register / login), without breaking payments.  
2. Prove and (when approved) lock origin so traffic cannot trivially bypass Cloudflare.  
3. Add nginx path rate limits as defense-in-depth with correct real_ip (IPv4+IPv6).  
4. Keep W1 email policy, W2 abuse limiter, W3 Turnstile (default off) intact.

### Non-goals

- Guest order captcha / edge on `POST /orders` → **W5**.  
- Abuse detection dashboard / auto-suspend → **W6**.  
- Enabling production Turnstile.  
- Changing payment/wallet/ledger/fulfillment/eSIM workers.  
- PayOS / Airalo inbound webhooks (not present in codebase — N/A).

---

## 2. Evidence Gate (must stay honest)

| ID | Topic | Status | Who provides | Evidence needed | Blocks slices |
|----|-------|--------|--------------|-----------------|---------------|
| EG-1 | Cloudflare live rules / Bot Fight / Security Level | **NOT VERIFIED** | Owner / CF admin | Screenshots or export: WAF Managed, Custom Rules, Rate Limiting, Bot Fight, Security Level; DNS proxy status for `cardon.vn`, `www`, `admin`, `partner`, IPN host | **S0**, **S2** (CF invent rules) |
| EG-2 | Origin firewall / direct access | **NOT VERIFIED** | Owner / VPS ops | SG/ufw/nftables (redacted); confirm 80/443 sources; SSH policy | **S1** apply |
| EG-3 | Production nginx runtime | **NOT VERIFIED** | Ops | Read-only `nginx -T` on prod (or equivalent); confirm mounts `infra/nginx/conf.d` | **S3** apply to prod |
| EG-4 | Production eSIM IPN hostname | **PARTIAL / NOT VERIFIED** | Owner | Exact public URL SePay calls (apex vs tunnel) | **S2** IPN skip expression; **S4** verify |
| EG-5 | Production proxy hop count | **NOT VERIFIED** | Ops | Confirm path Client→CF→Nginx→API with no extra proxy | Optional trust-hop tweak (out of core W4) |
| EG-6 | CF currently challenges payments? | **NOT VERIFIED** | Owner | Rule list matching `/api/v1/payments/**` | **S2** (fix before add) |

**Rule:** NOT VERIFIED must not be treated as CONFIRMED by inference.

### What can proceed without full Evidence Gate

| Work | Allowed without EG? | Risk |
|------|---------------------|------|
| Draft CF rule expressions offline | Yes (docs only) | Low |
| Draft nginx conf patches in a branch **after** plan accept | Yes, **local/staging only** when implement opens | Medium if applied to prod early |
| Apply CF/firewall/prod nginx | **No** — need EG-1/2/3 | High |
| Live payment webhook tests | **No** without sandbox + separate approve | Critical |

---

## 3. A. Cloudflare Security plan

### 3.1 Inventory (current)

| Item | Plan assumption |
|------|-----------------|
| Live WAF / Custom / RL / Bot Fight | **Unknown** until EG-1 |
| Repo | No Cloudflare Terraform/API config; design only in `20` / checklist |
| Default for planning | Treat live as **empty or unknown** — do not assume Managed Rules already protect auth |

### 3.2 Target posture (after EG-1)

1. **WAF Managed Rules** — leave enabled if already on; do not tighten globally without soak. Document current action (log/challenge/block).  
2. **Custom Rules (path-scoped, priority ordered)** — proposed set:

| Priority (conceptual) | Match | Action | Notes |
|----------------------|-------|--------|-------|
| Highest | URI Path starts with `/api/v1/payments/webhook` OR equals `/api/v1/payments/webhooks/sepay` OR starts with `/api/v1/payments/ipn/` | **Skip** remaining custom WAF / do not challenge | Absolute payment safety |
| High | `/api/partner/` (Agent API) | **Skip** browser challenge | API key clients |
| High | `/health`, `/api/v1/health` (if used) | Skip | Probes |
| Medium | `POST` + path in `{/api/v1/auth/register,/api/v1/auth/agent-register}` | **Managed Challenge** or Rate Limit | Aligns W3 surfaces |
| Medium | `POST` + `/api/v1/auth/login` | Rate Limit (looser) or Challenge after threshold | Optional v1 |
| Lower | `POST` + `/api/v1/account/support/tickets` | Rate Limit (generous) | Complements W2; optional v1 |
| Do **not** | Global challenge on `/api/*` | — | Breaks Agent API + webhooks |
| Do **not** | Hard block `POST /api/v1/orders` | — | Checkout invariant |

Exact CF expression syntax to be filled from Dashboard UI after EG-1 (field names differ by plan).

3. **Rate Limiting Rules (CF)** — suggested starting points (tune after CGNAT monitor):

| Path group | Characteristic | Suggested start | Action |
|------------|----------------|-----------------|--------|
| Auth register + agent-register | Per IP | ~10–20 req / 1 min | Managed Challenge then block brief |
| Login | Per IP | ~20–40 req / 1 min | Challenge |
| Support ticket create | Per IP | Generous (e.g. 30 / 5 min) | Challenge |
| General API | Optional later | High threshold | Log only first |

**VN mobile CGNAT:** shared carrier NATs → prefer **challenge over hard block**, larger burst, short mitigation timeout, monitor 403/429 by ASN.

4. **Bot Fight / Super Bot Fight**

| Mode | Plan |
|------|------|
| Global hard block | **Not recommended** for v1 |
| Super Bot Fight aggressive | **Defer** until metrics |
| Bot Fight | Prefer **Off** or **Definitely automated = challenge** only after EG-1 shows no payment impact |
| False-positive | HTML challenge breaks API clients and some mobile WebViews — keep path skips |

5. **Security Level / Browser Integrity Check** — inventory only; do not raise to “I'm Under Attack” without incident.

### 3.3 Owner Dashboard evidence checklist (EG-1)

- [ ] Zone name + plan tier  
- [ ] DNS: proxy status for customer/admin/partner/(IPN)  
- [ ] WAF Managed: on/off + sensitivity  
- [ ] Full Custom Rules list (expression, action, order, enabled)  
- [ ] Rate Limiting rules list  
- [ ] Bot Fight / Super Bot Fight state  
- [ ] Security Level + BIC  
- [ ] Any rule matching `payments` / `webhook` / `ipn`  
- [ ] Recent Security Events sample (redacted) optional  

---

## 4. B. Origin Protection plan

### 4.1 Target

Only Cloudflare may reach origin **HTTP/HTTPS** (80/443) for orange-cloud hostnames, **after** EG-1 confirms those hostnames are proxied and EG-2 documents current exposure.

### 4.2 Proposed controls (ops — not executed now)

| Control | Detail |
|---------|--------|
| Ingress 80/443 | Allow Cloudflare published IPv4 **and IPv6** ranges only |
| Deny other WAN → 80/443 | Default drop |
| API container port | Keep unpublished on host (compose already `expose` only) — verify live |
| DB/Redis | Remain non-public; verify no accidental publish |
| SSH / management | **Separate** allowlist (ops IPs / VPN / bastion) — never open 22 to world as part of “CF only” mistakenly |
| IPv6 | If AAAA exists on origin, apply equivalent filters; if IPv6 unused, document |

### 4.3 Verification (when implement opens)

1. From non-CF IP: HTTPS to origin IP should fail/timeout (ops-controlled check — not agent flood).  
2. Via `cardon.vn` hostname through CF: 200 on health.  
3. Webhooks via public hostname still succeed in **sandbox**.

### 4.4 Rollback

Restore previous SG/firewall snapshot; keep change window short.

### 4.5 Blockers

**S1 blocked on EG-2** (+ EG-1 hostname proxy confirmation). Drafting allowlist docs can start anytime.

---

## 5. C. Nginx Edge Rate Limiting plan

### 5.1 Design principles

- Key on `$binary_remote_addr` **after** CF real_ip (so key = client, not CF node).  
- **Exact / regex location order:** webhook/IPN/health **without** ordinary `limit_req` (or dedicated ultra-high zone only if ops insist — default = **no limit_req**).  
- Auth locations: dedicated lower rate.  
- Do not put `limit_req` on `/api/partner/`.  
- Do not put restrictive `limit_req` on `/api/v1/orders`.  
- `limit_req_status 429;`  
- Prefer `burst=N nodelay` with conservative rates for CGNAT.

### 5.2 Proposed zones (conceptual — apply only in implement)

```nginx
# http{} context — conceptual
limit_req_zone $binary_remote_addr zone=cardon_auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=cardon_support:10m rate=10r/m;
# optional general (high) — defer if uncertain
# limit_req_zone $binary_remote_addr zone=cardon_api:10m rate=30r/s;

# limit_conn optional for slowloris — defer v1 unless evidence
```

Suggested location matching on `cardon.vn` (and admin/partner only if needed):

| Location | limit_req | Notes |
|----------|-----------|-------|
| `= /api/v1/payments/webhooks/sepay` | **none** | Keep alias; must stay before `/api/` |
| `^~ /api/v1/payments/webhook/` | **none** | Prefix exempt |
| `^~ /api/v1/payments/ipn/` | **none** | IPN exempt |
| `= /health` or health paths | **none** | |
| `^~ /api/partner/` | **none** | Agent API |
| `~ ^/api/v1/auth/(register|agent-register)$` | `zone=cardon_auth burst=10 nodelay` | POST-heavy; method check optional via `limit_except` |
| `~ ^/api/v1/auth/login$` | same or looser auth zone | |
| `^~ /api/v1/account/support/tickets` (POST create) | support zone **or** skip if hard to method-split | Prefer CF for ticket if nginx method split messy |
| Other `/api/` | none or deferred high zone | Avoid orders collateral |

**Admin/partner vhosts:** usually no auth-register; do not copy aggressive auth limits onto `/api/partner/`.

### 5.3 Real IP / IPv6 (paired with nginx slice)

| Change | File | Purpose |
|--------|------|---------|
| Add Cloudflare **IPv6** `set_real_ip_from` | `00-cloudflare-real-ip.conf` | Fix W4-05 |
| Keep `real_ip_header CF-Connecting-IP` + `real_ip_recursive on` | same | Unchanged semantics |
| Process to refresh ranges | ops runbook | CF publishes changing lists |

Do **not** change `proxy-headers.conf` semantics in v1 unless hop evidence requires it.

### 5.4 CGNAT / false-positive

- Auth `5r/m` + burst 10 ≈ design `20`; may still hitch shared NATs — soak staging; raise burst before lowering rate.  
- Return **429** not 503.  
- Monitor nginx 429 vs app W2 429 to avoid double-penalty confusion.

### 5.5 Files in scope (when implement)

- `infra/nginx/nginx.conf` (zones in `http`)  
- `infra/nginx/conf.d/00-cloudflare-real-ip.conf`  
- `infra/nginx/conf.d/cardon.vn.conf` (locations)  
- Possibly snippets new `rate-limit-auth.conf`  
- **Not** `conf.d.local` as prod source of truth (local may mirror later for tests)

### 5.6 Must not change

- Payment signature paths / Nest payment code  
- Upload privacy middleware in Nest  
- Turning `/uploads/support` public again  

---

## 6. D. Webhook / IPN Safety Matrix (implementation constraints)

| Gateway / path | Exists in source? | CF | Nginx limit_req | Turnstile | App controls to preserve |
|----------------|-------------------|----|-----------------|-----------|---------------------------|
| `POST /api/v1/payments/webhook/:gateway` | **Yes** | Skip/allow | **Exempt** | No | `@SkipThrottle`, signature verify, idempotency |
| `…/webhook/megapay` | **Yes** | Skip | Exempt | No | MegaPay notify verify |
| `…/webhook/sepay` | **Yes** | Skip | Exempt | No | SePay HMAC / secrets |
| `…/webhooks/sepay` | **Yes** (nginx alias) | Skip | Exempt | No | Same handler |
| `…/webhook/paypal` | **Yes** (provider + tests) | Skip | Exempt | No | PayPal webhook verify |
| `POST /api/v1/payments/ipn/esim/sepay` | **Yes** | Skip | Exempt | No | IPN secret; EG-4 hostname |
| PayOS | **No code** | N/A | N/A | N/A | — |
| Airalo inbound webhook | **Not found** | N/A | N/A | N/A | Outbound only |

**Hard bans during W4 implement:**

- No CF Managed Challenge / JS Challenge / Block on matrix paths.  
- No ordinary `limit_req` on those locations.  
- No Turnstile.  
- No edits to payment state machine, wallet ledger, SePay agent deposit verify, fulfillment dispatch, eSIM worker.  
- No live production webhook “tests” that create/settle real payments without sandbox + explicit approve.

---

## 7. E. Trusted Proxy plan

### 7.1 Target chain (unchanged architecture)

```text
Client → CF (CF-Connecting-IP)
      → Nginx (set_real_ip_from CF ranges; real_ip_header CF-Connecting-IP)
      → X-Real-IP=$remote_addr; XFF append
      → Nest trust proxy hops = 1 (default)
      → extractClientIp() ← req.ip
```

### 7.2 Planned work

| Item | W4 core? | Notes |
|------|----------|-------|
| Add CF IPv6 to nginx real_ip | **Yes** (S3) | Repo gap W4-05 |
| Refresh IPv4 ranges vs current CF list | **Yes** | Ops compare |
| Change `TRUST_PROXY_HOPS` | **No** unless EG-5 proves mismatch | Default 1 remains plan baseline |
| Rewrite payment/agent-api raw XFF → `extractClientIp` | **Optional S5** | Logging only; not required to ship CF/nginx |

### 7.3 Explicit non-actions in plan phase / core implement

- Do not “fix” trust proxy by guessing extra hops.  
- Do not parse raw XFF in new edge code.  
- Do not weaken `extractClientIp` anti-spoof behavior.

---

## 8. F. Implementation slices

Dependency overview:

```text
S0 Evidence pack (EG-1..6)
 ├─ S1 Origin firewall          [needs EG-1 proxy + EG-2]
 ├─ S2 Cloudflare path rules    [needs EG-1; fix W4-07 first]
 └─ S3 Nginx real_ip IPv6 + limit_req  [needs EG-3 for prod; can draft/test local anytime after plan accept]
      └─ S4 Verification & soak
           └─ S5 Optional XFF logging alignment (code) — deferrable
```

---

### Slice S0 — Evidence Gate pack

| Field | Content |
|-------|---------|
| Goal | Collect EG-1…EG-6; produce short evidence appendix (redacted) |
| Files | Docs only (future `35-…` evidence note **if** owner asks — not created now) |
| Allowed | Read-only ops exports; screenshots |
| Forbidden | Changing CF/firewall/nginx |
| Risk | Low |
| Tests | N/A |
| Rollback | N/A |
| Acceptance | Owner confirms evidence attached; statuses updated CONFIRMED/PARTIAL with citations |

**Blocked work without S0:** production apply of S1/S2/S3.

---

### Slice S1 — Origin protection

| Field | Content |
|-------|---------|
| Goal | HTTP/HTTPS origin reachable only from Cloudflare (v4+v6); SSH separate |
| Config | Cloud SG / ufw / nftables (ops) |
| Allowed | Firewall rules for 80/443; document SSH allowlist |
| Forbidden | Opening DB/Redis; changing app ENV; touching payment |
| Risk | Lockout if CF ranges wrong or grey-cloud DNS |
| FP | Ops lockout — require console/VPN break-glass |
| Tests | Health via public hostname; origin-IP deny check; webhook sandbox |
| Rollback | Previous SG snapshot |
| Acceptance | EG-2 closed; bypass test documented; payments sandbox OK |

**Depends:** EG-1 (proxy on), EG-2.  
**Can draft offline:** Yes. **Apply:** after Evidence Gate + owner change window.

---

### Slice S2 — Cloudflare path-scoped rules

| Field | Content |
|-------|---------|
| Goal | Challenge/rate auth abuse paths; hard-skip payments + partner API |
| Config | CF Dashboard Custom Rules + Rate Limiting (no repo secrets) |
| Allowed | Rules per §3.2; disable conflicting unknown rules that challenge payments |
| Forbidden | Global I'm Under Attack; Super Bot Fight hard block; Turnstile enable; orders hard block |
| Risk | Medium — false challenge on mobile; payment outage if skip wrong |
| FP | CGNAT → prefer challenge; short mitigation |
| Tests | Register/login clean IP; burst register challenged; partner API key call OK; **sandbox** SePay/MegaPay/PayPal/IPN |
| Rollback | Disable new rules; restore prior export |
| Acceptance | EG-1/EG-6 addressed; exemption matrix verified; 24h no gateway failure spike |

**Depends:** S0 (EG-1, EG-6); EG-4 for IPN hostname in skip list.  
**Order vs S1:** Prefer **S1 before aggressive CF block**, or at least confirm orange-cloud — otherwise attackers bypass CF.

---

### Slice S3 — Nginx real_ip IPv6 + limit_req

| Field | Content |
|-------|---------|
| Goal | Correct client IP on v6; auth path `limit_req`; webhook/IPN/health/partner exempt |
| Files | `infra/nginx/nginx.conf`, `conf.d/00-cloudflare-real-ip.conf`, `conf.d/cardon.vn.conf` (+ optional snippet) |
| Allowed | Zones, locations, IPv6 `set_real_ip_from`, `limit_req_status 429` |
| Forbidden | Changing Nest payment code; caching `/api/`; weakening uploads auth in Nest |
| Risk | Medium — CGNAT 429; mis-ordered location applying limit to webhook |
| FP | Shared NAT; mitigate burst |
| Tests | `nginx -t`; local/staging register under limit; webhook paths **unlimited**; health OK; partner API OK |
| Rollback | Revert conf files; reload previous |
| Acceptance | EG-3 for prod apply; W4-04/W4-05 addressed; matrix locations confirmed |

**Local draft/test:** after plan accept, without prod reload until EG-3.  
**Prod reload:** owner-approved window only.

---

### Slice S4 — Verification & monitoring soak

| Field | Content |
|-------|---------|
| Goal | Prove no payment break; measure 403/429; VN mobile spot-check |
| Allowed | Sandbox webhooks; synthetic health; read-only CF analytics |
| Forbidden | Production payment mutation tests without approve; flood |
| Risk | Low–medium |
| Acceptance | Checklist §9 green; gateway failure alerts quiet; owner sign-off |

---

### Slice S5 — Optional code hygiene (defer)

| Field | Content |
|-------|---------|
| Goal | Payment webhook + Agent API IP logging use `extractClientIp` (W4-09) |
| Files | `payment.controller.ts`, `agent-api-auth.guard.ts` (possibly activity utils) |
| Allowed | Logging IP only |
| Forbidden | Payment verify/idempotency changes; trust hop guess |
| Acceptance | Unit tests; no payment behavior change |

**Not required** to call W4 Edge “done.”

---

## 9. G. Regression & verification plan

### 9.1 Automated (before/after nginx/app-adjacent changes)

- W1: email-policy, auth-registration, agent-registration.email-policy  
- W2: abuse-rate-limit, support upload/ownership/http-smoke, payment-skip-throttle, order-create-unchanged  
- W3: turnstile unit + controller-order + scope guardrail  
- Auth security audit as applicable  

### 9.2 Manual / ops (staging or sandbox; production only with approve)

| Case | Expect |
|------|--------|
| Customer registration | 200 / business OK; under burst may 429/challenge |
| Agent registration | Same |
| Customer login | OK; not hard-blocked globally |
| Support ticket create | OK; optional edge limit |
| Agent API (`/api/partner/`) | **No** HTML challenge; API works |
| `POST /orders` | Unchanged app behavior; no new hard edge block |
| SePay webhook + alias path | 2xx with valid sig (**sandbox**) |
| SePay eSIM IPN (EG-4 URL) | 2xx with valid secret (**sandbox**) |
| MegaPay webhook | 2xx sandbox |
| PayPal webhook | 2xx sandbox |
| Health | 200, no limit |
| IPv4 / IPv6 | Client IP correct in logs after real_ip update |
| VN mobile spot-check | Register/login usable; record ASN if challenged |
| Monitoring | CF 403/429; gateway failure; nginx 429 |

### 9.3 Explicitly not in default verification

- Production live payment capture webhooks without sandbox.  
- Stress tests that could DoS origin.  

---

## 10. Rollback summary

| Layer | Rollback |
|-------|----------|
| Cloudflare | Disable/delete new rules; import previous export |
| Firewall | Prior SG/nft snapshot |
| Nginx | Git revert conf + reload prior |
| Optional S5 code | Revert PR |
| Data | None expected |

---

## 11. Residual risks after successful W4

- Captcha farms + CGNAT still need W1–W3.  
- CDN cache residual on uploads (W2 A-NGINX-CACHE) — purge ops.  
- Turnstile still default off / keys NOT VERIFIED.  
- Guest order abuse → W5.  

---

## 12. Effort (indicative)

| Slice | Effort |
|-------|--------|
| S0 Evidence | 0.5–1d ops |
| S1 Firewall | 0.5d + window window |
| S2 CF rules | 0.5–1d + soak |
| S3 Nginx | 0.5–1d + soak |
| S4 Verify | 0.5–1d |
| S5 Optional | 0.5d eng |

Aligned with roadmap **S–M**.

---

## 13. Owner decisions still needed before implement

1. Accept this plan `#34`.  
2. Deliver Evidence Gate pack (EG-1…EG-6).  
3. Approve change windows for firewall / CF / nginx reload.  
4. Confirm eSIM IPN public hostname (EG-4).  
5. Confirm Bot Fight: Off vs challenge-only.  
6. Confirm whether support-ticket CF rate limit is in v1 or deferred.  
7. Confirm S5 (XFF logging) in or out of W4.

---

## 14. Stop condition (this phase)

- [x] Created only `docs/security/phase-1/34-w4-edge-security-implementation-plan.md`  
- [x] No source / Nginx / CF / firewall / ENV / commit / deploy  
- [x] No W5/W6  
- [x] Roadmap `#22` not modified (discrepancy recorded here)

**DỪNG.** Chờ owner nghiệm thu Implementation Plan trước khi mở W4 Implementation.
