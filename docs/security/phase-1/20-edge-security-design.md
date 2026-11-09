# 20 — Edge security design (Cloudflare / Nginx)

**Depends on:** `15` (F8), app-layer designs `16–19`.  
**Constraint:** Webhooks/IPN must remain reliable; no origin breakage.

---

## Root cause

App-layer throttle is necessary but late. Repo shows Cloudflare **trusted** (`00-cloudflare-real-ip.conf`, `cf-ipcountry`) but nginx confs lack `limit_req`. Bot volume should be cut at edge when possible.

---

## Current state (repo)

| Control | Status |
|---------|--------|
| CF → nginx real IP | Present |
| nginx `limit_req` | Absent in `infra/nginx/conf.d*` |
| API/web/admin/partner vhosts | Present |
| SePay webhook path alias | Present — must exempt from challenge |
| eSIM IPN locations | Local/sandbox snippets exist — prod must stay reachable to SePay |

---

## Proposed solution

### A. Cloudflare (preferred primary edge)

1. **WAF custom rules (challenge/block)**  
   - High rate to `/api/v1/auth/register`, `/api/v1/auth/agent-register`  
   - Optional: body field inspect if plan allows (email `@example.`) — treat as best-effort  
2. **Rate limiting rules** per path group (auth, support, orders)  
3. **Bot Fight / Super Bot Fight** — start in challenge mode, not hard block  
4. **Origin:** firewall VPS to Cloudflare IPs only (if not already)  

### B. Nginx (defense in depth)

```nginx
# conceptual — not applied in this phase
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;

location ~ ^/api/v1/auth/(register|agent-register|login) {
  limit_req zone=auth burst=10 nodelay;
  proxy_pass ...;
}
```

- Webhooks: **no** `limit_req` or much higher dedicated zone  
- Health: exempt  

### C. Webhook protection / exemption list

Never challenge/block:

- `/api/v1/payments/webhook/*`  
- `/api/v1/payments/webhooks/sepay` (alias)  
- `/api/v1/payments/ipn/**`  
- Provider callbacks if any  

Rely on signature verification + idempotency already in payment design (`docs/12_SECURITY_DEPLOY.md`).

### D. IP handling consistency

- nginx `real_ip_header CF-Connecting-IP` (done)  
- Nest `extractClientIp` uses `X-Forwarded-For` first hop — ensure Express `trust proxy` matches deployment so throttles see client IP, not CF node  

### E. Customer impact controls

- Challenge pages only on abuse paths first  
- Monitor 403/429 rates for VN mobile carriers (CGNAT)  
- Bypass list for office IPs if needed  

---

## Business impact

- Large reduction in junk before it hits Node  
- Misconfigured WAF can block payments — hence exemption list + staged rollout  

## Performance impact

- Edge only; app CPU decreases under attack  

## False-positive risk

- Medium if global Bot Fight aggressive — mitigate with path-scoped rules  

## Rollback

- Disable CF rules via dashboard  
- Remove nginx `limit_req` stanzas / reload  

## Regression tests / verification

- Synthetic SePay/MegaPay webhook still 2xx with valid signature  
- Register from clean IP works  
- Burst register from one IP challenged/limited  
- Partner API key traffic not broken by auth-path rules  

## Dependencies

- Owner CF access; ops for VPS firewall  
- App still needs deny-list + Redis (edge is not enough alone)  

## Effort

- **S–M** (0.5–2 days ops) — mostly configuration, not app code.
