# Build 6032.5 — Configuration Center

**Previous build:** 6032.4 WEBHOOK MONITOR  
**Target:** Unified enterprise Configuration Center (reorganize settings UX, no business logic changes)  
**Status:** Complete

---

## Architecture

```
Admin UI (/configuration)
    ↓ REST (module-by-module)
ConfigurationCenterController  ← NEW (overview, search, test, import/export)
SettingsAdminController      ← UNCHANGED (CRUD per module)
SettingsStoreService         ← UNCHANGED (DB + ENV, encryption)
System Audit / Activity      ← UNCHANGED (existing @Audit on PUT)
```

- **No payment/provider/order/webhook engine changes**
- **Existing settings pages reused** under `/configuration/*` via re-exports + shared layout
- **Legacy routes** `/settings/*` redirect to `/configuration/*`

### Modules

| Module | Path | Source |
|--------|------|--------|
| ConfigurationCenterModule | `src/modules/configuration-center/` | Overview, search, tests, export |
| SettingsAdminModule | `src/modules/admin/` | Existing CRUD APIs |
| SettingsModule | `src/modules/settings/` | Store, encryption, reload |

---

## Navigation

Sidebar: **Configuration** → `/configuration`

Sticky sub-nav:

- Overview, Payment, Providers, Orders, SMTP, Telegram, Webhooks
- Security, Integrations, Feature Flags, Maintenance, Backup
- System, Audit, Advanced

Monitoring modules (Activity, Notifications, Queue, Webhook Monitor) unchanged.

---

## Configuration Modules

| Module | Route | Notes |
|--------|-------|-------|
| Overview | `/configuration` | Dashboard cards + dependency warnings |
| Payment | `/configuration/payment` | Reuses payment settings page |
| Providers | `/configuration/providers` | eSale + test connection |
| Orders | `/configuration/orders` | Order limits |
| SMTP | `/configuration/smtp` | Send test email (existing) |
| Telegram | `/configuration/telegram` | Test bot message (new) |
| Webhooks | `/configuration/webhooks` | Callback URLs + test POST |
| Security | `/configuration/security` | Secrets policy overview |
| Integrations | `/configuration/integrations` | Hub + test buttons |
| Feature Flags | `/configuration/feature-flags` | System flags (reuses system page) |
| Maintenance | `/configuration/maintenance` | Links to system/health |
| Backup | `/configuration/backup` | JSON import/export per module |
| System | `/configuration/system` | Site URL, thresholds, flags |
| Audit | `/configuration/audit` | System audit log UI |
| Advanced | `/configuration/advanced` | Reload + health link |
| Health | `/configuration/health` | System health scan (legacy page) |

---

## API

Base: `/api/v1/admin`

### New — Configuration Center

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/configuration/overview` | `configuration.read` | Dashboard summary |
| GET | `/configuration/search?q=` | `configuration.read` | Global config search index |
| GET | `/configuration/modules/:module/audit-meta` | `configuration.read` | Last modified metadata |
| GET | `/configuration/export/:module` | `configuration.manage` | JSON export |
| POST | `/configuration/import/:module` | `configuration.manage` | JSON import |
| POST | `/configuration/test/megapay` | `configuration.manage` | HEAD request to endpoint |
| POST | `/configuration/test/sepay` | `configuration.manage` | Credential validation |
| POST | `/configuration/test/telegram` | `configuration.manage` | getMe + send test message |
| POST | `/configuration/test/webhook` | `configuration.manage` | POST to callback URL |
| POST | `/configuration/test/provider` | `configuration.manage` | Delegates to eSale test |

### Unchanged — Settings CRUD

All `/admin/settings/*` endpoints remain. Saves continue to write **Audit Log** + **Activity Log** via existing decorators.

---

## RBAC

| Permission | Roles |
|------------|-------|
| `configuration.read` | SUPER_ADMIN, ADMIN |
| `configuration.manage` | SUPER_ADMIN, ADMIN |
| `settings.manage` | SUPER_ADMIN (legacy, still used by settings controller) |
| `audit.read` | SUPER_ADMIN, ADMIN (+ SUPPORT read audit) |

Seeded in `prisma/seed.mjs`.

---

## Security

- Secrets masked as `********` in admin views (unchanged)
- **Reveal / Copy** — SUPER_ADMIN only (`ProtectedSecretField`)
- Export with secrets — SUPER_ADMIN + explicit `include_secrets=true`
- Import with secrets — SUPER_ADMIN + `include_secrets` body flag
- No secrets in browser console logs
- Configuration overview polling excluded from activity noise

---

## UI Features

- **Configuration Overview** — configured modules, warnings, environment, DB count, production readiness
- **Settings Audit bar** — last modified, modified by, source, View History → Audit
- **Dependency warnings** — Telegram/SMTP/Payment/Provider cascade messages
- **Global search** — Ctrl+K on configuration layout
- **Status badges** — Configured / Needs Attention / Disabled / Production Ready
- **Test Connection** — real HTTP/Telegram/eSale tests (no fake success)

---

## Deployment

```bash
node prisma/seed.mjs   # configuration.read / configuration.manage
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

Verify:

- http://admin.localhost/configuration
- All configuration sub-pages load
- Ctrl+K search jumps to module
- SMTP / Telegram / Provider test connection
- Audit bar + `/configuration/audit`
- Footer: **6032.5 CONFIGURATION CENTER**

---

## Verification Checklist

- [ ] Configuration menu replaces Settings in sidebar
- [ ] `/settings/*` redirects to `/configuration/*`
- [ ] Overview dashboard loads
- [ ] Test connections return real results or explicit errors
- [ ] Secrets masked; SUPER_ADMIN reveal works
- [ ] Import/export JSON (no secrets unless SUPER_ADMIN confirms)
- [ ] Audit integration on settings saves (unchanged)
- [ ] Docker build + deploy success

---

## Do Not Modify

Payment flow, order flow, provider logic, webhook handlers, queue/monitoring modules, notification/activity/audit engines — configuration layer only.
