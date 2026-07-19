# CardOn — Master Database Review

**Review date:** 2026-06-18 | **Source:** `prisma/schema.prisma`, `prisma/migrations/`

---

## Summary

| Metric | Count |
|--------|-------|
| Models | **56** |
| Enums | **66** |
| Migrations | **37** |
| Database | PostgreSQL 16 |

---

## Model Inventory by Domain

### Auth & RBAC (6)
`User`, `Permission`, `RolePermission`, `RefreshToken`, `PasswordResetToken`, `EmailVerificationToken`

### Agent B2B (6)
`Agent`, `AgentKyc`, `AgentInvite`, `AgentDeposit`, `AgentProductPrice`, `AgentWebhookConfig`

### Product Catalog (4)
`ProductCategory`, `Product`, `ProductVariant`, `ProviderProductMapping`

### Provider (8)
`Provider`, `ProviderBalance`, `ProviderTransaction`, `ProviderLog`, `ProviderCostHistory`, `ProviderHealthMetric`, `ProviderRuntimeSetting`, `ProviderReconciliationReport`

### Order & Fulfillment (8)
`FinancialTransaction` (table: `transactions`), `Order`, `OrderItem`, `CardRecord`, `CardAccessLog`, `OrderEvent`, `TopupTransaction`

### Payment (2)
`PaymentGateway`, `Payment`

### Finance (5)
`LedgerEntry`, `Invoice`, `PaymentGatewayInvoice`, `ReconcileReport`, `ReconcileItem`

### Webhook (1)
`WebhookLog`

### System (4)
`SystemSetting`, `Notification`, `AuditLog`, `SystemAuditLog`, `SystemActivityLog`, `SystemNotification`

### CMS (8)
`CmsPage`, `CmsCategory`, `CmsTag`, `CmsPageTag`, `CmsMedia`, `CmsSeo`, `CmsBanner`, `EmailTemplate`

### Support (3)
`ContactMessage`, `SupportTicket`, `SupportTicketMessage`

---

## Key Schema Patterns (Verified)

### Order model
- Dual status: `paymentStatus` + `fulfillmentStatus`
- Channel: `B2C` | `AGENT`
- Agent idempotency: `@@unique([agentId, agentRequestId])`
- Rich pricing fields: faceValue, sellAmount, providerCost, profit
- `clientTrace` JSON for IP/UA capture

### Agent financial model
- `Agent.balance` + `Agent.heldBalance` (wallet + hold)
- `LedgerEntry` types: CREDIT, DEBIT, HOLD, RELEASE
- `AgentDeposit` links to gateway payments and ledger credit

### Provider model
- `ProviderTransaction` per attempt with `attempt`, `requestId` unique
- `ProviderRuntimeSetting` for eSale runtime config
- Soft delete on several provider tables (`deletedAt`)

---

## Indexes & Constraints

**Strengths:**
- Order: indexes on paymentStatus, fulfillmentStatus, agentRequestId composite unique
- Ledger: `[agentId, createdAt]`, `[referenceType, referenceId]`
- WebhookLog: paymentReference, source, createdAt
- SystemActivityLog: eventType, category, createdAt

**Gaps:**
- No dedicated index on `Order.agentId + createdAt` (common partner query — may use agentId filter)
- `CardAccessLog.cardId` — no FK to `CardRecord`
- Full-text search not indexed (partner fuzzy search uses ILIKE)

---

## Enums (Notable)

| Enum | Values count | Usage |
|------|-------------|-------|
| UserRole | 7 | Admin RBAC |
| FulfillmentStatus | 6 | Order lifecycle |
| OrderPaymentStatus | 6 | Payment state |
| PaymentRecordStatus | 5 | Payment records |
| ProviderTransactionStatus | 5 | incl. TIMEOUT |
| LedgerEntryType | 4 | Wallet operations |
| WebhookSource | 5 | MEGAPAY, SEPAY, PROVIDER, PARTNER, INTERNAL |
| SystemActivityEventType | 30+ | Monitoring |

---

## Migration History

- **Init:** `20250618100000_init_cardon_schema`
- **Latest:** `20250628160000_phase_6033_3_agent_deposit`
- **6033.x migrations:** Agent deposit, platform-related schema (no 6033.4 migration — aggregation only)

---

## Table Classification

### Core production tables (actively used)
Orders, Payments, Agents, LedgerEntries, ProviderTransactions, Products, Users, SystemActivityLog, SystemAuditLog, WebhookLog, AgentDeposit

### Legacy / dual-system tables
| Table | Status | Notes |
|-------|--------|-------|
| `AuditLog` | Legacy | Auth events; parallel to SystemAuditLog |
| `Notification` | Legacy | User notifications; parallel to SystemNotification |
| `notifications` (old) | Active for account | Not deprecated in code |

### Missing tables (documented/planned, not in schema)
| Planned | Referenced in |
|---------|---------------|
| `agent_webhook_deliveries` | 6033.4 doc future |
| Agent team members | Partner users UI |
| Promotion rules | Marketing roadmap |
| Settlement cycles | Finance docs |

### Temporary / staging patterns
- None explicit; `ReconcileReport` + `ReconcileItem` serve staging reconciliation

---

## Naming Issues

| Issue | Detail |
|-------|--------|
| `FinancialTransaction` → `transactions` table | Non-obvious mapping |
| `transactions` vs `provider_transactions` | Similar names, different domains |
| `Notification` vs `SystemNotification` | Confusing for developers |

---

## Schema vs Business Rules

| Rule (docs) | Schema reality | Discrepancy |
|-------------|----------------|-------------|
| Ledger append-only | `deletedAt`, `updatedAt` on LedgerEntry | Yes |
| Agent webhook delivery log | No table | Missing |
| Partner team roles | No AgentMember model | Missing |
| PIN access audit | CardAccessLog exists | OK |

---

## Recommendations (documentation only — no migrations in this review)

1. Add migration for Phase 6 admin permissions (data seed, not schema)
2. Plan `agent_webhook_deliveries` when outbound webhook engine is built
3. Plan `AgentMember` + `AgentMemberRole` for partner RBAC
4. Consider index `orders(agent_id, created_at DESC)` for partner list queries
5. Deprecation plan for `AuditLog` → `SystemAuditLog` migration
6. Resolve LedgerEntry soft-delete fields vs append-only policy

---

## Unused / Low-traffic Models (inferred)

| Model | Evidence |
|-------|----------|
| `AgentInvite` | Schema exists; invite flow partial |
| `ProviderReconciliationReport` | Admin finance; may be low volume |
| `PaymentGatewayInvoice` | Gateway billing; partial UI |
| `EmailTemplate` | Admin UI; delivery pipeline unclear |

No tables identified as completely orphaned — all have module references or FK relations.
