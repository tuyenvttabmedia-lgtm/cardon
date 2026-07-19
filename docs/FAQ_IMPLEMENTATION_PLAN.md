# FAQ Implementation Plan

> **Trạng thái:** Thiết kế — chưa triển khai  
> **Ngày:** 2026-07-09  
> **Ưu tiên:** Simple → Stable → Maintainable → SEO → Easy admin

---

## 1. Executive summary

**Quyết định:** Migrate thẳng JSON → PostgreSQL. **Không** làm Phase 1 cải thiện JSON.

**Effort ước tính:** **5–7 ngày dev** + 1 ngày UAT/staging

**Deliverable:** FAQ module DB-backed + Admin list/editor + Frontend hub `/tro-giup` + embed limits

---

## 2. Development phases

### Phase 1 — Database & API core (1.5 ngày)

| Task | Module |
|------|--------|
| Prisma schema: `FaqCategory`, `Faq`, `FaqPosition` + enums | `prisma/schema.prisma` |
| Prisma migration SQL | `prisma/migrations/` |
| FAQ HTML sanitizer subset | `src/modules/faq/entities/faq-html-safety.ts` |
| Repository layer | `src/modules/faq/repositories/faq.repository.ts` |
| Service layer (CRUD, list filters, slug unique) | `src/modules/faq/services/faq.service.ts` |
| DTOs + validation | `src/modules/faq/dto/` |
| Admin controller REST | `src/modules/faq/controllers/faq-admin.controller.ts` |
| Public controller | `src/modules/faq/controllers/faq-public.controller.ts` |
| Register FaqModule in AppModule | `src/app.module.ts` |
| Migration script JSON → DB | `prisma/scripts/migrate-faq-json-to-db.ts` |
| Verify script | `prisma/scripts/verify-faq-migration.ts` |
| Unit tests: sanitizer, slug, mapping | `src/modules/faq/*.spec.ts` |

**Exit criteria:** API trả FAQ từ DB; migration script chạy OK trên staging.

---

### Phase 2 — Admin UI (2 ngày)

| Task | Module |
|------|--------|
| `faqAdminApi` client (REST) | `apps/admin/services/api-client.ts` |
| Types `Faq`, `FaqCategory` | `apps/admin/types/api.ts` |
| `FaqListTable` (based on ArticleListTable) | `apps/admin/components/marketing/faq/` |
| `FaqLiteEditor` (TipTap minimal) | `apps/admin/components/marketing/faq/FaqLiteEditor.tsx` |
| `FaqEditorPage` | `apps/admin/app/marketing/faq/[id]/page.tsx` |
| Redesign list page | `apps/admin/app/marketing/faq/page.tsx` |
| Category drawer/tab | `apps/admin/app/marketing/faq/categories/` or tab |
| Bulk actions API integration | list page |
| Remove old accordion bulk-save page | delete old UI |
| Marketing dashboard FAQ count | `apps/admin/app/marketing/page.tsx` |
| i18n labels | `apps/admin/lib/i18n/vi.ts` |

**Exit criteria:** Admin tạo/sửa/xóa/tìm/phân trang FAQ; không còn bulk JSON save.

---

### Phase 3 — Frontend public (1.5 ngày)

| Task | Module |
|------|--------|
| Public API client update | `apps/web/lib/cms-api.ts` |
| `FaqSection` — props limit/featured/position/viewAll | `apps/web/components/faq/FaqSection.tsx` |
| `FaqAccordion` — HTML answer render | `apps/web/components/faq/FaqAccordion.tsx` |
| `GuideFaqBlock` — search + category pills | `apps/web/components/faq/GuideFaqBlock.tsx` |
| Homepage integration | `apps/web/components/home/HomePageClient.tsx` |
| Contact integration | `apps/web/components/contact/ContactPageClient.tsx` |
| Guide integration | `apps/web/components/guide/HuongDanPageClient.tsx` |
| Hub page `/tro-giup` | `apps/web/app/tro-giup/page.tsx` |
| Hub client component | `apps/web/components/faq/FaqHubPageClient.tsx` |
| Detail page `/tro-giup/[categorySlug]/[faqSlug]` | `apps/web/app/tro-giup/[categorySlug]/[faqSlug]/page.tsx` |
| FAQ JSON-LD component | `apps/web/components/seo/FaqSchema.tsx` |
| Footer link | `apps/web/lib/footer-config.ts` |
| Sitemap entries | `apps/web/app/sitemap.ts` |
| Web sanitizer (FAQ subset) | `apps/web/lib/sanitize-faq-html.ts` |
| Deprecate old `GET /cms/faqs?category=` calls | cms-api.ts |

**Exit criteria:** 4 surfaces hoạt động; hub paginated; homepage max 10 featured.

---

### Phase 4 — Migration, cleanup & deploy (1 ngày)

| Task | Notes |
|------|-------|
| Staging dry-run migration | Verify audit log |
| Production migration | Pre-launch window |
| Remove JSON read/write code | `cms.repository.ts`, `cms.service.ts` |
| Remove old admin API routes | `cms-admin.controller.ts` |
| Deploy api + admin + web | Docker rebuild |
| UAT checklist | See §5 |
| Keep JSON backup row | 30 days |

---

### Phase 5 — Optional polish (future, không bắt buộc)

- Full-text search `tsvector` nếu >500 FAQ
- Drag-drop reorder admin
- "Bài này có hữu ích?" thumbs up/down
- Product page positions (garena, viettel…)
- FAQ analytics dashboard admin

---

## 3. Affected modules

### Backend (`src/`)

| File / Area | Change |
|-------------|--------|
| `prisma/schema.prisma` | Add 3 models |
| `src/modules/faq/` | **New module** |
| `src/modules/cms/services/cms.service.ts` | Remove FAQ methods |
| `src/modules/cms/repositories/cms.repository.ts` | Remove FAQ JSON methods |
| `src/modules/cms/controllers/cms-admin.controller.ts` | Remove FAQ routes |
| `src/modules/cms/controllers/cms-public.controller.ts` | Remove or alias FAQ routes |
| `src/modules/cms/entities/cms.constants.ts` | Deprecate `CMS_FAQ_SETTING_KEY` |
| `src/app.module.ts` | Import FaqModule |

### Admin (`apps/admin/`)

| File / Area | Change |
|-------------|--------|
| `app/marketing/faq/` | Full redesign |
| `services/api-client.ts` | New `faqAdminApi` |
| `types/api.ts` | New types |
| `components/marketing/MarketingNav.tsx` | Label update optional |

### Web (`apps/web/`)

| File / Area | Change |
|-------------|--------|
| `app/tro-giup/` | **New routes** |
| `components/faq/` | Extend + new components |
| `components/home/HomePageClient.tsx` | Featured limit |
| `components/guide/HuongDanPageClient.tsx` | GuideFaqBlock |
| `components/contact/ContactPageClient.tsx` | Limit + view all |
| `lib/cms-api.ts` | New FAQ endpoints |
| `lib/footer-config.ts` | Add hub link |
| `app/sitemap.ts` | FAQ URLs |

### Docs

| File | Status |
|------|--------|
| `docs/FAQ_DATABASE_DESIGN.md` | ✅ Created |
| `docs/FAQ_ADMIN_DESIGN.md` | ✅ Created |
| `docs/FAQ_FRONTEND_DESIGN.md` | ✅ Created |
| `docs/FAQ_MIGRATION_PLAN.md` | ✅ Created |
| `docs/FAQ_IMPLEMENTATION_PLAN.md` | ✅ Created |
| `docs/02_DATABASE_SCHEMA.md` | Update after implement |

---

## 4. Effort breakdown

| Phase | Effort | Owner |
|-------|--------|-------|
| DB + API | 1.5 ngày | Backend |
| Admin UI | 2 ngày | Frontend admin |
| Frontend public | 1.5 ngày | Frontend web |
| Migration + deploy | 1 ngày | Full stack |
| UAT | 0.5–1 ngày | QA / Product |
| **Total** | **5.5–7 ngày** | |

---

## 5. Testing checklist

### API

- [ ] `POST /admin/faqs` — create draft
- [ ] `PATCH /admin/faqs/:id` — update answer HTML sanitized (no img/iframe)
- [ ] `DELETE /admin/faqs/:id` — cascade positions
- [ ] `GET /admin/faqs?q=...` — search works
- [ ] `GET /admin/faqs?position=guide` — filter
- [ ] `PATCH /admin/faqs/bulk` — bulk status change
- [ ] Slug unique constraint enforced
- [ ] Cannot delete category with FAQs
- [ ] `GET /cms/faqs?featured=true&limit=10` — homepage
- [ ] `GET /cms/faqs?position=contact&limit=10` — contact
- [ ] `GET /cms/faqs/:cat/:slug` — detail + view_count increment
- [ ] Public API không trả DRAFT/INACTIVE

### Admin UI

- [ ] List pagination 20/page
- [ ] Search debounce
- [ ] Filter category + position + status
- [ ] Featured toggle + warning >10
- [ ] Edit page save draft / publish
- [ ] FaqLiteEditor: bold, italic, list, link work; paste image blocked
- [ ] Bulk delete confirm
- [ ] Category CRUD

### Frontend

- [ ] Homepage ≤10 featured + "Xem tất cả" link
- [ ] /huong-dan: 10–15 FAQ + search + view all
- [ ] /lien-he: 8–10 FAQ + view all
- [ ] /tro-giup: search + category + pagination
- [ ] /tro-giup/[cat]/[slug]: detail renders + breadcrumb
- [ ] JSON-LD valid (Google Rich Results Test)
- [ ] Mobile responsive hub
- [ ] Empty search state + link liên hệ
- [ ] Footer link /tro-giup

### Migration

- [ ] Dry-run staging: count match
- [ ] homepage/general → featured mapping correct
- [ ] guide/contact → positions correct
- [ ] Plain text answers wrapped in `<p>`
- [ ] Rollback tested on staging

### Regression

- [ ] Blog /huong-dan không bị ảnh hưởng
- [ ] CMS articles admin không bị ảnh hưởng
- [ ] `/tai-khoan/ho-tro` ticket page không conflict URL

---

## 6. Điều chỉnh so với đề xuất ban đầu (tóm tắt)

| Điểm | Quyết định của bạn | Điều chỉnh đề xuất | Lý do |
|------|-------------------|-------------------|-------|
| Phase 1 JSON | ❌ Bỏ | ✅ Đồng ý — migrate thẳng DB | Pre-launch, không lãng phí effort |
| 3 bảng schema | ✅ | ✅ Giữ + thêm enum status | Draft cần cho admin |
| `featured` + `positions` | ✅ Cả hai | Phân vai: featured=TC, positions=embed | Tránh overlap homepage |
| position `homepage` | Có trong draft | ❌ Bỏ — dùng `featured` | Một nguồn s truth cho TC |
| Admin giống Articles | ✅ | ✅ + FaqLiteEditor riêng | Article editor quá nặng |
| URL SEO | Chưa chốt | **`/tro-giup/[category]/[slug]`** | Index tốt hơn hash |
| Help Center enterprise | ❌ | ✅ Hub FAQ only | Đúng scope CardOn |

---

## 7. Go / No-go criteria

**Go khi:**

- Bạn chốt URL `/tro-giup`
- Chốt danh mục seed (7 categories ở trên hoặc custom)
- Chấp nhận migrate gán category "Chung" ban đầu
- Staging dry-run PASS

**Không cần thêm** trước khi code:

- Enterprise KB features
- Phase 1 JSON improvements
- Full-text search engine (200 FAQ ILIKE đủ)

---

## 8. Next step (khi bạn approve)

1. Confirm 3 điểm: URL `/tro-giup`, category seed list, hybrid SEO URL
2. Implement Phase 1 → 4 theo thứ tự
3. Staging UAT → production deploy pre-launch

**Hiện tại: chưa code — chờ approval.**
