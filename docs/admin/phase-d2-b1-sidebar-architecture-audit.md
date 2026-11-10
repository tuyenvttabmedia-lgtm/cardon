# CardOn Admin — Phase D2-B1: Sidebar Architecture Audit

**Phase:** D2-B1 (READ-ONLY)  
**Date:** 2026-11-10  
**Scope:** Khảo sát Sidebar hiện tại, inventory route/RBAC, đề xuất mapping 7 nhóm — **không triển khai**.  
**Verdict:** **PASS** (audit đủ acceptance; có issue/NOT VERIFIED được liệt kê rõ)

Evidence UI: `docs/admin/visual-qa-d2b1/sidebar-flat-menu-refunds.png` (screenshot Owner — menu flat, mục Hoàn tiền active).

---

## 1. Executive Summary

Sidebar Admin hiện là **danh sách phẳng 17 mục** (Dark Navy `bg-slate-950`, desktop `w-64` = **256px**), lọc bằng `canAccessNavItem` trong `AdminShell`. Không có nhóm thu gọn, không có menu search, không có collapse/tooltip, không có badge công việc trên sidebar.

Thiết kế Owner chốt (248 / 68 px, groups, menu search, badge việc cần xử lý) **chưa có trong source** — D2-B2 mới triển khai.

Phát hiện quan trọng:

| ID | Mức | Nội dung |
|---|---|---|
| B1-01 | High | `/payments` dùng `visibleForRoles: ['SUPPORT','ACCOUNTANT']` + SUPER_ADMIN bypass (D2-A). **ADMIN bị ẩn** menu Payments dù có `payments.view`. |
| B1-02 | High | Active state: `/products` và `/products/esim` **cùng sáng** khi đang ở Catalog eSIM (prefix match). |
| B1-03 | Med | Hub sidebar trỏ `/finance/supplier` và `/agents/overview` — vào sub-route khác trong cùng hub thì **mất active** ở sidebar. |
| B1-04 | Med | `pricing-routes.ts` khai báo `/pricing/*` nhưng **không có** `app/pricing/**` pages. |
| B1-05 | Med | `/configuration/esim-go` có page nhưng **không** nằm trong `CONFIGURATION_SECTIONS`. |
| B1-06 | Low | Không có menu search; GlobalSearchBar là search nghiệp vụ (đơn/email/ref), không phải tìm menu. |
| B1-07 | Info | Badge sidebar: chưa có UI; một số nguồn đếm đã có API (dashboard backlog, ops cards, refunds `needsAction`, eSIM dashboard) — cần contract badge riêng trước D2-B2. |

D2-A regression (SUPER_ADMIN thấy Payments): **VERIFIED** qua unit test + source `canAccessNavItem`.

---

## 2. Sidebar component architecture

### 2.1 Thành phần chính

| Thành phần | File | Vai trò |
|---|---|---|
| Layout + Sidebar desktop | `apps/admin/components/layout/AdminShell.tsx` → `AdminLayout` | `aside` sticky, brand, `SidebarNav`, footer |
| Nav filter | Cùng file → `SidebarNav` | `NAV_ITEMS.filter(canAccessNavItem)` |
| Mobile drawer | Cùng file → `MobileNavDrawer` | Hamburger `lg:hidden` + `Drawer` |
| Drawer primitive | `apps/admin/components/ui/Dialog.tsx` → `Drawer` | Focus trap, Escape, overlay; width `w-72` |
| Menu registry | `apps/admin/lib/permissions.ts` → `NAV_ITEMS` | Single source of truth cho sidebar top-level |
| Access logic | `canAccessNavItem`, `ROLE_NAV_ALLOWLIST`, `hasPermission` | Role allowlist + permission + SUPER_ADMIN bypass |
| Auth wiring | `useAuth()` | `permissions`, `user.role` |
| Global search (header) | `apps/admin/components/layout/GlobalSearchBar.tsx` | **Không** phải menu search |
| Notification badge | `apps/admin/components/layout/AdminNotificationBell.tsx` | Badge unread notifications (header, không phải sidebar) |
| Section / hub nav | `SectionNav` (`components/ui/Navigation.tsx`) + hub configs | Sub-nav trong page, không phải sidebar |

### 2.2 Cấu trúc dữ liệu menu

```ts
interface NavItem {
  href: string;
  label: string;
  permission?: string;
  permissions?: string[];   // ANY-of
  roles?: string[];         // explicit role gate (staff/config)
  visibleForRoles?: string[]; // additive visibility filter
}
```

Không có: `group`, `icon`, `badge`, `children`, `collapsed`, `searchKeywords`.

### 2.3 Collapse / expand / persistence

| Khả năng | Hiện trạng |
|---|---|
| Collapse sidebar 68px | **Không có** |
| Group accordion | **Không có** |
| Persist open state | **Không có** |
| Menu search | **Không có** |
| Tooltip khi collapsed | **Không có** |

### 2.4 Active route

Logic trong `SidebarNav` (`AdminShell.tsx`):

- Đặc biệt `/orders`: active khi `pathname === '/orders'` **hoặc** `/orders/:id` (regex một segment) — **không** active trên `/orders/agent`.
- Các mục khác: `pathname === href || pathname.startsWith(href + '/')`.

Hệ quả:

- `/esim-ops`, `/monitoring`, `/configuration`, `/refunds`, `/support/tickets` — nested OK.
- `/products` + `/products/esim` — **cả hai active** trên Catalog eSIM (B1-02).
- `/finance/supplier` — không active trên `/finance/esim|retail|…` (B1-03).
- `/agents/overview` — không active trên `/agents/list|kyc|…` (B1-03).

Query parameters: **không** ảnh hưởng active (chỉ pathname).

### 2.5 Mobile

- Breakpoint: sidebar desktop `hidden … lg:flex`; drawer `lg:hidden`.
- Đóng drawer: `useEffect` theo `pathname` + `onNavigate` khi click link + overlay/Escape.
- Panel: `w-72 max-w-[85vw]`, dark theme override `bg-slate-950`.

### 2.6 Theme / kích thước thực tế

| Spec Owner | Hiện tại | Gap |
|---|---|---|
| Expanded 248px | `w-64` = 256px | −8px |
| Collapsed 68px | N/A | Chưa có |
| Dark Navy | `bg-slate-950` + `border-slate-800` | Gần khớp |
| Active = nền + indicator trái | `border-l-2 border-admin-400 bg-white/10` | Đã có pattern tương tự |
| Menu dài | Flat 17 items + scroll `overflow-y-auto` | Evidence screenshot Owner |

---

## 3. Complete route inventory

Nguồn: `apps/admin/app/**/page.tsx` + redirects `apps/admin/next.config.ts`.

### 3.1 Top-level / hub pages (có thể gắn sidebar)

| Route | Page | Ghi chú |
|---|---|---|
| `/dashboard` | `app/dashboard/page.tsx` | Ops Cockpit |
| `/orders` | `app/orders/page.tsx` | B2C retail |
| `/orders/agent` | `app/orders/agent/page.tsx` | Agent API orders |
| `/orders/[id]` | DYNAMIC | Chi tiết đơn |
| `/esim-ops` | `app/esim-ops/page.tsx` | eSIM ops list |
| `/esim-ops/[id]` | DYNAMIC | |
| `/esim-ops/payments` | Sub | |
| `/esim-ops/attempts` | Sub | |
| `/refunds` | `app/refunds/page.tsx` | |
| `/refunds/[id]` | DYNAMIC | |
| `/payments` | `app/payments/page.tsx` | Manual / payment list |
| `/products` | `app/products/page.tsx` | |
| `/products/esim` | Catalog eSIM | |
| `/providers` | `app/providers/page.tsx` | NCC status |
| `/providers/[id]` | DYNAMIC | |
| `/customers` | `app/customers/page.tsx` | |
| `/marketing` (+ nhiều sub) | CMS hub | Sub-nav `MarketingNav` |
| `/support/tickets` | Support | |
| `/finance/*` | Finance hub | Sidebar trỏ `/finance/supplier`; SectionNav 5 mục |
| `/operations` (+ exceptions/…) | Ops hub | Exception Center = `/operations/exceptions` |
| `/monitoring` (+ server/…) | Monitoring hub | |
| `/agents/overview` (+ list/kyc/…) | Agent Center | Redirect `/agents` → overview |
| `/staff` | Admin staff | |
| `/configuration` (+ many) | Config hub | Health = `/configuration/health` |
| `/account` | User menu only | Không có trong `NAV_ITEMS` |
| `/login` | Auth | Ngoài shell |

### 3.2 Redirects / legacy (next.config)

| Source | Destination | Phân loại |
|---|---|---|
| `/settings`, `/settings/*` | `/configuration…` | LEGACY_ROUTE |
| `/audit` | `/configuration/audit` | LEGACY_ROUTE |
| `/finance` , `/finance/dashboard`, `/finance/providers` | `/finance/supplier` | LEGACY / alias |
| `/finance/payments` | `/finance/gateway-fee` | LEGACY alias |
| `/finance/agents` | `/agents` | LEGACY |
| `/agents` | `/agents/overview` | Alias |
| `/monitoring/partner-api-logs` | `/monitoring/api-logs` | LEGACY |
| `/configuration/feature-flags|advanced|security|integrations` | system/config | LEGACY |

### 3.3 Routes có file nhưng không có top-level sidebar

Ví dụ: toàn bộ sub của finance/agents/monitoring/configuration/marketing; `/account`; `/configuration/esim-go`; `/agents/registration` (có page; subnav chỉ có `registration/invite`).

### 3.4 Config khai báo route nhưng không có page

| Config | Routes | Phân loại |
|---|---|---|
| `lib/pricing-routes.ts` | `/pricing/overview|groups|agents|providers|discounts|history` | **ROUTE_MISSING** (không có `app/pricing/**`) — margin nằm ở `/agents/margin-config` |

---

## 4. Current menu inventory

Nguồn: `NAV_ITEMS` trong `apps/admin/lib/permissions.ts` (17 items). Labels từ `vi.nav.*` / hardcode.

| # | Label hiện tại | href | Permission gate | Extra gates |
|---|---|---|---|---|
| 1 | Tổng quan | `/dashboard` | `admin.dashboard` | — |
| 2 | Đơn hàng | `/orders` | `orders.read` | — |
| 3 | Đơn đại lý | `/orders/agent` | `orders.read` | — |
| 4 | Đơn hàng eSIM | `/esim-ops` | `orders.read` | — |
| 5 | Hoàn tiền | `/refunds` | ANY refund.* | — |
| 6 | Sản phẩm | `/products` | `products.manage` | — |
| 7 | Catalog eSIM | `/products/esim` | `products.manage` | — |
| 8 | NCC · Trạng thái | `/providers` | `providers.manage` | — |
| 9 | Khách hàng | `/customers` | `customers.read` | — |
| 10 | Marketing | `/marketing` | `cms.manage` | — |
| 11 | Hỗ trợ | `/support/tickets` | `support.manage` | — |
| 12 | Tài chính | `/finance/supplier` | `finance.view` | — |
| 13 | Vận hành | `/operations` | ANY `reconciliation.read` \| `finance.view` | — |
| 14 | Giám sát | `/monitoring` | ANY activity/webhook/queue/notification/server | — |
| 15 | Đại lý | `/agents/overview` | `users.read` | — |
| 16 | Nhân sự quản trị | `/staff` | `users.manage` | `roles: SUPER_ADMIN\|ADMIN` |
| 17 | Thanh toán | `/payments` | `payments.view` | `visibleForRoles: SUPPORT\|ACCOUNTANT` (+ SUPER_ADMIN bypass) |
| 18* | Cấu hình | `/configuration` | `configuration.read` | `roles: SUPER_ADMIN\|ADMIN` |

\*Đếm 17 mục trong mảng; bảng trên liệt kê đủ entry (payments nằm trước configuration trong source — thứ tự UI: … staff, payments, configuration).

Thứ tự UI thực tế (source order): dashboard → orders → orders/agent → esim-ops → refunds → products → products/esim → providers → customers → marketing → support → finance → operations → monitoring → agents → staff → **payments** → configuration.

Evidence screenshot: flat list, Hoàn tiền active, không group.

---

## 5. RBAC matrix theo role

### 5.1 Cơ chế (phân biệt visibility vs API)

1. **`ROLE_NAV_ALLOWLIST`** — ACCOUNTANT / MARKETING / SUPPORT chỉ thấy href thuộc prefix list. ADMIN / SUPER_ADMIN **không** có allowlist.
2. **`item.roles`** — chặn mọi role không nằm trong list (kể cả SUPER_ADMIN nếu thiếu — hiện staff/config gồm SUPER_ADMIN).
3. **SUPER_ADMIN bypass** — sau `item.roles`, `role === 'SUPER_ADMIN' → true` (bỏ qua `visibleForRoles` + permission check ở nav). **D2-A semantics — giữ nguyên.**
4. **`visibleForRoles`** — filter thêm (Payments).
5. **`permission` / `permissions`** — check JWT/me permissions (ADMIN và staff thường).
6. **API authorization** — Nest guards riêng; menu VISIBLE ≠ API 200.

Ma trận quyền DB tham chiếu: `scripts/deploy/sync-rbac-production.mjs` `ROLE_PERMISSION_MATRIX` (seed/sync). Client nav dùng permissions từ `/auth/me`.

### 5.2 Visibility matrix (nav)

Giả định role có **đủ permission theo matrix seed** (không giả định custom grant).

| Menu | SUPER_ADMIN | ADMIN | SUPPORT | ACCOUNTANT | MARKETING |
|---|---|---|---|---|---|
| Tổng quan `/dashboard` | VISIBLE | VISIBLE | HIDDEN (thiếu `admin.dashboard`) | HIDDEN (allowlist + perm) | HIDDEN |
| Đơn hàng `/orders` | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN |
| Đơn đại lý `/orders/agent` | VISIBLE | VISIBLE | VISIBLE | VISIBLE (prefix `/orders`) | HIDDEN |
| Đơn hàng eSIM `/esim-ops` | VISIBLE | VISIBLE | VISIBLE | VISIBLE | HIDDEN |
| Hoàn tiền `/refunds` | VISIBLE | VISIBLE | VISIBLE (`refund.request`) | VISIBLE | HIDDEN |
| Sản phẩm `/products` | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN |
| Catalog eSIM | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN |
| NCC · Trạng thái | VISIBLE | VISIBLE | HIDDEN | HIDDEN | HIDDEN |
| Khách hàng | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN |
| Marketing | VISIBLE | VISIBLE | HIDDEN | HIDDEN | VISIBLE |
| Hỗ trợ | VISIBLE | VISIBLE | VISIBLE | HIDDEN | HIDDEN |
| Tài chính | VISIBLE | VISIBLE | HIDDEN | VISIBLE | HIDDEN |
| Vận hành | VISIBLE | VISIBLE | VISIBLE (`reconciliation.read`) | VISIBLE | HIDDEN |
| Giám sát | VISIBLE | VISIBLE | VISIBLE (queue/webhook/server/…) | HIDDEN | HIDDEN |
| Đại lý | VISIBLE | VISIBLE | VISIBLE (`users.read`) | VISIBLE | HIDDEN |
| Nhân sự | VISIBLE | VISIBLE | HIDDEN (`roles`) | HIDDEN | HIDDEN |
| Thanh toán `/payments` | VISIBLE (D2-A bypass) | **HIDDEN** (`visibleForRoles`) | VISIBLE | VISIBLE | HIDDEN |
| Cấu hình | VISIBLE | VISIBLE | HIDDEN (`roles`) | HIDDEN | HIDDEN |

**Khác:** CUSTOMER/AGENT không vào admin shell (`isAdminStaffRole`).

### 5.3 Trường hợp menu hiện nhưng API có thể 403 / ngược lại

| Case | Nav | API | Ghi chú |
|---|---|---|---|
| ADMIN + Payments | HIDDEN | Có thể 200 nếu gọi URL với `payments.view` | Nav hẹp hơn API |
| SUPPORT + `/dashboard` trong allowlist | HIDDEN (thiếu perm) | N/A | Allowlist không đủ |
| SUPER_ADMIN + Health summary | Nav không có mục Health riêng (nằm trong Configuration) | `system.health.read` | Dashboard cockpit soft-fail 403 nếu thiếu perm (đã gặp prod trước sync RBAC) |
| ACCOUNTANT + Operations | VISIBLE via `finance.view` OR `reconciliation.read` | Một số action cần `operations.manage` / `reconciliation.manage` | Hub đọc được; mutate có thể 403 |
| Giám sát sub-pages | Hub VISIBLE nếu ANY monitoring perm | Từng section có permission riêng trong `MONITORING_SECTIONS` | Sub-nav ẩn mục thiếu perm |

### 5.4 D2-A SUPER_ADMIN Payments

- Source: `canAccessNavItem` — SUPER_ADMIN return true trước `visibleForRoles`.
- Test: `apps/admin/lib/permissions.test.ts` — PASS theo thiết kế.
- ACCOUNTANT vẫn bị chặn `/providers` dù có `finance.view` (allowlist) — regression guard trong cùng file.

---

## 6. Menu-to-route mapping

| Menu hiện tại | Route | Tồn tại? | Page/component | Nhóm nghiệp vụ (thực tế) | Class |
|---|---|---|---|---|---|
| Tổng quan | `/dashboard` | Yes | Dashboard cockpit | Tổng quan | MENU_VALID |
| Đơn hàng | `/orders` | Yes | OrdersList (B2C) | Kinh doanh | MENU_VALID |
| Đơn đại lý | `/orders/agent` | Yes | OrdersList agent | Kinh doanh / Đại lý order | MENU_VALID |
| Đơn hàng eSIM | `/esim-ops` | Yes | eSIM ops | Kinh doanh / Ops eSIM | MENU_VALID |
| Hoàn tiền | `/refunds` | Yes | Refunds list | Tài chính (payout/claim) | MENU_VALID |
| Sản phẩm | `/products` | Yes | Products | Catalog | MENU_VALID |
| Catalog eSIM | `/products/esim` | Yes | eSIM catalog | Catalog | MENU_VALID (+ ACTIVE_COLLISION) |
| NCC · Trạng thái | `/providers` | Yes | Providers | NCC / vận hành | MENU_VALID |
| Khách hàng | `/customers` | Yes | Customers | Kinh doanh | MENU_VALID |
| Marketing | `/marketing` | Yes | Marketing hub | CMS | MENU_VALID |
| Hỗ trợ | `/support/tickets` | Yes | Tickets | CS / ops | MENU_VALID |
| Tài chính | `/finance/supplier` | Yes | FinanceShell | Tài chính | MENU_VALID (hub entry hẹp) |
| Vận hành | `/operations` | Yes | Ops hub (+ Exception Center) | Vận hành | MENU_VALID |
| Giám sát | `/monitoring` | Yes | Monitoring hub | Giám sát | MENU_VALID |
| Đại lý | `/agents/overview` | Yes | Agent Center | Đại lý | MENU_VALID (hub entry hẹp) |
| Nhân sự | `/staff` | Yes | Staff | Quản trị | MENU_VALID |
| Thanh toán | `/payments` | Yes | Payments | Tài chính / ops TT | MENU_VALID (RBAC nav đặc biệt) |
| Cấu hình | `/configuration` | Yes | Config hub (+ Health) | Quản trị | MENU_VALID |
| — | `/account` | Yes | Account | User | ROUTE_UNLINKED (sidebar) |
| — | `/configuration/esim-go` | Yes | eSIM Go config | Quản trị | ROUTE_UNLINKED (config subnav) |
| — | `/pricing/*` | **No pages** | — | — | ROUTE_MISSING (config only) |
| — | `/configuration/health` | Yes | System health | Giám sát kỹ thuật / cấu hình | ROUTE_UNLINKED top-level (qua Configuration) |
| — | `/operations/exceptions` | Yes | Exception Center | Vận hành | Qua hub Operations |

**Không DUPLICATE_ROUTE** top-level (một href một entry). Trùng **active highlight** ≠ duplicate route.

---

## 7. Proposed 7-group navigation

**Quy tắc áp dụng:** không tạo route mới; mỗi chức năng một vị trí chính; dynamic/detail không lên sidebar; Marketing/Support map vào nhóm hiện có.

| Nhóm mới | Tên menu đề xuất | Route thực tế | Menu hiện tại | RBAC (giữ semantics) | Quyết định |
|---|---|---|---|---|---|
| 1. Tổng quan | Tổng quan | `/dashboard` | Tổng quan | `admin.dashboard` | GIỮ |
| 2. Kinh doanh & Đơn hàng | Đơn bán lẻ | `/orders` | Đơn hàng | `orders.read` | ĐỔI NHÃN nhẹ (rõ B2C) |
| 2 | Đơn đại lý | `/orders/agent` | Đơn đại lý | `orders.read` | GIỮ — **không** gộp vào nhóm Đại lý |
| 2 | Đơn hàng eSIM | `/esim-ops` | Đơn hàng eSIM | `orders.read` | GIỮ |
| 2 | Sản phẩm | `/products` | Sản phẩm | `products.manage` | GIỮ |
| 2 | Catalog eSIM | `/products/esim` | Catalog eSIM | `products.manage` | GIỮ; sửa active collision ở B2 |
| 2 | Khách hàng | `/customers` | Khách hàng | `customers.read` | GIỮ |
| 2 | Hỗ trợ | `/support/tickets` | Hỗ trợ | `support.manage` | GIỮ trong Kinh doanh (CS gắn đơn/KH) |
| 3. Tài chính | Tài chính | `/finance/supplier` *(hoặc hub `/finance` redirect)* | Tài chính | `finance.view` | GIỮ entry; subnav hiện có |
| 3 | Hoàn tiền | `/refunds` | Hoàn tiền | refund.* | **CHUYỂN nhóm** → Tài chính (claim/payout/đối soát; copy UI đã nói không tự chuyển tiền) |
| 3 | Thanh toán | `/payments` | Thanh toán | `payments.view` + visibleForRoles / SUPER_ADMIN | GIỮ RBAC D2-A; **Owner cần chốt** có hiện cho ADMIN không |
| 4. Đại lý & Phân phối | Đại lý | `/agents/overview` | Đại lý | `users.read` | GIỮ; wallet chỉ là tab detail (`ledger.view`) — **không** tạo menu Wallet |
| 5. Vận hành & Nhà cung cấp | Vận hành | `/operations` | Vận hành | recon/finance | GIỮ; Exception Center = child `/operations/exceptions` |
| 5 | NCC · Trạng thái | `/providers` | NCC · Trạng thái | `providers.manage` | GIỮ trong Vận hành & NCC |
| 6. Giám sát hệ thống | Giám sát | `/monitoring` | Giám sát | monitoring perms | GIỮ |
| 6 | *(không nhân đôi)* Health | `/configuration/health` | (trong Cấu hình) | `system.health.read` / `settings.manage` | **Không** thêm top-level Health — khác Monitoring (runtime/infra vs integrity scan). Deep-link từ dashboard đủ |
| 7. Quản trị hệ thống | Marketing | `/marketing` | Marketing | `cms.manage` | ĐẶT vào Quản trị (CMS), không tạo nhóm 8 |
| 7 | Nhân sự quản trị | `/staff` | Nhân sự | `users.manage` + roles | GIỮ |
| 7 | Cấu hình | `/configuration` | Cấu hình | `configuration.read` + roles | GIỮ (gồm Health/Backup/…) |

### 7.1 Quyết định các câu hỏi Owner

| Câu hỏi | Quyết định đề xuất | Lý do (chức năng/route) |
|---|---|---|
| Hoàn tiền thuộc Tài chính? | **Có** | Workflow request → approve → manual payout → recon; API `/admin/refund-requests`; không phải fulfillment order list |
| Đơn đại lý vs quản lý đại lý cùng nhóm? | **Không** | `/orders/agent` = đơn hàng; `/agents/*` = lifecycle KYC/wallet/API — tách nhóm 2 vs 4 |
| Agent wallet? | **Không lên sidebar** | Tab trong `/agents/[id]` (`permission: ledger.view`); statement/invoices cũng là tab |
| Provider status | Nhóm 5 | Runtime NCC, không phải config credentials (`/configuration/providers`) |
| Monitoring vs Health trùng? | **Không trùng** | Monitoring = server/queues/webhooks/activity; Health = integrity scan `/configuration/health` |
| Exception Center | Child của Vận hành | Đã có `/operations/exceptions`; hub `/operations` đã card link |

### 7.2 Không đưa lên sidebar

- Dynamic: `/orders/[id]`, `/esim-ops/[id]`, `/refunds/[id]`, `/agents/[id]`, `/providers/[id]`.
- Finance/monitoring/configuration/marketing section routes (giữ SectionNav trong page).
- `/account` (user menu).
- `/pricing/*` (chưa có page).

---

## 8. Badge data source audit

Sidebar **hiện không render badge**. Notification bell có unread badge (header) — không dùng cho menu item.

| Badge dự kiến | Nguồn dữ liệu | API hiện có | Điều kiện đếm | Tái sử dụng? | Kết luận |
|---|---|---|---|---|---|
| Orders cần xử lý (B2C) | `DashboardStats.backlog` | `GET /admin/dashboard` | `needManualReview`, `waitingAdminRetry`, `pendingDelivery`, `processing` | Có — đã dùng cockpit | **READY** nếu badge = tổng action-needed rõ contract (không lẫn KPI doanh thu) |
| Orders NMR | Cùng backlog / order filters | Dashboard + list `attn=NEED_MANUAL_REVIEW` | `needManualReview` | Có | **READY** (số order status, không phải attempt) |
| eSIM cần xử lý | `EsimOpsDashboard` / list counts | `GET /admin/esim-ops/dashboard` | `needManualReview` (+ waiting/failed trên UI) | Có trên eSIM page | **READY** — tách badge eSIM vs B2C |
| Payment cần xử lý | Manual review list | `GET /admin/payments/manual-review` | Độ dài `payments[]` (+ `unknownWebhooks`) | Có list, **không** có count-only nhẹ | **CONDITIONAL** — tái sử dụng được nhưng payload có thể nặng; chưa có endpoint count |
| Refund needs action | List filter | `GET /admin/refund-requests?needsAction=true` | `total` khi filter | Có | **READY** với `take=1` hoặc dùng `total` — xác minh perf trước B2 |
| Ops exceptions mở | Ops dashboard cards | `GET /admin/operations/dashboard` | `cards.exceptions` | Có | **READY** cho menu Vận hành |
| Support tickets mở | Ticket list | `GET /admin/support/tickets?status=…` | Phụ thuộc status filter | List only | **NOT READY** — chưa có count “cần xử lý” chuẩn hóa |
| Agent KYC pending | Dashboard `agentStatistics.pendingKyc` | `GET /admin/dashboard` | `pendingKyc` | Có | **READY** cho Đại lý — chỉ khi >0 |
| Notification unread | Notification API | `unreadCount()` | unread > 0 | Có | **Không** dùng làm badge sidebar menu (đã có bell); tránh trùng |

**Quy tắc thiết kế (giữ):** không badge `0`; không badge khi lỗi API; không hardcode; không biến badge thành KPI (dùng action-needed counts ở trên).

---

## 9. Responsive / UX findings

| Hạng mục | Hiện trạng | Rủi ro khi chuyển 248/68 |
|---|---|---|
| Width desktop | 256px (`w-64`) | Đổi 248px ảnh hưởng nhỏ tới content offset |
| Collapse 68px | Chưa có | Cần icon + tooltip; mất label text |
| Main offset | Flex row, không `ml-*` fixed | OK với flex; collapsed cần animation width |
| Menu dài | 17 items scroll trong aside | Group accordion giảm chiều dài cảm nhận |
| Tablet | `lg` breakpoint — dưới lg = drawer | Giữ drawer; cân nhắc tablet landscape |
| Mobile drawer | `w-72`, tự đóng sau navigate | Đạt spec “tự đóng” |
| Sticky | Aside `lg:sticky lg:h-screen`; header sticky | OK |
| Active nested | Xem §2.4 | Phải sửa trước/khi group (products, finance, agents) |
| Tooltip collapsed | Không | Bắt buộc cho a11y khi chỉ icon |
| Keyboard / focus | Link chuẩn; Drawer có focus trap | Collapsed icon buttons cần `aria-label` |
| Menu search | Không | Spec Owner yêu cầu — mới hoàn toàn |
| GlobalSearchBar | Search nghiệp vụ | **Không** thay menu search |

Evidence: `docs/admin/visual-qa-d2b1/sidebar-flat-menu-refunds.png`.

---

## 10. D2-A regression verification

| Check | Kết quả | Evidence |
|---|---|---|
| SUPER_ADMIN thấy Payments | **PASS** | `canAccessNavItem` SUPER_ADMIN bypass; `permissions.test.ts` |
| SUPPORT/ACCOUNTANT + `payments.view` + visibleForRoles | **PASS** (unit) | Cùng test file |
| MARKETING không mở Payments dù có `payments.view` | **PASS** (unit) | Allowlist + visibleForRoles |
| `canAccessNavItem` semantics sau D2-A | **PASS** (source) | Không sửa trong D2-B1 |
| Routes không đổi | **PASS** | Read-only audit |
| Không phát sinh quyền mới do gom menu | **N/A B1** | B2 phải map permission y nguyên; chỉ đổi group UI |

Issue ghi nhận (không sửa): **ADMIN không thấy Payments** trên nav (B1-01) — có thể intentional “slim” hoặc sót; cần Owner chốt trước B2.

---

## 11. Risks and unresolved questions

1. **Payments cho ADMIN:** hiện HIDDEN — có đưa vào nhóm Tài chính cho ADMIN không, hay giữ visibleForRoles?
2. **Entry Tài chính:** giữ `/finance/supplier` hay đổi active-match theo prefix `/finance`?
3. **Entry Đại lý:** tương tự prefix `/agents`?
4. **Marketing trong nhóm 7:** Owner có muốn nhóm riêng sau này không?
5. **Hỗ trợ** thuộc Kinh doanh hay Vận hành?
6. **Badge polling:** interval / chỉ load khi expand group / chỉ roles có perm?
7. **`/configuration/esim-go`:** bổ sung CONFIGURATION_SECTIONS ở phase config riêng (ngoài sidebar B2)?
8. **`pricing-routes.ts` dead config:** dọn ở phase khác?

---

## 12. Recommended D2-B2 implementation plan

1. **Chốt Owner** các câu §11 (đặc biệt Payments×ADMIN, nhóm Support/Marketing).
2. Mở rộng model `NavItem` → `NavGroup` + optional `icon`, `badgeKey`, `match: 'exact'|'prefix'|'orders-special'`.
3. Implement shell: width 248 / collapsed 68, accordion groups, localStorage persist, tooltip, menu search (filter label/href).
4. Sửa active matching: products vs products/esim; finance/agents hub prefix.
5. Giữ nguyên `canAccessNavItem` + tests D2-A; thêm test group visibility không đổi semantics.
6. Badge phase hẹp: chỉ gắn keys **READY** (NMR orders, eSIM attention, refunds needsAction, ops exceptions, pending KYC) — hide on 0/error.
7. Visual QA desktop/tablet/mobile + role matrix smoke (SUPER_ADMIN, ADMIN, SUPPORT, ACCOUNTANT, MARKETING).
8. **Không** đổi API permission; **không** deploy lẫn RBAC seed trừ khi Owner yêu cầu riêng.

---

## 13. File paths và evidence

| Path | Dùng cho |
|---|---|
| `apps/admin/lib/permissions.ts` | NAV_ITEMS, allowlist, canAccessNavItem |
| `apps/admin/lib/permissions.test.ts` | D2-A Payments tests |
| `apps/admin/components/layout/AdminShell.tsx` | Sidebar / drawer / active |
| `apps/admin/components/ui/Dialog.tsx` | Drawer |
| `apps/admin/components/ui/Navigation.tsx` | SectionNav |
| `apps/admin/lib/configuration-routes.ts` | Config subnav |
| `apps/admin/lib/monitoring-routes.ts` | Monitoring subnav |
| `apps/admin/lib/agent-routes.ts` | Agent Center subnav |
| `apps/admin/lib/pricing-routes.ts` | Dead `/pricing/*` config |
| `apps/admin/components/finance/FinanceShell.tsx` | Finance SectionNav |
| `apps/admin/components/marketing/MarketingNav.tsx` | Marketing SectionNav |
| `apps/admin/next.config.ts` | Redirects / legacy |
| `apps/admin/app/**/page.tsx` | Route inventory |
| `scripts/deploy/sync-rbac-production.mjs` | Role permission matrix |
| `docs/admin/visual-qa-d2b1/sidebar-flat-menu-refunds.png` | UI evidence Owner |

---

## 14. Kết luận

| Acceptance | Status |
|---|---|
| Inventory menu đầy đủ | **PASS** |
| Inventory route thực tế | **PASS** |
| Đối chiếu menu ↔ route | **PASS** |
| RBAC matrix theo role | **PASS** (dựa seed + source; live multi-role UI **NOT VERIFIED** trong session này) |
| SUPER_ADMIN Payments sau D2-A | **PASS** (unit + source) |
| Phân biệt menu visibility vs API auth | **PASS** |
| Đề xuất mapping 7 nhóm | **PASS** (chờ Owner chốt câu hỏi) |
| Badge data audit | **PASS** |
| Responsive / UX findings | **PASS** |
| Issue / NOT VERIFIED rõ | **PASS** |
| Không đổi source/config/DB | **PASS** (chỉ thêm docs + copy screenshot) |
| Không commit/deploy | **PASS** |

**Phase D2-B1: PASS**

**DỪNG TẠI ĐÂY.** Không triển khai D2-B2 cho đến khi Owner nghiệm thu báo cáo và chốt các quyết định mở (§11).
