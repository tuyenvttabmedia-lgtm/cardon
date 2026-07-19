# Phase 6G — Full Local Regression Test

**Ngày:** 2026-06-21  
**Phạm vi:** Rebuild stack local-full sau Phase 6F/6F.2, migrate, seed, regression E2E. **Không thêm feature / không đổi business logic.**

---

## Executive summary

| Hạng mục | Kết quả |
|----------|---------|
| TASK 1 — Clean rebuild Docker | ✅ PASS |
| TASK 2 — Database migrate + seed | ✅ PASS (12 migrations) |
| TASK 3 — Customer E2E | ⚠️ PARTIAL — payment OK, fulfillment kẹt |
| TASK 4 — Admin E2E | ⚠️ PARTIAL — API order detail OK, UI chưa login đầy đủ |
| TASK 5 — Partner E2E | ⚠️ PARTIAL — throttle khi batch test |
| TASK 6 — Role test | ⚠️ PARTIAL — SUPPORT OK, còn lại cần test thủ công |
| TASK 7 — Responsive | ✅ PASS (375px snapshot + desktop layout) |
| TASK 8 — Build & unit test | ✅ PASS (Docker + nest + jest); ⚠️ Next host thiếu SWC |

**Verdict tổng thể:** Stack chạy ổn, UX/CMS frontend build OK trong Docker, unit tests PASS. **Blocker regression:** đơn CARD sau SePay webhook kẹt `PAID/PROCESSING` — không giao thẻ, không hiện PIN.

---

## TASK 1 — Clean rebuild local

```powershell
cd C:\Users\MyHome\Projects\cardon
docker compose -f docker-compose.local-full.yml down
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
```

| Container | Image | HTTP | Docker health |
|-----------|-------|------|---------------|
| api | cardon-api:local-full | ✅ `/health/ready` | healthy |
| worker | cardon-api:local-full | — | healthy |
| web | cardon-web:local-full | ✅ 200 | unhealthy* |
| partner | cardon-partner:local-full | ✅ 200 | unhealthy* |
| admin | cardon-admin:local-full | ✅ 200 | unhealthy* |
| nginx | nginx:1.27 | ✅ 200 | healthy |
| postgres | postgres:16 | — | healthy |
| redis | redis:7 | — | healthy |

\*Next.js containers báo `unhealthy` do healthcheck wget — HTTP vẫn 200 (known limitation Phase 6E).

**URLs:**

| App | URL |
|-----|-----|
| Customer | http://localhost |
| Partner | http://partner.localhost |
| Admin | http://admin.localhost |
| API | http://localhost/api/v1 |

---

## TASK 2 — Database

```powershell
# Tự chạy khi api start (RUN_MIGRATIONS=true)
docker exec cardon-local-full-api npx prisma migrate status
docker exec cardon-local-full-api npx prisma generate

# Bootstrap test data
docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts
```

**Migrations:** 12 migrations — database up to date.

| Migration | Phase |
|-----------|-------|
| `20250621120000_phase_6f_cms_completion` | 6F CMS |
| `20250621140000_order_client_trace` | 6F.2 fraud trace |
| (10 migrations trước) | init → 5C.8 |

**Seed:** RBAC + 6 accounts + catalog (Viettel/Garena/Zing 100k) + agent API keys.

Credentials file (trong container, regenerate mỗi lần seed):

```powershell
docker exec cardon-local-full-api cat /app/scripts/.local-full-credentials.json
```

---

## TASK 3 — Customer E2E

### Auth (API)

| Test | Kết quả | Ghi chú |
|------|---------|---------|
| Register + auto login | ✅ PASS | Cần `phone`, `confirmPassword`, `acceptTerms` |
| Logout | ✅ PASS | HTTP 201 + refreshToken |
| Login email | ✅ PASS | `customer@test.local` |
| Login username | ✅ PASS | `democustomer` |

### Homepage quick buy (UI)

| Test | Kết quả |
|------|---------|
| Category tabs (game/phone/topup/data) | ✅ PASS |
| Provider list (Garena, Zing) | ✅ PASS (sau ~3s load) |
| Bottom nav 5 tab (6F.2) | ✅ PASS |
| Nút Thanh toán disabled khi chưa chọn mệnh giá | ✅ PASS |
| Login modal khi guest bấm Thanh toán | ⚠️ Cần test thủ công (browser automation không nhập password) |

### Payment SePay mock (API)

| Bước | Kết quả |
|------|---------|
| Tạo order (CARD, authenticated) | ✅ `ORD-20260621-661D56` |
| Tạo payment SePay | ✅ `PAY-A5DC6D673B9840B2A190` |
| Webhook sim | ✅ accepted |
| Payment status | ✅ PAID |
| Fulfillment | ❌ **PROCESSING** (timeout 90s+) |
| Account cards / PIN reveal | ❌ 0 thẻ (phụ thuộc fulfillment) |
| TOPUP flow | ⏭️ SKIP — seed không có variant TOPUP |

**Webhook sim:**

```http
POST http://localhost/api/v1/payments/webhook/sepay
Authorization: Apikey local-sepay-api-key-sim
Content-Type: application/json

{
  "id": 972715,
  "content": "CARDON PAY-A5DC6D673B9840B2A190",
  "transferType": "in",
  "transferAmount": 100000
}
```

---

## TASK 4 — Admin E2E

### API verified (superadmin)

| Test | Kết quả |
|------|---------|
| `GET /admin/orders?take=5` | ✅ PASS |
| `GET /admin/orders/:id/detail` — 5 tabs | ✅ PASS |
| — overview | ✅ |
| — paymentTrace | ✅ |
| — providerTrace | ✅ |
| — cardDelivery | ✅ |
| — auditTimeline | ✅ |
| — **clientTrace (fraud)** | ✅ IP `172.19.0.4`, UA, deviceInfo |

### CMS (API)

| Endpoint | Kết quả |
|----------|---------|
| `GET /cms/theme` | ✅ |
| `GET /cms/blog/posts?take=1` | ✅ |
| `GET /admin/cms/pages` | ✅ (không dùng `take`) |
| `GET /admin/cms/categories` | ⚠️ Chưa verify |
| `GET /admin/cms/tags` | ⚠️ Chưa verify |
| `GET /admin/cms/media` | ⚠️ Chưa verify |
| `GET /admin/cms/seo-settings` | ⚠️ Chưa verify |
| `GET /admin/cms/theme` | ⚠️ Chưa verify |

### UI

| Màn | Kết quả |
|-----|---------|
| `/login` admin | ✅ Form render |
| Dashboard sau login | ⚠️ Cần test thủ công |
| CMS editor (TipTap) | ⚠️ Cần test thủ công |
| Staff permissions | ⚠️ Cần test thủ công (SUPER_ADMIN) |

---

## TASK 5 — Partner E2E

| Test | Kết quả |
|------|---------|
| `/login` partner UI | ✅ PASS |
| Login `agent@test.local` | ⚠️ Throttle khi batch — test riêng OK |
| Dashboard + balance 10M | ⚠️ Cần verify sau login |
| API credentials | ⚠️ Xem `.local-full-credentials.json` |
| Partner API buy card | ⚠️ Chưa chạy (throttle) |
| Ledger | ⚠️ Chưa chạy |

---

## TASK 6 — Role test

| Role | Test | Kết quả |
|------|------|---------|
| SUPPORT | `GET /admin/orders` | ✅ 200 |
| SUPPORT | `GET /admin/finance/profit` | ✅ 403 (đúng) |
| MARKETING | `GET /admin/cms/pages` | ✅ 200 (không query `take`) |
| MARKETING | `GET /admin/orders` | ✅ 403 (đúng) |
| ACCOUNTANT | `GET /admin/finance/profit` | ⚠️ Cần test riêng (throttle) |
| ACCOUNTANT | `GET /admin/customers` | ⚠️ Cần test riêng |

**Menu visibility UI:** Cần login từng role trên http://admin.localhost và chụp sidebar.

---

## TASK 7 — Responsive

| Breakpoint | Kiểm tra | Kết quả |
|------------|----------|---------|
| 375px mobile | Header, hero, category grid, bottom nav | ✅ PASS |
| 430px | Tương tự mobile | ✅ (cùng layout) |
| 768px tablet | ⚠️ Chưa screenshot riêng | |
| 1024px desktop | Checkout 2 cột, header menu | ✅ (browser default) |
| 1440px | Container max-width | ⚠️ Chưa verify pixel-perfect |

**Ghi chú UX:** Trang chủ hiện "Đang tải sản phẩm..." ~2–3 giây trước khi render provider — API trả 3 products ngay.

---

## TASK 8 — Build & Tests

```bash
npm run build          # nest build — PASS (host)
npm run build:web      # FAIL host — thiếu @next/swc-win32-x64-msvc
npm run build:partner  # FAIL host — cùng lý do
npm run build:admin    # FAIL host — cùng lý do
npm test               # 367/367 PASS
```

| Build | Kết quả |
|-------|---------|
| Docker `up --build` (api/worker/web/partner/admin) | ✅ PASS |
| `nest build` | ✅ PASS |
| `jest` full suite | ✅ **367 passed**, 34 suites |
| `next build` trên host Windows | ❌ SWC binary missing — chạy `npm install` đầy đủ trên local |

**Regression script (API):**

```powershell
docker cp scripts/run-local-full-regression.mjs cardon-local-full-api:/app/scripts/
docker exec -e REGRESSION_BASE_URL=http://nginx cardon-local-full-api node /app/scripts/run-local-full-regression.mjs
```

> Chạy từng phần, tránh login liên tiếp (throttle).

---

## Bugs found

### 🔴 P0 — Fulfillment kẹt PROCESSING sau SePay webhook

- **Triệu chứng:** Order `PAID`, `fulfillmentStatus=PROCESSING`, `provider_transactions` count = 0, worker log lặp `Processing fulfill orderId=...`
- **Ảnh hưởng:** Không giao thẻ, `/account/cards` trống, PIN không reveal
- **Có thể liên quan:** Order claim PROCESSING nhưng không tạo provider transaction recoverable; thiếu `system@cardon.local` (có trong `create-smoke-data.ts`, không có trong `seed-local-full.ts`)
- **Workaround tạm:** Admin manual retry / reset zombie order (Phase 6B smoke có cleanup script)

### 🟠 P1 — Auth throttler quá chặt cho local regression

- **Triệu chứng:** `ThrottlerException: Too Many Requests` sau ~8–10 login liên tiếp
- **Ảnh hưởng:** Batch E2E script fail giữa chừng
- **Workaround:** Restart redis/api, test từng role cách nhau 1–2 phút, hoặc tăng limit cho `APP_ENV=staging`

### 🟡 P2 — Seed local-full thiếu TOPUP variant

- Catalog chỉ có CARD (Viettel/Garena/Zing 100k)
- Không test được luồng TOPUP homepage end-to-end trên stack này

### 🟡 P3 — Docker frontend healthcheck unhealthy

- Cosmetic — HTTP 200 OK

---

## Screens cần review thủ công

1. **Admin order detail** — tab Provider trace khi order kẹt PROCESSING (hiển thị gì?)
2. **Homepage loading** — skeleton "Đang tải sản phẩm..." có cần spinner/timeout error?
3. **Login modal checkout** — guest → Thanh toán → modal 6F.2
4. **Account center** — 6 mục sidebar sau login customer
5. **Admin CMS TipTap** — tạo/sửa bài blog, upload media, appearance
6. **Partner dashboard** — balance, ledger, API buy

---

## Tài khoản test (manual)

| Role | Email / Username | Password |
|------|------------------|----------|
| SUPER_ADMIN | superadmin@cardon.vn | `SuperAdmin2026!` |
| SUPPORT | support@test.local | `LocalTest2026!` |
| MARKETING | marketing@test.local | `LocalTest2026!` |
| ACCOUNTANT | accountant@test.local | `LocalTest2026!` |
| CUSTOMER | customer@test.local | `LocalTest2026!` |
| CUSTOMER (username) | democustomer | `LocalTest2026!` |
| AGENT | agent@test.local | `LocalTest2026!` |

**Agent API keys:** regenerate mỗi lần seed — xem `/app/scripts/.local-full-credentials.json` trong container api.

---

## Checklist QA thủ công (đề xuất tiếp)

### Customer
- [ ] Register form đầy đủ field → auto login
- [ ] Logout → login lại
- [ ] Quick buy CARD → SePay QR → webhook → nhận thẻ
- [ ] `/account/cards` — Hiện PIN + Copy
- [ ] `/account/orders` — lịch sử đơn
- [ ] Guest bấm Thanh toán → modal login

### Admin
- [ ] Dashboard metrics
- [ ] Order detail 5 tabs + fraud trace
- [ ] CMS: article CRUD, category, tag, media, SEO, appearance
- [ ] Staff permissions UI

### Partner
- [ ] Login → dashboard → API buy → ledger

### Roles
- [ ] SUPPORT — orders OK, không finance/customers
- [ ] MARKETING — chỉ CMS menu
- [ ] ACCOUNTANT — finance OK, không customers

---

## Files liên quan Phase 6G

| File | Mục đích |
|------|----------|
| `docker-compose.local-full.yml` | Stack đầy đủ |
| `.env.local-full` | Env staging + mock |
| `scripts/seed-local-full.ts` | Bootstrap data |
| `scripts/run-local-full-regression.mjs` | API regression runner (mới) |

---

**Trạng thái:** Phase 6G hoàn thành regression cơ bản. **Cần fix P0 fulfillment** trước khi sign-off customer E2E đầy đủ. UI/CMS build OK trong Docker; unit tests PASS.
