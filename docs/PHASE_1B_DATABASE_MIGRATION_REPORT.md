# Phase 1B — Database Migration Report

> Date: 2026-06-18  
> Scope: PostgreSQL environment, Prisma migration, manual constraints, seed foundation  
> No API, controllers, frontend, or business services.

---

## Executive Summary

| Item | Status |
|------|--------|
| `docker-compose.yml` (PostgreSQL 16 + Redis 7) | **Created** |
| Migration `init_cardon_schema` | **Created** (SQL ready) |
| Migration applied to database | **Pending** — no PostgreSQL/Docker on host |
| Manual constraints SQL | **Created** |
| Manual constraints applied | **Pending** |
| Seed foundation | **Created** |
| Seed executed | **Pending** |
| `prisma validate` | **PASS** |
| `prisma migrate status` | **Blocked** — P1001 (DB unreachable) |

**Next step:** Install Docker Desktop + Node.js, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/phase-1b-db-setup.ps1
```

Or step-by-step:

```powershell
docker compose up -d
npx prisma migrate deploy
npm run db:manual
npx prisma db seed
npx prisma migrate status
npx prisma validate
```

---

## Task 1 — PostgreSQL Environment

### `docker-compose.yml`

| Service | Image | Port | Container |
|---------|-------|------|-----------|
| postgres | `postgres:16` | 5432 | `cardon-postgres` |
| redis | `redis:7-alpine` | 6379 | `cardon-redis` |

- Credentials: `postgres` / `postgres`, database `cardon`
- Healthchecks enabled for both services
- Named volumes: `cardon_postgres_data`, `cardon_redis_data`

### Environment (`.env.example` updated)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cardon?schema=public
REDIS_URL=redis://localhost:6379
SEED_SUPER_ADMIN_EMAIL=superadmin@cardon.vn
SEED_SUPER_ADMIN_PASSWORD=ChangeMe123!
```

### Host environment note

Docker CLI was **not available** on the build machine. Compose file is ready; services were not started in this session.

---

## Task 2 — First Prisma Migration

### Migration

| Property | Value |
|----------|-------|
| Name | `init_cardon_schema` |
| Folder | `prisma/migrations/20250618100000_init_cardon_schema/` |
| SQL file | `migration.sql` (~1032 lines) |
| Lock file | `prisma/migrations/migration_lock.toml` |
| Generator | `prisma migrate diff --from-empty` (equivalent to initial `migrate dev`) |

### Schema addition (Phase 1B)

| Model | Table | Purpose |
|-------|-------|---------|
| `SystemSetting` | `system_settings` | Key/value platform settings for seed |

### Table count

| Metric | Count |
|--------|------:|
| `CREATE TABLE` in migration SQL | **35** |
| Prisma models | **35** |

### Tables created

users, permissions, role_permissions, refresh_tokens, password_reset_tokens, email_verification_tokens, agents, agent_kyc, agent_product_prices, agent_webhook_configs, product_categories, products, product_variants, provider_product_mappings, providers, provider_transactions, provider_logs, payment_gateways, payments, transactions, orders, order_items, card_records, topup_transactions, ledger_entries, invoices, reconcile_reports, reconcile_items, webhook_logs, notifications, audit_logs, cms_pages, cms_seo, cms_banners, **system_settings**

### Migration apply result

```
Error: P1001 — Can't reach database server at localhost:5432
```

Migration SQL is committed and will apply on first `prisma migrate deploy` when PostgreSQL is running.

---

## Task 3 — Manual PostgreSQL Constraints

### File

`prisma/manual/001_constraints.sql`

### Apply script

`scripts/apply-manual.ps1` → `npm run db:manual`

### Constraints & indexes added

| # | Type | Name / object | Description |
|---|------|---------------|-------------|
| 1 | CHECK | `chk_guest_order_email` | `is_guest_order = true` → `guest_email NOT NULL` |
| 2 | Partial INDEX | `idx_orders_payment_expires_waiting` | `payment_expires_at` WHERE `payment_status = 'WAITING_PAYMENT'` |
| 3 | Partial INDEX | `idx_orders_guest_email_guest` | `guest_email` WHERE `is_guest_order = true` |
| 4 | Partial INDEX | `idx_users_active` | Active users (`deleted_at IS NULL`) |
| 5 | Partial INDEX | `idx_agents_active` | Active agents |
| 6 | Partial INDEX | `idx_products_active` | Active products |
| 7 | Partial INDEX | `idx_product_variants_active` | Active variants |
| 8 | Partial INDEX | `idx_providers_active` | Active providers |
| 9 | Partial INDEX | `idx_orders_active` | Active orders by `order_code` |
| 10 | Partial INDEX | `idx_payments_active` | Active payments |
| 11 | Partial INDEX | `idx_transactions_active` | Active financial transactions |
| 12 | Partial INDEX | `idx_provider_transactions_active` | Active provider transactions |
| 13 | Partial INDEX | `idx_invoices_active` | Active invoices |

### Triggers added

| Trigger | Event | Function | Purpose |
|---------|-------|----------|---------|
| `trg_ledger_no_update` | BEFORE UPDATE | `prevent_ledger_mutation()` | Block ledger mutation |
| `trg_ledger_no_delete` | BEFORE DELETE | `prevent_ledger_mutation()` | Block ledger deletion |

**Ledger is append-only** — enforced at database level after manual SQL is applied.

### Manual SQL apply result

**Pending** — requires running PostgreSQL container.

---

## Task 4 — Seed Foundation

### File

`prisma/seed.mjs` (registered in `package.json` → `prisma.seed`)

### Seeded (when `prisma db seed` runs)

| Domain | Content |
|--------|---------|
| **Permissions** | 10 codes from `14_AUTH_RBAC.md` |
| **Role permissions** | Full matrix: SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN |
| **SUPER_ADMIN user** | Email/password from env (default dev credentials) |
| **System settings** | 5 keys (payment timeout, site name, agent rate limit, guest checkout, platform marker) |

### NOT seeded (per requirement)

products, providers, orders, payments, agents (beyond admin user), catalog, transactions

### System settings keys

| Key | Default | Description |
|-----|---------|-------------|
| `payment.timeout_minutes` | `15` | Payment expiration window |
| `site.name` | `"CardOn.vn"` | Display name |
| `agent.default_rate_limit` | `100` | API rate limit |
| `order.guest_checkout_enabled` | `true` | Guest checkout flag |
| `platform.initialized` | `true` | Seed marker |

### Seed result

**Pending** — requires database + applied migration.

---

## Task 5 — Validation

### `prisma validate`

```
The schema at prisma/schema.prisma is valid
```

**Result: PASS**

### `prisma migrate status`

```
Error: P1001 — Can't reach database server at localhost:5432
```

**Result: Pending** (expected until Docker PostgreSQL is running)

### `prisma generate`

Prisma Client v6.9.0 generated to `node_modules/@prisma/client`.

---

## Files Created / Updated

| File | Action |
|------|--------|
| `docker-compose.yml` | Created |
| `prisma/migrations/migration_lock.toml` | Created |
| `prisma/migrations/20250618100000_init_cardon_schema/migration.sql` | Created |
| `prisma/manual/001_constraints.sql` | Created |
| `prisma/seed.mjs` | Created |
| `scripts/apply-manual.ps1` | Created |
| `scripts/phase-1b-db-setup.ps1` | Created |
| `prisma/schema.prisma` | Added `SystemSetting` model |
| `package.json` | DB scripts + seed + dependencies |
| `.env.example` | Redis + seed vars |
| `docs/DATA_RETENTION_RULES.md` | Referenced by constraints |
| `docs/PHASE_1A1_PRISMA_AUDIT.md` | Phase 1B note added |
| `docs/PHASE_1B_DATABASE_MIGRATION_REPORT.md` | This report |

---

## Sign-Off

| Check | Result |
|-------|--------|
| Docker compose defined | Done |
| Initial migration SQL | Done |
| Manual constraints SQL | Done |
| Ledger append-only trigger | Defined (apply pending) |
| Seed foundation | Done |
| `prisma validate` | PASS |
| Migration applied | **Pending host Docker/PostgreSQL** |
| Backend code | Not started |

**Phase 1B artifacts complete. Run `scripts/phase-1b-db-setup.ps1` when Docker is available to finalize.**
