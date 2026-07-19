# Financial Reconciliation

## Overview

Reconciliation ensures financial records across CardOn.vn, payment gateways, providers, and agent ledgers are consistent and auditable.

```
ReconciliationService
    ↓
PaymentInterface.reconcile()     ← gateway side
ProviderInterface.checkTransaction()  ← provider side
LedgerRepository                  ← agent side
OrderRepository                   ← internal orders
```

Reconciliation is read-heavy and runs via scheduled jobs — never inline with order processing.

## Reconciliation Domains

| Domain | Compare | Frequency |
|--------|---------|-----------|
| Payment Gateway | Local payments vs MegaPay/SePay records | Daily |
| Provider | Local provider_transactions vs provider reports | Daily |
| Agent Ledger | ledger_entries sum vs agents.balance | Daily |
| Order Revenue | orders (PAID) vs payments + ledger debits | Daily |

## Payment Gateway Reconciliation

```
ReconciliationWorker (cron: daily 02:00)
    ↓
For each gateway (MegaPay, SePay):
    ↓
  PaymentService.reconcile(date)
      ↓
  PaymentProvider.reconcile(date)
      ↓
  Fetch gateway transaction list for date
      ↓
  Match by payment_reference
      ↓
  Generate ReconcileReport
```

### Match Results

| Status | Meaning | Action |
|--------|---------|--------|
| `MATCHED` | Local and gateway records agree | No action |
| `MISSING_LOCAL` | Gateway has record, local missing | Alert accountant, investigate |
| `MISSING_GATEWAY` | Local has SUCCESS, gateway has no record | Query via queryTransaction(), alert if unresolved |
| `AMOUNT_MISMATCH` | References match, amounts differ | Flag order, block auto-settlement |
| `STATUS_MISMATCH` | Same ref, different status | Manual review |

### ReconcileReport Structure

```typescript
{
  gateway: 'MEGAPAY' | 'SEPAY',
  date: '2024-06-18',
  totalGateway: 150,
  totalLocal: 148,
  matched: 147,
  missingLocal: 2,
  missingGateway: 1,
  amountMismatch: 0,
  items: ReconcileItem[]
}
```

Reports stored in `reconcile_reports` with line items in `reconcile_items`.

## Provider Reconciliation

```
ReconciliationWorker
    ↓
For each provider (esale, imedia):
    ↓
  Fetch local provider_transactions (date range, status: SUCCESS)
      ↓
  Compare with provider report / checkTransaction batch
      ↓
  Flag unmatched transactions
```

| Status | Meaning | Action |
|--------|---------|--------|
| `MATCHED` | Local request_id found in provider | OK |
| `MISSING_PROVIDER` | Local SUCCESS but provider has no record | checkTransaction(), alert admin |
| `MISSING_LOCAL` | Provider has record not in local DB | Investigate, possible external call |
| `AMOUNT_MISMATCH` | Transaction exists but amount differs | Manual review |

Provider timeout recovery via `checkTransaction()` is the primary tool for resolving `MISSING_PROVIDER` items.

## Agent Ledger Reconciliation

```
For each agent:
    ↓
  latest_ledger.after_balance === agents.balance
    ↓
  SUM(CREDIT) - SUM(DEBIT) === agents.balance
    ↓
  Cross-check agent orders:
    SUM(HOLD) - SUM(RELEASE) - SUM(DEBIT from hold) === agents.held_balance
    Completed agent orders have matching DEBIT with reference_type=ORDER
```

Any mismatch triggers alert. Ledger entries are immutable — fix via adjustment entry, never edit history.

## Order Revenue Reconciliation

Verify all paid orders have corresponding financial records:

| Order Type | Expected Record |
|------------|----------------|
| B2C (MegaPay/SePay) | `payments` row (via `orders.payment_id`) with status SUCCESS |
| Agent | `ledger_entries` HOLD → DEBIT with `reference_type=ORDER` |

```
SELECT orders WHERE payment_status = 'PAID' AND channel = 'B2C'
  AND payment_id IS NULL → ORPHAN_PAID_ORDER

SELECT orders WHERE channel = 'AGENT' AND fulfillment_status = 'COMPLETED'
  AND NOT EXISTS (ledger DEBIT for order.id) → ORPHAN_AGENT_ORDER
```

## Scheduled Jobs

| Job | Schedule | Queue |
|-----|----------|-------|
| `reconcile-payment-megapay` | Daily 02:00 | `reconciliation` |
| `reconcile-payment-sepay` | Daily 02:15 | `reconciliation` |
| `reconcile-provider-esale` | Daily 03:00 | `reconciliation` |
| `reconcile-provider-imedia` | Daily 03:15 | `reconciliation` |
| `reconcile-agent-ledger` | Daily 04:00 | `reconciliation` |
| `reconcile-order-revenue` | Daily 04:30 | `reconciliation` |

All jobs are idempotent — safe to re-run for the same date.

## Manual Reconciliation

Accountant can trigger manual reconcile from admin panel:

```
Admin Panel → Finance → Reconciliation
    ↓
Select domain (Payment / Provider / Ledger)
    ↓
Select date range
    ↓
ReconciliationService.runManual(domain, dateRange)
    ↓
Display report with drill-down
```

Manual runs do not replace scheduled jobs — both produce independent reports.

## Dispute Resolution Workflow

```
1. Reconciliation flags mismatch
2. ACCOUNTANT reviews report
3. Investigate using:
   - webhook_logs (payment)
   - provider_transactions (provider)
   - ledger_entries (agent)
4. Resolution:
   - Adjust ledger (SUPER_ADMIN)
   - Manual refund (ADMIN)
   - Mark as resolved with note
5. Close reconciliation item
```

## Data Retention

| Data | Retention |
|------|-----------|
| `reconcile_reports` / `reconcile_items` | 7 years |
| `webhook_logs` | 2 years |
| `provider_transactions` | 7 years |
| `ledger_entries` | Permanent |

## Permissions

| Action | ACCOUNTANT | ADMIN | SUPER_ADMIN |
|--------|-----------|-------|-------------|
| View reports | ✓ | ✓ | ✓ |
| Trigger manual reconcile | ✓ | ✓ | ✓ |
| Resolve disputes | ✓ | ✓ | ✓ |
| Ledger adjustment | — | — | ✓ |

## Related Docs

- [03_PAYMENT.md](./03_PAYMENT.md)
- [08_AGENT_BALANCE_LEDGER.md](./08_AGENT_BALANCE_LEDGER.md)
- [10_INVOICE_SYSTEM.md](./10_INVOICE_SYSTEM.md)
