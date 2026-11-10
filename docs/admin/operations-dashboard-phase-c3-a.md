# Cardon Admin — Operations Dashboard · Phase C3-A

**Ngày:** 2026-11-10  
**Phạm vi:** RBAC & Health Integration QA (A1–A5)  
**Môi trường:** LOCAL ONLY — `cardon-local-full` · `http://admin.localhost`  
**Trạng thái:** Báo cáo hoàn tất · **không** sửa code · **không** scan Health · **không** commit/deploy · **không** sang C3-B  
**Verdict tổng:** **PASS with notes** (A2 = NOT VERIFIED)

Screenshot: `docs/admin/visual-qa-c3a/`

---

## 0. Môi trường & tài khoản kiểm thử

| Hạng mục | Giá trị |
|----------|---------|
| Stack | Docker `cardon-local-full` (nginx :80 · api/admin/worker healthy) |
| Admin UI | `http://admin.localhost/dashboard` |
| API base | `/api/v1` qua nginx |
| DB | Postgres local container `cardon` (read-only query) |
| Health scan | **Không chạy** (đúng giới hạn C3-A) |

### Tài khoản / role (không ghi credential)

| Email | Role | Dùng cho |
|-------|------|----------|
| `superadmin@cardon.vn` | `SUPER_ADMIN` | A1 UI/API positive · A4 soft-fail · A5 có `activity.read` |
| `maint@keyon.vn` | `ACCOUNTANT` | A3/A5 thiếu quyền → HTTP **403** thật |

**Không** dùng `SUPER_ADMIN` để kết luận tình huống thiếu quyền.  
Local **không** có user `ADMIN` / `SUPPORT` active → một số combo quyền chỉ xác minh qua DB matrix + unit test (xem A3).

---

## 1. Permission matrix (LOCAL DB `role_permissions`)

| Role | `admin.dashboard` | `system.health.read` | `settings.manage` | `activity.read` |
|------|:-----------------:|:--------------------:|:-----------------:|:---------------:|
| SUPER_ADMIN | ✓ | ✓ | ✓ | ✓ |
| ADMIN | ✓ | ✓ | ✗ | ✓ |
| ACCOUNTANT | ✗ | ✗ | ✗ | ✗ |
| SUPPORT | ✗ | ✗ | ✗ | ✗ |
| MARKETING | ✗ | ✗ | ✗ | ✗ |

Nguồn: query read-only `role_permissions` + `permissions` trên DB local.

### Endpoint wiring (code + security audit)

| Endpoint | Permission bắt buộc |
|----------|---------------------|
| `GET /admin/system/health` | `system.health.read` |
| `GET /admin/system/health/status` | `system.health.read` |
| `GET/POST …/health/report|run|autofix|export` | `settings.manage` |
| `GET /admin/activity` | `activity.read` |
| `GET /admin/dashboard` | `admin.dashboard` |

Unit suite liên quan: **PASS** (35 tests) — gồm `admin.security-audit.spec.ts`, `system-health-summary.spec.ts`, `operations-health.spec.ts`.

---

## 2. Kết quả A1–A5

### A1 — Health chưa scan · **PASS**

**API** (`GET /api/v1/admin/system/health`, session SUPER_ADMIN) → **200**:

| Field | Quan sát |
|-------|----------|
| `scanAvailable` | `false` |
| `healthScore` | `null` |
| `productionLabel` | `null` |
| `status` | `null` |
| `runAt` / `lastScanAt` | `null` |
| `categoryIntegrity.label` | `"Chưa quét"` |

**UI dashboard:**

- Health score hiển thị `—` (không `100%`)
- Label **«Chưa quét»**
- Không «Production Ready»
- Business / backlog / Pay·NCC / Agents vẫn render

**Screenshot:** `docs/admin/visual-qa-c3a/a1-health-unscanned.png`

**Ghi chú (không FAIL):** Unscanned vẫn hiển thị `systemVersion` (API/WEB/ADMIN/WORKER ✓) — đây là version/liveness hiện tại, **không** phải score scan. `categoryIntegrity.status` trong JSON vẫn là `"ok"` trong khi label = «Chưa quét» (chỉ quan sát; không sửa trong C3-A).

---

### A2 — Health đã scan · **NOT VERIFIED**

- Local API trả unscanned (`scanAvailable=false`).
- Không chạy Health Scan (chưa được owner phê duyệt; thao tác đổi trạng thái hệ thống).
- Không có dataset scanned cô lập đã được phê duyệt để đối chiếu FE↔BE.

→ Cần owner phê duyệt scan LOCAL hoặc cung cấp fixture scanned trước khi verify A2.

---

### A3 — Health permission · **PASS with notes**

#### Backend RBAC (live API)

| Actor | `GET …/health` | `GET …/health/status` | `GET …/dashboard` |
|-------|:--------------:|:---------------------:|:-----------------:|
| SUPER_ADMIN (`system.health.read` ✓) | **200** | (có quyền theo matrix) | **200** |
| ACCOUNTANT (không có `system.health.read`) | **403** | **403** | **403** |

`/auth/me` ACCOUNTANT: `system.health.read=false`, `settings.manage=false`, `activity.read=false`, `admin.dashboard=false`.

#### FE không tự cấp quyền / không lách bằng `settings.manage`

- Cockpit gọi `systemHealthApi.getHealth()` — backend vẫn enforce `system.health.read`.
- Nút **«Báo cáo Health»** gated `can('settings.manage')` (link `/configuration/health`), **không** thay thế quyền đọc summary.
- Soft-fail Health (A4) chứng minh 403 không phá Business/Backlog/Pay·NCC/Agents.

#### Combo chưa verify live UI

| Combo | Kết quả |
|-------|---------|
| User `ADMIN` (có `system.health.read`, không `settings.manage`) | **NOT VERIFIED** live — local không có user ADMIN; matrix DB + unit test khẳng định ADMIN đọc summary được, không scan/export |
| `settings.manage` **không** kèm `system.health.read` | **NOT VERIFIED / N/A by design** — không role mặc định nào có combo này |

---

### A4 — Health API failure · **PASS**

**Cách mô phỏng (LOCAL only, không đổi backend):**  
Monkey-patch `window.fetch` trong browser tab dashboard để trả lỗi cho `GET …/admin/system/health` (không đụng endpoint khác). Sau QA: restore `fetch` native + Refresh.

| Mô phỏng | Health UI | Section nghiệp vụ | Score giả / stale |
|----------|-----------|-------------------|-------------------|
| HTTP **403** | «Không tải được health — các chỉ số nghiệp vụ vẫn hiển thị.» + **Thử lại** | Business / Ops / Pay·NCC / Agents bình thường | Không (health state cleared) |
| HTTP **500** | Cùng soft-fail + **Thử lại** | Giữ nguyên | Không |

Dashboard **không** trắng trang.

**Screenshots:**

- `docs/admin/visual-qa-c3a/a4-health-403-softfail.png`
- `docs/admin/visual-qa-c3a/a4-health-500-softfail.png`

Timeout mạng riêng: không mô phỏng thêm (403/500 đã cover soft-fail path); có thể bổ sung C3-B nếu cần.

---

### A5 — Activity permission · **PASS**

#### Backend

| Actor | `GET /admin/activity` |
|-------|:---------------------:|
| SUPER_ADMIN (`activity.read` ✓) | **200** (items trả về) |
| ACCOUNTANT (thiếu `activity.read`) | **403** |

#### FE soft-fail (LOCAL fetch mock → activity 403)

- Section **«Sự kiện gần đây»** ẩn hoàn toàn (không fake rows, không crash).
- Health/Business/Agents vẫn hiển thị.
- Sau restore fetch + Refresh: section Activity hiện lại với WARNING logs.

**Screenshots:**

- Có quyền: `docs/admin/visual-qa-c3a/a5-activity-with-permission.png`
- API 403 → ẩn: `docs/admin/visual-qa-c3a/a5-activity-403-hidden.png`

**Client gate:** `DashboardCockpit` bỏ qua fetch khi `!can('activity.read')` — không verify live bằng ACCOUNTANT trên `/dashboard` vì ACCOUNTANT cũng thiếu `admin.dashboard` (đúng RBAC).

---

## 3. Request/response đã quan sát (tóm tắt)

| # | Actor | Request | Status | Ghi chú |
|---|-------|---------|:------:|---------|
| 1 | SUPER_ADMIN | `GET /admin/system/health` | 200 | unscanned summary |
| 2 | SUPER_ADMIN | `GET /admin/dashboard?period=today` | 200 | metrics OK |
| 3 | SUPER_ADMIN | `GET /admin/activity?limit=5…` | 200 | có items |
| 4 | ACCOUNTANT | `POST /auth/login` | 201 | identity OK |
| 5 | ACCOUNTANT | `GET /admin/system/health` | **403** | thiếu `system.health.read` |
| 6 | ACCOUNTANT | `GET /admin/system/health/status` | **403** | |
| 7 | ACCOUNTANT | `GET /admin/activity…` | **403** | thiếu `activity.read` |
| 8 | ACCOUNTANT | `GET /admin/dashboard…` | **403** | thiếu `admin.dashboard` |
| 9 | Browser mock | Health → 403/500 | (client) | soft-fail UI |
| 10 | Browser mock | Activity → 403 | (client) | section ẩn |

Token / password / secret: **không** ghi vào báo cáo.

---

## 4. Kiểm tra bảo mật (checklist C3-A)

| Mục | Kết quả |
|-----|---------|
| Không ghi credential/token vào report | ✅ |
| Không dùng SUPER_ADMIN để kết luận thiếu quyền | ✅ (dùng ACCOUNTANT) |
| Không sửa RBAC production / seed quyền | ✅ |
| Không thêm permission mới | ✅ |
| Không đổi backend permission logic | ✅ |
| Không chạy Health Scan | ✅ |
| Không sửa source / Prisma / business data | ✅ |
| LOCAL only | ✅ |

---

## 5. Issue phát hiện / đề xuất (không tự sửa)

| ID | Mức | Mô tả | Đề xuất |
|----|-----|-------|---------|
| C3A-N1 | Info | A2 chưa verify (chưa scan) | Owner phê duyệt scan LOCAL hoặc fixture scanned → C3-A follow-up / C3-B |
| C3A-N2 | Info | Local thiếu user `ADMIN` để QA UI «health.read ✓ / settings.manage ✗» | Tạo user ADMIN LOCAL khi owner duyệt (không seed ngoài LOCAL) |
| C3A-N3 | Low | Unscanned JSON: `categoryIntegrity.status = "ok"` trong khi label «Chưa quét» | Xem xét đồng bộ status/`unknown` khi chưa scan (backend C1 follow-up) |
| C3A-N4 | Info | Cockpit luôn gọi Health API dù client chưa check `can('system.health.read')` — dựa soft-fail 403 | Optional: gate client giống Activity để giảm 403 noise (chỉ polish) |

**Không** phát hiện regression làm trắng dashboard khi Health/Activity 403/500.

---

## 6. Tái hiện nhanh

### A1

1. Login staff có `system.health.read` trên LOCAL.
2. Mở `/dashboard`.
3. `GET /api/v1/admin/system/health` → kỳ vọng `scanAvailable=false`, `healthScore=null`.
4. UI: `—` + «Chưa quét», không 100% / Production Ready.

### A3 / A5 backend 403

1. Login `ACCOUNTANT` LOCAL (`maint@keyon.vn`).
2. Gọi `GET /admin/system/health` và `GET /admin/activity` với Bearer token.
3. Kỳ vọng **403**; `/auth/me` không chứa các permission trên.

### A4 / A5 FE soft-fail

1. Trên tab dashboard đã login (có đủ quyền).
2. Patch tạm `fetch` trả 403/500 cho health hoặc activity (LOCAL browser only).
3. Bấm **Làm mới** / **Thử lại**.
4. Quan sát soft-fail; restore `fetch` sau khi xong.

---

## 7. Verdict & dừng

| Test | Kết quả |
|------|---------|
| A1 Health chưa scan | **PASS** |
| A2 Health đã scan | **NOT VERIFIED** |
| A3 Health permission | **PASS** (note: thiếu live ADMIN user) |
| A4 Health API failure | **PASS** |
| A5 Activity permission | **PASS** |

**C3-A hoàn tất báo cáo. Chờ owner nghiệm thu. Không tự chuyển C3-B.**
)