# Build 6032.3.1 — Queue Monitor Hotfix

**Previous build:** 6032.3 QUEUE MONITOR  
**Target:** Monitoring enhancements (health, workers, statistics, history, bulk ops, export)  
**Status:** Complete

---

## Scope

Read + operations layer only. No new queues, no worker logic changes, no payment/provider flow changes.

---

## Architecture

```
Admin UI (/monitoring/queues)
    ↓ REST + polling (5/10/30/60s or off)
QueueMonitorController
    ├── QueueMonitorService (BullMQ read, health, stats, history, bulk, alerts)
    └── QueueMonitorExportService (CSV / Excel / JSON)
         ↓
ActivityEventDispatcher → Notification Center (alerts)
AuditLogService (manage operations)
```

### New utilities

| File | Role |
|------|------|
| `utils/queue-health.util.ts` | HEALTHY / WARNING / CRITICAL rules |
| `utils/queue-job-search.util.ts` | Extended job search haystack |
| `utils/queue-job-timeline.util.ts` | Job lifecycle timeline |
| `entities/queue-config.constants.ts` | Read-only queue config registry |

---

## Queue Health

| Status | Rules |
|--------|-------|
| HEALTHY | Worker online, Redis OK, failed rate < 5% |
| WARNING | Failed ≥ 5%, delayed ≥ 25, retries ≥ 15 |
| CRITICAL | Paused, worker offline, Redis error, failed rate > 20% |

Dashboard queue table: Name, Health, Worker, Redis, Jobs (W/A/D/F).

---

## Worker Monitor

`GET /admin/queues/:queue/workers`

Uses BullMQ `getWorkers()` + global Redis heartbeat (`cardon:worker:heartbeat`).

Fields: name, status, hostname, startedAt, uptime, lastHeartbeat. PID/memory/CPU shown as null (worker logic unchanged).

Alert when heartbeat age > 60s → Notification Center + Activity Log.

---

## Statistics

Enhanced `GET /admin/queues/:queue/statistics`:

- Counts: completed, waiting, active, delayed, failed
- jobs/min, jobs/hour, jobs/sec
- avg duration, P95 duration, avg waiting time
- longest job, oldest waiting job
- retry rate, failure rate, success rate
- 24h hourly chart

---

## History

`GET /admin/queues/:queue/history?range=24h|7d|30d|custom`

Chart buckets: completed, failed, retry, waiting (snapshot on latest bucket).

---

## Job Timeline

`GET /admin/jobs/:id?queue=` includes `timeline[]` steps: Created → Waiting → Active → Completed/Failed → Retry.

---

## Bulk Operations

| Operation | Endpoint |
|-----------|----------|
| Retry selected | `POST /admin/queues/:queue/jobs/bulk` `{ action: "retry", job_ids }` |
| Remove selected | `{ action: "remove" }` |
| Promote selected | `{ action: "promote" }` |
| Retry all failed | `POST /admin/queues/:queue/retry-failed` |
| Remove all completed | `POST /admin/queues/:queue/remove-completed` |
| Pause / Resume / Clean | existing endpoints |

All manage ops: confirm in UI, Activity Log + Audit Log.

---

## Export

`GET /admin/queues/:queue/export/csv|excel|json?type=statistics|jobs|failed|history`

Permission: `queue.export`

---

## Alerts

Debounced 60s on dashboard load:

| Condition | Severity |
|-----------|----------|
| Redis disconnect | CRITICAL |
| Worker offline (>60s) | CRITICAL |
| Queue paused | CRITICAL |
| Failed spike | WARNING |
| Retry spike | WARNING |
| Delay too high | WARNING |

---

## Permissions

| Code | Roles |
|------|-------|
| `queue.read` | SUPER_ADMIN, ADMIN, SUPPORT |
| `queue.manage` | SUPER_ADMIN, ADMIN |
| `queue.export` | SUPER_ADMIN, ADMIN |

---

## UI

- Route: `/monitoring/queues`
- Throughput dashboard cards
- Health badges (green/yellow/red)
- Auto-refresh: OFF / 5s / 10s / 30s / 60s with countdown
- Queue detail tabs: Jobs, Statistics, History, Failed, Delayed, Completed, Worker, Config (readonly)
- Job detail timeline drawer
- Bulk selection + confirm dialogs
- Export CSV / Excel / JSON

**Footer:** `6032.3.1 QUEUE HOTFIX`

---

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d api admin worker
docker compose -f docker-compose.local-full.yml exec api node prisma/seed.mjs
```

Verify: http://admin.localhost/monitoring/queues
