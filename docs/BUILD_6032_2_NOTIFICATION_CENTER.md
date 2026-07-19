# Build 6032.2 — Notification Center

**Previous build:** 6032.1 ACTIVITY LOG  
**Target:** Enterprise Notification Center (In-App + Telegram)  
**Status:** Complete

---

## Architecture

```
System Event
    ↓
ActivityEventDispatcher
    ↓
NotificationActivitySubscriber (6032.2)
    ↓
NotificationDispatcher
    ↓
├── In-App (system_notifications)
└── Telegram (TelegramNotificationService — ERROR/CRITICAL only)
```

- **Notification ≠ Activity** — notifications are actionable admin alerts
- **No polling** on the backend — subscriber listens to activity events
- **No duplicate logic** — single dispatcher path; Telegram is not called from business logic
- **Activity Log unchanged** — only a new subscriber was added

### Modules

| Module | Path | Role |
|--------|------|------|
| ActivityEventModule | `src/modules/activity-event/` | Event bus (6032.1) |
| NotificationCenterModule | `src/modules/notification-center/` | Subscriber, dispatcher, API, in-app persistence |

---

## Dispatcher

`NotificationActivitySubscriber` registers with `ActivityEventDispatcher` on module init.

`NotificationDispatcher`:
1. Persists in-app rows via `SystemNotificationService.dispatch()` → `system_notifications`
2. Sends Telegram when severity is `ERROR` or `CRITICAL` and Telegram settings are enabled (reuses `TelegramNotificationService`)

### Notification events (from activity)

| Activity Event | Notification |
|----------------|--------------|
| SMTP_FAILED | ✓ |
| PROVIDER_SYNC_FAILED | ✓ |
| QUEUE_FAILED | ✓ |
| WEBHOOK_FAILED | ✓ |
| LOGIN_FAILED | ✓ |
| MAINTENANCE_ENABLED | ✓ |
| LOW_PROVIDER_BALANCE | ✓ |
| LOW_AGENT_BALANCE | ✓ |
| API_KEY_ROTATED | ✓ |
| DOWNLOAD_PIN (export PIN) | ✓ |

**Excluded:** LOGIN, LOGOUT, SMTP_SUCCESS, PROVIDER_SYNC

---

## Database

### Table: `system_notifications`

Append-only content; only `is_read`, `read_at`, and soft-delete (`deleted_at`) are updated.

| Column | Type |
|--------|------|
| id | UUID |
| title | VARCHAR |
| message | TEXT |
| notification_type | SystemNotificationType |
| severity | SystemNotificationSeverity |
| source | SystemActivitySource |
| resource | VARCHAR |
| resource_id | VARCHAR |
| resource_display | VARCHAR |
| recipient_type | SystemNotificationRecipientType |
| recipient_id | UUID |
| recipient_role | UserRole |
| is_read | BOOLEAN |
| read_at | TIMESTAMPTZ |
| channel | SystemNotificationChannel |
| metadata | JSONB |
| created_at | TIMESTAMPTZ |
| deleted_at | TIMESTAMPTZ |

### Indexes

`recipient_id`, `recipient_role`, `is_read`, `severity`, `notification_type`, `created_at`

### Migration

`prisma/migrations/20250628120000_phase_6032_2_notification_center/migration.sql`

Also adds `LOW_PROVIDER_BALANCE`, `LOW_AGENT_BALANCE` to `SystemActivityEventType`.

---

## API

Base: `/api/v1/admin/notifications`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/notifications` | `notification.read` |
| GET | `/admin/notifications/unread-count` | `notification.read` |
| GET | `/admin/notifications/:id` | `notification.read` |
| PATCH | `/admin/notifications/:id/read` | `notification.read` |
| PATCH | `/admin/notifications/read-all` | `notification.read` |
| PATCH | `/admin/notifications/dismiss` | `notification.manage` |
| GET | `/admin/notifications/export/csv` | `notification.manage` |
| GET | `/admin/notifications/export/excel` | `notification.manage` |

---

## RBAC

| Permission | Description |
|------------|-------------|
| `notification.read` | View notification center & bell |
| `notification.manage` | Export, dismiss (soft delete) |

| Role | Read | Manage | Scope |
|------|------|--------|-------|
| SUPER_ADMIN | ✓ | ✓ | All |
| ADMIN | ✓ | — | All |
| SUPPORT | ✓ | — | ORDER, SYSTEM, SECURITY |
| MARKETING | ✓ | — | MARKETING only |
| ACCOUNTANT | ✓ | — | FINANCE only |

Legacy `/admin/notifications` routes on `AdminOperationController` were removed in favor of the new module.

---

## UI

### Header bell (`AdminNotificationBell`)

- Unread badge with 30s polling
- Yellow badge when unread warnings only; red for ERROR/CRITICAL
- Drawer tabs: All, Unread, Warnings, Critical
- Actions: Mark read, Open resource, Dismiss, Mark all read

### Monitoring → Notifications (`/monitoring/notifications`)

- Stats: Unread, Today, Critical, Resolved
- Filters: severity, type, source, read state, date range
- Table / Timeline views
- Bulk mark read, dismiss, export CSV/Excel

### Footer

`6032.2 NOTIFICATION CENTER`

---

## Telegram Integration

Reuses existing `TelegramNotificationService` via `NotificationDispatcher`.

Telegram sends only when:
- Severity is `ERROR` or `CRITICAL`
- Admin Telegram settings: `enabled`, `botToken`, `chatId` configured

---

## Deployment

```bash
npx prisma migrate deploy
npx prisma generate
node prisma/seed.mjs

docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin web worker
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate api worker admin web nginx
```

Verify:
1. http://admin.localhost — footer `6032.2 NOTIFICATION CENTER`
2. Monitoring → Notifications
3. Header bell + unread badge

---

## Verification

| Test | Expected |
|------|----------|
| SMTP Failed | In-app notification |
| Provider Sync Failed | In-app notification |
| Webhook / Queue Failed | In-app notification |
| Maintenance Enabled | WARNING notification |
| CRITICAL / ERROR | Telegram (if enabled) |
| Mark read | Badge count decreases |
| Mark all read | All cleared |
| Drawer / Page | Functional |
| Permissions | Role-scoped visibility |

---

## Known Issues

- Header bell uses 30s polling (no WebSocket in this build)
- Role-scoped filtering applies post-query in service layer; pagination totals may include rows filtered by role type on edge cases
- Legacy `notifications` table and `AdminNotificationService` remain for customer/agent alerts but admin API routes were migrated to `system_notifications`

---

## Next Recommendation

1. **6032.3** — Email / Slack / Discord channels via same `NotificationDispatcher`
2. WebSocket or SSE for real-time badge updates
3. User-targeted notifications (`recipient_type = USER`) for per-admin alerts
4. Notification rules engine (mute, snooze, escalation policies)
