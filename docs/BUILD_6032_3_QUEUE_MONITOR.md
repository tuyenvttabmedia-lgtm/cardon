# Build 6032.3 — Queue Monitor

**Previous build:** 6032.2 NOTIFICATION CENTER  
**Target:** Production-grade BullMQ Queue Monitor (read + operations)  
**Status:** Complete

---

## Architecture

```
Admin UI (/monitoring/queues)
    ↓ REST (poll 10s)
QueueMonitorController
    ↓
QueueMonitorService
    ↓ BullMQ Queue APIs (read + pause/resume/clean/retry/promote/remove)
Existing queues only — no new workers, no business logic changes
```

- **Read layer** — dashboard, queue list, paginated jobs, statistics, hourly chart
- **Operations layer** — pause, resume, clean, retry, promote, remove (BullMQ only, no SQL)
- **Alerts** — reuses `ActivityEventDispatcher` → Notification Center (6032.2)
- **Logging** — every manage operation writes Activity Log + Audit Log

### Modules

| Module | Path | Role |
|--------|------|------|
| QueueMonitorModule | `src/modules/queue-monitor/` | API, BullMQ integration, masking, alerts |
| QueueModule | `src/queue/` | Existing global BullMQ queues (unchanged) |

---

## Queues monitored

All queues from `QUEUE_NAMES` in `src/queue/queue.constants.ts`:

| Queue key | Display name |
|-----------|--------------|
| `payment_queue` | Payment |
| `provider_queue` | Provider |
| `topup_queue` | Topup |
| `email_queue` | Email |
| `reconciliation_queue` | Reconciliation |
| `notification_queue` | Notification |

No duplicate workers. No payment/provider flow changes.

---

## API

Base path: `/api/v1/admin` (global prefix)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/queues` | `queue.read` | Dashboard + all queue rows |
| GET | `/queues/:queue` | `queue.read` | Queue detail |
| GET | `/queues/:queue/jobs` | `queue.read` | Paginated jobs (status, filters) |
| GET | `/queues/:queue/statistics` | `queue.read` | Stats + 24h hourly chart |
| GET | `/jobs/:id?queue=` | `queue.read` | Job detail (masked payload) |
| POST | `/queues/:queue/pause` | `queue.manage` | Pause queue |
| POST | `/queues/:queue/resume` | `queue.manage` | Resume queue |
| POST | `/queues/:queue/clean` | `queue.manage` | Clean jobs by status |
| POST | `/queues/:queue/retry-failed` | `queue.manage` | Retry all failed (batch) |
| POST | `/jobs/:id/retry?queue=` | `queue.manage` | Retry single job |
| POST | `/jobs/:id/promote?queue=` | `queue.manage` | Promote delayed job |
| DELETE | `/jobs/:id?queue=` | `queue.manage` | Remove job |

GET `/admin/queues` is excluded from automatic activity export interceptor noise (`ACTIVITY_EXCLUDED_PATH_PREFIXES`).

---

## RBAC

| Permission | Roles |
|------------|-------|
| `queue.read` | SUPER_ADMIN, ADMIN, SUPPORT |
| `queue.manage` | SUPER_ADMIN, ADMIN |

Seeded in `prisma/seed.mjs`.

---

## Admin UI

| Route | Component |
|-------|-----------|
| `/monitoring/queues` | `apps/admin/app/monitoring/queues/page.tsx` |

**Menu:** Monitoring → Queue Monitor (`apps/admin/lib/permissions.ts`)

**Features:**
- Dashboard cards (totals, Redis, worker heartbeat)
- Queue table with drill-down drawer
- Tabs: Jobs, Statistics, Failed, Delayed, Completed, Worker
- Job detail drawer (payload masking)
- Auto-refresh 10s + manual refresh
- Manage actions gated on `queue.manage`

**Footer build:** `6032.3 QUEUE MONITOR`

---

## Security

`queue-payload-mask.util.ts` masks sensitive keys (password, token, pin, api_key, etc.) in job payload/result before API response.

---

## Alerts (Notification Center)

On dashboard load (debounced 60s):

| Condition | Severity |
|-----------|----------|
| Failed jobs > threshold (10) | WARNING |
| Worker heartbeat missing | CRITICAL |
| Queue paused | CRITICAL |

Dispatches `QUEUE_FAILED` activity events → Notification Center subscriber.

---

## Operations logging

Each manage action calls `logOperation()`:
- **Activity:** `QUEUE_RETRY` event with admin context
- **Audit:** `SystemAuditResource.SYSTEM` with action mapped (DELETE/DISABLE/ENABLE/UPDATE)

---

## Deploy

```bash
# From repo root
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d

# Seed permissions (if fresh DB)
docker compose -f docker-compose.local-full.yml exec api npx prisma db seed
```

Verify: `http://admin.localhost/monitoring/queues`

Test manage ops (ADMIN/SUPER_ADMIN): Pause → Resume → Clean completed → Retry failed job.

---

## Files added/changed

### Backend
- `src/modules/queue-monitor/` (module, controller, service, DTOs, constants, masking)
- `src/app.module.ts` — import QueueMonitorModule
- `src/modules/activity-event/interfaces/activity-event.interface.ts` — exclude `/admin/queues`
- `prisma/seed.mjs` — `queue.read`, `queue.manage`

### Admin
- `apps/admin/app/monitoring/queues/page.tsx`
- `apps/admin/services/api-client.ts` — `queueMonitorApi`
- `apps/admin/types/api.ts` — Queue Monitor types
- `apps/admin/lib/permissions.ts` — nav item
- `apps/admin/lib/i18n/vi.ts` — labels
- `apps/admin/lib/build-version.ts`

### Infra
- `docker-compose.local-full.yml` — build version `6032.3 QUEUE MONITOR`
