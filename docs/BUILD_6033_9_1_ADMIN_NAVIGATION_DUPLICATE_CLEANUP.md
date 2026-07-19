# BUILD 6033.9.1 — ADMIN NAVIGATION & DUPLICATE CLEANUP

**Build label:** `6033.9.1 ADMIN NAVIGATION & DUPLICATE CLEANUP`

Navigation, route, and duplicate cleanup only — **no business logic, API, or database changes**.

---

## Rule applied

| Case | Action |
|------|--------|
| Two modules differ only in UI (same business) | Keep one, redirect/delete duplicate |
| Two modules differ in business purpose | **Do not merge** |

Examples kept separate (different nghiệp vụ):

- Finance invoices vs Operations invoice lookup
- `/providers` (ops) vs `/finance/providers` (accounting)
- Finance vs Operations (subtitle/nav clarity only)

---

## Changes

### 1. Settings → Configuration (canonical)

- **Deleted:** `apps/admin/app/settings/**` (all duplicate pages)
- **Kept:** `apps/admin/app/configuration/**` (canonical implementations moved here)
- **Redirects:** `/settings` → `/configuration` (next.config.ts, already existed)

### 2. Finance agents stub → Agents

- **Deleted:** `apps/admin/app/finance/agents/page.tsx`
- **Redirect:** `/finance/agents` → `/agents`
- **FinanceShell:** removed "Đại lý" sub-nav; subtitle → *Báo cáo kế toán & đối soát sổ sách*

### 3. Legacy audit → Configuration audit

- **Deleted:** `apps/admin/app/audit/page.tsx` (legacy `/admin/audit-logs` UI)
- **Redirect:** `/audit` → `/configuration/audit` (System Audit 6032.x)

### 4. Monitoring hub (single sidebar menu)

- **Sidebar:** one item `Giám sát` → `/monitoring`
- **New:** `MonitoringShell`, `monitoring/layout.tsx`, `monitoring/page.tsx` (hub)
- **Sub-nav:** Tổng quan · Hoạt động · Webhook · Hàng đợi · API Logs · Thông báo

### 5. Agents & Staff in sidebar

- `/agents` — permission `users.read`
- `/staff` — permission `users.manage`, roles SUPER_ADMIN / ADMIN

### 6. Feature flags → System

- **Deleted:** `configuration/feature-flags/page.tsx`
- **Removed** from ConfigurationNav
- **Redirect:** `/configuration/feature-flags` → `/configuration/system`

### 7. Misc link fixes

- Dashboard health card: `/settings/health` → `/configuration/health`
- Việt hóa nav: Giám sát, Cấu hình, API Logs, …

---

## Files removed

```
apps/admin/app/settings/**/*
apps/admin/app/audit/page.tsx
apps/admin/app/finance/agents/page.tsx
apps/admin/app/configuration/feature-flags/page.tsx
apps/admin/components/settings/SettingsNav.tsx
```

---

## Redirects (next.config.ts)

| Source | Destination |
|--------|-------------|
| `/settings/*` | `/configuration/*` |
| `/audit` | `/configuration/audit` |
| `/finance/agents` | `/agents` |
| `/configuration/feature-flags` | `/configuration/system` |

---

## Not changed (by design)

- Payment / Order / Provider / Ledger / Webhook engines
- Finance vs Operations module boundaries
- Provider ops vs Finance provider reporting
- Backend API paths (`/admin/settings/*` API unchanged — UI only moved)

---

## Verification

```powershell
cd C:\Users\MyHome\Projects\cardon
npm run build:admin
```

Deploy when ready:

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --force-recreate admin nginx
```
