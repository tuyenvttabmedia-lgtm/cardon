# Database Schema

> Phase 1 — **Canonical schema reference.** Merged from docs 14, 15, 16 + V2 decisions.  
> Last updated: final architecture cleanup (`FINAL_ARCHITECTURE_CHECK.md`).

## Entity Relationship Summary

```
users 1──1 agents
agents 1──1 agent_kyc
agents 1──N transactions
agents 1──N ledger_entries
agents 1──N agent_product_prices
agents 1──0..1 agent_webhook_configs

product_categories 1──N products (brand)
products 1──N product_variants (sellable SKU)
product_variants 1──N provider_product_mappings
providers 1──N provider_product_mappings

transactions 1──0..1 orders
orders 1──0..1 payments
orders 1──N order_items
order_items 1──N card_records
order_items 1──0..1 topup_transactions
orders 1──N provider_transactions

product_variants 1──N agent_product_prices
```

**Catalog model:** Category → Product → Variant → Provider mappings (1 variant : N providers).

---

## User Roles (ENUM)

```
CUSTOMER | AGENT | SUPPORT | MARKETING | ACCOUNTANT | ADMIN | SUPER_ADMIN
```

---

## Auth & Users

### users

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | VARCHAR UNIQUE | |
| phone | VARCHAR | Nullable |
| password_hash | VARCHAR | bcrypt |
| role | ENUM | CUSTOMER, AGENT, SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN |
| status | ENUM | ACTIVE, SUSPENDED, BANNED |
| email_verified_at | TIMESTAMPTZ | Nullable |
| last_login_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

One `users` row with role `AGENT` maps to exactly one `agents` row.

### password_reset_tokens

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| token_hash | VARCHAR | bcrypt hash of token |
| expires_at | TIMESTAMPTZ | |
| used_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | |

### email_verification_tokens

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| token_hash | VARCHAR | bcrypt hash of token |
| expires_at | TIMESTAMPTZ | |
| used_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | |

---

## Agents

### agents

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users UNIQUE | 1:1 with AGENT user |
| company_name | VARCHAR | Display name |
| balance | DECIMAL(18,2) | Updated only via ledger |
| held_balance | DECIMAL(18,2) | HOLD entries; default 0 |
| api_key_hash | VARCHAR | **bcrypt hash** |
| secret_key_encrypted | TEXT | AES-256-GCM; webhook HMAC |
| last_used_at | TIMESTAMPTZ | Nullable |
| contact_email | VARCHAR | Nullable |
| rate_limit | INT | Default 100 req/min |
| api_enabled | BOOLEAN | Default false; true after KYC approved |
| status | ENUM | ACTIVE, SUSPENDED |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Available balance = `balance - held_balance`.  
API key shown **once** on generate/regenerate.

### agent_kyc

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK → agents UNIQUE | One KYC record per agent |
| company_name | VARCHAR | Legal company name |
| tax_code | VARCHAR | Business tax ID |
| representative_name | VARCHAR | Legal representative |
| document_front | VARCHAR | Encrypted file path / URL |
| document_back | VARCHAR | Encrypted file path / URL |
| business_license | VARCHAR | Encrypted file path / URL |
| status | ENUM | PENDING, SUBMITTED, APPROVED, REJECTED |
| reviewed_by | UUID FK → users | Nullable; admin reviewer |
| reviewed_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Agent API disabled until `agent_kyc.status = APPROVED` and `agents.api_enabled = true`.

### agent_product_prices

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK → agents | |
| variant_id | UUID FK → product_variants | |
| agent_price | DECIMAL | Custom agent price |
| status | ENUM | ACTIVE, INACTIVE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

```sql
CREATE UNIQUE INDEX idx_agent_variant_price ON agent_product_prices(agent_id, variant_id);
```

### agent_webhook_configs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK → agents UNIQUE | |
| callback_url | VARCHAR | |
| events | JSONB | e.g. ["ORDER_COMPLETED"] |
| enabled | BOOLEAN | Default true |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

## Product Engine

### product_categories

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| slug | VARCHAR UNIQUE | e.g. game-card, topup |
| name | VARCHAR | e.g. Game Card |
| parent_id | UUID FK → product_categories | Nullable |
| sort_order | INT | Default 0 |
| status | ENUM | ACTIVE, INACTIVE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### products

Brand / service group level (not directly sellable).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| category_id | UUID FK → product_categories | |
| slug | VARCHAR UNIQUE | e.g. garena, pubg-mobile |
| name | VARCHAR | e.g. Garena |
| description | TEXT | Nullable |
| status | ENUM | ACTIVE, INACTIVE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### product_variants

Sellable SKU — checkout and Agent API operate on variants.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| product_id | UUID FK → products | |
| sku | VARCHAR UNIQUE | e.g. GARENA_100K |
| name | VARCHAR | e.g. Garena 100K |
| type | ENUM | CARD, TOPUP, DATA, SOFTWARE |
| face_value | DECIMAL | Nominal value |
| sell_price | DECIMAL | Default B2C price |
| status | ENUM | ACTIVE, INACTIVE |
| metadata | JSONB | telco, package_id, etc. |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### provider_product_mappings

One variant → many providers.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| provider_id | UUID FK → providers | |
| product_variant_id | UUID FK → product_variants | |
| provider_product_code | VARCHAR | Provider-side SKU/code |
| provider_cost | DECIMAL | Cost from this provider |
| priority | INT | Manual routing priority (lower = higher) |
| health_score | DECIMAL | Updated by routing service |
| status | ENUM | ACTIVE, INACTIVE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

```sql
CREATE UNIQUE INDEX idx_provider_variant ON provider_product_mappings(provider_id, product_variant_id);
```

---

## Providers & Payment Gateways

### providers

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| code | VARCHAR UNIQUE | esale, imedia |
| name | VARCHAR | |
| api_credentials | TEXT | Encrypted JSON |
| balance | DECIMAL | Last synced balance |
| last_balance_synced_at | TIMESTAMPTZ | Nullable |
| last_product_synced_at | TIMESTAMPTZ | Nullable |
| status | ENUM | ACTIVE, INACTIVE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### payment_gateways

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| code | VARCHAR UNIQUE | megapay, sepay |
| name | VARCHAR | |
| config_encrypted | TEXT | AES-256-GCM JSON |
| status | ENUM | ACTIVE, INACTIVE |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Hybrid credentials: production secrets in ENV; admin overrides in `config_encrypted`.

---

## Orders & Checkout

### transactions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| transaction_id | VARCHAR UNIQUE | Ledger reference ID |
| agent_id | UUID FK → agents | Nullable (B2C) |
| type | ENUM | AGENT_ORDER, B2C_CHECKOUT, ADMIN_TOPUP |
| amount | DECIMAL | |
| status | ENUM | PENDING, HOLD, COMPLETED, RELEASED, FAILED |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### orders

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_code | VARCHAR UNIQUE | Human-readable |
| transaction_id | UUID FK → transactions | Nullable (B2C optional) |
| user_id | UUID FK → users | Nullable (guest) |
| agent_id | UUID FK → agents | Nullable (B2C) |
| agent_request_id | VARCHAR | Nullable; agent idempotency |
| channel | ENUM | B2C, AGENT |
| guest_email | VARCHAR | Nullable; required when is_guest_order |
| guest_phone | VARCHAR | Nullable |
| is_guest_order | BOOLEAN | Default false |
| invoice_required | BOOLEAN | Default false; VAT invoice at checkout |
| customer_note | VARCHAR | Nullable |
| total_amount | DECIMAL | Order total snapshot |
| payment_status | ENUM | WAITING_PAYMENT, PAID, FAILED, EXPIRED, REFUNDED |
| fulfillment_status | ENUM | PENDING, PROCESSING, COMPLETED, FAILED, WAITING_ADMIN_RETRY |
| payment_id | UUID FK → payments | Nullable; B2C only |
| payment_expires_at | TIMESTAMPTZ | Nullable; configurable timeout |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

```sql
CREATE UNIQUE INDEX idx_orders_agent_request ON orders(agent_id, agent_request_id);
CREATE INDEX idx_orders_guest_email ON orders(guest_email) WHERE is_guest_order = true;
```

Constraint: if `is_guest_order = true` then `guest_email` NOT NULL and `user_id` IS NULL.

### order_items

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| variant_id | UUID FK → product_variants | |
| quantity | INT | Number of units |
| unit_price | DECIMAL | Price snapshot |
| discount | DECIMAL | Default 0 |
| total_amount | DECIMAL | (unit_price × quantity) - discount |
| status | ENUM | PENDING, PROCESSING, COMPLETED, FAILED, PARTIAL |
| created_at | TIMESTAMPTZ | |

**Multi-quantity cards:** quantity=10 → 10 `card_records` rows.

### card_records

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_item_id | UUID FK → order_items | |
| card_serial | VARCHAR | AES-256-GCM encrypted |
| card_pin | VARCHAR | AES-256-GCM encrypted |
| provider_response | JSONB | Sanitized |
| status | ENUM | PENDING, DELIVERED, FAILED |
| created_at | TIMESTAMPTZ | |

### topup_transactions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| order_item_id | UUID FK → order_items | |
| phone_number | VARCHAR | Recipient phone |
| telco | VARCHAR | MOBIFONE, VINAPHONE, etc. |
| amount | DECIMAL | Topup denomination |
| provider_reference | VARCHAR | Provider-side reference |
| status | ENUM | PENDING, SUCCESS, FAILED |
| result_message | VARCHAR | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

## Payments

### payments

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| gateway | ENUM | MEGAPAY, SEPAY |
| payment_reference | VARCHAR UNIQUE | Webhook idempotency — **only here** |
| amount | DECIMAL | |
| status | ENUM | PENDING, SUCCESS, FAILED, EXPIRED |
| gateway_response | JSONB | |
| paid_at | TIMESTAMPTZ | Nullable |
| expires_at | TIMESTAMPTZ | Nullable; matches order timeout |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Orders link via `orders.payment_id → payments.id`.

---

## Ledger

### ledger_entries

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK → agents | |
| type | ENUM | CREDIT, DEBIT, HOLD, RELEASE |
| before_balance | DECIMAL | |
| before_held | DECIMAL | |
| amount | DECIMAL | Always positive |
| after_balance | DECIMAL | |
| after_held | DECIMAL | |
| reference_type | ENUM | TRANSACTION, ORDER, TOPUP, REFUND, ADJUSTMENT |
| reference_id | UUID | |
| description | VARCHAR | |
| created_by | UUID FK → users | Nullable |
| created_at | TIMESTAMPTZ | |

Append-only. Never update or delete.

---

## Provider Fulfillment

### provider_transactions

1 order : N provider_transactions (each retry = new row).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| provider_id | UUID FK → providers | |
| provider_transaction_id | VARCHAR UNIQUE | Nullable |
| request_id | VARCHAR UNIQUE | Idempotency per attempt |
| attempt | INT | 1 = first, 2+ = retry |
| action | ENUM | BUY_CARD, TOPUP, CHECK |
| status | ENUM | PENDING, SUCCESS, FAILED, TIMEOUT |
| request_payload | JSONB | |
| response_payload | JSONB | |
| created_at | TIMESTAMPTZ | |

---

## Finance & Audit

### webhook_logs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| source | ENUM | MEGAPAY, SEPAY |
| payment_reference | VARCHAR | |
| payload | JSONB | |
| signature_valid | BOOLEAN | |
| ip_address | VARCHAR | |
| processed | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

### invoices

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| invoice_number | VARCHAR UNIQUE | INV-YYYYMMDD-XXXXX |
| type | ENUM | B2C_RECEIPT, AGENT_STATEMENT, AGENT_TOPUP_RECEIPT, MONTHLY_SUMMARY |
| order_id | UUID FK → orders | Nullable |
| agent_id | UUID FK → agents | Nullable |
| user_id | UUID FK → users | Nullable |
| subtotal | DECIMAL | |
| tax_amount | DECIMAL | Default 0 |
| total_amount | DECIMAL | |
| status | ENUM | DRAFT, ISSUED, VOID |
| issued_at | TIMESTAMPTZ | Nullable |
| pdf_url | VARCHAR | Nullable |
| metadata | JSONB | company_name, tax_code, address when VAT |
| created_at | TIMESTAMPTZ | |

### audit_logs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| admin_id | UUID FK → users | |
| action | VARCHAR | |
| target_type | ENUM | ORDER, AGENT, PRODUCT, USER, INVOICE |
| target_id | UUID | |
| metadata | JSONB | |
| ip_address | VARCHAR | Nullable |
| created_at | TIMESTAMPTZ | |

### reconcile_reports / reconcile_items

Unchanged — see prior schema. Domain: PAYMENT, PROVIDER, LEDGER, ORDER_REVENUE.

### notifications

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| recipient_type | ENUM | USER, AGENT, ADMIN_ROLE |
| recipient_id | UUID | Nullable |
| recipient_role | ENUM | Nullable; SUPPORT, MARKETING, ACCOUNTANT, ADMIN |
| type | VARCHAR | |
| title | VARCHAR | |
| body | TEXT | |
| metadata | JSONB | |
| read_at | TIMESTAMPTZ | Nullable |
| created_at | TIMESTAMPTZ | |

---

## CMS

### cms_pages / cms_seo / cms_banners

Unchanged from prior schema. See Phase 12 doc `13_SEO_CMS.md`.

---

## Key Indexes

```sql
CREATE UNIQUE INDEX idx_orders_agent_request ON orders(agent_id, agent_request_id);
CREATE UNIQUE INDEX idx_payments_reference ON payments(payment_reference);
CREATE UNIQUE INDEX idx_provider_variant ON provider_product_mappings(provider_id, product_variant_id);
CREATE UNIQUE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_payment_expires ON orders(payment_expires_at) WHERE payment_status = 'WAITING_PAYMENT';
CREATE INDEX idx_provider_tx_order ON provider_transactions(order_id, attempt);
CREATE INDEX idx_ledger_agent_created ON ledger_entries(agent_id, created_at);
CREATE INDEX idx_card_records_order_item ON card_records(order_item_id);
```

---

## Status Flows

### payment_status (orders)

```
WAITING_PAYMENT → PAID | FAILED | EXPIRED
PAID → REFUNDED (manual only)
```

Payment expiration: cron job marks `WAITING_PAYMENT` → `EXPIRED` after configurable timeout (default 15 min). See `03_PAYMENT.md`.

### fulfillment_status

```
PENDING → PROCESSING → COMPLETED
PENDING → PROCESSING → FAILED
PENDING → PROCESSING → WAITING_ADMIN_RETRY → PROCESSING → COMPLETED
```

### transaction.status (agent)

```
PENDING → HOLD → COMPLETED (HOLD → DEBIT)
PENDING → HOLD → RELEASED (HOLD → RELEASE)
```

### agent_kyc.status

```
PENDING → SUBMITTED → APPROVED | REJECTED
```

---

## Table Inventory (30 tables)

| # | Table | Phase |
|---|-------|-------|
| 1 | users | 1–2 |
| 2 | password_reset_tokens | 2 |
| 3 | email_verification_tokens | 2 |
| 4 | agents | 1, 8 |
| 5 | agent_kyc | 2, 8 |
| 6 | agent_product_prices | 3, 8 |
| 7 | agent_webhook_configs | 8 |
| 8 | product_categories | 3 |
| 9 | products | 3 |
| 10 | product_variants | 3 |
| 11 | provider_product_mappings | 3, 5 |
| 12 | providers | 1, 5 |
| 13 | payment_gateways | 4 |
| 14 | transactions | 1, 8 |
| 15 | orders | 1, 4, 6 |
| 16 | order_items | 1, 4, 6 |
| 17 | card_records | 1, 6 |
| 18 | topup_transactions | 1, 6 |
| 19 | payments | 1, 4 |
| 20 | ledger_entries | 1, 8 |
| 21 | provider_transactions | 1, 5 |
| 22 | webhook_logs | 1, 4 |
| 23 | invoices | 11 |
| 24 | audit_logs | 7 |
| 25 | reconcile_reports | 10 |
| 26 | reconcile_items | 10 |
| 27 | notifications | 7 |
| 28 | cms_pages | 12 |
| 29 | cms_seo | 12 |
| 30 | cms_banners | 12 |

---

## Related Docs

- [14_AUTH_RBAC.md](./14_AUTH_RBAC.md) — auth flows (schema merged here)
- [15_PRODUCT_ENGINE.md](./15_PRODUCT_ENGINE.md) — pricing & routing logic
- [16_B2C_CHECKOUT_FLOW.md](./16_B2C_CHECKOUT_FLOW.md) — checkout flows
- [17_QUEUE_REGISTRY.md](./17_QUEUE_REGISTRY.md) — BullMQ queues
