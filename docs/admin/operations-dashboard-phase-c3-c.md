# Cardon Admin — Operations Dashboard · Phase C3-C

**Ngày:** 2026-11-10  
**Phạm vi:** Operational Stability & Release Readiness  
**Môi trường:** LOCAL ONLY — `cardon-local-full` · `http://admin.localhost`  
**Build:** `6035.2 AGENT REGISTRATION & KYC CENTER` (`NEXT_PUBLIC_BUILD_VERSION` / UI footer)  
**Trạng thái:** Báo cáo hoàn tất · **không** sửa code · **không** scan Health · **không** commit/deploy · **không** mở phase tiếp theo  
**Kết luận:** **Ready with notes**

Screenshot: `docs/admin/visual-qa-c3c/`

---

## 0. Environment

| Hạng mục | Giá trị |
|----------|---------|
| Compose | `cardon-local-full` (api/admin/worker/nginx/postgres/redis healthy) |
| Admin | `http://admin.localhost/dashboard` |
| NODE_ENV (admin container) | `production` |
| Actor chính | `superadmin@cardon.vn` (`SUPER_ADMIN`) |
| Actor thiếu quyền | `maint@keyon.vn` (`ACCOUNTANT`) |
| Users local có sẵn | SUPER_ADMIN, ACCOUNTANT — **không** có ADMIN / SUPPORT |
| Giới hạn | Read-only DB nghiệp vụ · browser API mock LOCAL · không đổi RBAC/source |

---

## 1. C3C-1 — Loading & refresh · **PASS**

| # | Kịch bản | Kết quả | Bằng chứng |
|---|----------|---------|-----------|
| 1 | Mở `/dashboard` lần đầu | Sections render; Health «Chưa quét»; không crash | UI snapshot + healthy screenshot |
| 2 | Reload trang | Sau reload vẫn Cockpit đầy đủ | Harness reload + navigate recovery |
| 3 | Refresh ×5 liên tục | Không crash; KPI/sections ổn; loading kết thúc | `refreshSpam` snap: no whiteCrash |
| 4 | Đổi `today` → `last7` → `month` | Period API đúng TZ; UI không crash | API period objects |
| 5 | Đổi kỳ liên tục khi request chưa xong | Không crash; `LatestRequestTracker` bảo vệ stale | Rapid click + staleRace mock |
| 6 | Nhiều tab Dashboard | Tab 2 mở `/dashboard` độc lập, dữ liệu OK | viewId `80f133` snapshot đầy đủ |
| 7 | Orders → quay lại Dashboard | Render lại bình thường | Navigate `/orders` rồi `/dashboard` |

**Xác minh bổ sung**

- Không fake Health 100% / Production Ready trong lúc load.  
- Không phát hiện `console.error` / `window.onerror` / unhandledrejection trong cửa sổ test.  
- Refresh không nhân đôi section (DOM vẫn một khối Cockpit).

| Verdict C3C-1 | **PASS** |

---

## 2. C3C-2 — Section isolation · **PASS**

Mô phỏng LOCAL bằng monkey-patch `window.fetch` (không đổi backend). Sau test: restore `fetch` native.

| Mock | Health | Business / Backlog / Pay·NCC / Agents | Activity | Ghi chú |
|------|--------|----------------------------------------|----------|---------|
| Health **403** | Error + **Thử lại** | Vẫn hiển thị số liệu hợp lệ | Hiện | Screenshot `health-403-isolated.png` |
| Health **500** | Error + Retry | Giữ nguyên | Hiện | |
| Health **network fail** | Error + Retry | Giữ nguyên | Hiện | `TypeError: Failed to fetch` |
| Dashboard metrics **500** | Vẫn «Chưa quét» OK | **«Yêu cầu thất bại» + Thử lại** — **không** hiện KPI 0 giả | Hiện | Business block chỉ lỗi |
| Activity **403** | OK | OK | **Ẩn section** | Soft-fail |
| Recover (bỏ mock + Refresh) | «Chưa quét» | KPI 0 hợp lệ (retail rỗng) | Hiện lại | |

**Không** thay lỗi bằng số 0 giả trên metrics failure.  
**Không** giữ Health score cũ khi Health lỗi (state cleared → error UI).

| Verdict C3C-2 | **PASS** |

---

## 3. C3C-3 — RBAC & Health resilience · **PASS with notes**

### 3.1 Actors local

| Role | User | Kết quả |
|------|------|---------|
| SUPER_ADMIN | `superadmin@cardon.vn` | Dashboard/Health/Activity **200**; có `system.health.read`, `activity.read`, `settings.manage` |
| ACCOUNTANT | `maint@keyon.vn` | Dashboard/Health/status/Activity đều **403**; `/auth/me` không có các perm trên |
| ADMIN | — | **NOT VERIFIED** (không có user) |
| SUPPORT | — | **NOT VERIFIED** (không có user) |

### 3.2 Health

| Check | Kết quả |
|-------|---------|
| Unscanned: `scanAvailable=false`, `healthScore=null`, `productionLabel=null` | **PASS** (API + UI `—` / «Chưa quét») |
| Không 100% / Production Ready khi chưa quét | **PASS** |
| Health 403 không phá Business/Agents | **PASS** (C3C-2) |
| Không chạy Scan/Autofix | **Tuân thủ** |
| Report/Run/Export vẫn `settings.manage` (code + C3-A) | **PASS** (không re-test mutate) |

| Verdict C3C-3 | **PASS** (ADMIN/SUPPORT = NOT VERIFIED) |

---

## 4. C3C-4 — Data consistency & stale · **PASS**

| Check | Kết quả |
|-------|---------|
| Period TZ `Asia/Ho_Chi_Minh` | today `2026-11-10`; last7 `2026-11-04→10`; month `2026-11-01→10` |
| Backlog snapshot **không** đổi theo period | `backlogSameAcrossPeriods=true` |
| Agents snapshot **không** đổi theo period | `agentsSame=true` |
| `providerErrorsScope` | `SYSTEM` |
| Revenue/Profit / attempts / retail scope | Không đổi logic C1; kỳ hiện tại 0 khớp C3-B |
| Stale race (delay month/last7 > today) | UI không crash; không phát hiện ghi đè sai kỳ; tracker `isLatest` trong code |
| Payment attempts = rows (hint UI) | Hint SUCCESS vẫn đúng wording |

| Verdict C3C-4 | **PASS** |

---

## 5. C3C-5 — Performance & diagnostics · **PASS (local evidence)**

### 5.1 API latency (SUPER_ADMIN, LOCAL Docker)

| Endpoint | Samples | Latency |
|----------|---------|---------|
| `GET /admin/dashboard?period=today` | 5 | **avg 54 ms** (min 47 · max 62) · all 200 |
| `GET /admin/dashboard?period=last7` | 1 | 61 ms · 200 |
| `GET /admin/dashboard?period=month` | 1 | 61 ms · 200 |
| `GET /admin/system/health` | 1 | 66 ms · 200 |
| `GET /admin/activity?limit=5…` | 1 | 20 ms · 200 |

Phân loại: **backend API latency** thấp trên LOCAL; không thấy cần index/migration từ bằng chứng này.

### 5.2 Browser / frontend

| Metric | Giá trị | Phân loại |
|--------|---------|-----------|
| HTML shell `/dashboard` via nginx | ~69 ms · ~8.3 KB | Network/SSR shell |
| UI ready sau navigate (đã hydrate) | ~0–immediate khi data sẵn | Frontend |
| Console errors trong cửa sổ test | **0** | — |
| Page JS errors | **0** | — |

### 5.3 Đề xuất tối ưu

**Không** đề xuất tạo index / đổi query — latency LOCAL < 100 ms, không có EXPLAIN chậm.

| Verdict C3C-5 | **PASS** |

---

## 6. Test matrix tổng hợp

| Nhóm | Verdict |
|------|---------|
| C3C-1 Loading/refresh/period/multi-tab | **PASS** |
| C3C-2 Section isolation | **PASS** |
| C3C-3 RBAC & Health | **PASS** (note: thiếu ADMIN/SUPPORT) |
| C3C-4 Consistency / stale | **PASS** |
| C3C-5 Performance | **PASS** |

---

## 7. Issues / notes (không tự sửa)

| ID | Mức | Mô tả | Ảnh hưởng vận hành | Đề xuất |
|----|-----|-------|--------------------|---------|
| C3C-N1 | Info | Không có user ADMIN/SUPPORT local | Không chặn release LOCAL; coverage RBAC UI thiếu | Tạo actor LOCAL khi owner duyệt (không seed ngoài LOCAL) |
| C3C-N2 | Info | Retail KPI/backlog đang 0 (C3-B) | Ops vẫn dùng được; stress non-empty data hạn chế | Fixture test DB cô lập nếu cần load test dữ liệu |
| C3C-N3 | Info | Login abuse rate-limit Redis khi QA nhiều lần | Chỉ môi trường LOCAL QA | Xóa key abuse tạm khi QA (đã làm) |

**Không** phát hiện FAIL nghiêm trọng (crash, stale sai kỳ, fake Health 100%, section isolation hỏng).

---

## 8. Screenshots

| File | Nội dung |
|------|----------|
| `docs/admin/visual-qa-c3c/health-403-isolated.png` | Health lỗi; Business/Agents/Pay vẫn hiển thị |
| `docs/admin/visual-qa-c3c/dashboard-healthy-recovered.png` | Trạng thái phục hồi · «Chưa quét» · không 100% |

---

## 9. Tiêu chí nghiệm thu C3-C

| # | Tiêu chí | Status |
|---|----------|--------|
| 1 | Không crash loading/refresh/period | **PASS** |
| 2 | Không stale response sai kỳ | **PASS** |
| 3 | Section isolation khi API lỗi | **PASS** |
| 4 | RBAC không truy cập trái quyền | **PASS** (trên actor có sẵn) |
| 5 | Health chưa quét/lỗi không số liệu giả | **PASS** |
| 6 | C1 logic không bị thay | **PASS** (không sửa code) |
| 7 | Không lỗi nghiêm trọng chưa giải thích | **PASS** |
| 8 | Báo cáo + bằng chứng | **PASS** |

---

## 10. Kết luận

**Ready with notes**

Operations Dashboard `/dashboard` ổn định trên LOCAL cho vận hành hằng ngày ở mức đã kiểm: refresh, đổi kỳ, multi-tab, soft-fail Health/Activity/metrics, RBAC ACCOUNTANT 403, Health unscanned trung thực, API latency thấp.

Notes còn lại chỉ là thiếu actor ADMIN/SUPPORT và dữ liệu retail non-empty — không phải lỗi ổn định.

**Dừng tại C3-C. Chờ owner review / nghiệm thu. Không tự mở phase tiếp theo.**
`)