# Build 6032.6 — Maintenance Center

Enterprise platform maintenance control layer for CardOn. This build adds availability controls only — payment, order, provider, webhook, queue, and notification business logic are unchanged.

## Route

- Admin UI: `/configuration/maintenance`
- Customer page: `/bao-tri` (redirect from middleware when mode is `MAINTENANCE` or `EMERGENCY`)

## Modes

| Mode | Customer | Admin | Partner |
|------|----------|-------|---------|
| **OFF** | Full access | Full access | Full access |
| **READ_ONLY** | Browse + login; no orders, payments, profile edits | Full access | Full access |
| **MAINTENANCE** | Maintenance page | Full access | Configurable bypass whitelist |
| **EMERGENCY** | Blocked (maintenance page) | Full access | Blocked |
| **EMERGENCY login** | Blocked | Full access | Blocked |
| **EMERGENCY login (SUPER_ADMIN)** | — | Allowed | — |

## API

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/maintenance` | `maintenance.read` |
| PUT | `/admin/maintenance` | `maintenance.manage` + SUPER_ADMIN password |
| POST | `/admin/maintenance/preview` | `maintenance.read` |
| POST | `/admin/maintenance/schedule` | `maintenance.manage` + SUPER_ADMIN password |
| GET | `/cms/platform-status` | Public |

## RBAC

- `maintenance.read` — view dashboard (ADMIN+)
- `maintenance.manage` — change settings (SUPER_ADMIN only in practice; password required)

Seeded in `prisma/seed.mjs`.

## Storage

Maintenance config is stored in `system_settings` under key `settings.maintenance` (JSON). No Prisma migration required.

## Enforcement layer

Guards on customer mutation endpoints only:

- `POST /orders` — module `orders`
- `POST /payments` — module `payment`
- `PATCH /account/profile`, `POST /account/change-password` — module `customer_api`
- `POST /agent-api/v1/cards/buy` — module `partner_api` (respects partner bypass whitelist)
- Auth login/register — `EMERGENCY` blocks non-`SUPER_ADMIN`

Webhooks, admin routes, and internal workers are not blocked.

## Notifications

On mode transition:

1. Activity log (`MAINTENANCE_ENABLED` / `MAINTENANCE_DISABLED`)
2. System audit log (`SETTING` / `maintenance`)
3. Notification Center (via activity dispatcher)
4. Telegram (optional, when platform Telegram is configured and maintenance is enabled)

## System Health

- Operations checklist item: **Maintenance** (pass when OFF, warning for READ_ONLY, error otherwise)
- Health summary includes `maintenance` public status object

## Dashboard cards

- Maintenance Status
- Read Only
- Affected Modules
- Current Banner
- Scheduled Tasks
- Maintenance History

Red **Maintenance ON** badge shown when mode ≠ OFF.

## Schedule

- Start / end datetime
- Timezone
- Auto enable → switches to `MAINTENANCE` at start
- Auto disable → switches to `OFF` at end

## Deploy verification

1. Footer: **6032.6 MAINTENANCE CENTER**
2. Open `/configuration/maintenance`
3. Test modes: OFF, READ_ONLY, MAINTENANCE, EMERGENCY
4. Verify banner preview, schedule, history
5. Verify activity + audit + notification center entries
6. Verify customer redirect to `/bao-tri`
7. Verify System Health maintenance checklist

## Build markers

| Component | Value |
|-----------|-------|
| API `BUILD_VERSION` | `6032.6 MAINTENANCE CENTER` |
| Admin footer | `6032.6 MAINTENANCE CENTER` |
| `docker-compose.local-full.yml` | Updated |

## Module layout

```
src/modules/maintenance-center/
  controllers/maintenance-center.controller.ts
  services/maintenance-center.service.ts
  services/maintenance-availability.service.ts
  guards/platform-maintenance.guard.ts
  decorators/maintenance-module.decorator.ts
  dto/maintenance.dto.ts
  entities/maintenance.constants.ts
```
