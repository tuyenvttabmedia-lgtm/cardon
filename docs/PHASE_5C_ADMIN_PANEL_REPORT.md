# Phase 5C — Admin Panel Frontend

> Date: 2026-06-19  
> Scope: Admin panel (`apps/admin/`)  
> Not included: Deployment, backend changes

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` (admin) | **PASS** (13 routes) |
| Tasks completed | **13/13** |

---

## Module Structure

```
apps/admin/
├── app/
│   ├── layout.tsx              # AuthGuard + AdminLayout
│   ├── login/
│   ├── dashboard/
│   ├── orders/
│   ├── payments/
│   ├── products/
│   ├── agents/
│   ├── providers/
│   ├── finance/
│   └── audit/
├── components/
│   ├── layout/AdminShell.tsx   # Sidebar, Topbar, User menu, RBAC
│   └── ui/                     # Form, Display (Badge, Card, 403)
├── services/api-client.ts
├── hooks/useAuth.ts
├── lib/
│   ├── permissions.ts          # NAV_ITEMS + canAccessNavItem
│   ├── auth-storage.ts
│   └── utils.ts
└── types/api.ts
```

Tech: **Next.js 15**, **TypeScript**, **Tailwind CSS 3**  
Dev port: **3003**

---

## Deliverables

### TASK 1: Admin app structure — **DONE**

Workspace `@cardon/admin`, script `npm run build:admin`.

### TASK 2: Authentication — **DONE**

- Login `/auth/login` + `GET /auth/me` (permissions[])
- JWT refresh on 401
- Logout + clear session
- Hỗ trợ roles: SUPPORT, MARKETING, ACCOUNTANT, ADMIN, SUPER_ADMIN (hiển thị badge role)

### TASK 3: Admin layout — **DONE**

- Sidebar (desktop) + topbar + user menu
- Mobile: nav scroll ngang
- Menu lọc theo `permissions[]` từ `/auth/me`
- `RequirePermission` — trang 403 nếu thiếu quyền

### TASK 4: Dashboard — **DONE**

Route `/dashboard` · Permission `admin.dashboard` · Roles ADMIN/SUPER_ADMIN

Hiển thị: doanh thu hôm nay, đơn hàng, payments success/fail, pending fulfillment, provider errors, agent stats.

### TASK 5: Order management — **DONE**

Route `/orders` · `orders.read`

- List + filter (paymentStatus, fulfillmentStatus, customer email)
- Chi tiết đơn (modal panel)
- Retry fulfillment khi `WAITING_ADMIN_RETRY` + permission `orders.retry`

### TASK 6: Payment management — **DONE**

Route `/payments` · `payments.review`

- Manual review queue
- Approve / Reject
- Unknown webhooks list

### TASK 7: Product management — **DONE**

Route `/products` · `products.manage`

- Categories: list, create, disable
- Products: list (public catalog), create, disable
- Variants: create, disable
- Provider mappings: list, disable, create

**Note:** Backend chưa có `GET /admin/products` — dùng `GET /products` (public) cho danh sách hiển thị.

### TASK 8: Agent management — **DONE**

Route `/agents` · `users.read`

- List + detail
- KYC approve/reject (`agents.kyc.review`) — credentials one-time trong sessionStorage
- Suspend, enable/disable API (`agents.manage`)
- Credit agent (`agents.credit`)
- **Không** hiển thị secret/hash — chỉ `hasApiCredentials` + one-time modal sau approve

### TASK 9: Provider monitor — **DONE**

Route `/providers` · `providers.manage`

- eSale balance, health status, low balance warning
- Recent failures
- Manual refresh (re-fetch API)

### TASK 10: Finance — **DONE**

Route `/finance` · `finance.view`

Tabs: Profit report, Reconciliation reports, Agent statement, Invoices  
CSV export khi có `finance.manage`

### TASK 11: Audit logs — **DONE**

Route `/audit` · `audit.view`

- User, action, time, target, metadata (JSON truncated)
- Filter theo action

### TASK 12: Security — **DONE**

| Biện pháp | Triển khai |
|-----------|------------|
| Ẩn menu không có permission | `NAV_ITEMS` + `canAccessNavItem` |
| 403 handling | `RequirePermission` + `ErrorMessage` |
| Không lưu sensitive data | KYC credentials chỉ sessionStorage tạm; không persist secret/hash |
| JWT keys riêng | `cardon_admin_*` |

### TASK 13: Build — **DONE**

```bash
cd apps/admin && npm run build
# 13 routes, exit 0
```

---

## Permission → Menu mapping

| Menu | Permission |
|------|------------|
| Tổng quan | `admin.dashboard` |
| Đơn hàng | `orders.read` |
| Thanh toán | `payments.review` |
| Sản phẩm | `products.manage` |
| Agent | `users.read` |
| Provider | `providers.manage` |
| Tài chính | `finance.view` |
| Audit log | `audit.view` |

---

## Configuration

| Env | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3003` |

---

## Known API gaps (frontend workarounds)

1. Product admin list — dùng public `/products`
2. Payment list chung — chỉ manual-review queue
3. Provider — read-only, không sync API
4. Order detail — chưa có payments/provider txns trong response

---

## Out of Scope

- Deployment
- Admin backend changes
- Agent Portal / Customer site changes

---

## Previous Phases

| Phase | Status |
|-------|--------|
| Backend Admin API | PASS |
| Finance / Provider / Agent | PASS |
| Customer Website 5A | PASS |
| Agent Portal 5B | PASS |
