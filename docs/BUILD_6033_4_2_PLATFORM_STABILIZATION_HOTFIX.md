# BUILD 6033.4.2 — PLATFORM STABILIZATION HOTFIX

**Build:** `6033.4.2 PLATFORM STABILIZATION HOTFIX`  
**Prior build:** `6033.4.1 B2B ARCHITECTURE ALIGNMENT`  
**Scope:** Stabilization only — worker fix, Vietnamese cleanup, build consistency. **No new features.**

---

## Goal

Make the localhost environment production-ready by fixing the Worker restart loop and standardizing portal stability before continuing development.

---

## Do Not Modify

Payment Engine, Provider Engine, Ledger Engine, Order Engine, Webhook Engine, business logic, pricing, Partner API, Customer API, database schema (no migration required).

---

## Priority 1 — Worker Fix

### Root Cause

`MaintenanceCenterModule` imported `NotificationModule` as a **static** dependency. During NestJS module graph resolution in the Worker process, a circular chain caused `NotificationModule` to be `undefined` at import index `[3]`:

```
WorkerAppModule → ProductModule → AuthModule → NotificationModule → ProviderModule → AuthModule
                                                              ↓
                                              MaintenanceCenterModule → NotificationModule (undefined)
```

Error: `UndefinedModuleException` — *The module at index [3] of the MaintenanceCenterModule "imports" array is undefined.*

### Fix

Use `forwardRef()` for the circular dependency, matching the existing pattern for `AuditLogModule`:

**File:** `src/modules/maintenance-center/maintenance-center.module.ts`

```typescript
imports: [
  SettingsModule,
  ActivityEventModule,
  forwardRef(() => AuditLogModule),
  forwardRef(() => NotificationModule),  // was: NotificationModule
],
```

No modules disabled. No bypass. Architecture preserved.

### Worker Verification

After fix, worker logs confirm:

- `MaintenanceCenterModule dependencies initialized`
- `AuditLogModule dependencies initialized`
- `ProviderWorker ready`
- `TopupWorker registered`
- `Worker heartbeat started`
- `Worker process started (APP_ROLE=worker)`

Container status: **healthy** (no restart loop).

---

## Priority 2–3 — Portal & Architecture Verification

| Portal | Host | Status |
|--------|------|--------|
| Public | http://localhost | HTTP 200 |
| Customer | http://customer.localhost | HTTP 200, Vietnamese login UI |
| Partner | http://partner.localhost | HTTP 200, Vietnamese login UI |
| Admin | http://admin.localhost | HTTP 200 |

Architecture boundaries from 6033.4.1 remain frozen:

- **Partner** — API Platform only (sidebar in `navigation.ts`)
- **Customer** — 7 retail modules only
- **Admin** — ERP unchanged

---

## Priority 4 — Vietnamese Standardization

| File | Change |
|------|--------|
| `PlatformSection.tsx` | Default empty state → "Sắp phát triển" |
| `ApiSubNav.tsx` | "Trung tâm API", "Thử API", "Sử dụng API" |
| `navigation.ts` | Matching sidebar labels |
| `OrderDetailPageClient.tsx` | "Thử lại an toàn", "Đang thử lại…" |
| Wallet deposit/withdraw pages | "Đang tải…" |

Industry-standard terms retained: SDK, Webhook, IP Whitelist, Rate Limit.

---

## Priority 6 — Build Consistency

All portals use `@cardon/build-info`:

```
6033.4.2 PLATFORM STABILIZATION HOTFIX
```

Updated in:

- `packages/build-info/src/build-info.service.ts`
- `src/config/configuration.ts`
- `docker-compose.local-full.yml` (all service env vars)

---

## Deployment

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api partner admin web worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate
```

Prisma: no pending migrations (schema unchanged).

---

## Build Report

### Docker Build

| Service | Result |
|---------|--------|
| api | PASS |
| partner | PASS |
| admin | PASS |
| web | PASS |
| worker | PASS |

### Container Status (post-deploy)

| Container | Status |
|-----------|--------|
| postgres | healthy |
| redis | healthy |
| api | healthy |
| worker | **healthy** |
| nginx | healthy |
| partner | running (healthcheck may lag) |
| web | running |
| admin | running |

### Service Verification

| Check | Result |
|-------|--------|
| Worker restart loop | **Fixed** |
| Redis | connected |
| BullMQ | ProviderWorker + TopupWorker registered |
| API | Nest started, DB connected |
| Queues | provider_queue, topup_queue active |

### Browser Verification

| URL | Verified |
|-----|----------|
| http://localhost | Public homepage loads |
| http://customer.localhost/login | Vietnamese UI |
| http://partner.localhost/login | Vietnamese B2B login |
| http://admin.localhost/login | Loads |

Authenticated portal walkthrough (Partner sidebar, Admin modules) requires manual login.

---

## Known Issues / Future Improvements

1. **Frontend healthchecks** — partner/web/admin may show `health: starting` briefly; HTTP 200 confirmed.
2. **Authenticated regression** — full sidebar audit after login recommended.
3. **Worker cron** — SystemHealthCron scheduled; no functional change in this build.

---

## Acceptance Checklist

- [x] Worker healthy
- [x] No restart loop
- [x] No circular dependency (forwardRef applied)
- [x] Core containers healthy (api, worker, postgres, redis, nginx)
- [x] Public verified (HTTP 200)
- [x] Customer verified (login UI)
- [x] Partner verified (login UI)
- [x] Admin verified (login UI)
- [x] Vietnamese cleanup (key partner strings)
- [x] Build label 6033.4.2 on all services
- [x] Docker PASS
- [x] No engine/business logic changes
- [ ] Full authenticated portal audit (manual)
