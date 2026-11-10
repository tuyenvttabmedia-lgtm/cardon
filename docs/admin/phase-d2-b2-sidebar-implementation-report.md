# CardOn Admin — Phase D2-B2 Sidebar Implementation Report

**Date:** 2026-11-10  
**Mode:** LOCAL only — **không commit / deploy**  
**Verdict:** **PASS (LOCAL)** — chờ Owner nghiệm thu UI

Kế hoạch chốt: `docs/admin/phase-d2-b2-sidebar-implementation-plan.md`

---

## 1. Đánh giá quyết định Owner

Các chốt **hợp lý** và khớp audit D2-B1:

| Chốt | Đánh giá |
|---|---|
| Refunds → Tài chính; Agent Orders → Kinh doanh | Đúng tách nghiệp vụ đơn vs lifecycle đại lý |
| Wallet không menu mới | Đúng — tab agent detail |
| Health trong Cấu hình | Đúng — khác Monitoring |
| Payments ADMIN + `payments.view`; giữ SUPER_ADMIN bypass; không đổi backend | Đúng, tối thiểu risk RBAC |
| Active match cụ thể hơn cha | Đúng — sửa collision D2-B1 |
| 5 badge + loại Support | Đúng scope hẹp |

### KYC badge — **không triển khai** (xác minh source)

Owner yêu cầu xác minh «READY = chờ admin». Kết quả:

- Không có `AgentKycStatus.READY`.
- `pendingKyc` trên dashboard = count `AgentStatus.PENDING_KYC` (`src/modules/admin/repositories/admin.repository.ts`).
- `PENDING_KYC` gồm chưa nộp (`PENDING`), chờ duyệt (`SUBMITTED`), và `NEED_MORE_INFO` (chờ đại lý).
- Approve/reject admin chỉ khi `SUBMITTED` (`agent.service.ts`).
- UI KYC mặc định filter `SUBMITTED` (`AgentListTable`).

→ **Không dùng `pendingKyc` làm badge.** Chỉ 4 badge: Retail NMR, eSIM NMR, Refund needsAction, Ops exceptions.

---

## 2. Đã triển khai (LOCAL)

### Navigation / RBAC
- `NAV_GROUPS` (7 nhóm) + `NAV_ITEMS` gắn `group` / `match` / `badgeKey`.
- Payments `visibleForRoles`: `SUPPORT | ACCOUNTANT | ADMIN`.
- `isNavItemActive` — products / orders-retail / finance-hub / agents-hub / operations-hub / configuration-hub.
- SUPER_ADMIN bypass và allowlist SUPPORT/ACCOUNTANT/MARKETING **giữ semantics D2-A**.

### Sidebar UI
- Desktop **248px** / collapsed **68px** (`AdminSidebar.tsx`), persist localStorage.
- Group accordion + menu search + tooltip/`title` khi collapsed.
- Mobile drawer giữ auto-close.
- Dark Navy + active border-l.

### Badges
- Hook `useSidebarBadges` — API hiện có; ẩn khi 0 / lỗi / thiếu quyền.
- Không API mới; không badge KYC / Support.

---

## 3. Files chạm

| File | Thay đổi |
|---|---|
| `apps/admin/lib/permissions.ts` | Groups, match, Payments ADMIN, active helper |
| `apps/admin/lib/permissions.test.ts` | D2-A regression + D2-B2 active/RBAC |
| `apps/admin/components/layout/AdminSidebar.tsx` | **Mới** — shell sidebar |
| `apps/admin/components/layout/AdminShell.tsx` | Dùng DesktopSidebar / SidebarNav |
| `apps/admin/hooks/useSidebarBadges.ts` | **Mới** — 4 badge |
| `docs/admin/phase-d2-b2-sidebar-implementation-plan.md` | Plan Owner-locked |
| `docs/admin/phase-d2-b2-sidebar-implementation-report.md` | Báo cáo này |

---

## 4. Tests / build

| Check | Result |
|---|---|
| `vitest` permissions + refund-admin-ui + order-action-confirm | **PASS** |
| `vitest` dashboard-ui | **PASS** |
| `npm run build --workspace=@cardon/admin` | **PASS** (exit 0) |

---

## 5. Acceptance checklist

- [x] 7 nhóm theo Owner
- [x] Refunds trong Tài chính; Agent Orders trong Kinh doanh
- [x] Payments ADMIN khi `payments.view`; SUPER_ADMIN bypass; MARKETING không mở
- [x] Active products / finance / agents / ops / configuration đúng boundary
- [x] 4 badge READY; KYC skipped + báo cáo; Support không badge
- [x] 248 / 68, search, groups, mobile close
- [x] Không đổi backend permission / seed / API mới
- [x] Không commit / deploy

---

## 6. Việc Owner nên nghiệm thu trên LOCAL

1. SUPER_ADMIN: đủ 7 nhóm; Payments hiện; collapse/search.
2. ADMIN + `payments.view`: thấy Thanh toán; không `payments.view`: ẩn.
3. Active: Catalog eSIM không sáng Sản phẩm; `/finance/esim` sáng Tài chính; `/refunds` chỉ Hoàn tiền; `/agents/kyc` sáng Đại lý.
4. Badge >0 chỉ khi có việc; F12 network không 4xx spam (403 → ẩn).
5. Mobile drawer đóng sau chọn menu.

**DỪNG — chờ Owner nghiệm thu. Không commit/deploy.**
