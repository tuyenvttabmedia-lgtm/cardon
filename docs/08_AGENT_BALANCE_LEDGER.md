# Agent Balance & Ledger

## Overview

Agent balance is the prepaid wallet used for B2B purchases. All balance changes go through an immutable ledger — never update balance directly.

```
AgentService | AdminService
    ↓
LedgerService              ← all balance business logic
    ↓
LedgerRepository
    ↓
ledger_entries + agents.balance + agents.held_balance
```

**Forbidden:**

```typescript
// WRONG — never do this
agent.balance += amount;
await agentRepo.save(agent);
```

## Balance Model

| Field | Meaning |
|-------|---------|
| `agents.balance` | Total wallet balance |
| `agents.held_balance` | Funds locked by active HOLD entries |
| Available balance | `balance - held_balance` |

Order placement checks **available balance**, not raw balance.

## Ledger Entry Structure

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `agent_id` | FK → agents |
| `type` | CREDIT, DEBIT, HOLD, RELEASE |
| `before_balance` / `after_balance` | Wallet balance snapshot |
| `before_held` / `after_held` | Held balance snapshot |
| `amount` | Always positive |
| `reference_type` | TRANSACTION, ORDER, TOPUP, REFUND, ADJUSTMENT |
| `reference_id` | UUID of referenced entity |
| `description` | Human-readable note |
| `created_by` | Admin user ID for manual ops |
| `created_at` | Timestamp |

**Do not use `order_code` as ledger reference.** Use `transaction_id` via `reference_type = TRANSACTION`.

```typescript
// Example HOLD entry (agent order placed)
{
  agent_id: "...",
  type: "HOLD",
  before_balance: 10000000,
  before_held: 0,
  amount: 980000,
  after_balance: 10000000,
  after_held: 980000,
  reference_type: "TRANSACTION",
  reference_id: "txn-uuid-...",
  description: "Hold for agent order"
}
```

## LedgerService Methods

```typescript
class LedgerService {
  hold(agentId: string, amount: Decimal, referenceType: ReferenceType, referenceId: string): Promise<LedgerEntry>;
  debitFromHold(agentId: string, amount: Decimal, referenceType: ReferenceType, referenceId: string): Promise<LedgerEntry>;
  release(agentId: string, amount: Decimal, referenceType: ReferenceType, referenceId: string): Promise<LedgerEntry>;
  credit(agentId: string, amount: Decimal, referenceType: ReferenceType, referenceId: string, createdBy?: string): Promise<LedgerEntry>;
  getAvailableBalance(agentId: string): Promise<Decimal>;
  getHistory(agentId: string, pagination: PaginationDto): Promise<LedgerEntry[]>;
}
```

All methods run inside database transactions with row-level lock on agent record.

## Agent Order Flow (HOLD → DEBIT / RELEASE)

```
Agent POST /orders
    ↓
Check idempotency (agent_id + agent_request_id)
    ↓
Create transaction (status: PENDING)
    ↓
LedgerService.hold(agentId, amount, TRANSACTION, transaction.id)
    ↓
Create order (payment_status: PAID, fulfillment_status: PENDING)
    ↓
Update transaction (status: HOLD)
    ↓
Push fulfillment queue
    ↓
Return HTTP 200
```

### Provider success

```
FulfillmentWorker → provider SUCCESS
    ↓
LedgerService.debitFromHold(agentId, amount, ORDER, order.id)
    ↓
transaction.status = COMPLETED
    ↓
fulfillment_status = COMPLETED
```

HOLD converts to DEBIT. `balance` decreases, `held_balance` decreases.

### Provider failure (permanent or admin-gives-up)

```
FulfillmentWorker → provider FAIL (no retry)
    OR admin cancels failed order
    ↓
LedgerService.release(agentId, amount, ORDER, order.id)
    ↓
transaction.status = RELEASED
    ↓
fulfillment_status = FAILED
```

HOLD released. Available balance restored. **No auto-refund to external bank** — internal hold release only.

## Admin Topup (CREDIT)

```
Admin Panel → Agent → Topup Balance
    ↓
AdminService.topupAgentBalance(agentId, amount, note, adminId)
    ↓
LedgerService.credit(agentId, amount, TOPUP, topupRef, adminId)
    ↓
Audit log + optional invoice
```

Requires role `ADMIN` or `ACCOUNTANT`.

## Credit Sources

| Source | Type | reference_type | Triggered By |
|--------|------|---------------|-------------|
| Admin manual topup | CREDIT | TOPUP | ADMIN / ACCOUNTANT |
| Manual refund | CREDIT | REFUND | ADMIN |
| Balance adjustment | CREDIT or DEBIT | ADJUSTMENT | SUPER_ADMIN |

Automatic refund on provider failure is **disabled** for B2C. Agent orders use **RELEASE** (not CREDIT) when hold is reversed.

## Balance Integrity Rules

1. Every balance change has exactly one ledger entry
2. `after_balance` and `after_held` must match computed values
3. Ledger entries are **append-only**
4. Available = `balance - held_balance` at all times
5. All operations use database transactions with `SELECT ... FOR UPDATE`

## Reconciliation Check

```
For each agent:
  latest_entry.after_balance === agents.balance
  latest_entry.after_held === agents.held_balance
  SUM(CREDIT) - SUM(DEBIT) === net balance change
  SUM(HOLD) - SUM(RELEASE) - SUM(debitFromHold) === held_balance
```

Mismatch triggers alert to `ACCOUNTANT`.

## Insufficient Balance Handling

```
Agent POST /orders
    ↓
available_balance < amount
    ↓
Return 400 INSUFFICIENT_BALANCE
    ↓
No transaction, no hold, no order, no queue job
```

## Permissions

| Action | AGENT | SUPPORT | MARKETING | ACCOUNTANT | ADMIN | SUPER_ADMIN |
|--------|-------|---------|-----------|------------|-------|-------------|
| View own balance | ✓ | — | — | — | — | — |
| View agent balance | — | ✓ | — | ✓ | ✓ | ✓ |
| Topup agent | — | — | — | ✓ | ✓ | ✓ |
| Manual adjustment | — | — | — | — | — | ✓ |
| View ledger history | ✓ (own) | ✓ | — | ✓ | ✓ | ✓ |

## Related Docs

- [07_AGENT_API.md](./07_AGENT_API.md)
- [06_ORDER_FULFILLMENT.md](./06_ORDER_FULFILLMENT.md)
- [09_RECONCILIATION.md](./09_RECONCILIATION.md)
