# Admin Panel

## Overview

The admin panel is the internal operations interface for managing CardOn.vn. Built with Next.js (frontend) consuming NestJS API (backend).

```
Admin UI (Next.js)
    ↓
Admin API (NestJS Controllers)
    ↓
AdminService | OrderService | FulfillmentService | ...
    ↓
Repository
    ↓
Database
```

All admin actions go through Service layer — no direct database access from frontend.

## Role-Based Access Control (RBAC)

> **Canonical RBAC:** See [14_AUTH_RBAC.md](./14_AUTH_RBAC.md). Roles: SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN.

Admin roles: `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `SUPPORT`, `MARKETING`.

| Module | SUPPORT | MARKETING | ACCOUNTANT | ADMIN | SUPER_ADMIN |
|--------|---------|-----------|------------|-------|-------------|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Orders (view) | ✓ | — | ✓ | ✓ | ✓ |
| Orders (retry) | ✓ | — | — | ✓ | ✓ |
| Products (view) | ✓ | — | ✓ | ✓ | ✓ |
| Products (edit) | — | — | — | ✓ | ✓ |
| Providers (view) | ✓ | — | — | ✓ | ✓ |
| Providers (config) | — | — | — | ✓ | ✓ |
| Agents (view) | ✓ | — | ✓ | ✓ | ✓ |
| Agents (topup) | — | — | ✓ | ✓ | ✓ |
| Agents (KYC approve) | — | — | — | ✓ | ✓ |
| Ledger (view) | — | — | ✓ | ✓ | ✓ |
| Ledger (adjust) | — | — | — | — | ✓ |
| Reconciliation | — | — | ✓ | ✓ | ✓ |
| Invoices | — | — | ✓ | ✓ | ✓ |
| Users (manage) | — | — | — | ✓ | ✓ |
| SEO / CMS | — | ✓ | — | ✓ | ✓ |
| System config | — | — | — | — | ✓ |

RBAC enforced in backend via guards — frontend hides UI elements but backend is the authority.

## Dashboard

Real-time operational overview:

| Widget | Data Source |
|--------|------------|
| Today's orders | orders (created_at = today) |
| Revenue today | payments (SUCCESS, today) |
| Pending fulfillment | orders (fulfillment_status = WAITING_ADMIN_RETRY) |
| Provider balances | providers.balance (last synced) |
| Agent total balance | SUM(agents.balance) |
| Failed orders (24h) | orders (fulfillment_status = FAILED) |

Alert badges for items requiring admin action.

## Order Management

### Order List

Filters:

- `payment_status`: PENDING, PAID, FAILED, REFUNDED
- `fulfillment_status`: PENDING, PROCESSING, COMPLETED, FAILED, WAITING_ADMIN_RETRY
- Date range, order_code, agent, product

### Order Detail

- Order info, channel (B2C/AGENT), statuses
- Payment info via `orders.payment_id → payments` (B2C)
- Transaction + ledger HOLD/DEBIT/RELEASE trail (Agent)
- Provider transaction attempts (1:N, with attempt number)
- order_items → card_records (PIN masked) or topup_transactions
- Fulfillment timeline from `audit_logs`

### Manual Retry

For orders with `fulfillment_status = WAITING_ADMIN_RETRY`:

```
Admin clicks "Retry Fulfillment"
    ↓
FulfillmentService.retry(orderId, adminId)
    ↓
New request_id generated
    ↓
Job pushed to fulfillment-retry queue
    ↓
Audit log: admin, action, timestamp
```

Requires role SUPPORT or above.

### Manual Refund

Refund is **manual only** — never automatic on provider failure.

```
Admin clicks "Refund"
    ↓
AdminService.refundOrder(orderId, adminId, reason)
    ↓
Validate: payment_status = PAID
    ↓
Initiate gateway refund (PaymentService)
    ↓
Update payment_status = REFUNDED
    ↓
Audit log
```

Requires role ADMIN or above.

## Product Management

```
Admin Panel → Products
    ↓
ProductService (CRUD)
    ↓
ProductRepository
```

| Action | Description |
|--------|-------------|
| Create product | Bind to provider, set SKU, prices |
| Edit product | Update name, prices, status |
| Sync from provider | Trigger ProviderInterface.syncProduct() |
| Assign provider | Change products.provider_id |

Product sync runs via queue — not inline in admin request.

## Provider Management

### Provider Dashboard

- Current balance (last synced)
- Last sync timestamp
- Active product count
- Recent error count

### Provider Actions

| Action | Description |
|--------|-------------|
| Sync balance | Trigger getBalance() via queue |
| Sync products | Trigger syncProduct() via queue |
| View transactions | List provider_transactions |
| Edit credentials | Update encrypted api_credentials |

**Low balance warning displayed but selling is NOT disabled.**

## Agent Management

### Agent List

- Company name, balance, status, order count
- API key status (active/regenerate)

### Agent Actions

| Action | Role | Description |
|--------|------|-------------|
| Topup balance | ACCOUNTANT+ | LedgerService.credit() |
| Suspend | ADMIN+ | Set status SUSPENDED, invalidate API key |
| View ledger | ACCOUNTANT+ | Paginated ledger_entries |
| Regenerate API key | ADMIN+ | New bcrypt hash; **plain key shown once** |
| Configure webhook | ADMIN+ | `agent_webhook_configs` |
| View orders | SUPPORT+ | Agent order history |

## User Management

ADMIN and SUPER_ADMIN can:

- Create staff/accountant/admin accounts
- Assign roles
- Suspend/ban users
- Reset passwords

SUPER_ADMIN exclusive:

- System configuration
- Ledger manual adjustment
- Provider credential management

## Audit Log

All admin actions recorded:

| Field | Description |
|-------|-------------|
| admin_id | Who performed action |
| action | RETRY_FULFILLMENT, REFUND, TOPUP, SUSPEND, etc. |
| target_type | ORDER, AGENT, PRODUCT, USER |
| target_id | Entity ID |
| metadata | JSONB — previous/new values |
| created_at | Timestamp |

Audit logs are immutable. Required for compliance and dispute resolution.

## Notification Center

Admin alerts for operational events:

| Event | Priority | Recipient |
|-------|----------|-----------|
| Order WAITING_ADMIN_RETRY | High | SUPPORT, ADMIN |
| Provider balance low | Medium | ADMIN |
| Reconciliation mismatch | High | ACCOUNTANT |
| Agent balance mismatch | Critical | ACCOUNTANT, SUPER_ADMIN |
| Failed fulfillment | High | SUPPORT |

Delivered via in-app notification and optional email/webhook.

## API Structure

All admin endpoints prefixed with `/admin/api/v1/`:

```
/admin/api/v1/orders
/admin/api/v1/orders/:id/retry
/admin/api/v1/products
/admin/api/v1/providers
/admin/api/v1/agents
/admin/api/v1/agents/:id/topup
/admin/api/v1/reconciliation
/admin/api/v1/invoices
/admin/api/v1/users
/admin/api/v1/audit-logs
```

Authenticated via JWT with role claims. Guards validate role on every request.

## Related Docs

- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md)
- [09_RECONCILIATION.md](./09_RECONCILIATION.md)
- [13_SEO_CMS.md](./13_SEO_CMS.md)
