# BUILD 6034.2 — AGENT STATEMENT & INVOICE CENTER

**Build label:** `6034.2 AGENT STATEMENT & INVOICE CENTER`

## Scope

Per-agent B2B reconciliation inside **Admin → Đại lý → Chi tiết đại lý** (tabs **Sao kê** / **Hóa đơn**). Not Finance company reports, not Operations, not Provider Settlement.

## Architecture

```
Order (AGENT channel)
        ↓ aggregation
AdminAgentStatementCenterService
        ↓
AgentStatement / AgentStatementAdjustment
        ↓
FinanceRepository.createInvoice (type AGENT_STATEMENT)
        ↓
Invoice (linked to agent + statement)
```

- **No engine rewrites** — Order, Payment, Ledger, Provider, Webhook unchanged.
- **Aggregation only** — reads orders, writes statement/adjustment records, delegates invoicing to existing finance layer.

## Statement lifecycle

| Status   | Meaning                                      |
|----------|----------------------------------------------|
| DRAFT    | Generated; orders/adjustments can still apply  |
| LOCKED   | Monthly close; no automatic order changes    |
| INVOICED | Invoice created from locked statement        |
| PAID     | Payment status updated (read-only tracking)  |

Late orders after lock roll to the **next** period unless corrected via manual adjustment.

## Invoice lifecycle

1. Statement **LOCKED**
2. **POST** `statements/:id/invoice` → `Invoice` type `AGENT_STATEMENT`
3. Statement status → **INVOICED**
4. Payment status: UNPAID | PARTIAL | PAID | CANCELLED | OVERDUE (foundation, read-only)

## Adjustment flow

- Fields: amount (+/-), reason, createdBy, createdAt
- Permissions: `finance.manage` (FINANCE, ADMIN, SUPER_ADMIN)
- SUPPORT: read-only; MARKETING: no access
- Positive wallet credits use `LedgerService.credit` with reference `ADJUSTMENT`
- Every change → Activity Log + Audit Log

## Aggregation APIs

Base: `/api/v1/admin/agent-center/agents/:agentId`

| Method | Route | Permission |
|--------|-------|------------|
| GET | `statement-center/dashboard` | `finance.view` |
| GET | `statements` | `finance.view` |
| GET | `statements/:id` | `finance.view` |
| GET | `statements/export` | `finance.manage` |
| GET | `statement-orders` | `finance.view` |
| POST | `statements/generate` | `finance.manage` |
| POST | `statements/:id/lock` | `finance.manage` |
| POST | `statements/:id/invoice` | `finance.manage` |
| GET/POST | `adjustments` | view / manage |
| GET | `invoices`, `invoices/:id` | `finance.view` |

## RBAC

| Role        | Access |
|-------------|--------|
| SUPER_ADMIN | Full   |
| ADMIN       | Full   |
| FINANCE     | Generate, lock, invoice, adjustment |
| SUPPORT     | Read only |
| MARKETING   | No access |

Read-only admin users: view only, no export/adjust/lock.

## Database

Migration: `20250701180000_phase_6034_2_agent_statement_invoice`

- `AgentStatement` — period, summary JSON, status, paymentStatus, invoiceId
- `AgentStatementAdjustment` — amount, reason, optional statementId

## Admin UI

- `AgentStatementTabPanel` — dashboard cards, period filters, orders table, adjustments, quick actions
- `AgentInvoiceTabPanel` — invoice list, detail, create from locked statement
- Integrated in `AgentDetailView` (no new sidebar)

## Deployment

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate api admin nginx
# Prisma migrate if new migration
```

Verify: `http://admin.localhost` → Đại lý → agent → Sao kê / Hóa đơn → footer **6034.2 AGENT STATEMENT & INVOICE CENTER**

## Future roadmap

- Excel/PDF export via background job + Notification Center
- Full agent timeline UI (API returns timeline on statement detail)
- VAT line items on agent invoices
- Partial payment recording
- Custom date range picker on dashboard
