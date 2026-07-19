# BUILD 6033.9.2 — MONITORING HUB CONSOLIDATION

**Build label:** `6033.9.2 MONITORING HUB CONSOLIDATION`

Consolidates all monitoring features under one unified hub. **No business logic, API, or database changes.**

---

## Business principle

| Monitoring | Not |
|------------|-----|
| Observe system health | Operations (manual actions) |
| Read-only + retry/cancel where existing | Finance |
| Event streams & alerts | Configuration |

---

## Navigation

Single sidebar: **Giám sát** → `/monitoring`

| Sub-nav | Route | Reuses |
|---------|-------|--------|
| Tổng quan | `/monitoring` | Aggregated dashboard (existing APIs) |
| Hoạt động | `/monitoring/activity` | `systemActivityApi` |
| Webhook | `/monitoring/webhooks` | `webhookMonitorApi` |
| Hàng đợi | `/monitoring/queues` | `queueMonitorApi` |
| API Logs | `/monitoring/api-logs` | `partnerApiLogsApi` |
| Thông báo | `/monitoring/notifications` | `systemNotificationApi` |

---

## Architecture

```
/monitoring (MonitoringShell)
├── Breadcrumb
├── Sub-navigation
├── Global search → deep-link sub-pages
└── Page content
    ├── MonitoringDashboard (overview)
    ├── Activity (filters + table/timeline + drawer)
    ├── Webhooks (monitor + retry + dead letter)
    ├── Queues (BullMQ monitor)
    ├── API Logs (partner request logs)
    └── Notifications (+ monitoring quick filters)
```

**Shared UI:** `MonitoringUi.tsx` — breadcrumb, filter bar, action bar, empty/loading states, health cards.

---

## Reuse matrix

| Feature | Component / API | New implementation? |
|---------|-----------------|---------------------|
| Activity log | `ActivityLogPanel`, `/admin/activity` | No |
| Webhook monitor | `webhookMonitorApi` | No |
| Queue monitor | `queueMonitorApi`, `QueueMonitorChart` | No |
| Partner API logs | `partnerApiLogsApi` | No (same DB source as Partner) |
| Notifications | `systemNotificationApi` | No (+ quick filters UI only) |
| System health cards | `systemHealthApi.getHealth()` | No |

---

## Redirect table

| Legacy | Canonical |
|--------|-----------|
| `/monitoring/partner-api-logs` | `/monitoring/api-logs` |

---

## Dashboard cards

- Sức khỏe hệ thống → `/configuration/health`
- Sức khỏe hàng đợi / Redis / Workers → `/monitoring/queues`
- Sức khỏe webhook → `/monitoring/webhooks`
- Sức khỏe API → `/monitoring/api-logs`
- Thông báo → `/monitoring/notifications`
- Cảnh báo gần đây + Hoạt động gần đây

---

## Global search

Supports deep-link by query type:

- UUID → Webhook detail
- Request ID → API Logs
- Numeric job ID → Queues
- Long ID → Webhook order filter
- Default → Activity keyword

---

## Files added

```
apps/admin/lib/monitoring-routes.ts
apps/admin/components/monitoring/MonitoringUi.tsx
apps/admin/components/monitoring/MonitoringGlobalSearch.tsx
apps/admin/components/monitoring/MonitoringDashboard.tsx
apps/admin/app/monitoring/api-logs/page.tsx
apps/admin/hooks/useMonitoringUrlInit.ts
```

## Files removed

```
apps/admin/app/monitoring/partner-api-logs/page.tsx
```

---

## Deployment

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin nginx
```

Verify:

- http://admin.localhost/monitoring
- All sub-pages + footer `6033.9.2 MONITORING HUB CONSOLIDATION`

---

## Acceptance checklist

- [x] Single Monitoring menu
- [x] Shared MonitoringShell (breadcrumb, search, layout)
- [x] No duplicate monitoring pages
- [x] Reuse existing APIs
- [x] No business logic changes
- [x] 100% Vietnamese (monitoring labels)
- [ ] Docker PASS (run locally)
- [ ] No regression (manual verify)
