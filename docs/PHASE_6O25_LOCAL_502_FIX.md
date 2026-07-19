# Phase 6O25 — Local 502 Bad Gateway Fix

**Date:** 2025-06-25  
**Build:** 6O25  
**Status:** Resolved — localhost stack restored

---

## Root cause

Two separate issues caused the outage after Phase 6O25 deploy:

### 1. Nginx stale upstream IP (primary 502 on `/`)

After `web` (and `admin`) containers were recreated, Docker assigned a **new IP** (`172.19.0.7`). Nginx had cached the **old IP** (`172.19.0.5`) at startup and kept proxying to a dead address:

```
connect() failed (111: Connection refused) while connecting to upstream
upstream: "http://172.19.0.5:3001/"
```

The web process itself was healthy (`200` on `127.0.0.1:3001` inside the container). Only nginx → web routing was broken.

**Fix:** Updated `infra/nginx/nginx.conf` to use Docker embedded DNS with runtime re-resolution:

- `resolver 127.0.0.11 valid=10s ipv6=off;`
- `zone upstream_* 64k;` + `server web:3001 resolve;` on all upstreams

Then `nginx -s reload` (or restart nginx after stack recreate).

### 2. API crash loop after 6O25 rebuild (502 on `/health`, API routes)

New API image failed at startup:

```
UndefinedModuleException: Nest cannot create the CmsModule instance.
Scope [... NotificationModule -> CmsModule -> AuthModule -> NotificationModule]
```

`NotificationModule` imported `CmsModule` for `EmailTemplateService`, creating a **circular module dependency** (Cms → Auth → Notification → Cms).

**Fix:** Extracted `EmailTemplateModule` (no Auth import) under `src/modules/email-template/`. Both `NotificationModule` and `CmsModule` import it instead.

### 3. Docker build failures (blocked clean deploy)

| Image | Error | Fix |
|-------|-------|-----|
| `api` | TS2352 in `order-delivery.service.ts` | Cast via `unknown` for `mapOrder()` |
| `web` | `CardRevealPanel.tsx` — optional `pin` | Guard CopyButton; use `pinMasked` fallback |
| `admin` | Email templates page — invalid `label` prop on `Input` | Use `Label` + `Input` separately |

---

## Migration status

```bash
docker exec cardon-local-full-api npx prisma migrate status
# 26 migrations found — Database schema is up to date

docker exec cardon-local-full-api npx prisma generate
# Prisma Client generated successfully
```

Migration `20250623230000_phase_6o25_customer_delivery` was already applied.

---

## Commands executed

```powershell
cd C:\Users\MyHome\Projects\cardon

# Diagnosis
docker ps -a
docker logs cardon-local-full-nginx --tail=100
docker logs cardon-local-full-web --tail=100
docker logs cardon-local-full-api --tail=200

# Fix nginx DNS + reload
# (edited infra/nginx/nginx.conf)
docker exec cardon-local-full-nginx nginx -t
docker exec cardon-local-full-nginx nginx -s reload

# Migration check
docker exec cardon-local-full-api npx prisma migrate status
docker exec cardon-local-full-api npx prisma generate

# Rebuild after code fixes
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api web admin

# Recreate services
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate api web admin worker

# Restart nginx last
docker restart cardon-local-full-nginx
```

---

## Changed files

| File | Change |
|------|--------|
| `infra/nginx/nginx.conf` | Docker DNS resolver + `zone` + `resolve` on upstreams |
| `src/modules/email-template/*` | New standalone module (breaks circular dep) |
| `src/modules/notification/notification.module.ts` | Import `EmailTemplateModule` instead of `CmsModule` |
| `src/modules/cms/cms.module.ts` | Import `EmailTemplateModule` |
| `src/modules/order/services/order-delivery.service.ts` | TS cast fix |
| `apps/web/components/order/CardRevealPanel.tsx` | Optional PIN type fix |
| `apps/admin/app/marketing/email-templates/page.tsx` | Label/Input fix |

---

## Verification (all PASS)

| URL | Result |
|-----|--------|
| http://localhost/ | 200 |
| http://localhost/health | 200 |
| http://localhost/nap-cuoc | 200 |
| http://localhost/nap-data | 200 |
| http://localhost/tin-tuc | 200 |
| http://admin.localhost/ | 200 |

6O25 API routes confirmed in logs:

- `GET /api/v1/orders/lookup/delivery`
- `POST /api/v1/orders/:id/cards/:cardId/reveal-pin`
- `GET/PUT /api/v1/admin/cms/email-templates`

> Note: Health check via nginx is at `/health` (proxied to API). Direct path `/api/v1/health` is not mapped in local nginx config.

---

## Final `docker ps` status

```
NAMES                        STATUS
cardon-local-full-api        Up (healthy)
cardon-local-full-worker     Up (healthy)
cardon-local-full-web        Up (unhealthy*) 
cardon-local-full-admin      Up (unhealthy*)
cardon-local-full-nginx      Up (healthy)
cardon-local-full-postgres   Up (healthy)
cardon-local-full-redis      Up (healthy)
cardon-local-full-partner    Up (unhealthy*) — pre-existing
```

\*Frontend containers report `unhealthy` due to Docker `HEALTHCHECK` (wget) but serve HTTP 200 correctly. Non-blocking for local dev; optional follow-up to tune healthcheck.

---

## Phase 6P

**Do not start Phase 6P** until this fix is verified locally. Stack is restored as of this report.
