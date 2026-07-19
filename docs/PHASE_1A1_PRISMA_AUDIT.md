# Phase 1A.1 — Prisma Schema Audit

> Date: 2026-06-18  
> Scope: Review + AUD-01→AUD-05 remediation in `prisma/schema.prisma`  
> References: `docs/02_DATABASE_SCHEMA.md`, `docs/FINAL_ARCHITECTURE_CHECK.md`, `docs/PHASE_1A_DATABASE_REPORT.md`  
> No migrations, seed, API, service, or application code.

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| Schema syntax | Valid (`npx prisma validate` — 2026-06-18) |
| AUD-01 → AUD-05 | **Resolved** in `prisma/schema.prisma` |
| Blockers before Phase 1B | **None** (delete-behavior) |
| Remaining Phase 1B items | Partial indexes, CHECK constraints, optional triggers (non-blocking) |

| Check | Result |
|-------|--------|
| 1 — Financial correctness | **PASS** |
| 2 — Relations | **PASS** |
| 3 — Delete behavior | **PASS** |
| 4 — Indexes | **PASS** |
| 5 — Enums completeness | **PASS** (canonical docs) |
| 6 — Security | **PASS** |
| 7 — PostgreSQL migration prep | **INFO** (deferred SQL — Phase 1B) |

---

## Remediation Applied (AUD-01 → AUD-05)

All changes in `prisma/schema.prisma` only. Financial and transaction data **never** cascade-delete.

### 1. User → Agent (AUD-05)

| FK | Before | After |
|----|--------|-------|
| `agents.user_id → users` | Cascade | **Restrict** |

Optional reviewer FK unchanged: `agent_kyc.reviewed_by → users` **SetNull**.

### 2. Order immutability (AUD-01, AUD-04)

| FK | Before | After |
|----|--------|-------|
| `order_items.order_id → orders` | Cascade | **Restrict** |
| `payments.order_id → orders` | Cascade | **Restrict** |
| `provider_transactions.order_id → orders` | Cascade | **Restrict** |
| `topup_transactions.order_id → orders` | Cascade | **Restrict** |
| `orders.transaction_id → transactions` | SetNull | **Restrict** |
| `orders.payment_id → payments` | SetNull | **Restrict** |

Order optional ownership preserved: `user_id`, `agent_id` remain **SetNull** (order record survives; parent soft-unlink only).

### 3. Agent financial (AUD-03)

| FK | Before | After |
|----|--------|-------|
| `ledger_entries.agent_id → agents` | Cascade | **Restrict** |
| `agent_product_prices.agent_id → agents` | Cascade | **Restrict** |
| `agent_kyc.agent_id → agents` | Cascade | **Restrict** |
| `agent_webhook_configs.agent_id → agents` | Cascade | **Restrict** |
| `transactions.agent_id → agents` | SetNull | **Restrict** |

### 4. Card records (AUD-04)

| FK | Before | After |
|----|--------|-------|
| `card_records.order_item_id → order_items` | Cascade | **Restrict** |
| `topup_transactions.order_item_id → order_items` | Cascade | **Restrict** |

### 5. Provider / payment / finance history (AUD-01, AUD-02)

| FK | Before | After |
|----|--------|-------|
| `provider_transactions.provider_id → providers` | Restrict | **Restrict** (unchanged) |
| `provider_logs.provider_id → providers` | Cascade | **Restrict** |
| `provider_logs.order_id → orders` | SetNull | **Restrict** |
| `invoices.order_id → orders` | SetNull | **Restrict** |
| `invoices.agent_id → agents` | SetNull | **Restrict** |
| `invoices.user_id → users` | SetNull | **Restrict** |
| `reconcile_items.report_id → reconcile_reports` | Cascade | **Restrict** |

### 6. Non-financial — Cascade retained (allowed)

| FK | Behavior |
|----|----------|
| `refresh_tokens.user_id` | Cascade |
| `password_reset_tokens.user_id` | Cascade |
| `email_verification_tokens.user_id` | Cascade |
| `role_permissions.permission_id` | Cascade |
| `cms_seo.page_id → cms_pages` | Cascade |
| Catalog mappings (variants, provider_product_mappings) | Cascade |

---

## CHECK 1 — Financial Correctness

**Result: PASS**

- All money fields: `@db.Decimal(18, 2)` (exception: `health_score` Decimal(18,4) — non-money routing score)
- `ledger_entries`: required `before_balance`, `before_held`, `amount`, `after_balance`, `after_held`
- Traceability: `reference_type` + `reference_id`, unique `transaction_id`, order price snapshots

---

## CHECK 2 — Relations

**Result: PASS**

| Path | Status |
|------|--------|
| User → Orders | PASS |
| User → Agent (1:1) | PASS |
| Agent → Ledger | PASS |
| Order → OrderItems → CardRecords | PASS |
| Order → Payment | PASS |
| Order → FinancialTransaction | PASS |
| Order → ProviderTransactions (indirect from Transaction) | PASS |
| Provider → ProviderTransactions | PASS |
| Product → Variants → ProviderMappings | PASS |

---

## CHECK 3 — Delete Behavior

**Result: PASS**

Protected tables — no `ON DELETE CASCADE` inbound from deletable parents:

| Protected table | Protection |
|-----------------|------------|
| payments | Restrict from orders |
| orders | Children use Restrict; user/agent FKs SetNull |
| ledger_entries | Restrict from agents |
| transactions | Restrict from agents; orders Restrict to transactions |
| provider_transactions | Restrict from orders + providers |
| invoices | Restrict from orders, agents, users |
| provider_logs | Restrict from providers + orders |
| reconcile_items | Restrict from reconcile_reports |
| card_records | Restrict from order_items |

**Delete chain blocked example:**

```
DELETE users WHERE id = ?     → FAIL if agents row exists (Restrict)
DELETE agents WHERE id = ?    → FAIL if ledger_entries exist (Restrict)
DELETE orders WHERE id = ?    → FAIL if payments / items / provider_tx exist (Restrict)
```

---

## CHECK 4 — Indexes

**Result: PASS**

| Requirement | Status |
|-------------|--------|
| `orders.order_code` UNIQUE | PASS |
| `payments.payment_reference` UNIQUE | PASS |
| `provider_transactions.provider_reference` INDEX | PASS |
| `UNIQUE(agent_id, agent_request_id)` | PASS |
| External / idempotency IDs indexed | PASS |

---

## CHECK 5 — Enums Completeness

**Result: PASS** (aligned with `02_DATABASE_SCHEMA.md`)

| Domain | Schema enum | Key values |
|--------|-------------|------------|
| Order payment | `OrderPaymentStatus` | WAITING_PAYMENT, PAID, FAILED, EXPIRED, REFUNDED |
| Payment record | `PaymentRecordStatus` | PENDING, SUCCESS, FAILED, EXPIRED |
| Fulfillment | `FulfillmentStatus` | PENDING, PROCESSING, COMPLETED, FAILED, WAITING_ADMIN_RETRY |
| Provider tx | `ProviderTransactionStatus` | PENDING, SUCCESS, FAILED, TIMEOUT |
| Ledger | `LedgerEntryType` | HOLD, RELEASE, DEBIT, CREDIT |

---

## CHECK 6 — Security

**Result: PASS**

- No plaintext `api_key`, secret, card PIN, or serial
- Required: `api_key_hash`, `secret_key_encrypted`, `encrypted_pin`, `encrypted_serial`, `token_hash`, `password_hash`

---

## CHECK 7 — PostgreSQL Migration Preparation

**Result: INFO** — add in Phase 1B migration (non-blocking)

### Partial indexes

```sql
CREATE INDEX idx_orders_guest_email ON orders(guest_email) WHERE is_guest_order = true;
CREATE INDEX idx_orders_payment_expires ON orders(payment_expires_at)
  WHERE payment_status = 'WAITING_PAYMENT';
```

### CHECK constraints

```sql
ALTER TABLE orders ADD CONSTRAINT chk_guest_order
  CHECK (
    (is_guest_order = false)
    OR (is_guest_order = true AND guest_email IS NOT NULL AND user_id IS NULL)
  );
```

### Optional triggers (recommended)

- Block UPDATE/DELETE on `ledger_entries` (append-only)
- Block direct UPDATE on `agents.balance` / `held_balance` (ledger-only)

Prisma schema FK changes above will be reflected automatically when `prisma migrate` runs in Phase 1B.

---

## Validation

```bash
npx prisma validate
# 2026-06-18: The schema at prisma/schema.prisma is valid
```

---

## Issues Log

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| AUD-01 | Critical | **Fixed** | Payment cascade removed |
| AUD-02 | Critical | **Fixed** | ProviderTransaction cascade removed |
| AUD-03 | Critical | **Fixed** | LedgerEntry cascade removed |
| AUD-04 | High | **Fixed** | OrderItem, CardRecord, TopupTransaction cascade removed |
| AUD-05 | High | **Fixed** | User→Agent cascade removed; agent financial FKs Restrict |
| AUD-06 | Low | Accepted | ProviderTransaction links via Order (canonical) |
| AUD-07 | Low | Accepted | Audit checklist enum naming vs docs — no schema change |
| AUD-08 | Info | Phase 1B | Partial indexes + CHECK constraints |
| AUD-09 | Info | Phase 1B | Ledger append-only trigger optional |

---

**Phase 1A.1 complete. Schema ready for Phase 1B migration.**

---

## Phase 1A.2 — Soft Delete & Audit Preparation

> Applied: 2026-06-18  
> Policy doc: `docs/DATA_RETENTION_RULES.md`

### Summary

| Item | Status |
|------|--------|
| `deleted_at` on 11 business models | **Done** |
| Audit timestamps (`created_at` / `updated_at`) | **Done** |
| Ledger append-only documentation | **Done** |
| Order immutability documentation | **Done** |
| `npx prisma validate` | **PASS** |

### Soft delete — `deleted_at` added

| Model | Table | Index |
|-------|-------|-------|
| User | users | `@@index([deletedAt])` |
| Agent | agents | yes |
| Product | products | yes |
| ProductVariant | product_variants | yes |
| Provider | providers | yes |
| Order | orders | yes |
| Payment | payments | yes |
| FinancialTransaction | transactions | yes |
| ProviderTransaction | provider_transactions | yes |
| LedgerEntry | ledger_entries | yes (column present; **must stay NULL**) |
| Invoice | invoices | yes |

Admin delete = `deleted_at = now()` + status disabled/archived — **never SQL DELETE**. See `DATA_RETENTION_RULES.md` §2.

### Audit timestamps added / verified

| Model | created_at | updated_at | Notes |
|-------|:----------:|:----------:|-------|
| users | ✓ | ✓ | existing |
| agents | ✓ | ✓ | existing |
| products | ✓ | ✓ | existing |
| providers | ✓ | ✓ | existing |
| orders | ✓ | ✓ | existing |
| payments | ✓ | ✓ | existing |
| transactions | ✓ | ✓ | existing |
| ledger_entries | ✓ | ✓ | **added** — frozen at insert (no `@updatedAt`) |
| provider_transactions | ✓ | ✓ | **added** |
| invoices | ✓ | ✓ | **added** |

### Immutability rules (documented)

| Rule | Location |
|------|----------|
| Ledger append-only — no UPDATE/DELETE | `DATA_RETENTION_RULES.md` §4, schema header comment |
| Order freeze after PAID or fulfillment COMPLETED | `DATA_RETENTION_RULES.md` §5 |
| Corrections via adjustment transaction | `DATA_RETENTION_RULES.md` §5 |

### Phase 1B additions (from 1A.2)

| Item | Notes |
|------|-------|
| Partial indexes `WHERE deleted_at IS NULL` | Optional performance — see `DATA_RETENTION_RULES.md` §7 |
| Ledger mutation triggers | Recommended — see `DATA_RETENTION_RULES.md` §4 |

### Validation

```bash
npx prisma validate
# 2026-06-18 (Phase 1A.2): The schema at prisma/schema.prisma is valid
```

---

## Sign-Off (Updated)

| Item | Status |
|------|--------|
| AUD-01 → AUD-05 applied | Done |
| Phase 1A.2 soft delete + audit | Done |
| `prisma validate` | PASS |
| Migration / seed / code | Not started |
| Overall audit | **FULL PASS** |

**Phase 1A.1 + 1A.2 complete. Schema ready for Phase 1B migration.**

---

## Phase 1B — Database Migration Foundation

> See: `docs/PHASE_1B_DATABASE_MIGRATION_REPORT.md`

| Item | Status |
|------|--------|
| `docker-compose.yml` (Postgres 16 + Redis 7) | Created |
| Migration `20250618100000_init_cardon_schema` | SQL created |
| `prisma/manual/001_constraints.sql` | Created |
| `prisma/seed.mjs` | Created |
| `SystemSetting` model | Added to schema |
| `prisma validate` | PASS |
| DB apply + seed | Pending Docker on host |
