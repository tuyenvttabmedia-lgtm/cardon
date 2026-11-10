# Customer Center Wave 1 — Phase B (Layout & Component Design)

**Status:** Approved scope (owner 2026-11-09). No migration. No prod deploy/commit from this wave doc alone.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Khách hàng                                          │
│ Search [q]  Status [select]  [Xóa bộ lọc]                   │
├──────────────────────┬──────────────────────────────────────┤
│ LIST ~40%            │ DETAIL ~60%                          │
│ (independent scroll) │ (independent scroll)                 │
│                      │                                      │
│ rows: email, name,   │ empty state OR                       │
│ phone, status,       │ tabs: Tổng quan | Đơn hàng | Bảo mật │
│ created, lastLogin   │                                      │
│ pagination 25/50     │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- Selected via `?id=<uuid>` (existing GlobalSearch compatible).
- No auto-select first row.
- Mobile: list OR detail full-width; back clears `id`.

## Component tree

```
app/customers/page.tsx
└── CustomersPageClient
    ├── CustomersListPanel
    └── CustomerDetailPanel
        ├── CustomerOverviewTab
        ├── CustomerOrdersTab
        └── CustomerSecurityTab
```

## Files (planned)

| Path | Change |
|------|--------|
| `apps/admin/app/customers/page.tsx` | Thin Suspense wrapper |
| `apps/admin/components/customers/*` | New UI |
| `apps/admin/types/api.ts` | List envelope + detail KPI/loginEvents |
| `apps/admin/services/api-client.ts` | Typed list/detail params |
| `apps/admin/lib/i18n/vi.ts` | Copy |
| `src/modules/admin/dto/admin-operation.dto.ts` | Filters + loginEvent pagination |
| `src/modules/admin/repositories/admin.repository.ts` | items+total, KPIs, audit login events, order product labels |
| `src/modules/admin/services/admin-customer.service.ts` | Wire KPIs + login events |
| `src/modules/admin/admin-operation.spec.ts` / new customer center spec | Regression |

## KPI definitions (Wave 1)

| Metric | Definition |
|--------|------------|
| `totalOrders` | Distinct Order count for user, `deletedAt=null`, exclude admin-test |
| `successfulOrders` | `paymentStatus=PAID` AND `fulfillmentStatus=COMPLETED` |
| `failedOrCancelledOrders` | `paymentStatus ∈ {FAILED,EXPIRED}` OR `fulfillmentStatus=FAILED`, **excludes** `REFUNDED` |
| `refundedOrders` | `paymentStatus=REFUNDED` (own bucket) |
| `totalPaidAmount` / `totalSpending` | SUM `totalAmount` where `paymentStatus=PAID` (orders, not payment attempts) |

## Login events (best-effort)

Query `audit_logs` where `targetType=USER`, `targetId=customerId`, `action ∈ {LOGIN_SUCCESS,LOGIN_FAILED}`.  
UI label: nguồn `audit_logs` — **không** gọi là Customer Login History chính thức.  
Registration IP: luôn «Chưa có dữ liệu» (no column).

## Out of scope

Migration, login history table, register/login write path, Activity Timeline, session revoke, payment/webhook/fulfillment, deploy, commit.
