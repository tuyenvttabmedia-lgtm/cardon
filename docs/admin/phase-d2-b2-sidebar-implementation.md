# CardOn Admin — Phase D2-B2 Sidebar (+ UX v2 Enterprise)

**Date:** 2026-11-10  
**Mode:** LOCAL only — không commit / deploy  
**Nghiệm thu:** `http://admin.localhost` (Ctrl+F5)

---

## Sidebar UX v2 — Enterprise Navigation Redesign

### Root cause: `/staff` tô «Tổng quan»

| Kiểm chứng | Kết quả |
|---|---|
| `isNavItemActive('/staff', dashboard)` | `false` (match `exact`) |
| `resolveActiveNavHref('/staff', NAV_ITEMS)` | `/staff` |
| Live CDP trên `/staff` | Chỉ `/staff` có `aria-current=page`, `bg #20283A`, border `#FF647C` |

**Nguyên nhân cảm nhận trước đây:**

1. Sidebar dài → mục «Nhân sự» nằm dưới fold; vùng trên chỉ còn «Tổng quan» nhìn nổi.
2. Không có **exclusive active** helper → dễ nhầm khi nhiều match.
3. Sidebar collapsed / group đóng khiến staff ẩn trong popover/group.

**Fix v2:** `resolveActiveNavHref` (1 winner, longest href); `/staff` dùng `match: 'exact'`; nhóm active tự mở; không fallback dashboard cho route unmapped (`/account` → null).

### Thay đổi UX v2

| Hạng mục | Chi tiết |
|---|---|
| Layout 3 vùng | Header 72px cố định · Nav scroll riêng · Footer ~44px cố định |
| Theme | `#080D1C` / hover `#151D30` / active `#20283A` / indicator `#FF647C` |
| Icons | Lucide 18px đồng bộ cho mọi menu item (`lucide-react`) |
| Item height | ~37px; group heading ~28px chevron |
| Search | «Tìm chức năng…»; không dấu; clear; empty state; Enter → route đầu |
| Collapsed 68px | Icon + tooltip; group → popover menu con |
| Badge | Chỉ trên item; thêm **KYC** = `agentCenter.dashboard.pendingReview` (= `SUBMITTED`) |
| Mapping / RBAC | Giữ nguyên Owner chốt |

### KYC badge (xác minh lại)

- `pendingKyc` (AgentStatus.PENDING_KYC) = **không** dùng.
- `pendingReview` = `AgentKyc.count({ status: SUBMITTED })` — đúng hàng chờ admin.
- API: `GET /admin/agent-center/dashboard` · perm `users.read`.

### Route active matrix (unit + live)

| Path | Active href |
|---|---|
| `/dashboard` | `/dashboard` |
| `/staff` | `/staff` |
| `/products` | `/products` |
| `/products/esim` | `/products/esim` |
| `/payments` | `/payments` |
| `/refunds` | `/refunds` |
| `/finance/esim` | `/finance/supplier` |
| `/agents/kyc` | `/agents/overview` |
| `/operations/exceptions` | `/operations` |
| `/configuration/health` | `/configuration` |
| `/account` | **null** (không active) |

### Files changed (v2)

- `apps/admin/package.json` + lock — dependency `lucide-react`
- `apps/admin/lib/permissions.ts` — icons, `resolveActiveNavHref`, `normalizeNavSearch`, KYC badge key
- `apps/admin/lib/permissions.test.ts` — 21 tests
- `apps/admin/components/layout/AdminSidebar.tsx` — shell v2
- `apps/admin/components/layout/AdminShell.tsx` — drawer bg
- `apps/admin/hooks/useSidebarBadges.ts` — `agentKycPending`
- `docs/admin/visual-qa-sidebar-v2/*`
- `docs/admin/phase-d2-b2-sidebar-implementation.md`

### Screenshots

| File | Nội dung |
|---|---|
| `visual-qa-sidebar-v2/01-staff-active-1440.png` | `/staff` → Nhân sự current |
| `visual-qa-sidebar-v2/02-products-esim-active-1440.png` | Catalog eSIM exclusive |
| `visual-qa-sidebar-v2/03-operations-badges-1440.png` | Badge eSIM=1, Ops=38; icons |
| `visual-qa-sidebar-v2/04-search-accent-nhansu.png` | Search «nhan su» → Nhân sự |

### Tests / build

| Check | Result |
|---|---|
| `vitest` permissions | **21 PASS** |
| `tsc` admin | **PASS** |
| Docker `cardon-admin:local-full` build + healthy | **PASS** |

### Vấn đề còn tồn tại (ghi nhận, không sửa trong phase)

1. Main content một số trang có dấu hiệu overflow ngang (Owner screenshot) — ngoài scope Sidebar.
2. Scrollbar native trên nav tối — có thể custom thin scrollbar sau.
3. Visual QA tablet/mobile drawer chưa chụp đủ 14 trạng thái trong session này; Owner có thể verify trên LOCAL.

**DỪNG — chờ Owner nghiệm thu. Không commit/deploy.**
