# Phase 4A.1 — Admin Security Audit

> Date: 2026-06-19  
> Scope: Admin backend APIs only (`src/modules/admin/` + payment manual review path)  
> Not included: Finance, Invoice, Frontend

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` | **PASS** |
| `npm run test:admin` | **PASS (25/25)** |
| Critical issues found | **3** |
| Critical issues fixed | **3** |

---

## Audit Checks

### CHECK 1: Permission enforcement — **PASS**

| Role | Expected | Verified |
|------|----------|----------|
| **SUPPORT** | View orders, retry fulfillment; **cannot** approve payments, suspend agents, dashboard | Seed matrix + guard tests |
| **ACCOUNTANT** | Payment review, view orders; **cannot** suspend agents, dashboard | Seed matrix + guard tests |
| **ADMIN** | Full admin module permissions | Seed matrix |
| **SUPER_ADMIN** | All permissions | Seed matrix |

**Mechanism:** `JwtAuthGuard` + `PermissionsGuard` on all routes; `RolesGuard` on dashboard and agent suspend/enable/disable API.

**Fix applied:** Added `RolesGuard` to `GET /admin/dashboard` (previously `@Roles` decorator had no guard).

---

### CHECK 2: Manual payment approval safety — **PASS** (after fix)

**Scenario:** Admin approves late payment.

| Control | Status |
|---------|--------|
| Payment exists | `requireManualReviewPayment()` |
| Amount matches order total | **NEW** `assertManualReviewPaymentSafe()` |
| Late webhook amount matches (if present) | `assertWebhookAmountMatches()` |
| Order state valid (`WAITING_PAYMENT` / `EXPIRED` / idempotent `PAID`) | **NEW** validation |
| Audit created | `AdminPaymentService.resolveManualReview()` → `ADMIN_PAYMENT_REVIEW_APPROVE` |

**Fix applied:** `PaymentService.assertManualReviewPaymentSafe()` blocks approval when payment amount ≠ order total or order is ineligible.

---

### CHECK 3: Manual fulfillment retry safety — **PASS**

**Scenario:** Admin clicks retry many times.

| Control | Status |
|---------|--------|
| Only `WAITING_ADMIN_RETRY` accepted | `AdminOrderService.retryFulfillment()` |
| Provider retry idempotency | `ProviderService.retryFulfillment()` → recoverable txn + claim |
| Audit per retry | `ADMIN_PROVIDER_RETRY` |

No duplicate provider purchase when status transitions after first success (retry rejected at admin layer).

---

### CHECK 4: Agent suspension — **PASS**

**Scenario:** Agent suspended.

| Expected | Status |
|----------|--------|
| Cannot login Agent API | `AgentApiAuthService` → `AGENT_SUSPENDED` |
| Cannot buy card / new requests | Auth blocked before buy |
| Existing `PROCESSING` continues | Provider/agent-api money audit (Phase 3B.1) |

Admin suspend also sets `apiEnabled: false` via `AgentService.suspendAgent()`.

---

### CHECK 5: Admin credit balance — **PASS**

| Control | Status |
|---------|--------|
| No direct balance update | `AgentService.creditAgent()` → `LedgerService.credit()` only |
| CREDIT ledger entry | `LedgerEntryType.CREDIT` |
| Audit required | `AgentAuditService.recordCredited()` |

Credit endpoint: `POST /admin/agents/:id/credit` (agent module) — permission `agents.credit` (ACCOUNTANT+).

---

### CHECK 6: Audit integrity — **PASS**

Important admin actions record audit **before** return:

| Action | Audit code |
|--------|------------|
| Fulfillment retry | `ADMIN_PROVIDER_RETRY` |
| Payment approve/reject | `ADMIN_PAYMENT_REVIEW_APPROVE` / `REJECT` |
| Agent API enable/disable | `ADMIN_AGENT_API_ENABLED` / `DISABLED` |
| Agent suspend | `AGENT_SUSPENDED` (agent audit) |
| Agent credit | `AGENT_CREDITED` (agent audit) |

---

### CHECK 7: Sensitive data exposure — **PASS** (after fix)

Admin API must **not** expose:

| Field | Mitigation |
|-------|------------|
| `apiKeyHash` | Stripped via `mapAdminAgent()` |
| `secretKeyEncrypted` | Stripped via `mapAdminAgent()` |
| `apiKeyLookup` | Stripped via `mapAdminAgent()` |
| Password hash | User select limited to `id`, `email` (no password) |
| Provider credentials | `listProviderStatus` excludes `apiCredentials` |
| Late webhook raw payload | **NEW** `sanitizeGatewayResponseForAdmin()` in manual review list |

**Fix applied:** `admin-agent.mapper.ts` + sanitized manual review queue responses.

---

### CHECK 8: Pagination protection — **PASS** (after fix)

| Table | Endpoint | Control |
|-------|----------|---------|
| Orders | `GET /admin/orders` | `@Max(100)` on `take` + `resolveAdminPagination()` |
| Audit logs | `GET /admin/audit-logs` | Same |
| Agents | `GET /admin/agents` | Same |
| Transactions | N/A | No admin transactions list endpoint yet |

Default page size: **50**. Maximum page size: **100**.

**Fix applied:** `admin-pagination.util.ts`, DTO validation, repository clamp.

---

## Critical Fixes Summary

1. **Payment amount validation** on manual review approve (`payment.service.ts`)
2. **Agent response sanitization** — no API secrets in admin agent APIs (`admin-agent.mapper.ts`)
3. **Pagination cap** — max 100 rows per request (`admin-pagination.util.ts`, DTOs, repository)

---

## Test Coverage

```
src/modules/admin/admin.service.spec.ts          — 8 tests (Phase 4A core)
src/modules/admin/admin.security-audit.spec.ts   — 17 tests (Phase 4A.1 audit)
```

Run:

```powershell
npm run build
npm run test:admin
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/modules/admin/entities/admin-agent.mapper.ts` | **NEW** — sanitize agent admin responses |
| `src/modules/admin/utils/admin-pagination.util.ts` | **NEW** — pagination clamp |
| `src/modules/admin/entities/admin.constants.ts` | Pagination constants |
| `src/modules/admin/dto/admin.dto.ts` | `@Min`/`@Max` on pagination |
| `src/modules/admin/repositories/admin.repository.ts` | Use pagination util |
| `src/modules/admin/services/admin-agent.service.ts` | Map agents via sanitizer |
| `src/modules/admin/controllers/admin.controller.ts` | `RolesGuard` on dashboard |
| `src/modules/payment/services/payment.service.ts` | Amount validation + gateway sanitize |
| `src/modules/admin/admin.security-audit.spec.ts` | **NEW** — 17 security audit tests |

---

## Out of Scope (per instruction)

- Finance module
- Invoice module
- Frontend admin UI

---

## Next Phase

**Do not start Finance.** Phase 4A.1 complete — ready for owner review.
