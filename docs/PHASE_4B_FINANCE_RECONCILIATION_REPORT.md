# Phase 4B — Finance & Reconciliation Core

> Date: 2026-06-19  
> Scope: Finance backend APIs (`src/modules/finance/`) — reconciliation, profit, agent statement, invoice foundation, CSV export  
> Not included: Frontend, real tax authority API, accounting export integration

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:finance` | **PASS (12/12)** |
| Tasks completed | **11/11** |

---

## Module Structure

```
src/modules/finance/
├── controllers/finance.controller.ts
├── services/
│   ├── payment-reconcile.service.ts
│   ├── provider-reconcile.service.ts
│   ├── reconcile-report.service.ts
│   ├── profit.service.ts
│   ├── agent-statement.service.ts
│   ├── invoice.service.ts
│   ├── export.service.ts
│   └── finance-audit.service.ts
├── repositories/finance.repository.ts
├── dto/finance.dto.ts
├── entities/
│   ├── finance.constants.ts
│   └── reconcile.engine.ts
├── finance.module.ts
└── finance.service.spec.ts
```

Prefix: **`/api/v1/admin/finance/*`**

Auth: `JwtAuthGuard` + `PermissionsGuard`

---

## Deliverables

### TASK 1: Finance Module

**DONE** — `FinanceModule` wired in `AppModule`.

### TASK 2: Payment Reconciliation

`POST /admin/finance/reconcile/payment` — permission: `finance.manage`

Supports **MegaPay** and **SePay** (`PaymentGatewayCode`).

Compares gateway report lines vs internal `payments`:

| Check | Field |
|-------|-------|
| Amount | `payment.amount` vs gateway `amount` |
| Status | `SUCCESS` / `FAILED` mapping |
| Transaction ID | `gatewayResponse.gatewayTransactionId` or `paymentReference` |
| Time | Calendar day match on `paidAt` vs `occurredAt` |

Status labels:

| Label | Schema enum |
|-------|-------------|
| `MATCHED` | `MATCHED` |
| `MISMATCH` | `AMOUNT_MISMATCH` / `STATUS_MISMATCH` |
| `MISSING_GATEWAY` | `MISSING_GATEWAY` |
| `MISSING_INTERNAL` | `MISSING_LOCAL` |

### TASK 3: Provider Reconciliation

`POST /admin/finance/reconcile/provider` — permission: `finance.manage`

Supports **eSale** (and any provider by `providerCode`).

Compares provider report vs `provider_transactions`:

| Check | Source |
|-------|--------|
| Transaction ID | `requestId` / `providerTransactionId` |
| Quantity | `requestPayload.quantity` |
| Cost | `quantity × provider_product_mappings.provider_cost` |
| Status | `SUCCESS` vs report status |

### TASK 4: Reconcile Reports

Uses existing tables: `reconcile_reports`, `reconcile_items`.

| Field | Value |
|-------|-------|
| `domain` | `PAYMENT` or `PROVIDER` |
| `summary` | `{ type, total, matched, mismatch }` |
| `totalMatched` / `totalMismatch` | Aggregated counts |

Endpoints:

| Method | Path | Permission |
|--------|------|------------|
| GET | `/reconcile/reports` | `finance.view` |
| GET | `/reconcile/reports/:id` | `finance.view` |

### TASK 5: Profit Calculation

`GET /admin/finance/profit` — permission: `finance.view`

```
Gross profit = Revenue (PAID orders) − Provider cost (mapping × quantity)
```

Filters: `dateFrom`, `dateTo`, optional `productId`, `providerId`.

### TASK 6: Agent Statement

`GET /admin/finance/agents/:agentId/statement` — permission: `finance.view`

Source: **`ledger_entries` only**

Returns:

- Opening balance (last entry before period or first entry `beforeBalance`)
- Credits / Debits / Holds / Releases summary
- Closing balance
- Full entry list for period

### TASK 7: Invoice Foundation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/invoices/customer` | B2C receipt from PAID order |
| POST | `/invoices/agent` | Agent top-up receipt from CREDIT ledger entry |
| POST | `/invoices/:id/issue` | DRAFT → ISSUED |
| POST | `/invoices/:id/void` | → VOID |
| GET | `/invoices` | List |
| GET | `/invoices/:id` | Detail |

Statuses: `DRAFT`, `ISSUED`, `VOID`

No tax authority connection — `taxAmount = 0`, metadata only.

Invoice types: `B2C_RECEIPT`, `AGENT_TOPUP_RECEIPT`

### TASK 8: Export Foundation

CSV export service — permission: `finance.manage`

| Method | Path | Output |
|--------|------|--------|
| GET | `/export/reconciliation/:reportId` | Reconcile items CSV |
| GET | `/export/profit` | Profit metrics CSV |
| GET | `/export/agents/:agentId/statement` | Agent statement CSV |

No external accounting integration.

### TASK 9: Permissions

New permissions (seed):

| Code | Description |
|------|-------------|
| `finance.view` | View reports, profit, statements, invoices |
| `finance.manage` | Create reconcile, invoices, exports |

| Role | Access |
|------|--------|
| **ACCOUNTANT** | `finance.view`, `finance.manage` |
| **ADMIN** | `finance.view`, `finance.manage` (+ all admin perms) |
| **SUPER_ADMIN** | All permissions |

### TASK 10: Audit

| Action | When |
|--------|------|
| `RECONCILE_CREATED` | Payment or provider reconcile report saved |
| `INVOICE_CREATED` | Customer or agent invoice created |
| `INVOICE_VOIDED` | Invoice voided |

### TASK 11: Tests

`finance.service.spec.ts` — 12 tests:

- Payment reconcile matched
- Payment amount mismatch
- Provider quantity mismatch
- Profit calculation
- Agent statement balance (ledger-only)
- Invoice create + unpaid rejection
- Permission denied (SUPPORT vs `finance.manage`)
- Audit action constants

Run:

```powershell
npm run build
npm run test:finance
```

---

## API Summary

| Method | Path | Permission |
|--------|------|------------|
| POST | `/admin/finance/reconcile/payment` | `finance.manage` |
| POST | `/admin/finance/reconcile/provider` | `finance.manage` |
| GET | `/admin/finance/reconcile/reports` | `finance.view` |
| GET | `/admin/finance/reconcile/reports/:id` | `finance.view` |
| GET | `/admin/finance/profit` | `finance.view` |
| GET | `/admin/finance/agents/:agentId/statement` | `finance.view` |
| GET | `/admin/finance/invoices` | `finance.view` |
| GET | `/admin/finance/invoices/:id` | `finance.view` |
| POST | `/admin/finance/invoices/customer` | `finance.manage` |
| POST | `/admin/finance/invoices/agent` | `finance.manage` |
| POST | `/admin/finance/invoices/:id/issue` | `finance.manage` |
| POST | `/admin/finance/invoices/:id/void` | `finance.manage` |
| GET | `/admin/finance/export/reconciliation/:reportId` | `finance.manage` |
| GET | `/admin/finance/export/profit` | `finance.manage` |
| GET | `/admin/finance/export/agents/:agentId/statement` | `finance.manage` |

---

## Design Notes

1. **Reconcile engine** (`reconcile.engine.ts`) is pure — unit-tested without DB.
2. **Payment reconcile input** accepts gateway CSV-equivalent JSON body (admin uploads parsed rows).
3. **Provider cost** for profit/reconcile derived from `provider_product_mappings.provider_cost × quantity`.
4. **Invoice numbers** format: `INV-YYYYMMDD-NNNN` (daily sequence).
5. **Tax provider** intentionally not connected — foundation only.

---

## Out of Scope (per instruction)

- Frontend admin UI
- Real tax authority API
- External accounting export (QuickBooks, MISA, etc.)

---

## Next Phase

**Do not start frontend.** Phase 4B complete — ready for owner review.
