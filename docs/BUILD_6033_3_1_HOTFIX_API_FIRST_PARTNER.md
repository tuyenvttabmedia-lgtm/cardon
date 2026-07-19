# Build 6033.3.1 — HOTFIX API-FIRST PARTNER

**Build footer:** `6033.3.1 HOTFIX API-FIRST PARTNER`

---

## Root Cause — Admin 502

Build **6033.3** introduced `AgentDepositModule` with a **circular import** against `PaymentModule`:

```
PaymentModule → AgentDepositModule
AgentDepositModule → PaymentModule (forwardRef)
```

That cycle changed NestJS module initialization order. Combined with existing cycles in the audit/maintenance graph:

```
AuthModule → MaintenanceCenterModule → AuditLogModule → AuthModule
```

NestJS failed to bootstrap the API (`UndefinedModuleException`: `AuditLogModule` imports[0] `AuthModule` undefined). Nginx returned **502 Bad Gateway** for all admin API routes including Provider Runtime Settings and eSale settings.

### Fix (DI only — no business logic changes)

1. **Removed** `AgentDepositModule` from `PaymentModule.imports` (breaks Payment ↔ AgentDeposit cycle).
2. **Registered** `AgentDepositModule` once in `AppModule` after `PaymentModule`.
3. **Re-imported** `AgentDepositModule` in `AgentPlatformModule` (required by `AgentFinanceService`).
4. **PaymentController** resolves `AgentDepositWebhookService` via `ModuleRef.get(..., { strict: false })` instead of constructor injection.
5. **Added** `forwardRef()` in `AuditLogModule`, `AuthModule`, and `MaintenanceCenterModule` to stabilize the audit/maintenance cycle.

**Not modified:** Payment Engine, Provider Engine, Ledger, Webhook business logic, database schema.

---

## Partner UX Refactor

### New sidebar (API-first, Vietnamese)

| Menu | Sub-items |
|------|-----------|
| Bảng điều khiển | — |
| Ví | Tổng quan, Nạp tiền, Lịch sử nạp, Sổ quỹ |
| Đơn hàng API | Tra cứu, Lịch sử |
| API | API Keys, Webhook, Tài liệu, Test API |
| Báo cáo | — |
| Hóa đơn | — |
| Thông báo | — |
| Tài khoản | — |

### Hidden from nav (routes preserved — Phase 6040)

- `/finance/*` (overview, withdraw, settlement, adjustments, credit, history)
- `/products`, `/users`, `/support`, `/settlement`

Enterprise banner shown on hidden finance pages.

---

## Files Modified

### Backend (regression fix)

- `src/modules/payment/payment.module.ts`
- `src/modules/payment/controllers/payment.controller.ts`
- `src/modules/agent-deposit/agent-deposit.module.ts`
- `src/modules/agent-platform/agent-platform.module.ts`
- `src/app.module.ts`
- `src/modules/audit-log/audit-log.module.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/maintenance-center/maintenance-center.module.ts`

### Partner frontend

- `apps/partner/lib/agent-platform/navigation.ts`
- `apps/partner/components/layout/Sidebar.tsx`
- `apps/partner/components/wallet/WalletSubNav.tsx`
- `apps/partner/components/orders/OrdersSubNav.tsx`
- `apps/partner/components/api/ApiSubNav.tsx`
- `apps/partner/components/platform/EnterpriseModuleBanner.tsx`
- `apps/partner/components/platform/panels/DocsPanel.tsx`
- `apps/partner/app/(platform)/orders/*`
- `apps/partner/app/(platform)/api/*`
- `apps/partner/app/(platform)/webhooks/WebhooksPageClient.tsx`
- `apps/partner/app/(platform)/wallet/deposit-history/*`
- `apps/partner/app/(platform)/notifications/*`
- `apps/partner/app/(platform)/settings/SettingsPageClient.tsx`
- `apps/partner/app/(platform)/finance/*` (enterprise banners)
- `apps/partner/lib/partner-session.ts`
- `apps/partner/lib/build-version.ts`
- `docker-compose.local-full.yml`
- `scripts/verify-admin-hotfix.mjs`

---

## Verification Results

### Admin API (via `scripts/verify-admin-hotfix.mjs`)

| Endpoint | Status |
|----------|--------|
| `/health` | 200 |
| `/api/v1/admin/dashboard` | 200 |
| `/api/v1/admin/orders` | 200 |
| `/api/v1/admin/providers/status` | 200 |
| `/api/v1/admin/providers/:id/runtime-settings` | 200 |
| `/api/v1/admin/settings/payment/runtime` | 200 |
| `/api/v1/admin/settings/provider/esale` | 200 |
| `/api/v1/admin/configuration/overview` | 200 |
| `/api/v1/admin/webhooks/statistics` | 200 |
| `/api/v1/admin/system/health` | 200 |
| `/api/v1/admin/queues` | 200 |

### Portal frontends

| URL | Status |
|-----|--------|
| `http://admin.localhost` | 200 |
| `http://localhost` | 200 |
| `http://partner.localhost/dashboard` | 307 (auth redirect) |
| `http://customer.localhost` | 307 (auth redirect) |

### Docker

- `docker compose build api partner admin` — **PASS**
- API container — **healthy** (`Nest application successfully started`)

---

## Not Modified

Payment Engine, Provider Engine, Ledger, Webhook Engine, Queue, Notification, Monitoring, Configuration, Maintenance business logic, database schema.
