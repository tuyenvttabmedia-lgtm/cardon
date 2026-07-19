# Security & Deployment

## Security Overview

CardOn.vn handles financial transactions, API credentials, and card PINs. Security is enforced at every layer.

## Data Encryption

### At Rest

| Data | Method | Location |
|------|--------|----------|
| Provider API credentials | AES-256-GCM | `providers.api_credentials` |
| Gateway admin config | AES-256-GCM | `payment_gateways.config_encrypted` |
| Gateway production secrets | ENV vars | Deploy-time only |
| Card PIN / serial | AES-256-GCM | `card_records` |
| Agent API key | **bcrypt hash** | `agents.api_key_hash` — never encrypt |
| Agent webhook secret | AES-256-GCM | `agents.secret_key_encrypted` |
| User password | bcrypt hash | `users.password_hash` |

**API key rule:** Plain API key displayed **once** when admin generates/regenerates. Only hash persisted.

**Rules:**

- Encryption keys stored in environment variables — never in code or database
- Decrypt sensitive data only in Service layer at point of use
- Never log decrypted credentials or card PINs
- Never return encryption keys in API responses

### In Transit

- HTTPS required for all endpoints (TLS 1.2+)
- HSTS header enabled
- Internal service communication over private network

## Authentication & Authorization

### B2C (Customer)

- JWT access token + refresh token
- Session stored server-side or stateless JWT with short expiry
- Guest checkout supported (no account required)

### Agent API

- API key in `Authorization: Bearer` header
- Key stored as bcrypt hash — compare via constant-time check
- Rate limiting per agent (default: 100 req/min)
- IP whitelist optional per agent

### Admin Panel

- JWT with role claims (SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN)
- Role guard on every admin endpoint
- Session timeout: 8 hours (configurable)
- Optional 2FA for ADMIN and SUPER_ADMIN (future)

## Input Validation

- All API inputs validated via DTOs with class-validator
- SQL injection prevented by Prisma parameterized queries
- XSS prevented by output encoding in Next.js
- CSRF protection on admin panel forms
- Webhook signature verification on every payment callback

## Webhook Security

```
Payment gateway webhook
    ↓
Verify signature (HMAC / RSA per gateway spec)
    ↓
IF invalid → 401, log attempt with IP
    ↓
IF valid → process idempotently
```

- Log all webhook attempts to `webhook_logs`
- Rate limit webhook endpoints
- Reject replayed webhooks via `payment_reference` uniqueness

## Rate Limiting

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| B2C public API | 60 req | 1 min |
| Agent API | 100 req | 1 min (per agent) |
| Admin API | 200 req | 1 min |
| Payment webhook | 1000 req | 1 min |
| Login | 5 attempts | 15 min |

Implemented via Redis-backed rate limiter.

## Audit & Logging

| Log Type | Content | Retention |
|----------|---------|-----------|
| Access log | IP, endpoint, user/agent, timestamp | 90 days |
| Admin audit | Action, target, admin_id, metadata | 7 years |
| Payment webhook | Full payload, processed flag | 2 years |
| Provider transaction | Request/response (sanitized) | 7 years |
| Error log | Stack trace, context (no secrets) | 30 days |

**Never log:** API keys, card PINs, passwords, encryption keys.

## Infrastructure Architecture

```
                    Internet
                       ↓
                   Nginx (SSL termination, reverse proxy)
                       ↓
              ┌────────┴────────┐
              ↓                 ↓
        Next.js (web)     NestJS (api)
        Port 3000          Port 4000
              ↓                 ↓
              └────────┬────────┘
                       ↓
              PostgreSQL (primary DB)
              Redis (queue + cache)
                       ↓
              BullMQ Workers (separate process)
```

## Docker Deployment

### Services

| Container | Image | Purpose |
|-----------|-------|---------|
| `nginx` | nginx:alpine | Reverse proxy, SSL, static assets |
| `web` | cardon-web | Next.js frontend |
| `api` | cardon-api | NestJS backend |
| `worker` | cardon-api | BullMQ workers (same image, different CMD) |
| `postgres` | postgres:16 | Primary database |
| `redis` | redis:7-alpine | Queue + cache |

### docker-compose Structure

```yaml
services:
  nginx:
    ports: ["443:443", "80:80"]
    depends_on: [web, api]

  web:
    build: ./apps/web
    environment:
      - NEXT_PUBLIC_API_URL=https://api.cardon.vn

  api:
    build: ./apps/api
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on: [postgres, redis]

  worker:
    build: ./apps/api
    command: node dist/worker.js
    depends_on: [postgres, redis]

  postgres:
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    volumes: [redisdata:/data]
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✓ | PostgreSQL connection |
| `REDIS_URL` | ✓ | Redis connection |
| `ENCRYPTION_KEY` | ✓ | AES-256 for encrypted DB fields |
| `JWT_SECRET` | ✓ | JWT signing |
| `MEGAPAY_API_KEY` | ✓ | Production gateway secret (ENV) |
| `MEGAPAY_WEBHOOK_SECRET` | ✓ | Webhook verification (ENV) |
| `SEPAY_API_KEY` | ✓ | Production gateway secret (ENV) |
| `ESALE_*` / `IMEDIA_*` | ✓ | Provider secrets (ENV or DB encrypted) |

Dynamic gateway overrides stored in `payment_gateways.config_encrypted`. ENV takes precedence for critical production secrets.

## Nginx Configuration

```nginx
# SSL termination
server {
    listen 443 ssl http2;
    server_name cardon.vn;

    ssl_certificate /etc/ssl/cardon.vn.crt;
    ssl_certificate_key /etc/ssl/cardon.vn.key;

    # Frontend
    location / {
        proxy_pass http://web:3000;
    }

    # API
    location /api/ {
        proxy_pass http://api:4000;
        client_max_body_size 1m;
    }

    # Admin API
    location /admin/api/ {
        proxy_pass http://api:4000;
        # Optional: IP whitelist for admin
    }

    # Webhook (no rate limit bypass)
    location /api/v1/payment/webhook/ {
        proxy_pass http://api:4000;
    }
}
```

## Backup Strategy

| Target | Method | Frequency | Retention |
|--------|--------|-----------|-----------|
| PostgreSQL | pg_dump → encrypted storage | Daily | 30 days |
| Redis | RDB snapshot | Daily | 7 days |
| Invoice PDFs | File storage backup | Daily | 7 years |

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | API liveness |
| `GET /api/health/ready` | DB + Redis connectivity |
| Worker heartbeat | Redis key TTL check |

## Deployment Process

```
1. Pull latest code
2. Build Docker images
3. Run database migrations (Prisma migrate)
4. Rolling restart: worker → api → web → nginx
5. Verify health checks
6. Monitor error logs for 15 minutes
```

Zero-downtime via rolling restart. Database migrations run before service restart.

## Security Checklist (Pre-Launch)

- [ ] All secrets in environment variables
- [ ] HTTPS enforced, HTTP redirects to HTTPS
- [ ] Encryption key rotated from development default
- [ ] Webhook signatures verified
- [ ] Rate limiting enabled
- [ ] Admin panel requires authentication
- [ ] Database not exposed to public network
- [ ] Redis not exposed to public network
- [ ] Card PIN encryption verified end-to-end
- [ ] Audit logging enabled for admin actions
- [ ] Backup automation tested

## Related Docs

- [01_SYSTEM_ARCHITECTURE.md](./01_SYSTEM_ARCHITECTURE.md)
- [03_PAYMENT.md](./03_PAYMENT.md)
- [11_ADMIN_PANEL.md](./11_ADMIN_PANEL.md)
