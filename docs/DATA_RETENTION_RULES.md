# Data Retention Rules

> Phase 1A.2 — Canonical policy for soft delete, audit timestamps, and record immutability.  
> Schema: `prisma/schema.prisma`  
> Related: `docs/02_DATABASE_SCHEMA.md`, `docs/PHASE_1A1_PRISMA_AUDIT.md`

---

## 1. Core Principle

**Important business records must never be physically deleted.**

- Application and admin actions must **never** execute SQL `DELETE` on protected tables.
- Prisma Client `delete()` / `deleteMany()` on protected models is **forbidden** in service layer.
- FK policy uses `onDelete: Restrict` on financial relations (Phase 1A.1).
- Retirement uses **soft delete** (`deleted_at`) + **status change** where applicable.

---

## 2. Soft Delete — `deleted_at`

### Models with `deleted_at`

| Table | Prisma model | Soft delete allowed? |
|-------|--------------|----------------------|
| users | User | Yes |
| agents | Agent | Yes |
| products | Product | Yes |
| product_variants | ProductVariant | Yes |
| providers | Provider | Yes |
| orders | Order | Admin archive only (rare) |
| payments | Payment | No — keep `deleted_at` NULL |
| transactions | FinancialTransaction | No — keep `deleted_at` NULL |
| provider_transactions | ProviderTransaction | No — keep `deleted_at` NULL |
| ledger_entries | LedgerEntry | **Never** — must always stay NULL |
| invoices | Invoice | Yes (VOID + deleted_at) |

Column definition (all above tables):

```
deleted_at TIMESTAMPTZ NULL
```

Index: `@@index([deletedAt])` on each model for active-record queries.

### Query convention

Default reads exclude soft-deleted rows:

```sql
WHERE deleted_at IS NULL
```

Prisma middleware / repository base filter (future Phase 2+):

```typescript
// Example — not implemented yet
where: { deletedAt: null }
```

### Admin “delete” action (status-based)

Never `DELETE FROM …`. Instead:

```
deleted_at = NOW()
status     = <disabled/archived value for entity>
updated_at = NOW()
```

| Entity | Status field | Value on soft delete |
|--------|--------------|----------------------|
| users | `status` | `SUSPENDED` (or `BANNED` for abuse) |
| agents | `status` | `SUSPENDED` + `api_enabled = false` |
| products | `status` | `INACTIVE` |
| product_variants | `status` | `INACTIVE` |
| providers | `status` | `INACTIVE` |
| orders | `payment_status` / note | Admin archive: set `deleted_at`; do not change paid amounts |
| invoices | `status` | `VOID` |
| payments | — | **Do not soft delete** |
| transactions | — | **Do not soft delete** |
| provider_transactions | — | **Do not soft delete** |
| ledger_entries | — | **Do not soft delete** |

> **DISABLED / ARCHIVED** in requirements maps to existing enums: `INACTIVE`, `SUSPENDED`, `VOID`, `BANNED` — no new enum values required for MVP.

---

## 3. Audit Timestamps

### Standard

All business-critical tables expose:

| Column | Purpose |
|--------|---------|
| `created_at` | Row insert time (immutable) |
| `updated_at` | Last metadata change (see exceptions) |

### Compliance matrix

| Table | created_at | updated_at | Notes |
|-------|:----------:|:----------:|-------|
| users | Yes | Yes (`@updatedAt`) | |
| agents | Yes | Yes | |
| products | Yes | Yes | |
| product_variants | Yes | Yes | |
| providers | Yes | Yes | |
| orders | Yes | Yes | Limited updates after PAID (see §5) |
| payments | Yes | Yes | Status/gateway response only |
| transactions | Yes | Yes | Status transitions only |
| provider_transactions | Yes | Yes | Status/payload on retry |
| ledger_entries | Yes | Yes (frozen) | Set once at insert; **never updated** |
| invoices | Yes | Yes | Until VOID |

### Ledger `updated_at` exception

`ledger_entries.updated_at` is set equal to `created_at` at insert and **must not change**.  
No `@updatedAt` decorator — prevents accidental Prisma auto-touch. Service layer blocks all UPDATE.

---

## 4. Ledger Immutability (Append-Only)

> **Ledger is append-only.**

### Rules

1. **INSERT only** — new entry per balance change (CREDIT, DEBIT, HOLD, RELEASE).
2. **No UPDATE** — never modify `before_balance`, `amount`, `after_balance`, or any column.
3. **No DELETE** — physical or soft (`deleted_at` must remain `NULL`).
4. **No direct balance mutation** — `agents.balance` / `held_balance` updated only inside the same transaction as a new ledger row.

### Future service layer (required)

```typescript
// LedgerRepository — MUST implement
async createEntry(dto: CreateLedgerEntryDto): Promise<LedgerEntry> { /* INSERT only */ }

// FORBIDDEN — throw ForbiddenException / ConflictException
async updateEntry() { throw new Error('Ledger is append-only'); }
async deleteEntry() { throw new Error('Ledger is append-only'); }
```

### Future database hardening (Phase 1B optional)

```sql
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER trg_ledger_no_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
```

---

## 5. Order Immutability

### Freeze trigger

Once an order reaches **either**:

- `payment_status = PAID`, **or**
- `fulfillment_status = COMPLETED` (SUCCESS)

the following fields are **frozen** and must not change:

| Scope | Frozen fields |
|-------|---------------|
| Order | `total_amount`, `channel`, `agent_id`, `user_id`, guest fields |
| OrderItem | `variant_id`, `quantity`, `unit_price`, `discount`, `total_amount` |

### Allowed updates after freeze

- Status transitions (`fulfillment_status`, `payment_status` → REFUNDED with audit)
- `payment_id`, `payment_expires_at` (before PAID only)
- Operational metadata (`customer_note` — before PAID only)
- **Not** amount, product, or quantity

### Corrections

Financial or catalog corrections require a **new adjustment transaction**:

- New `transactions` row (type `ADMIN_TOPUP` or adjustment flow)
- New `ledger_entries` (if agent balance affected)
- New order / credit note — never mutate the original paid order line items

---

## 6. Physical Delete Prohibition Summary

| Category | Policy |
|----------|--------|
| Financial records | Never DELETE; Restrict FKs |
| Ledger | Never UPDATE/DELETE; append-only only |
| Catalog (product/variant/provider) | Soft delete only |
| Auth tokens | May hard-delete (expired tokens) — not in soft-delete list |
| CMS content | Soft delete or status ARCHIVED (future) |

---

## 7. Phase 1B Migration Notes

Add to first migration SQL (recommended):

```sql
-- Active-record partial indexes (optional optimization)
CREATE INDEX idx_users_active ON users(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_active ON agents(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_active ON products(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_active ON orders(order_code) WHERE deleted_at IS NULL;

-- Ledger append-only triggers (see §4)
```

---

## 8. Related Documentation

| Doc | Topic |
|-----|-------|
| `02_DATABASE_SCHEMA.md` | Canonical columns |
| `08_AGENT_BALANCE_LEDGER.md` | HOLD → DEBIT / RELEASE flows |
| `PHASE_1A1_PRISMA_AUDIT.md` | FK Restrict audit + Phase 1A.2 updates |

---

*Phase 1A.2 — schema and policy only. Service enforcement in Phase 2+.*
