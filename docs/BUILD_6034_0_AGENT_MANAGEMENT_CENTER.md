# BUILD 6034.0 — AGENT MANAGEMENT CENTER

**Build label:** `6034.0 AGENT MANAGEMENT CENTER`

Admin-only aggregation layer — **no changes** to Payment, Provider, Ledger, Order, Webhook engines, Partner Portal, Customer Portal, or pricing/settlement business logic.

---

## Goal

Single **360° Agent workspace** for Admin ERP. One agent company → users → wallet → API → orders → webhook → pricing → invoices → activity. Admin never jumps between unrelated pages.

---

## Architecture

```
Admin UI (Next.js)
  apps/admin/app/agents/*
  apps/admin/components/agents/*
        │
        ▼
agentCenterApi + adminApi (existing CRUD/KYC/credit/impersonate)
        │
        ▼
AdminAgentCenterModule (NEW — read aggregation only)
  GET  /admin/agent-center/dashboard
  GET  /admin/agent-center/agents
  GET  /admin/agent-center/agents/search
  GET  /admin/agent-center/kyc-queue
  GET  /admin/agent-center/agents/:id/{overview|information|wallet|api|webhooks|members|orders|activity|login-history|pricing|statement|invoices}
  PATCH /admin/agent-center/agents/:id/meta  (internal tags + notes)
        │
        ▼
Existing Prisma models / services (no duplicated storage)
```

**Internal meta** (tags, notes) stored in `Agent.securityConfig.adminCenter` JSON — admin-only, append-only note history.

---

## Sidebar navigation

| Main | Sub |
|------|-----|
| **Đại lý** | Tổng quan → `/agents/overview` |
| | Danh sách → `/agents/list` |
| | Yêu cầu KYC → `/agents/kyc` |
| | Đăng ký mới → `/agents/registration` |

Legacy `/agents` redirects to `/agents/overview`.

Agent detail: `/agents/[id]?tab=overview|information|wallet|…`

---

## Agent 360 — tabs

| Tab | Reuses | Notes |
|-----|--------|-------|
| Tổng quan | Aggregation | Cards: wallet, orders, revenue, API, webhook, members, KYC, activity |
| Thông tin | Agent + KYC | Company, tax, address, license, tags, notes |
| Ví | Ledger Engine | Balance, held, ledger, deposits — read-only |
| API | API Security Center | Keys, IP whitelist, rate limit, usage |
| Webhook | Webhook Delivery | URL, secret, deliveries, DLQ |
| Thành viên | Organization | Users, invite, disable |
| Vai trò | RBAC | Permission matrix (read-only) |
| Đơn hàng | Order Operations | Latest orders, search |
| Hoạt động | Activity Log | Timeline + filters |
| Lịch sử đăng nhập | Login History | IP, device, browser |
| Bảng giá | Pricing | **Read-only** (6034.1 = editing) |
| Sao kê | Finance statement | **Foundation** — download, no settlement edit |
| Hóa đơn | Finance invoices | **Foundation** — list/PDF, no generation (6034.3) |

---

## Agent list

Server-side pagination via `GET /admin/agent-center/agents`.

Columns: Agent Code, Company, Business Type, Status, Wallet Balance, Today's Orders, API Status, Webhook Status, Members, Created, Last Activity, Actions.

Search: company, agent code, tax code, phone, email, API key.  
Filters: status, KYC, business type, created date, API enabled, webhook enabled, wallet status.

---

## Quick actions (existing backend only)

Suspend / Enable, Reset API Key, Disable API, Open Partner Portal, Impersonate, View Activity, Send Notification, KYC approve/reject, Credit wallet — gated by RBAC (`agents.manage`, `agents.kyc.review`, etc.). SUPPORT role: read-only, actions hidden.

---

## RBAC

| Permission | Access |
|------------|--------|
| `users.read` | List, overview, most tabs |
| `ledger.view` | Wallet tab |
| `orders.read` | Orders tab |
| `activity.read` | Activity tab |
| `finance.view` | Statement, invoices |
| `pricing.manage` | Pricing tab |
| `agents.manage` | Meta, suspend, API, impersonate |
| `agents.kyc.review` | KYC queue + actions |

Backend `@Permissions()` on every route; UI hides actions when readonly.

---

## Future extension (do NOT add new agent pages)

| Build | Scope |
|-------|--------|
| **6034.1** | Pricing editing on Bảng giá tab |
| **6034.2** | Statement settlement |
| **6034.3** | Invoice generation |

Extend tabs in `AgentDetailView` + `AdminAgentCenterService` only.

---

## Key files

### Backend
- `src/modules/admin-agent-center/` — module, controller, service, DTOs
- `src/app.module.ts` — registers `AdminAgentCenterModule`

### Frontend
- `apps/admin/lib/agent-routes.ts` — sections + detail tabs
- `apps/admin/lib/i18n/vi.ts` — `agentCenter` block (100% Vietnamese)
- `apps/admin/services/api-client.ts` — `agentCenterApi`
- `apps/admin/components/agents/AgentManagementShell.tsx`
- `apps/admin/components/agents/AgentListTable.tsx`
- `apps/admin/components/agents/AgentDetailView.tsx`
- `apps/admin/app/agents/**` — layout, overview, list, kyc, registration, `[id]`

### Build label
- `packages/build-info/src/build-info.service.ts`
- `src/config/configuration.ts`
- `docker-compose.local-full.yml`

---

## Deployment

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin api
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin api nginx worker
```

### Verify

- http://admin.localhost/agents → overview
- http://admin.localhost/agents/list — pagination, search, filters
- http://admin.localhost/agents/{uuid} — all tabs, quick actions
- Footer: **6034.0 AGENT MANAGEMENT CENTER**
- API `/health` healthy; worker running

### Regression check

- Finance, Operations, Configuration, Partner Portal unchanged
- No duplicate agent modules outside `/agents/*`

---

## Docker status

| Service | Status |
|---------|--------|
| api | **healthy** — `/health` returns database, redis, workers ok |
| admin | **running** — `/agents/overview`, `/agents/list` HTTP 200 |
| worker | **healthy** |
| nginx | **healthy** |

Docker build: **PASS** (admin + api images rebuilt 6034.0)

---

## Verification checklist

- [x] Docker build PASS
- [x] API healthy (`http://api.localhost/health`)
- [x] Agent routes registered (`/api/v1/admin/agent-center/*`)
- [x] Admin agent pages reachable (redirect to login when unauthenticated)
- [ ] Full UI walkthrough (login required — Agent List, Detail tabs, Quick Actions, Footer)

---

## Known issues

- Agent code partial search (8-char prefix) requires full UUID in list filter; company/email/tax/API key search works via `q`.
- Admin Docker healthcheck may show `unhealthy` briefly while Next.js warms up; app serves pages normally.
