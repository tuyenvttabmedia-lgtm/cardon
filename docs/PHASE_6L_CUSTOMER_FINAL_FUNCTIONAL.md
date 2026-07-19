# Phase 6L — Customer Final Functional Completion

**Ngày hoàn thành:** 2026-06-21  
**Phạm vi:** Hoàn thiện tính năng vận hành customer-facing. **Không thay đổi** payment flow, card fulfillment core, admin core, agent API.

---

## Task Checklist

### TASK 1 — Contact form backend ✅

**Database:** `contact_messages` (migration `20250621180000_phase_6l_contact_messages`)

| Field | Type |
|-------|------|
| name, email, phone, subject, message | string |
| status | `NEW` \| `PROCESSED` |

**API:**
- `POST /contact` — public submit (rate limit 5/phút)
- `GET /admin/contact-messages` — list (filter status)
- `GET /admin/contact-messages/:id` — view
- `PATCH /admin/contact-messages/:id/processed` — mark processed
- `DELETE /admin/contact-messages/:id` — delete

**Admin:** Marketing → **Liên hệ** (`/marketing/contacts`)

**Email:** Template `CONTACT_FORM` gửi tới `ADMIN_ALERT_EMAIL` hoặc `SMTP_FROM`

**Web:** `/lien-he` form gọi API thật

---

### TASK 2 — Promotion page ✅

- Route: `/khuyen-mai`
- CMS posts: `category=promotion` (slug danh mục CMS)
- Layout: BlogListClient (featured + grid + pagination)
- SEO: title, description, canonical, OpenGraph

---

### TASK 3 — Guide page ✅

- Route: `/huong-dan`
- CMS posts: `category=guide`
- Layout giống blog/khuyến mãi
- Header menu mặc định trỏ `/huong-dan`

**Lưu ý CMS:** Tạo danh mục blog slug `promotion` và `guide` trong Admin → Marketing → Danh mục, gán bài viết tương ứng.

---

### TASK 4 — Account order UX ✅

**Backend:** `GET /account/orders` trả thêm `items[]` (productName, variantType, quantity, faceValue)

**UI `/account/orders`:**
- Desktop: bảng đầy đủ (mã đơn, sản phẩm, số tiền, TT thanh toán, TT giao hàng, ngày)
- Mobile: card layout
- Actions: **Xem thẻ** (đơn CARD đã PAID), **Hỗ trợ** → `/lien-he`

---

### TASK 5 — Topup readiness audit ✅

| Layer | Trạng thái |
|-------|------------|
| Frontend `/nap-cuoc` | ✅ UI hoàn chỉnh, chọn nhà mạng/mệnh giá |
| API order/payment | ✅ Tạo đơn TOPUP variant được |
| Provider fulfillment | ❌ `ProviderService.fulfillOrder` chỉ xử lý `CARD` — TOPUP chưa implement |
| Provider topup API | ⚠️ eSale adapter có `topup()` nhưng chưa gắn fulfillment pipeline |

**Giải pháp triển khai:**
- `GET /cms/site-config` trả `topup.ready` (false khi fulfillment chưa sẵn sàng)
- Admin **Settings → System:** toggle **Bật nạp cước trên website**
- `/nap-cuoc`: ẩn nút thanh toán + banner cảnh báo khi `ready=false`

**Kích hoạt nạp cước (khi backend sẵn sàng):**
1. Cấu hình eSale topup API (Settings → Providers)
2. Bật `customerTopupEnabled` (Settings → System)
3. Implement TOPUP fulfillment trong ProviderService (phase sau — ngoài 6L)

---

### TASK 6 — Footer company settings ✅

**Appearance → Thông tin công ty:**
- companyName, taxCode, address, hotline, email

**CMS key:** `cms.theme.company_info`

**Footer:** Hiển thị block công ty phía trên copyright; `/lien-he` đọc hotline/email/address từ CMS

---

### TASK 7 — Regression ✅

```
npm run build:web  → PASS
npm run build      → PASS (nest)
npm test           → 40/40 suites PASS (385 tests)
```

---

## Files chính

| Area | Path |
|------|------|
| Contact module | `src/modules/contact/` |
| Migration | `prisma/migrations/20250621180000_phase_6l_contact_messages/` |
| Site config | `GET /cms/site-config` |
| Admin contacts | `apps/admin/app/marketing/contacts/` |
| Promotion | `apps/web/app/khuyen-mai/` |
| Guide | `apps/web/app/huong-dan/` |
| Topup guard | `apps/web/components/topup/TopupPageClient.tsx` |

---

## Manual QA checklist

- [ ] Gửi form `/lien-he` → tin xuất hiện Admin → Marketing → Liên hệ
- [ ] Email admin nhận thông báo (cần `ADMIN_ALERT_EMAIL` + SMTP)
- [ ] `/khuyen-mai` hiển thị bài category `promotion`
- [ ] `/huong-dan` hiển thị bài category `guide`
- [ ] `/account/orders` desktop + mobile
- [ ] `/nap-cuoc` banner tạm ngưng khi topup chưa ready
- [ ] Footer hiển thị thông tin công ty sau khi lưu Appearance
- [ ] Bật topup trong System settings → vẫn blocked cho đến khi fulfillment ready
