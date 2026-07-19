# Build 6033.2 — Agent Finance Center

**Build footer:** `6033.2 AGENT FINANCE CENTER`

---

## Objective

Build the **Trung tâm Tài chính** (Finance Center) for agents — aggregation layer and Vietnamese UI over existing Wallet/Ledger data. No real deposit/withdraw execution, no Payment or Ledger engine changes.

---

## Architecture

```
Wallet
  ↓
Ledger (Single Source of Truth)
  ↓
Finance (Aggregation + UI)
  ↓
Settlement (future)
  ↓
Invoice (future)
  ↓
Reports
```

- **AgentFinanceService** aggregates read-only views from `AgentWalletService`, `LedgerService`, and orders
- **AgentWalletService** remains the wallet/ledger portal layer (6033.1)
- No balance mutation APIs in this build

---

## Finance Model

| Concept | Source |
|---------|--------|
| Available balance | Ledger balance via wallet overview |
| Pending settlement | Wallet overview placeholder |
| Credit limit / used | Wallet limits + ledger balance |
| Deposits | Ledger TOPUP entries (via wallet deposits) |
| Withdraws | Foundation placeholder |
| Adjustments | Ledger ADJUSTMENT, REFUND, TOPUP, commission entries |
| History | Paginated ledger with category mapping |
| Settlements | Foundation placeholder (Settlement Engine future) |

---

## Ledger Mapping

Portal ledger types map through `ledger-portal.mapper.ts`. Finance history adds categories:

| Category | Vietnamese label |
|----------|------------------|
| NAP_TIEN | Nạp tiền |
| RUT_TIEN | Rút tiền |
| MUA_HANG | Mua hàng |
| HOAN_TIEN | Hoàn tiền |
| DIEU_CHINH | Điều chỉnh |
| DOI_SOAT | Đối soát |
| CHIET_KHAU | Chiết khấu |

---

## RBAC

| Permission | Roles |
|------------|-------|
| `finance.read` | Owner, Manager, Finance, Operator, Readonly |
| `finance.export` | Owner, Manager, Finance, Operator (not Readonly) |

Finance role can view all finance screens. Readonly cannot export settlements.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agents/me/finance/overview` | Finance dashboard metrics + cash flow trends |
| GET | `/agents/me/finance/deposits` | Paginated deposit list |
| GET | `/agents/me/finance/withdraws` | Paginated withdraw list (foundation) |
| GET | `/agents/me/finance/settlements` | Settlement cycles (foundation) |
| GET | `/agents/me/finance/adjustments` | Adjustment/refund/commission entries |
| GET | `/agents/me/finance/credit` | Credit & limits |
| GET | `/agents/me/finance/history` | Unified finance timeline |
| GET | `/agents/me/finance/notifications` | Reuses Notification Center |
| POST | `/agents/me/finance/audit` | Activity log (export, filter, detail) |

Wallet APIs (`/agents/me/wallet/*`) unchanged.

---

## Partner Routes

| Route | Page |
|-------|------|
| `/finance` | Tổng quan tài chính |
| `/finance/deposits` | Nạp tiền (read-only) |
| `/finance/withdraws` | Rút tiền (read-only) |
| `/finance/settlements` | Đối soát |
| `/finance/adjustments` | Điều chỉnh |
| `/finance/credit` | Công nợ & Hạn mức |
| `/finance/history` | Lịch sử tài chính |

Redirects:

- `/wallet/deposits` → `/finance/deposits`
- `/wallet/withdraws` → `/finance/withdraws`
- `/wallet/limits` → `/finance/credit`
- `/settlement`, `/invoices` → `/finance/settlements`

---

## UI (Vietnamese)

Sidebar:

- **Ví** → Tổng quan, Sổ quỹ
- **Tài chính** → 7 sub-pages (overview + 6 finance screens)

Features:

- Finance overview with 9 KPI cards + 7/30-day cash flow chart
- Server pagination on list pages
- Settlement CSV/Excel export (RBAC gated)
- Finance history timeline with filters
- Activity log via `POST /agents/me/finance/audit`
- Notification Center reused (no new notification logic)

---

## Roadmap — Real Deposit

1. Enable Payment Engine deposit flow (admin-approved TOPUP)
2. Wire deposit creation UI on `/finance/deposits`
3. Status webhooks → ledger credit → finance overview refresh

---

## Roadmap — Settlement

1. Settlement Engine produces cycle batches
2. `AgentFinanceService.getSettlements` reads settlement records
3. Export and payout status on `/finance/settlements`

---

## Not Changed

- Payment Engine
- Provider Engine
- Order Engine
- Wallet Engine
- Ledger Engine
- Settlement Engine (business logic)
- Monitoring, Configuration, Maintenance

---

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

Verify: `http://partner.localhost/finance`

Footer: **6033.2 AGENT FINANCE CENTER**
