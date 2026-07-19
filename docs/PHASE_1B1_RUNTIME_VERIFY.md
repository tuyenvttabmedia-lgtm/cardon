# Phase 1B.1 — Database Runtime Verification Report

> Date: 2026-06-18  
> Scope: Docker runtime, migration apply, manual SQL, seed, live DB verification  
> No backend, API, or frontend.

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| Docker | Running |
| Migration `init_cardon_schema` | Applied |
| Manual constraints + triggers | Applied |
| Seed | Applied |
| `prisma validate` | PASS |
| `prisma migrate status` | Up to date |

---

## Environment

| Tool | Version / Status |
|------|----------------|
| Docker | 29.5.3 |
| Docker Compose | v5.1.4 |
| PostgreSQL container | `cardon-postgres` — **healthy** |
| Redis container | `cardon-redis` — **healthy** |
| Prisma | 6.9.0 |

---

## Step Results

| Step | Command | Result |
|------|---------|--------|
| 1 | `docker --version` | **PASS** — 29.5.3 |
| 1 | `docker compose version` | **PASS** — v5.1.4 |
| 2 | `docker compose up -d` | **PASS** — images pulled, containers started |
| 3 | Container verify | **PASS** — postgres + redis healthy |
| 4 | `npx prisma migrate deploy` | **PASS** — `20250618100000_init_cardon_schema` applied |
| 5 | Manual SQL (`001_constraints.sql`) | **PASS** — applied via `docker exec psql` |
| 6 | `npx prisma db seed` | **PASS** — via Cursor bundled Node (`prisma/seed.mjs`) |
| 7 | `npx prisma migrate status` | **PASS** — Database schema is up to date |
| 7 | `npx prisma validate` | **PASS** |

### Notes

- `npm` / system `node` not in PATH — migration ran via Cursor Node; manual SQL and seed applied with full node path.
- `npm run db:manual` equivalent executed directly: `Get-Content prisma/manual/001_constraints.sql | docker exec -i cardon-postgres psql ...`

---

## Database Checks

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Application tables | 35 | **35** | **PASS** |
| Total public tables (incl. `_prisma_migrations`) | — | 36 | Info |
| Guest CHECK `chk_guest_order_email` | ACTIVE | ACTIVE | **PASS** |
| Ledger trigger `trg_ledger_no_update` | ACTIVE | ACTIVE | **PASS** |
| Ledger trigger `trg_ledger_no_delete` | ACTIVE | ACTIVE | **PASS** |
| Partial index `idx_orders_payment_expires_waiting` | ACTIVE | ACTIVE | **PASS** |
| Partial index `idx_orders_guest_email_guest` | ACTIVE | ACTIVE | **PASS** |
| Soft-delete partial indexes (10) | ACTIVE | ACTIVE | **PASS** |

### Soft-delete partial indexes verified

```
idx_users_active
idx_agents_active
idx_products_active
idx_product_variants_active
idx_providers_active
idx_orders_active
idx_payments_active
idx_transactions_active
idx_provider_transactions_active
idx_invoices_active
```

### Application tables (35)

```
users, permissions, role_permissions, refresh_tokens, password_reset_tokens,
email_verification_tokens, agents, agent_kyc, agent_product_prices,
agent_webhook_configs, product_categories, products, product_variants,
provider_product_mappings, providers, provider_transactions, provider_logs,
payment_gateways, payments, transactions, orders, order_items, card_records,
topup_transactions, ledger_entries, invoices, reconcile_reports,
reconcile_items, webhook_logs, notifications, audit_logs, cms_pages,
cms_seo, cms_banners, system_settings
```

Plus Prisma internal: `_prisma_migrations`

---

## Seed Verification

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| SUPER_ADMIN user | 1 | **1** | **PASS** |
| Permissions | 10 | **10** | **PASS** |
| Role permissions | 29 | **29** | **PASS** |
| System settings | 5 | **5** | **PASS** |
| Required setting keys | 5 | **5** | **PASS** |

### Permission codes seeded

`users.read`, `orders.read`, `orders.retry`, `payments.view`, `ledger.view`, `providers.manage`, `pricing.manage`, `invoice.manage`, `cms.manage`, `settings.manage`

### Role permission matrix

| Role | Count |
|------|------:|
| SUPPORT | 4 |
| MARKETING | 1 |
| ACCOUNTANT | 5 |
| ADMIN | 9 |
| SUPER_ADMIN | 10 |
| **Total** | **29** |

### System setting keys

`payment.timeout_minutes`, `site.name`, `agent.default_rate_limit`, `order.guest_checkout_enabled`, `platform.initialized`

### SUPER_ADMIN

- Seeded via `prisma/seed.mjs`
- Credentials from `.env` (`SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`)
- **Change default password before any shared environment**

---

## Ledger Append-Only

Triggers `trg_ledger_no_update` and `trg_ledger_no_delete` are **ACTIVE** on `ledger_entries`.  
Function: `prevent_ledger_mutation()` — blocks UPDATE and DELETE.

---

## Sign-Off

| Item | Status |
|------|--------|
| Docker services | Running |
| Migration applied | Done |
| Manual SQL applied | Done |
| Seed executed | Done |
| 35 application tables | Verified |
| Constraints / triggers / indexes | Verified |
| SUPER_ADMIN + permissions + settings | Verified |
| Backend code | Not started |

**Phase 1B.1 complete — FULL PASS. Database foundation is live and verified.**
