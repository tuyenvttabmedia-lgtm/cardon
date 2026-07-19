# BUILD 6033.5 — API SECURITY CENTER

**Build:** `6033.5 API SECURITY CENTER`  
**Prior build:** `6033.4.1 B2B ARCHITECTURE ALIGNMENT`  
**Scope:** Partner Portal API Center — aggregation & security management only.

---

## Goal

Security control center for B2B API partners who purchase **only through API**. Centralizes authentication, IP restrictions, webhook secrets, rate limits, and audit logs.

---

## Do Not Modify

Payment, Provider, Ledger, Order, Webhook **engines** — only security layer and partner UI.

---

## Architecture

```
Partner UI (/api/*)
       ↓
AgentSecurityController  (/agents/me/security/*)
       ↓
AgentSecurityService     — keys, IP whitelist, webhook, rate usage
AgentApiTelemetryService — in-memory rate windows + API log ring buffer
       ↓
Agent (credentials, securityConfig JSON)
AgentWebhookConfig (callback + secretEncrypted)
       ↓
AgentApiAuthGuard / AgentApiAuthService — enforce IP + log auth events
```

**Module:** `src/modules/agent-security-center/`

---

## Partner Sidebar — API Center

| Route | Page |
|-------|------|
| `/api/keys` | Khóa API |
| `/api/ip-whitelist` | IP Whitelist |
| `/api/webhook` | Webhook Security |
| `/api/rate-limit` | Rate Limit |
| `/api/security` | Bảo mật (events) |
| `/api/logs` | API Logs |
| `/api/docs` | Tài liệu |
| `/api/test` | Thử API |

Legacy: `/webhooks` → `/api/webhook`, `/api` → `/api/keys`

---

## API Endpoints

| Method | Path | RBAC |
|--------|------|------|
| GET | `/agents/me/security/dashboard` | `api.read` |
| GET | `/agents/me/security/api-keys` | `api.read` |
| POST | `/agents/me/security/api-keys/rotate` | `api.manage` |
| POST | `/agents/me/security/api-keys/disable` | `api.manage` |
| POST | `/agents/me/security/api-keys/enable` | `api.manage` |
| PATCH | `/agents/me/security/api-keys/rename` | `api.manage` |
| GET/POST/PATCH/DELETE | `/agents/me/security/ip-whitelist` | read / manage |
| GET/PUT | `/agents/me/security/webhook` | read / `webhooks.manage` |
| POST | `/agents/me/security/webhook/rotate-secret` | `webhooks.manage` |
| GET | `/agents/me/security/rate-limit` | `api.read` |
| GET | `/agents/me/security/logs` | `api.read` |
| GET | `/agents/me/security/events` | `api.read` |

---

## Schema (minimal)

```sql
agents.security_config JSONB DEFAULT '{}'
agent_webhook_configs.secret_encrypted TEXT
agent_webhook_configs.signature_algorithm VARCHAR(32) DEFAULT 'HMAC-SHA256'
```

`securityConfig` stores: IP whitelist entries, API key label/environment/expiry, lastUsedIp, webhook secret rotation history.

---

## RBAC (Partner Platform)

| Role | api.read | api.manage | webhooks.manage |
|------|:--------:|:----------:|:---------------:|
| OWNER | ✓ | ✓ | ✓ |
| MANAGER | ✓ | ✓ | ✓ |
| OPERATOR | ✓ | ✗ | ✗ |
| READONLY | ✓ | ✗ | ✗ |

Readonly: cannot rotate, create, or delete keys/IP.

---

## Security Features

- **API Keys:** masked display, one-time secret on rotate, disable/enable, rename, environment, expiry
- **IP Whitelist:** IPv4/IPv6/CIDR validation, CRUD, enforce in `AgentApiAuthService`
- **Webhook:** URL config, HMAC-SHA256 secret rotate, masked secret, history
- **Rate Limit:** per-agent limit from `Agent.rateLimit`, usage from shared telemetry service, 429 history
- **API Logs:** auth success/failure, blocked IP, invalid signature, 429 (in-memory ring, 200 entries)
- **Security Events:** from `SystemActivityLog` (AUTH/SECURITY/API/WEBHOOK categories)

---

## Verification

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api partner
```

Partner: `http://partner.localhost/api/keys`  
Footer: **Build 6033.5 API SECURITY CENTER**

---

**Footer:** Build 6033.5 API SECURITY CENTER
