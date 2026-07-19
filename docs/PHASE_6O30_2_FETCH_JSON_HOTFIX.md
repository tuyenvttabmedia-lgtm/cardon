# Phase 6O30.2 — Fetch JSON Hotfix

**Build marker:** `6O30.2`

## Root Cause

Homepage error `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` was caused by client fetches receiving HTML instead of JSON.

### Failed request (homepage)

| Field | Value |
|-------|-------|
| **Request** | `GET /products` via `productApi.listProducts()` in `useProducts` → shown in `CheckoutShell` |
| **Expected URL** | `http://localhost/api/v1/products` |
| **Actual URL (broken build)** | `/products` (relative — hits Next.js `[slug]` route) |
| **HTTP status** | 404 |
| **Content-Type** | `text/html; charset=utf-8` |

When `NEXT_PUBLIC_API_URL` was baked as empty string (docker build without `--env-file`), `getApiBaseUrl()` returned `""` and fetch targeted page routes instead of `/api/v1/...`.

### CMS fetches (Phase 6O30.1) — verified OK

All admin CMS calls use `cmsAdminApi` → `/admin/cms/...` under `getApiBaseUrl()`. Marketing Dashboard uses `faqAdminApi.list()`, not raw fetch. No `/marketing/` or `/articles/` API paths found.

Web CMS (`cms-api.ts`): `/cms/faqs`, `/cms/theme`, `/cms/site-config`, `/cms/banners` — all under `getApiBaseUrl()`.

## Fix (minimal, no UI change)

1. `getApiBaseUrl()` — treat empty/whitespace env as unset (web, admin, partner)
2. `parseResponse()` — reject non-JSON content-type before `.json()` (web, admin, partner api-client)
3. `cms-api.ts` + `usePaymentMethods.ts` — check `response.ok` and `content-type` before parse
4. `docker-compose.local-full.yml` — default `WEB_NEXT_PUBLIC_API_URL` and `ADMIN_NEXT_PUBLIC_API_URL`

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```
