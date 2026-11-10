# Cardon Admin — Operations Dashboard · Phase C2 (Frontend)

**Ngày:** 2026-11-09  
**Trạng thái:** C2 frontend hoàn thành · **chờ owner nghiệm thu** trước C3  
**Tham chiếu:** `docs/admin/operations-dashboard-phase-b.md` · `docs/admin/operations-dashboard-phase-c1.md`

---

## 1. UI đã triển khai

Trang `/dashboard` nâng cấp thành **Operations Cockpit** (không tạo route/hub mới).

| Section | Nội dung |
|---------|----------|
| **A Header** | Tiêu đề Tổng quan · chips Hôm nay / 7 ngày / Tháng này · Refresh · `asOf` giờ VN |
| **B Health** | Score/label chỉ khi đã scan · API/WEB/ADMIN/WORKER · «Chưa quét» · link Giám sát / Báo cáo Health theo permission · **không** Run Scan/Autofix |
| **C Business** | Doanh thu · Lợi nhuận · Đơn PAID · Đơn tạo · TT SUCCESS attempts (+ hint «lần thanh toán») |
| **D Order Ops** | Snapshot PAID: Chờ giao / Đang xử lý / Chờ admin retry / Cần kiểm tra · link eSIM Ops |
| **E Pay & NCC** | TT FAILED attempts · **Lỗi Provider toàn hệ thống** · link Payments / Providers / Operations |
| **F Agents** | Tổng / Active / Chờ KYC / Suspended / Rejected · snapshot |
| **G Activity** | Optional: chỉ hiện nếu `activity.read` và API OK · WARNING/ERROR/CRITICAL · ẩn khi 403 |

UX:

- Soft-fail health: lỗi health **không** xóa metrics nghiệp vụ.
- Section độc lập: loading skeleton / error + Retry / empty.
- Đổi period: chỉ cập nhật KPI theo kỳ (business + payment/provider); giữ backlog + agent snapshot trên FE.
- Refresh: reload metrics + health + activity; chống stale bằng `LatestRequestTracker`.
- Không dùng `pendingFulfillment` legacy.
- Không `?? 100` cho health score.
- Mobile: chips wrap, `overflow-x-hidden`, grid 1→2→N cột.

---

## 2. Danh sách file thay đổi

### Mới
| File | Lý do |
|------|-------|
| `apps/admin/components/dashboard/DashboardCockpit.tsx` | Orchestrator load/period/refresh/stale |
| `apps/admin/components/dashboard/DashboardHeader.tsx` | Period chips + refresh + asOf |
| `apps/admin/components/dashboard/DashboardHealthSection.tsx` | Soft-fail health strip |
| `apps/admin/components/dashboard/DashboardBusinessSection.tsx` | KPI kinh doanh kỳ |
| `apps/admin/components/dashboard/DashboardOrderOpsSection.tsx` | Backlog snapshot |
| `apps/admin/components/dashboard/DashboardPayProviderSection.tsx` | Payment fail + provider SYSTEM |
| `apps/admin/components/dashboard/DashboardAgentSection.tsx` | Agent snapshot |
| `apps/admin/components/dashboard/DashboardActivitySection.tsx` | Optional activity |
| `apps/admin/components/dashboard/SectionShell.tsx` | Loading/error/retry wrapper |
| `apps/admin/components/dashboard/dashboard-links.ts` | Drill-down href đã xác minh |
| `apps/admin/components/dashboard/dashboard-ui.test.ts` | Vitest C2 |

### Sửa
| File | Lý do |
|------|-------|
| `apps/admin/app/dashboard/page.tsx` | Mount `DashboardCockpit` |
| `apps/admin/types/api.ts` | `DashboardStats` C1 + health nullable/`scanAvailable` |
| `apps/admin/services/api-client.ts` | `getDashboard(period?)` |
| `apps/admin/lib/i18n/vi.ts` | Copy cockpit / hints / «Chưa quét» |
| `apps/admin/app/configuration/health/page.tsx` | Khớp type C1 — không fake Ready khi chưa scan |
| `apps/admin/components/monitoring/MonitoringDashboard.tsx` | Khớp unscanned health (regression type) |

### Không sửa
- Backend C1 · Prisma · payment/webhook/fulfillment
- `apps/admin/lib/permissions.ts` (dùng `can('settings.manage'|'activity.read'|…)` trực tiếp; không cần nav mới)

---

## 3. Screenshot desktop / mobile

Không chụp được trong phiên C2 (LOCAL, không chạy browser session có API auth).

**Cách verify nhanh sau khi owner mở admin local:**

1. Desktop ≥1280: header + 6–7 section stack; KPI business 5 cột.
2. Tablet: 2 cột KPI.
3. Mobile ~375: chips full-width wrap; không scroll ngang; health 2 khối xếp dọc.

---

## 4. API mapping

| FE state | API | Ghi chú |
|---------|-----|--------|
| Metrics | `GET /admin/dashboard?period=today\|last7\|month` | Map `business`, `payments`, `backlog`, `providerErrors`+`providerErrorsScope`, `agentStatistics`, `period`, `asOf` |
| Health | `GET /admin/system/health` | Soft-fail riêng; `scanAvailable` / null score |
| Activity | `GET /admin/activity?limit=20&sort=newest` | Chỉ nếu `activity.read`; filter client WARNING/ERROR/CRITICAL |

Period change → `loadMetrics(period, 'period')` (không ghi đè backlog/agents).  
Refresh → invalidate tracker + full metrics + health + activity.

---

## 5. Loading / error / empty

| Section | Loading | Error | Empty |
|---------|---------|-------|-------|
| Health | skeleton strip | Banner soft-fail + Retry | «Chưa quét» khi 200 unscanned |
| Business | 5 skeleton | section error + Retry | 0 hợp lệ |
| Order Ops | 4 skeleton | section error | «Không có đơn tồn» |
| Pay/NCC | 2 skeleton | section error | 0 |
| Agents | skeleton card | section error | 0 |
| Activity | skeleton hoặc ẩn | ẩn nếu 403/fail | «Không có sự kiện…» |

Không hiển thị số giả khi API lỗi.

---

## 6. Drill-down routes

Chỉ route/filter đã xác minh trong `OrdersListPageClient` / module root:

| KPI | Href |
|-----|------|
| DT / LN / Đơn PAID | `/orders?preset=custom&from&to&payment=PAID` + tooltip paidAt vs createdAt |
| Đơn tạo | `/orders?preset=custom&from&to` |
| TT SUCCESS attempts | **không** query giả — hint text only (Payments UI chưa đọc URL filter) |
| TT FAILED | `/payments` nếu `payments.view` |
| Chờ giao | `/orders?ex=pending` |
| Đang xử lý | `/orders?ex=processing` |
| Chờ admin retry | `/orders?ex=attention` |
| Cần kiểm tra | `/orders?ex=attention&attn=NEED_MANUAL_REVIEW` |
| Provider errors | `/providers` nếu `providers.manage` |
| Agents | `/agents/overview` nếu `users.read` |
| Health report | `/configuration/health` nếu `settings.manage` |
| Monitoring | `/monitoring` nếu có quyền monitoring* |
| eSIM | `/esim-ops` |
| Activity | `/monitoring/activity` |

**Không** thêm `dateBasis=paidAt`.

---

## 7. Test / build results

| Command | Result |
|---------|--------|
| `vitest` `dashboard-ui.test.ts` | **9 PASS** |
| `npm test --workspace=@cardon/admin` | **21 files · 101 tests PASS** |
| `npm run build --workspace=@cardon/admin` | **PASS** (Next 15.5.19, types + lint OK) |

Coverage C2:

- API period query mapping  
- No `?? 100`  
- Soft-fail health isolation  
- Period vs snapshot update  
- Attempt / SYSTEM labels  
- Backlog ≠ `pendingFulfillment`  
- Drill-down hrefs  
- Alert activity filter  

---

## 8. Regression results

- Full admin vitest: **101 PASS** (gồm eSIM / refund / monitoring helpers).
- Admin production build: OK — `/dashboard` và các trang admin compile.
- Health Report + Monitoring hub cập nhật để không vỡ type khi C1 trả `healthScore: null`.

---

## 9. Known issues / follow-up C3

| # | Mục | Ghi chú |
|---|-----|--------|
| 1 | Screenshot desktop/mobile | Chưa có trong C2 — làm ở C3 QA |
| 2 | Payments URL filter | List chưa hydrate từ query → TT SUCCESS không link filter; FAILED chỉ về `/payments` |
| 3 | Visual QA live API | Cần auth local + seed data |
| 4 | Auto-refresh ≥60s | Phase B optional Wave 1.1 — chưa làm |
| 5 | RBAC `system.health.read` trên DB | Cần sync script khi deploy (ngoài C2) |

---

## 10. Xác nhận giới hạn

| Ràng buộc | |
|-----------|--|
| Chỉ C2 frontend | ✅ |
| LOCAL ONLY | ✅ |
| Không sửa backend C1 (trừ blocker) | ✅ không đụng BE |
| Không Prisma/migration | ✅ |
| Không đổi payment/webhook/fulfillment/provider logic | ✅ |
| Không C3 | ✅ |
| Không staging/production / deploy | ✅ |
| Không commit / push / PR | ✅ |

---

**Kết luận C2:** Operations Cockpit FE sẵn sàng nghiệm thu. Dừng tại đây chờ owner duyệt trước **Phase C3 – Integration & QA**.
