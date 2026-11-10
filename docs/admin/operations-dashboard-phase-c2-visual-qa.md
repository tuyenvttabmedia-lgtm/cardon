# Cardon Admin — Operations Dashboard · Phase C2 Visual QA

**Ngày:** 2026-11-09  
**Môi trường:** LOCAL ONLY — `admin.localhost` + `cardon-local-full` (API/admin rebuild từ source C1+C2)  
**Tài khoản:** `superadmin@cardon.vn` (SUPER_ADMIN)  
**Trạng thái:** Visual QA hoàn tất · **không** sửa code · chờ owner nghiệm thu · **không** sang C3

Screenshot: `docs/admin/visual-qa-c2/`

---

## 0. Chuẩn bị môi trường (bối cảnh)

| Bước | Kết quả |
|------|---------|
| Stack Docker local-full đang chạy | ✅ nginx :80 · admin.localhost |
| Image admin/api trước QA | ❌ thiếu C1/C2 (build cũ) |
| Rebuild local `api` + `admin` từ workspace | ✅ (LOCAL only — không staging/prod) |
| Sync RBAC `system.health.read` + restart API (clear permission cache) | ✅ |
| Login browser (abuse rate limit Redis) | Cần xóa key `cardon:abuse:auth_login:ip:…` tạm thời để tiếp tục QA |

---

## 1. Kết quả theo viewport

### Desktop 1440 × 900 — **PASS** (có note nhỏ)

| Kiểm tra | Kết quả |
|----------|---------|
| Header + period chips + Refresh + asOf VN | ✅ |
| Health «Chưa quét» / score `—` (không 100%) | ✅ |
| API/WEB/ADMIN/WORKER + link Giám sát / Báo cáo Health | ✅ |
| Business 5 KPI + hint paidAt + hint attempts | ✅ |
| Order Ops empty «Không có đơn tồn» | ✅ |
| Pay & NCC: FAILED attempts + «Lỗi Provider toàn hệ thống» | ✅ |
| Agents snapshot | ✅ |
| Activity WARNING list | ✅ |
| Horizontal overflow | ✅ `scrollWidth === clientWidth` |
| Chữ/KPI chồng | ✅ không phát hiện |

**Screenshots:**  
- `docs/admin/visual-qa-c2/desktop-1440x900.png`  
- `docs/admin/visual-qa-c2/desktop-lower-sections.png`

### Tablet 768 × 1024 — **PASS**

| Kiểm tra | Kết quả |
|----------|---------|
| Layout stack / 2 cột KPI | ✅ |
| Period chips + Refresh usable | ✅ |
| Overflow-x | ✅ không |

**Screenshots:**  
- `docs/admin/visual-qa-c2/tablet-768x1024.png`  
- `docs/admin/visual-qa-c2/tablet-768x1024-full.png`

### Mobile 375 × 812 — **PASS with issues**

| Kiểm tra | Kết quả |
|----------|---------|
| Cockpit sections stack dọc | ✅ |
| Period chips wrap + Refresh full width | ✅ |
| Health / Business readable | ✅ |
| **Document overflow-x** | ⚠ `scrollWidth=413` > `clientWidth=375` |
| Nguyên nhân overflow | Top bar user chip `Quản trị cao cấp` (`ml-auto flex…` right≈413) — **AdminShell**, không phải KPI grid cockpit |
| Cockpit content tự overflow | Không thấy offender từ StatCard/section |

**Screenshots:**  
- `docs/admin/visual-qa-c2/mobile-375x812.png`  
- `docs/admin/visual-qa-c2/mobile-375x812-full.png`

---

## 2. Checklist nội dung UI

| # | Mục | Kết quả | Ghi chú |
|---|-----|---------|---------|
| 1 | Header / period / Refresh / asOf | **PASS** | Đổi `last7` → asOf cập nhật `23:49:21` → `23:51:40` |
| 2 | Health chưa scan | **PASS** | `—` + «Chưa quét»; API `scanAvailable=false`, `healthScore=null` |
| 2b | Health đã scan | **NOT VERIFIED** | Không chạy scan (tránh đổi trạng thái hệ thống trong vòng QA báo cáo) |
| 2c | Health 403 / API error soft-fail | **NOT VERIFIED** | SUPER_ADMIN có `system.health.read`; không cố tình phá API |
| 3 | Business KPIs + attempts label | **PASS** | Hint «không phải số đơn» hiện (xem issue duplicate) |
| 4 | Order Ops backlog / NEED_MANUAL_REVIEW | **PARTIAL** | Empty state PASS; **không** có đơn PAID backlog để thấy 4 tile số >0 |
| 5 | Pay FAILED + Provider toàn HT | **PASS** | Label SYSTEM rõ; phân biệt B2C attempts vs provider logs |
| 6 | Agents | **PASS** | Tổng 1 · Active 1 |
| 7 | Activity có quyền | **PASS** | Section hiện, filter WARNING |
| 7b | Activity 403 / không quyền | **NOT VERIFIED** | Cần user thiếu `activity.read` |
| 8 | Loading / empty / error / retry | **PARTIAL** | Loading period chip → «Đang tải…» PASS; empty PASS; **section error/retry** NOT VERIFIED (không ép lỗi API) |
| 9 | Period / Refresh stale | **PASS (smoke)** | Period `last7` active; asOf mới; href orders cập nhật `from=2026-11-03&to=2026-11-09`. Rapid multi-click stale race **NOT VERIFIED** sâu |
| 10 | Drill-down + paidAt tooltip | **PASS** | Tooltip trên KPI; navigate `/orders?preset=custom&from=…&to=…&payment=PAID` mở Orders đúng kỳ |

**Drill-down screenshot:** `docs/admin/visual-qa-c2/drilldown-orders-paid-period.png`

### Drill-down matrix (xác minh)

| KPI | Href quan sát | Kết quả |
|-----|---------------|---------|
| Doanh thu / LN / PAID | `/orders?preset=custom&from=2026-11-03&to=2026-11-09&payment=PAID` | ✅ |
| Đơn tạo | `/orders?preset=custom&from=2026-11-03&to=2026-11-09` | ✅ (href DOM) |
| Backlog buckets | (empty — không click tile) | **NOT VERIFIED** live click |
| TT FAILED | `/payments` | ✅ link hiện |
| Provider | `/providers` | ✅ |
| Agents | `/agents/overview` | ✅ |
| Health report | `/configuration/health` | ✅ (permission settings.manage) |
| Monitoring | `/monitoring` | ✅ |
| Activity | `/monitoring/activity` | ✅ |
| eSIM Ops | `/esim-ops` | ✅ |
| TT SUCCESS filter | không fake query | ✅ text-only hint |

---

## 3. Lỗi UI/UX phát hiện (không sửa — chờ duyệt)

| ID | Mức | Mô tả | Tái hiện | Đề xuất (chờ owner) |
|----|-----|-------|----------|---------------------|
| VQA-1 | **Medium** | Mobile 375: `documentElement` overflow-x do topbar user chip «Quản trị cao cấp» tràn phải (~413px) | Emulate 375×812 trên `/dashboard` | Rút gọn label role trên mobile / ẩn text giữ avatar trong `AdminShell` |
| VQA-2 | **Low** | Hint TT SUCCESS bị **lặp 2 lần** (trong StatCard + đoạn dưới grid) | Desktop/tablet Business section | Bỏ một trong hai (`hint` prop **hoặc** `<p>` dưới grid) |
| VQA-3 | **Low** | Click StatCard Doanh thu trên viewport mobile emulator đôi khi không navigate (href đúng; navigate thủ công OK) | Click KPI trên 375 | Kiểm tra hit-target / nested interactive; regression desktop click |
| VQA-4 | **Info** | Local data = 0 cho business/backlog → không quan sát được tone cảnh báo backlog >0 | Dataset local-full hiện tại | Seed đơn PAID PENDING/REVIEW nếu muốn QA visual số khác 0 ở C3 |

**Không** phát hiện: gradient thừa, tile quá lớn, nhầm 100% health, nhầm Provider = B2C, dùng `pendingFulfillment`.

---

## 4. Kết luận

### Verdict: **PASS with issues** (C2 Visual QA)

- Cockpit C2 **khớp** wireframe Phase B trên desktop/tablet; mobile **usable** nhưng còn overflow topbar (VQA-1).  
- Health unscanned **đúng** («Chưa quét», không 100%).  
- Label attempts / Provider toàn hệ thống / paidAt tooltip **đúng**.  
- Drill-down Orders period **đúng**.  
- Một số trạng thái (health đã scan, health 403, activity 403, section error, backlog số >0, stale race sâu) → **NOT VERIFIED** — ghi rõ, không giả lập.

### Không làm trong vòng này

- Không sửa code (theo yêu cầu chờ phê duyệt).  
- Không commit / push / PR / deploy.  
- Không C3.  
- Không đổi backend nghiệp vụ / Prisma.

### Đề xuất bước tiếp (owner quyết)

1. Duyệt sửa VQA-1 + VQA-2 (nhỏ, FE only) trước hoặc gộp C3.  
2. C3 Integration & QA: user thiếu quyền, ép 403 health, seed backlog PAID, stale race, screenshot sau scan.

---

## 5. Xác nhận giới hạn

| Ràng buộc | |
|-----------|--|
| LOCAL ONLY | ✅ |
| Không sửa backend C1 / payment / webhook / fulfillment | ✅ |
| Không Prisma/migration | ✅ |
| Không staging/production / deploy | ✅ (chỉ rebuild container local) |
| Không commit/push/PR | ✅ |
| Không tự sang C3 | ✅ |
