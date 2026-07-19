# Build 6033.1 — Agent Wallet & Ledger Center

**Build footer:** `6033.1 AGENT WALLET & LEDGER CENTER`

---

## Objective

Wallet becomes the financial center of the Agent Platform. All balance visibility flows through the existing **LedgerService** — no duplicate balance calculations, no deposit/withdraw/settlement execution in this phase.

---

## Architecture

```
Deposit (future) → Wallet → Ledger → Orders → Settlement → Invoices → Reports
```

- **Ledger** (`ledger_entries` + `LedgerService`) is the single source of truth
- **Agent Wallet Center** (`AgentWalletService`) aggregates read-only views
- **No balance mutation APIs** in this build

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agents/me/wallet` | Wallet overview + trends |
| GET | `/agents/me/wallet/summary` | Period balance summary |
| GET | `/agents/me/wallet/ledger` | Paginated ledger with filters |
| GET | `/agents/me/wallet/ledger/:id` | Ledger detail + audit trail |
| GET | `/agents/me/wallet/deposits` | Deposit history (TOPUP credits) |
| GET | `/agents/me/wallet/withdraws` | Withdraw history (foundation) |
| GET | `/agents/me/wallet/limits` | Credit & limits (read-only) |
| GET | `/agents/me/wallet/activity` | Recent activity panel data |
| POST | `/agents/me/wallet/audit` | Activity log (export, filter, detail) |

Legacy platform route `GET /agents/me/platform/wallet` remains for backward compatibility.

---

## Partner Routes

| Route | Page |
|-------|------|
| `/wallet` | Overview |
| `/wallet/ledger` | Ledger Center |
| `/wallet/deposits` | Deposit History |
| `/wallet/withdraws` | Withdraw History |
| `/wallet/limits` | Credit & Limits |

Redirect: `/wallet/transactions` → `/wallet/ledger`

---

## RBAC

| Permission | Roles |
|------------|-------|
| `wallet.read` | Owner, Manager, Finance, Operator, Readonly |
| `wallet.export` | Owner, Manager, Finance, Operator (not Readonly) |

Finance role can view all wallet data. Readonly cannot export ledger.

---

## UI Features

- Wallet overview cards (11 metrics + 7/30-day balance trend)
- Ledger table with sticky filters, server pagination
- Ledger detail drawer with audit trail
- Deposit history from admin TOPUP ledger entries
- Withdraw history placeholder (foundation)
- Credit & limits read-only
- Recent activity side panel on overview
- Dashboard wallet widgets (daily/monthly spending, recent ledger)
- Export: CSV, Excel (CSV), PDF (print)

---

## Activity Log

`POST /agents/me/wallet/audit` dispatches system activity events for:

- Ledger detail view
- Filter apply
- Export (CSV / Excel / PDF)

Uses existing `ActivityEventDispatcher` — no audit log for configuration changes.

---

## Performance

- Server-side pagination (`skip` / `take`, max 100)
- Lazy loading per page
- Ledger list virtual scrolling ready (table pagination first)

---

## Future Integration

- **Deposit:** Gateway deposit requests → CREDIT/TOPUP ledger entries
- **Withdraw:** Withdraw requests → DEBIT ledger entries
- **Settlement:** Cycle aggregation from ledger SETTLEMENT types
- **Credit limits:** Agent model fields + enforcement on purchase

---

## Out of Scope (unchanged)

Payment engine, order engine, settlement engine, finance engine, monitoring, configuration, maintenance.

---

**6033.1 AGENT WALLET & LEDGER CENTER**
