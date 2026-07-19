# Invoice System

## Overview

The invoice system generates financial documents for B2C orders and agent transactions. Invoices are generated **after** payment confirmation — not at order creation.

```
Order (payment_status = PAID)
    ↓
InvoiceService.generate(orderId)
    ↓
InvoiceRepository.save()
    ↓
PDF generation (async queue)
    ↓
Customer / Agent download
```

## Invoice Types

| Type | Trigger | Recipient |
|------|---------|-----------|
| `B2C_RECEIPT` | B2C order paid | Customer |
| `AGENT_STATEMENT` | Agent order completed | Agent |
| `AGENT_TOPUP_RECEIPT` | Admin credits agent balance | Agent |
| `MONTHLY_SUMMARY` | Scheduled monthly job | Agent / Accountant |

## Data Model (Design Reference)

### invoices

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| invoice_number | VARCHAR UNIQUE | Format: `INV-YYYYMMDD-XXXXX` |
| type | ENUM | B2C_RECEIPT, AGENT_STATEMENT, AGENT_TOPUP_RECEIPT, MONTHLY_SUMMARY |
| order_id | UUID FK → orders | Nullable for topup/summary |
| agent_id | UUID FK → agents | Nullable for B2C |
| user_id | UUID FK → users | Nullable for agent invoices |
| subtotal | DECIMAL | |
| tax_amount | DECIMAL | If applicable |
| total_amount | DECIMAL | |
| status | ENUM | DRAFT, ISSUED, VOID |
| issued_at | TIMESTAMPTZ | |
| pdf_url | VARCHAR | Stored file path / S3 URL |
| metadata | JSONB | Tax info, buyer details |
| created_at | TIMESTAMPTZ | |

## B2C Receipt Flow

```
Payment webhook → payment_status = PAID
    ↓
InvoiceQueue.add({ orderId, type: 'B2C_RECEIPT' })
    ↓
InvoiceWorker
    ↓
InvoiceService.generateB2CReceipt(orderId)
    ↓
Load order + payment + product details
    ↓
Generate invoice_number
    ↓
Save invoice (status: ISSUED)
    ↓
Generate PDF → store pdf_url
    ↓
Customer can download from order detail page
```

Invoice generated regardless of fulfillment status. Payment confirmed = invoice issued.

## Agent Statement Flow

```
Agent order → fulfillment_status = COMPLETED
    ↓
LedgerService.debitFromHold completed
    ↓
InvoiceQueue.add({ orderId, type: 'AGENT_STATEMENT' })
```

Agent statement issued after fulfillment **and** ledger DEBIT — not at HOLD time.

## Agent Topup Receipt

```
Admin topups agent balance
    ↓
LedgerService.credit() completes
    ↓
InvoiceService.generateTopupReceipt(agentId, ledgerEntryId)
    ↓
Save + PDF
```

## Monthly Summary

Scheduled job on 1st of each month:

```
InvoiceWorker (cron: 1st day 06:00)
    ↓
For each active agent:
    ↓
  Aggregate ledger_entries for previous month
      ↓
  Generate MONTHLY_SUMMARY invoice
      ↓
  Email PDF to agent contact
```

Summary includes: total debits, total credits, opening/closing balance, order count.

## InvoiceService

```typescript
class InvoiceService {
  generateB2CReceipt(orderId: string): Promise<Invoice>;
  generateAgentStatement(orderId: string): Promise<Invoice>;
  generateTopupReceipt(agentId: string, ledgerEntryId: string): Promise<Invoice>;
  generateMonthlySummary(agentId: string, month: Date): Promise<Invoice>;
  voidInvoice(invoiceId: string, adminId: string, reason: string): Promise<Invoice>;
  getInvoicePdf(invoiceId: string): Promise<Buffer>;
}
```

Business logic in Service layer. PDF rendering is delegated to a template engine (e.g. Puppeteer, pdfkit).

## Invoice Number Format

```
INV-{YYYYMMDD}-{5-digit-sequence}

Examples:
  INV-20240618-00001
  INV-20240618-00002
```

Sequence is daily-reset, generated atomically in database transaction.

## PDF Template Content

### B2C Receipt

- CardOn.vn logo and company info
- Invoice number, date
- Customer email (if available)
- Order code, product name, quantity
- Unit price, total amount
- Payment method (MegaPay / SePay)
- Payment reference

### Agent Statement

- Agent company name, agent ID
- Order code, agent_request_id
- Product, quantity, agent_price
- Ledger debit reference
- Running balance after transaction

**Never include plain card PIN in invoice PDF.** Card details are retrieved separately via order API.

## Void Invoice

Manual operation by ADMIN only:

```
Admin Panel → Invoice → Void
    ↓
InvoiceService.voidInvoice(invoiceId, adminId, reason)
    ↓
status = VOID
    ↓
Audit log: admin, reason, timestamp
    ↓
Does NOT auto-refund — refund is separate manual process
```

Voided invoices remain in database for audit. New invoice can be re-issued if needed.

## API Endpoints

| Endpoint | Access | Purpose |
|----------|--------|---------|
| `GET /api/v1/orders/:code/invoice` | Customer | Download B2C receipt PDF |
| `GET /api/v1/agent/invoices` | Agent | List agent invoices |
| `GET /api/v1/agent/invoices/:id/pdf` | Agent | Download PDF |
| `GET /admin/invoices` | ADMIN, ACCOUNTANT | List all invoices |
| `POST /admin/invoices/:id/void` | ADMIN | Void invoice |

## Async Processing

PDF generation runs in `invoice` queue — never block order or payment flow.

```
InvoiceQueue (BullMQ)
  concurrency: 3
  retry: 3 attempts with exponential backoff
```

## Tax Handling (Future)

`metadata` JSONB reserved for tax fields:

```typescript
{
  "taxRate": 0.10,
  "taxAmount": 9800,
  "companyTaxId": "...",
  "buyerTaxId": "..."
}
```

Tax calculation logic in `InvoiceService` when tax module is enabled.

## Related Docs

- [03_PAYMENT.md](./03_PAYMENT.md)
- [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md)
- [09_RECONCILIATION.md](./09_RECONCILIATION.md)
