# CardOn Admin — Phase D2-B2 Implementation Plan (Owner-locked)

**Date:** 2026-11-10  
**Mode:** LOCAL only — no commit / push / deploy / RBAC seed / new API / business-rule changes.

## Owner decisions (accepted)

### 1. Menu grouping
| Quyết định | Mapping |
|---|---|
| Refunds → Tài chính | `/refunds` trong nhóm Tài chính |
| Agent Orders → Kinh doanh & Đơn hàng | `/orders/agent` không thuộc Đại lý |
| Agent Center / KYC / Wallet | Wallet = tab con, không menu mới; sidebar entry `/agents/overview` |
| Monitoring → Giám sát | `/monitoring` |
| System Health | Giữ trong Cấu hình (`/configuration/health`), không menu Health riêng |

### 2. Payments RBAC
- SUPER_ADMIN: giữ bypass `canAccessNavItem`.
- ADMIN: hiện Payments **khi** có `payments.view` (bổ sung vào `visibleForRoles`).
- SUPPORT / ACCOUNTANT: giữ behavior hiện tại.
- MARKETING: không mở rộng.
- Không đổi backend auth / seed / cấp quyền mới.

### 3. Active state
- `/products` ≠ `/products/esim` (match cụ thể hơn cha).
- Finance / Agents / Operations / Configuration: parent active trên route con thuộc hub.
- Không gán `/refunds` hay `/payments` như active của mục «Tài chính» (hub `/finance*`).
- `/orders` retail không active trên `/orders/agent`.

### 4. Badges (chỉ 5 dự kiến; KYC bị loại sau xác minh source)
| Badge | Nguồn | Triển khai D2-B2? |
|---|---|---|
| Retail NMR | `GET /admin/dashboard` → `backlog.needManualReview` | **Có** (gate `admin.dashboard` + role API ADMIN/SUPER_ADMIN) |
| eSIM NMR | `GET /admin/esim-ops/dashboard` → `orders.needManualReview` | **Có** (gate `orders.read`) |
| Refund needsAction | `GET /admin/refund-requests?needsAction=true` → `total` | **Có** |
| Ops exceptions | `GET /admin/operations/dashboard` → `cards.exceptions` | **Có** |
| Agent KYC «READY» | — | **Không** — xem §KYC |
| Support tickets | — | **Không** (Owner) |

### KYC verification (bắt buộc trước badge)
- Không tồn tại status KYC tên `READY`.
- Dashboard `pendingKyc` đếm `AgentStatus.PENDING_KYC` (`admin.repository.ts`).
- `PENDING_KYC` gồm agent chưa nộp (`AgentKycStatus.PENDING`), đã nộp chờ duyệt (`SUBMITTED`), và `NEED_MORE_INFO` (chờ đại lý).
- Hành động admin approve/reject **chỉ** khi `AgentKycStatus.SUBMITTED` (`agent.service.ts`).
- Onboarding UI mặc định filter `SUBMITTED` (`AgentListTable` mode kyc).

→ `pendingKyc` **không** đồng nghĩa «hồ sơ đang chờ admin xử lý». **Không triển khai badge KYC** trong D2-B2; báo Owner.

## UI scope (từ D2-B1 + design Owner)
- Sidebar expanded **248px**, collapsed **68px**.
- Groups accordion + menu search + tooltip khi collapsed.
- Dark Navy, active nền + indicator trái.
- Mobile drawer tự đóng sau chọn.
- Badge chỉ khi count > 0, có quyền, API OK; không hardcode.

## Out of scope
- Commit / deploy / restart prod.
- Đổi permission seed / Nest guards.
- API mới hoặc đổi semantics đếm.
- Support ticket badge; KYC badge.
- Đổi route tree / redirects nghiệp vụ.
