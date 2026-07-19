# Phase 1A — Database Foundation Report

> Date: 2026-06-18  
> Scope: Prisma schema only (no API, services, frontend, admin UI)  
> Source: `docs/02_DATABASE_SCHEMA.md`, `docs/FINAL_ARCHITECTURE_CHECK.md`

---

## Validation Result

```bash
npx prisma validate
# Equivalent executed: node node_modules/prisma/build/index.js validate
```

| Check | Result |
|-------|--------|
| Prisma schema syntax | **PASS** |
| Relation integrity | **PASS** |
| PostgreSQL provider | **PASS** |
| Environment | `.env` loaded from `.env.example` |

**Verdict: Schema is valid.**

---

## Model Count

| Metric | Count |
|--------|------:|
| Prisma models | **34** |
| Mapped DB tables | **34** |
| Enums | **40** |
| Canonical tables in `02_DATABASE_SCHEMA.md` | 30 |
| Phase 1A extensions | +4 |

### Domain Inventory

| Domain | Models | Tables |
|--------|--------|--------|
| **AUTH** | User, Permission, RolePermission, RefreshToken, PasswordResetToken | users, permissions, role_permissions, refresh_tokens, password_reset_tokens |
| **PRODUCT** | ProductCategory, Product, ProductVariant, ProviderProductMapping | product_categories, products, product_variants, provider_product_mappings |
| **ORDER** | Order, OrderItem, CardRecord, TopupTransaction, FinancialTransaction | orders, order_items, card_records, topup_transactions, transactions |
| **PAYMENT** | Payment, PaymentGateway, WebhookLog | payments, payment_gateways, webhook_logs |
| **PROVIDER** | Provider, ProviderTransaction, ProviderLog | providers, provider_transactions, provider_logs |
| **AGENT** | Agent, AgentKyc, AgentProductPrice, AgentWebhookConfig | agents, agent_kyc, agent_product_prices, agent_webhook_configs |
| **FINANCE** | LedgerEntry, Invoice, ReconcileReport, ReconcileItem | ledger_entries, invoices, reconcile_reports, reconcile_items |
| **CMS** | CmsPage, CmsSeo, CmsBanner | cms_pages, cms_seo, cms_banners |
| **SYSTEM** | Notification, AuditLog | notifications, audit_logs |

### Extensions vs `02_DATABASE_SCHEMA.md`

| Model | Reason |
|-------|--------|
| `Permission` + `RolePermission` | RBAC permission matrix (`14_AUTH_RBAC.md`) |
| `RefreshToken` | Server-side refresh token storage |
| `ProviderLog` | Provider request/response audit trail (Phase 1A task) |
| `EmailVerificationToken` | Already in canonical schema doc |

### Roles (`roles` table)

No separate `roles` table. Architecture uses:

- `UserRole` enum on `users.role`
- `role_permissions` junction (`RolePermission`) mapping `UserRole` → `Permission`

This matches `FINAL_ARCHITECTURE_CHECK.md` and avoids duplicating role data.

---

## Relation Check

| Required relation | Implementation | Status |
|-------------------|----------------|--------|
| Order → User (optional) | `Order.userId` → `User` | ✅ |
| Order → Payment (optional) | `Order.paymentId` → `Payment` | ✅ |
| Order → OrderItems | `Order.orderItems` | ✅ |
| OrderItem → CardRecords | `OrderItem.cardRecords` | ✅ |
| Provider → ProviderTransactions | `Provider.providerTransactions` | ✅ |
| Agent → LedgerEntries | `Agent.ledgerEntries` | ✅ |
| Agent → API configs | `Agent.webhookConfig` (`AgentWebhookConfig`) | ✅ |
| Agent → KYC | `Agent.kyc` (`AgentKyc`) | ✅ |
| ProductVariant → many Providers | via `ProviderProductMapping` | ✅ |

### Additional key relations (from architecture)

| Relation | Status |
|----------|--------|
| User 1:1 Agent | ✅ |
| Order 1:N Payment (active via `payment_id`) | ✅ |
| Order 1:N ProviderTransaction (retries) | ✅ |
| FinancialTransaction 1:0..1 Order | ✅ |
| ProductCategory self-referential tree | ✅ |
| CmsPage 1:1 CmsSeo | ✅ |

---

## Index & Constraint Check

### Required indexes (Phase 1A task)

| Requirement | Schema | Status |
|-------------|--------|--------|
| `payments.payment_reference` | `@unique` + `@@index([paymentReference])` | ✅ |
| `provider_transactions.provider_reference` | `@@index([providerReference])` | ✅ |
| `(agent_id, agent_request_id)` | `@@unique([agentId, agentRequestId])` on Order | ✅ |
| `orders.order_code` | `@unique` + `@@index([orderCode])` | ✅ |

### Idempotency unique constraints

| Field | Model | Status |
|-------|-------|--------|
| `payment_reference` | Payment | ✅ `@unique` |
| `request_id` | ProviderTransaction | ✅ `@unique` |
| `provider_transaction_id` | ProviderTransaction | ✅ `@unique` |
| `transaction_id` | FinancialTransaction | ✅ `@unique` |
| `(agent_id, agent_request_id)` | Order | ✅ `@@unique` |
| `order_code` | Order | ✅ `@unique` |

### External ID indexes

| Field | Model | Index |
|-------|-------|-------|
| `provider_reference` | ProviderTransaction | ✅ |
| `provider_reference` | TopupTransaction | ✅ |
| `payment_reference` | WebhookLog | ✅ |
| `reference` | ReconcileItem | ✅ |
| `sku` | ProductVariant | ✅ `@unique` |
| `code` | Provider, PaymentGateway | ✅ `@unique` |

### Indexes deferred to Phase 1B (partial / SQL-only)

These are documented in `02_DATABASE_SCHEMA.md` but cannot be expressed in Prisma schema DSL:

```sql
-- Partial index: guest orders only
CREATE INDEX idx_orders_guest_email ON orders(guest_email) WHERE is_guest_order = true;

-- Partial index: waiting payment only
CREATE INDEX idx_orders_payment_expires ON orders(payment_expires_at)
  WHERE payment_status = 'WAITING_PAYMENT';
```

Add via raw SQL in first migration (`Phase 1B`).

---

## Database Rules Compliance

| Rule | Status |
|------|--------|
| PostgreSQL | ✅ `provider = "postgresql"` |
| UUID primary keys | ✅ `@id @default(uuid()) @db.Uuid` |
| Money as `Decimal(18,2)` | ✅ All monetary fields |
| No float for money | ✅ |
| Status fields as Enum | ✅ All status/type fields |
| External IDs indexed | ✅ See table above |
| Idempotency keys unique | ✅ See table above |

---

## Security Fields

| Rule | Field | Model | Status |
|------|-------|-------|--------|
| No plain API key | `apiKeyHash` | Agent | ✅ bcrypt hash |
| No plain card PIN | `encryptedPin` | CardRecord | ✅ |
| No plain serial | `encryptedSerial` | CardRecord | ✅ |
| Webhook secret encrypted | `secretKeyEncrypted` | Agent | ✅ |
| Gateway config encrypted | `configEncrypted` | PaymentGateway | ✅ |
| Provider credentials encrypted | `apiCredentials` | Provider | ✅ |
| Token hashing | `tokenHash` | RefreshToken, PasswordResetToken, EmailVerificationToken | ✅ |

**No plain-text sensitive fields present.**

---

## Enum List (40)

| # | Enum | Values |
|---|------|--------|
| 1 | UserRole | CUSTOMER, AGENT, SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN |
| 2 | UserStatus | ACTIVE, SUSPENDED, BANNED |
| 3 | AgentStatus | ACTIVE, SUSPENDED |
| 4 | AgentKycStatus | PENDING, SUBMITTED, APPROVED, REJECTED |
| 5 | AgentProductPriceStatus | ACTIVE, INACTIVE |
| 6 | ProductCategoryStatus | ACTIVE, INACTIVE |
| 7 | CatalogProductStatus | ACTIVE, INACTIVE |
| 8 | ProductVariantType | CARD, TOPUP, DATA, SOFTWARE |
| 9 | ProductVariantStatus | ACTIVE, INACTIVE |
| 10 | ProviderProductMappingStatus | ACTIVE, INACTIVE |
| 11 | ProviderStatus | ACTIVE, INACTIVE |
| 12 | PaymentGatewayStatus | ACTIVE, INACTIVE |
| 13 | FinancialTransactionType | AGENT_ORDER, B2C_CHECKOUT, ADMIN_TOPUP |
| 14 | FinancialTransactionStatus | PENDING, HOLD, COMPLETED, RELEASED, FAILED |
| 15 | OrderChannel | B2C, AGENT |
| 16 | OrderPaymentStatus | WAITING_PAYMENT, PAID, FAILED, EXPIRED, REFUNDED |
| 17 | FulfillmentStatus | PENDING, PROCESSING, COMPLETED, FAILED, WAITING_ADMIN_RETRY |
| 18 | OrderItemStatus | PENDING, PROCESSING, COMPLETED, FAILED, PARTIAL |
| 19 | CardRecordStatus | PENDING, DELIVERED, FAILED |
| 20 | TopupTransactionStatus | PENDING, SUCCESS, FAILED |
| 21 | PaymentGatewayCode | MEGAPAY, SEPAY |
| 22 | PaymentRecordStatus | PENDING, SUCCESS, FAILED, EXPIRED |
| 23 | LedgerEntryType | CREDIT, DEBIT, HOLD, RELEASE |
| 24 | LedgerReferenceType | TRANSACTION, ORDER, TOPUP, REFUND, ADJUSTMENT |
| 25 | ProviderTransactionAction | BUY_CARD, TOPUP, CHECK |
| 26 | ProviderTransactionStatus | PENDING, SUCCESS, FAILED, TIMEOUT |
| 27 | WebhookSource | MEGAPAY, SEPAY |
| 28 | InvoiceType | B2C_RECEIPT, AGENT_STATEMENT, AGENT_TOPUP_RECEIPT, MONTHLY_SUMMARY |
| 29 | InvoiceStatus | DRAFT, ISSUED, VOID |
| 30 | AuditTargetType | ORDER, AGENT, PRODUCT, USER, INVOICE |
| 31 | ReconcileDomain | PAYMENT, PROVIDER, LEDGER, ORDER_REVENUE |
| 32 | ReconcileReportStatus | PENDING, COMPLETED, FAILED |
| 33 | ReconcileMatchStatus | MATCHED, MISSING_LOCAL, MISSING_GATEWAY, AMOUNT_MISMATCH, STATUS_MISMATCH |
| 34 | ReconcileResolution | OPEN, RESOLVED, IGNORED |
| 35 | NotificationRecipientType | USER, AGENT, ADMIN_ROLE |
| 36 | NotificationRecipientRole | SUPPORT, MARKETING, ACCOUNTANT, ADMIN |
| 37 | CmsPageType | PAGE, PRODUCT_LANDING, BLOG_POST |
| 38 | CmsPageStatus | DRAFT, PUBLISHED, ARCHIVED |
| 39 | CmsBannerPosition | HOME_HERO, HOME_SIDEBAR, CATEGORY_TOP |
| 40 | CmsBannerStatus | ACTIVE, INACTIVE |

---

## Warnings & Notes

| # | Severity | Item |
|---|----------|------|
| 1 | Info | **`roles` table omitted** — `UserRole` enum + `role_permissions` per architecture docs |
| 2 | Phase 1B | **Partial indexes** (guest email, payment expiry) require raw SQL in migration |
| 3 | Phase 1B | **CHECK constraint** `is_guest_order → guest_email NOT NULL AND user_id IS NULL` — enforce in migration or service layer |
| 4 | Info | **`@@unique([agentId, agentRequestId])`** — PostgreSQL allows multiple rows with `NULL` agent_request_id (B2C orders); idempotency applies only when both values are set |
| 5 | Info | **`provider_reference`** added on `provider_transactions` (Phase 1A index requirement); not listed in `02` table columns but supports reconciliation |
| 6 | Info | **`health_score`** uses `Decimal(18,4)` for routing precision (non-money field) |
| 7 | Info | **`FinancialTransaction`** mapped to table `transactions` to avoid SQL reserved word |
| 8 | Env | **Node.js/npm not in system PATH** — validation ran via Cursor bundled Node; run `npm install && npx prisma validate` after installing Node.js locally |
| 9 | Stop | **Phase 1B not started** — no migrations, no seed, no `@prisma/client` generate |

---

## Files Created (Phase 1A)

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Full database schema |
| `package.json` | Prisma dependencies |
| `.env.example` | DATABASE_URL template |
| `.gitignore` | node_modules, .env, .tools |
| `docs/PHASE_1A_DATABASE_REPORT.md` | This report |

---

## Sign-Off

| Check | Result |
|-------|--------|
| All required domains modeled | ✅ |
| Architecture decisions applied | ✅ |
| `prisma validate` | ✅ PASS |
| Phase 1B scope excluded | ✅ STOP |

**Phase 1A complete. Ready for Phase 1B (migrations) when approved.**
