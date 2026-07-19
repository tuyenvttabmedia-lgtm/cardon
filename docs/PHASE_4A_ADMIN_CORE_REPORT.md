# Phase 4A — Admin Operation Core

> Date: 2026-06-19  
> Scope: Admin backend APIs (`src/modules/admin/`) — dashboard, orders, payments, providers, agents, audit  
> Not included: Frontend UI, invoice, reconciliation

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:admin` | **PASS (8/8)** |
| Tasks completed | **10/10** |

---

## Module Structure

```
src/modules/admin/
├── controllers/admin.controller.ts
├── services/
│   ├── admin-dashboard.service.ts
│   ├── admin-order.service.ts
│   ├── admin-payment.service.ts
│   ├── admin-provider.service.ts
│   ├── admin-agent.service.ts
│   ├── admin-audit-log.service.ts
│   └── admin-audit.service.ts
├── repositories/admin.repository.ts
├── dto/admin.dto.ts
├── entities/admin.constants.ts
├── admin.module.ts
└── admin.service.spec.ts
```

Prefix: **`/api/v1/admin/*`** (global `api/v1` + `@Controller('admin')`)

Auth: `JwtAuthGuard` + `PermissionsGuard` (+ `RolesGuard` for sensitive agent ops)

---

## Deliverables

### TASK 1: Admin Module

**DONE** — `AdminModule` wired in `AppModule`. Consolidated admin operations; removed duplicate `OrderAdminController`.

### TASK 2: Dashboard API

`GET /api/v1/admin/dashboard` — permission: `admin.dashboard`

Returns: today revenue, orders count, successful/failed payments, pending fulfillment, provider errors, agent statistics.

### TASK 3: Order Management

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/orders` | `orders.read` |
| GET | `/admin/orders/:id` | `orders.read` |

Filters: `paymentStatus`, `fulfillmentStatus`, `status` (alias), `dateFrom`, `dateTo`, `customer` (email).

### TASK 4: Manual Fulfillment Retry

`POST /api/v1/admin/orders/:id/retry` — permission: `orders.retry`

- Only `WAITING_ADMIN_RETRY` orders
- Uses `ProviderService.retryFulfillment()`
- Audit: `ADMIN_PROVIDER_RETRY`

### TASK 5: Payment Manual Review

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/payments/manual-review` | `payments.review` |
| POST | `/admin/payments/:id/resolve` | `payments.review` |

Cases: late payment (`gatewayResponse.manualReview`), unknown webhooks (`webhook_logs.processed = false`)

Actions: `approve` | `reject`

- Approve: `PaymentService.approveManualReview()` — marks payment SUCCESS, order PAID (allows EXPIRED via `markPaidAfterManualReviewInTransaction`), enqueues fulfillment
- Reject: clears manual review flag with reason
- Audit: `ADMIN_PAYMENT_REVIEW_APPROVE` / `ADMIN_PAYMENT_REVIEW_REJECT`

### TASK 6: Provider Management

`GET /api/v1/admin/providers/status` — permission: `providers.manage`

Returns: balance, last check, low balance warning, recent failures. **Read-only** — no config changes.

### TASK 7: Agent Management

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/agents` | `users.read` |
| GET | `/admin/agents/:id` | `users.read` |
| POST | `/admin/agents/:id/suspend` | `agents.manage` + ADMIN/SUPER_ADMIN |
| POST | `/admin/agents/:id/enable-api` | `agents.manage` + ADMIN/SUPER_ADMIN |
| POST | `/admin/agents/:id/disable-api` | `agents.manage` + ADMIN/SUPER_ADMIN |

Balance credit remains on existing `POST /admin/agents/:id/credit` (Agent module). KYC approve/reject unchanged on Agent admin controller.

### TASK 8: Audit Log Viewer

`GET /api/v1/admin/audit-logs` — permission: `audit.view`

Filters: `userId`, `action`, `dateFrom`, `dateTo`, pagination.

### TASK 9: Security

- Every endpoint requires JWT + permission (and role where specified)
- Mutating actions record audit via `AdminAuditService`
- Agent suspend still audited by `AgentAuditService` (existing)

### TASK 10: Tests

File: `src/modules/admin/admin.service.spec.ts`

| Scenario | Status |
|----------|--------|
| Dashboard metrics | PASS |
| Order retry (WAITING_ADMIN_RETRY) | PASS |
| Order retry rejected (wrong status) | PASS |
| Payment review approve + audit | PASS |
| Payment review reject + audit | PASS |
| Agent suspend | PASS |
| Agent enable API + audit | PASS |
| Permission denied | PASS |

Script: `npm run test:admin`

---

## New Permissions (seed)

| Code | Roles |
|------|-------|
| `admin.dashboard` | ADMIN, SUPER_ADMIN |
| `audit.view` | ADMIN, SUPER_ADMIN |
| `payments.review` | ADMIN, SUPER_ADMIN, ACCOUNTANT |

---

## Related Changes

| File | Change |
|------|--------|
| `order/order.module.ts` | Removed `OrderAdminController` (moved to Admin) |
| `order/services/order.service.ts` | `markPaidAfterManualReviewInTransaction` |
| `payment/services/payment.service.ts` | Manual review queue + approve/reject |
| `payment/repositories/payment.repository.ts` | Manual review queries |
| `agent/controllers/agent.controller.ts` | Suspend moved to Admin module |

---

## Explicitly Out of Scope

- Admin frontend UI
- Invoice generation
- Reconciliation reports
- Provider config editing

---

## Verification Commands

```powershell
$node = "C:\Users\MyHome\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe"
Set-Location C:\Users\MyHome\Projects\cardon
& $node node_modules/@nestjs/cli/bin/nest.js build
& $node node_modules/jest/bin/jest.js --testPathPattern=admin
```

---

## Result

**Phase 4A Admin Operation Core — FULL PASS**

Stopped after Admin Core. Frontend not started.
