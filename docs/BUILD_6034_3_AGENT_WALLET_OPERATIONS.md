# BUILD 6034.3 — AGENT WALLET OPERATIONS

**Build label:** `6034.3 AGENT WALLET OPERATIONS`

## Scope

Per-agent wallet management inside **Admin → Đại lý → Chi tiết → Tab Ví**. Replaces `window.prompt` top-up with a full operations center.

## Money flows (unchanged engines)

| Flow | Trigger | Ledger |
|------|---------|--------|
| Nạp thủ công Admin | Modal → `POST wallet-center/manual-credit` | CREDIT / TOPUP |
| Nạp cổng (Partner/Admin hộ) | `AgentDepositService` + webhook | CREDIT / TOPUP |
| Trừ ví (SUPER_ADMIN) | `POST wallet-center/manual-debit` | DEBIT / ADJUSTMENT |
| Điều chỉnh sao kê | Tab Sao kê (6034.2) | Statement only |

## Phase 1 — Hotfix UX

- Modal nạp ví (format VNĐ, lý do bắt buộc, xác nhận `XAC NHAN`)
- Parse số tiền VN (`parseVndAmount` server + `parseVndDigits` client)
- Toast thành công / lỗi
- Nút **Nạp ví** Quick Actions → mở tab Ví

## Phase 2 — Operations & history

API base: `/api/v1/admin/agent-center/agents/:agentId/wallet-center`

| Method | Route | Permission |
|--------|-------|------------|
| GET | `summary` | ledger.view |
| GET | `ledger` | ledger.view |
| GET | `deposits` | ledger.view |
| GET | `manual-operations` | ledger.view |
| POST | `manual-credit` | agents.credit |
| POST | `manual-credit/:id/approve` | agents.manage |
| POST | `manual-credit/:id/reject` | agents.manage |
| POST | `manual-debit` | agents.credit + SUPER_ADMIN |
| POST | `deposit-on-behalf` | agents.credit + finance.manage |

UI: tab Ví với 3 section — Sổ cái | Nạp cổng | Thao tác Admin

## Phase 3 — Security & control

- **Phê duyệt:** ACCOUNTANT nạp > 50M → `PENDING_APPROVAL` → ADMIN/SUPER_ADMIN duyệt
- **Hạn mức ngày:** ACCOUNTANT tối đa 200M/ngày (completed credits)
- **Không tự duyệt:** approver ≠ requester (trừ SUPER_ADMIN)
- **Trừ ví:** SUPER_ADMIN only, confirm `TRU VI`
- **Audit:** `AgentManualCredit` + System Audit Log + Agent audit `AGENT_CREDITED`
- **Ledger extension:** `LedgerService.debitFromAvailable()` for manual debit

## Database

Migration: `20250702120000_phase_6034_3_agent_wallet_operations`

Model: `AgentManualCredit` — type, category, reason, status, approval chain

## RBAC

| Role | Nạp | Duyệt | Trừ ví | Nạp cổng hộ |
|------|-----|-------|--------|-------------|
| SUPER_ADMIN | ✓ | ✓ | ✓ | ✓ |
| ADMIN | ✓ | ✓ | ✗ | ✓ |
| ACCOUNTANT | ✓* | ✗ | ✗ | ✓ |
| SUPPORT | View | ✗ | ✗ | ✗ |

\* > 50M cần duyệt; hạn mức ngày 200M

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate api admin nginx
```

Verify: Đại lý → Chi tiết → **Ví** → Nạp ví thủ công → Footer **6034.3 AGENT WALLET OPERATIONS**
