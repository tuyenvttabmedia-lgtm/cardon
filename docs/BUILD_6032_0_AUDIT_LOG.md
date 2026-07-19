# Build 6032.0 — Settings Audit Log

**Target:** Enterprise append-only audit trail for system configuration changes  
**Previous build:** 6031.6 HOTFIX  
**Status:** Complete

---

## Database Changes

### New table: `system_audit_logs`

Append-only audit store (INSERT only — no UPDATE/DELETE in application code).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| resource | SystemAuditResource enum | SMTP, SEO, SYSTEM, FEATURE_FLAG, PROVIDER, … |
| resource_id | VARCHAR(128) | Optional entity id |
| resource_name | VARCHAR(255) | Human-readable label |
| action | SystemAuditAction enum | CREATE, UPDATE, ENABLE, DISABLE, … |
| field_name | VARCHAR(255) | Changed field(s) |
| old_value | JSONB | Masked secrets |
| new_value | JSONB | Masked secrets |
| performed_by | UUID | Admin user id |
| performed_email | VARCHAR(255) | |
| performed_role | UserRole | |
| ip_address | VARCHAR(64) | |
| user_agent | VARCHAR(512) | |
| session_id | VARCHAR(128) | |
| correlation_id | VARCHAR(64) | Request correlation |
| reason | VARCHAR(512) | Optional change reason |
| created_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | Always NULL (reserved) |

### Indexes

- `created_at`
- `resource`
- `action`
- `performed_by`
- `resource_id`

### Migration

`prisma/migrations/20250627180000_phase_6032_audit_log/migration.sql`

---

## API

Base path: `/api/v1/admin/audit`

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/audit` | `audit.read` | Paginated list + stats |
| GET | `/admin/audit/:id` | `audit.read` | Single entry detail |
| GET | `/admin/audit/export/csv` | `audit.export` | CSV export (filtered) |
| GET | `/admin/audit/export/excel` | `audit.export` | Excel export (filtered) |

### Query parameters (list/export)

- `page`, `limit` (20/50/100)
- `sort` — `newest` | `oldest`
- `keyword` — email, IP, reason, field
- `resource`, `action`, `role`, `user`
- `date_from`, `date_to`

### Backend module

`src/modules/audit-log/`

- `AuditLogModule`, `AuditLogController`, `AuditLogService`, `AuditLogRepository`
- `@Audit()` decorator + `AuditInterceptor` (global)
- `CorrelationIdMiddleware` (global via AppModule)
- Secret masking + 50KB JSON diff cap
- Fire-and-forget INSERT (non-blocking)

### Hooked endpoints (no business logic changes)

- All `PUT` routes in `SettingsAdminController`
- `PUT admin/providers/:id/runtime-settings`
- `PUT admin/cms/seo-settings`

### Exclusions

- GET requests
- `/admin/audit*` routes
- `/admin/audit-logs` (legacy)
- `/health`

---

## UI

**Location:** Settings → Audit Logs (`/settings/audit`)

- Stats cards: Today, Yesterday, This Month, Total
- Filterable/sortable table
- Row click → drawer with JSON diff (red/green/yellow)
- Masked secrets shown as `********`
- CSV / Excel export (requires `audit.export`)
- Pagination 20 / 50 / 100

**Build footer:** `6032.0 AUDIT LOG`

---

## Permission

| Permission | Description |
|------------|-------------|
| `audit.read` | View system audit logs |
| `audit.export` | Export CSV/Excel |

| Role | audit.read | audit.export |
|------|------------|--------------|
| SUPER_ADMIN | ✓ | ✓ |
| ADMIN | ✓ | ✗ |
| MARKETING | ✗ | ✗ |
| ACCOUNTANT | ✗ | ✗ |
| SUPPORT | ✗ | ✗ |
| AGENT | ✗ | ✗ |

Legacy `audit.view` + `/audit` page unchanged (old `audit_logs` table).

---

## Migration

```bash
npx prisma migrate deploy
npx prisma generate
node prisma/seed.mjs   # dev only — adds audit.read / audit.export permissions
```

---

## Test Result

| Case | Result |
|------|--------|
| SMTP host change → audit entry | PASS (via @Audit + snapshot) |
| SMTP password change → masked | PASS |
| Gateway enable/disable | PASS |
| Provider maintenance ON | PASS |
| Feature flag (customerTopupEnabled) OFF | PASS |
| Search / filter resource / date | PASS (UI + API) |
| Drawer detail + diff colors | PASS |
| Export CSV / Excel | PASS |
| Pagination | PASS |
| Permission enforcement | PASS |
| No changes to Orders/Payments/Wallet/etc. | PASS |

---

## Known Issues

1. **Legacy audit coexistence** — `audit_logs` and `system_audit_logs` run in parallel; settings still write legacy audit via `AdminAuditService.persist()`.
2. **Field-level rows** — One audit row per API call (multi-field changes grouped in `field_name` + JSON diff).
3. **Provider margin** — No dedicated margin endpoint; provider eSale settings changes are audited under `PROVIDER`.
4. **Session id** — Populated from `x-session-id` header when present; JWT `jti` not yet wired.

---

## Next Build Recommendation

1. **6032.1** — Migrate legacy `audit_logs` readers to `system_audit_logs`; deprecate `/audit` page.
2. **6033.0** — Audit RBAC role/permission changes via dedicated hooks on staff management.
3. **6033.x** — Optional async queue (BullMQ) for audit writes under very high mutation load.
4. **6034.0** — Retention policy job (archive old rows to cold storage; keep append-only semantics).
