# Phase 5C.4 — Final Security Polish

**Ngày:** 2026-06-20  
**Trạng thái:** HOÀN THÀNH  
**Phạm vi:** Security polish only — không đổi schema DB, không đổi business logic payment/order/agent

---

## Tóm tắt

Phase 5C.4 xử lý các mục còn lại sau audit 5C.3: UX quyền thanh toán SUPPORT, sanitize HTML CMS khi render public, giới hạn độ dài robots.txt, và test bảo mật.

---

## TASK 1 — Payment permission UX

### Thay đổi

| Trước | Sau |
|-------|-----|
| Menu **Thanh toán** yêu cầu `payments.review` | Menu yêu cầu `payments.view` |
| SUPPORT không thấy menu dù có `payments.view` | SUPPORT thấy menu và danh sách thanh toán |

### Hành vi trang `/payments`

- **Danh sách thanh toán:** `RequirePermission permission="payments.view"`
- **Duyệt / từ chối + webhook queue:** chỉ render khi `can('payments.review')`
- **Load API:** `loadReview()` chỉ gọi khi user có `payments.review` (tránh 403 cho SUPPORT)

### Kết quả mong đợi

| Role | Xem danh sách | Approve/Reject |
|------|---------------|----------------|
| SUPPORT | ✅ | ❌ |
| ACCOUNTANT | ✅ | ✅ |

**Files:** `apps/admin/lib/permissions.ts`, `apps/admin/app/payments/page.tsx`

---

## TASK 2 — CMS HTML security

### Nguyên tắc

- **DB / admin editor:** nội dung lưu **nguyên bản** (không sanitize khi ghi)
- **Public render:** sanitize trước khi hiển thị

### Server

- `src/modules/cms/entities/cms-html-safety.ts` — `sanitizeCmsHtml()`
- `src/modules/cms/entities/cms-public.mapper.ts` — `mapCmsPageForPublic()` áp sanitize lên `content`
- `GET /cms/pages/:slug` — chỉ trang `PUBLISHED`, response đã sanitize (`CmsPublicController`)

**Chặn:** `<script>`, `<iframe>`, `javascript:` / `vbscript:` URLs, event handlers `on*`

**Cho phép:** `p`, `br`, `strong`, `em`, `b`, `i`, `u`, `ul`, `ol`, `li`, `h1–h6`, `blockquote`, `a` (href an toàn), `span`

### Client

- `apps/web/lib/sanitize-cms-html.ts` — cùng logic (defense in depth)
- `apps/web/components/SafeCmsHtml.tsx` — sanitize rồi `dangerouslySetInnerHTML`
- `apps/admin/lib/sanitize-cms-html.ts` — bản admin (preview tương lai)

---

## TASK 3 — robots.txt validation

- Hằng số: `CMS_ROBOTS_TXT_MAX_LENGTH = 10_000`
- DTO: `@MaxLength(CMS_ROBOTS_TXT_MAX_LENGTH)` trên `UpdateCmsSeoSettingsDto.robotsTxt`

**File:** `src/modules/cms/dto/cms.dto.ts`, `src/modules/cms/entities/cms.constants.ts`

---

## TASK 4 — Tests

### Mới / cập nhật

| File | Nội dung |
|------|----------|
| `src/modules/admin/admin.payment-permission.spec.ts` | SUPPORT view-only, ACCOUNTANT review |
| `src/modules/cms/cms.security.spec.ts` | sanitize HTML, robots max length |

### Kết quả chạy lệnh

```text
npm run build          → PASS (sau prisma generate)
npm run build:admin    → PASS (17 routes)
npm test               → 26 passed, 3 failed (pre-existing, không liên quan 5C.4)
npm test --testPathPattern='cms.security|admin.payment-permission' → 13/13 PASS
```

**Test fail sẵn có (không sửa trong phase này — ngoài phạm vi polish):**

- `order.service.spec.ts` — TS constructor arity
- `agent.service.spec.ts` — thiếu mock `cardEncryption`
- `esale.provider.spec.ts` — Node 20 RSA_PKCS1_PADDING (CVE-2023-46809)

---

## Files thay đổi

```
apps/admin/lib/permissions.ts
apps/admin/app/payments/page.tsx
apps/admin/lib/sanitize-cms-html.ts
apps/web/lib/sanitize-cms-html.ts
apps/web/components/SafeCmsHtml.tsx
src/modules/cms/entities/cms-html-safety.ts
src/modules/cms/entities/cms-public.mapper.ts
src/modules/cms/entities/cms.constants.ts
src/modules/cms/controllers/cms-public.controller.ts
src/modules/cms/services/cms.service.ts
src/modules/cms/repositories/cms.repository.ts
src/modules/cms/cms.module.ts
src/modules/cms/dto/cms.dto.ts
src/modules/cms/cms.security.spec.ts
src/modules/admin/admin.payment-permission.spec.ts
```

---

## Kết luận

Phase 5C.4 **HOÀN THÀNH**. Không deploy.
