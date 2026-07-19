# Build 6032.1 — Activity Log Center

**Previous build:** 6032.0 AUDIT LOG  
**Target:** Enterprise Activity Log with Event Dispatcher foundation  
**Status:** Complete

---

## Architecture

```
System Event
    ↓
ActivityEventDispatcher (pub/sub)
    ↓
ActivityLogSubscriber (6032.1)
    ↓
system_activity_logs (append-only)

Future: NotificationSubscriber, TelegramSubscriber, EmailSubscriber, WebhookSubscriber
```

- **Independent** from Audit Log (`system_audit_logs`)
- **Fire-and-forget** dispatch — non-blocking
- **Extensible** subscriber pattern — no dispatcher changes needed for new subscribers

### Modules

| Module | Path | Role |
|--------|------|------|
| ActivityEventModule | `src/modules/activity-event/` | Global dispatcher |
| ActivityLogModule | `src/modules/activity-log/` | Subscriber, API, export interceptor |

---

## Database

### Table: `system_activity_logs`

Append-only (INSERT only).

| Column | Type |
|--------|------|
| id | UUID |
| event_type | SystemActivityEventType |
| event_category | SystemActivityEventCategory |
| severity | SystemActivitySeverity |
| source | SystemActivitySource |
| resource | VARCHAR(128) |
| resource_id | VARCHAR(128) |
| resource_display | VARCHAR(255) |
| title | VARCHAR(255) |
| description | TEXT |
| performed_by | UUID |
| performed_email | VARCHAR(255) |
| performed_role | UserRole |
| ip_address | VARCHAR(64) |
| user_agent | VARCHAR(512) |
| session_id | VARCHAR(128) |
| correlation_id | VARCHAR(64) |
| metadata | JSONB |

### Indexes

`created_at`, `event_type`, `event_category`, `severity`, `source`, `performed_by`, `resource`

### Migration

`prisma/migrations/20250628100000_phase_6032_1_activity_log/migration.sql`

---

## API

Base: `/api/v1/admin/activity`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/activity` | `activity.read` |
| GET | `/admin/activity/:id` | `activity.read` |
| GET | `/admin/activity/export/csv` | `activity.export` |
| GET | `/admin/activity/export/excel` | `activity.export` |

Query: `page`, `limit`, `keyword`, `severity`, `category`, `source`, `event`, `user`, `date_from`, `date_to`, `sort`

---

## RBAC

| Permission | SUPER_ADMIN | ADMIN | Others |
|------------|-------------|-------|--------|
| activity.read | ✓ | ✓ | ✗ |
| activity.export | ✓ | ✗ | ✗ |

Seed: `activity.read`, `activity.export`

---

## Event Hooks (6032.1)

| Event | Hook Location |
|-------|---------------|
| LOGIN / LOGOUT / LOGIN_FAILED | `AuthService` (staff roles only) |
| SMTP_TEST / SMTP_SUCCESS / SMTP_FAILED | `SettingsAdminController` |
| PROVIDER_SYNC / PROVIDER_SYNC_FAILED | `SettingsAdminController` |
| EXPORT_CSV / EXPORT_EXCEL | `ActivityExportInterceptor` (global) |
| DOWNLOAD_PIN | `AdminController.copyOrderSerial` |

No changes to Audit Log, Orders, Payments, Wallet, or other business logic.

---

## UI

**Location:** Monitoring → Activity Logs (`/monitoring/activity`)

- Stats: Today, Yesterday, This Week, Total
- **Table** and **Timeline** views
- Severity colors (INFO=blue, SUCCESS=green, WARNING=yellow, ERROR=orange, CRITICAL=red)
- Filters, pagination, drawer with metadata JSON
- CSV/Excel export

**Build footer:** `6032.1 ACTIVITY LOG`

Audit Logs remain under **Settings → Audit Logs**.

---

## Deployment

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate api worker admin nginx
```

Migration runs automatically via API entrypoint (`RUN_MIGRATIONS=true`).

---

## Verification

| Check | Result |
|-------|--------|
| Migration applied | PASS |
| Sidebar **Monitoring** menu | PASS |
| `/monitoring/activity` page | PASS |
| Table + Timeline toggle | PASS |
| Footer `6032.1 ACTIVITY LOG` | PASS |
| API `/admin/activity` | PASS |

---

## Known Issues

1. LOGIN_FAILED for unknown users logged without role filter (intentional for security monitoring).
2. Export interceptor logs all admin export routes including audit/finance — may produce duplicate EXPORT events if multiple exports in one session.
3. Customer/agent login does not create activity entries (staff only).

---

## Next Recommendation

1. **6032.2** — NotificationSubscriber wired to ActivityEventDispatcher for in-app alerts.
2. **6033.0** — Queue/Worker activity hooks (QUEUE_RETRY, QUEUE_FAILED, CRON_*).
3. **6033.x** — Webhook monitor UI consuming WEBHOOK_* events.
4. **6034.0** — Telegram/Email subscribers for CRITICAL severity events.
