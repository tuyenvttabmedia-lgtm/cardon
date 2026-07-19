# FAQ Frontend Design

> **Trạng thái:** Thiết kế — chưa triển khai  
> **Ngày:** 2026-07-09  
> **Nguyên tắc:** FAQ Hub nhẹ — **không** documentation portal, **không** tutorial site

---

## 1. Tổng quan luồng người dùng

```mermaid
flowchart TB
  Home[Trang chủ<br/>10 FAQ nổi bật]
  Guide[/huong-dan<br/>10-15 FAQ + search]
  Contact[/lien-he<br/>8-10 FAQ]
  Hub[/tro-giup<br/>Hub đầy đủ]
  Detail[/tro-giup/cat/slug<br/>Trang chi tiết SEO]

  Home -->|Xem tất cả| Hub
  Guide -->|Xem tất cả| Hub
  Contact -->|Xem tất cả| Hub
  Hub -->|Click câu hỏi| Detail
  Hub -->|Accordion inline| Hub
  Detail -->|Liên quan| Detail
```

---

## 2. Public API

### Endpoints mới (đề xuất)

```
GET /cms/faq/categories              → danh mục active
GET /cms/faqs                        → list có filter
GET /cms/faqs/:categorySlug/:slug    → chi tiết 1 FAQ (+ view_count++)
```

### Query params — `GET /cms/faqs`

| Param | Mô tả | Ví dụ |
|-------|-------|-------|
| `q` | Full-text search question+answer | `?q=vietqr` |
| `category` | Category slug | `?category=thanh-toan` |
| `position` | Filter position | `?position=guide` |
| `featured` | `true` only | `?featured=true` |
| `limit` | Max items | `?limit=10` |
| `offset` | Pagination | `?offset=20` |

### Deprecate

```
GET /cms/faqs?category=homepage   → thay bằng ?featured=true&limit=10
GET /cms/faqs?category=guide      → thay bằng ?position=guide&limit=15
GET /cms/faqs?category=contact    → thay bằng ?position=contact&limit=10
```

Giữ alias mapping 1 release nếu cần, sau đó xóa.

---

## 3. Trang chủ (`/`)

### Hiển thị

- Section **"Câu hỏi thường gặp"**
- **Chỉ FAQ `featured=true` AND `status=ACTIVE`**
- Sort: `sort_order ASC`
- **Limit: 10**
- Accordion (giữ `FaqAccordion` hiện tại, cải thiện render HTML answer)

### CTA

```
[Xem tất cả câu hỏi →]  →  /tro-giup
```

### API call

```
GET /cms/faqs?featured=true&limit=10
```

### Ghi chú

- Nếu < 10 featured → hiện số có; nếu 0 → ẩn section
- Không search/filter trên trang chủ

---

## 4. Trang Hướng dẫn (`/huong-dan`)

### Cấu trúc hiện tại (giữ)

1. Blog list (bài hướng dẫn dài) — **không đụng**
2. Section FAQ phía dưới — **redesign**

### FAQ section mới

| Thành phần | Mô tả |
|------------|-------|
| Tiêu đề | "Câu hỏi thường gặp về hướng dẫn" |
| Search box | Client-side hoặc API `?q=` scoped position=guide |
| Category pills | Filter nhanh theo danh mục FAQ |
| Accordion list | **10–15 items** |
| Link | "Xem tất cả → `/tro-giup?position=guide`" |

### API

```
GET /cms/faqs?position=guide&limit=15
GET /cms/faq/categories   (for pills)
```

Search trên trang: debounce 300ms → `GET /cms/faqs?position=guide&q=...&limit=15`

---

## 5. Trang Liên hệ (`/lien-he`)

### Hiển thị

- Form liên hệ — **giữ nguyên**
- FAQ section bên dưới:
  - **8–10 FAQ** (`position=contact`)
  - Accordion đơn giản, **không** search (form đã đủ interaction)
  - Link "Xem tất cả → `/tro-giup?position=contact`"

### API

```
GET /cms/faqs?position=contact&limit=10
```

---

## 6. FAQ Hub — `/tro-giup` (trang mới)

> **Lưu ý URL:** `/tai-khoan/ho-tro` đã dùng cho ticket tài khoản. Hub công khai dùng `/tro-giup`.

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  Breadcrumb: Trang chủ > Trợ giúp                          │
│  H1: Trung tâm trợ giúp                                     │
│  Sub: Giải đáp thắc mắc về mua thẻ, nạp cước, thanh toán   │
│  [🔍 Tìm câu hỏi...                              ]         │
├──────────────────┬─────────────────────────────────────────┤
│  Danh mục        │  Kết quả (accordion)                    │
│  • Tất cả        │  ┌─────────────────────────────────┐    │
│  • Thanh toán    │  │ Câu hỏi 1                    [+]│    │
│  • Mua thẻ       │  └─────────────────────────────────┘    │
│  • Nạp cước      │  ┌─────────────────────────────────┐    │
│  • Data 4G/5G    │  │ Câu hỏi 2                    [+]│    │
│  • Hoàn tiền     │  └─────────────────────────────────┘    │
│  • Tài khoản     │  ...                                    │
│                  │  [Trang 1] [2] [3] ...                  │
└──────────────────┴─────────────────────────────────────────┘
│  Không tìm thấy? [Liên hệ hỗ trợ →] /lien-he               │
└────────────────────────────────────────────────────────────┘
```

### Tính năng

| Tính năng | Có | Không |
|-----------|-----|-------|
| Search | ✅ | |
| Category filter | ✅ | |
| Accordion | ✅ | |
| Pagination 20/trang | ✅ | |
| Position filter (query `?position=`) | ✅ optional | |
| Rich layout / sidebar TOC dài | | ❌ |
| Bài viết dài / tutorial | | ❌ |
| Video embed | | ❌ |

### Accordion behavior

- Mặc định: expand inline trên hub
- Mỗi câu hỏi có link "Xem liên kết" → `/tro-giup/[category-slug]/[faq-slug]` (shareable, SEO)
- Answer render HTML qua sanitizer + `cms-prose` (subset)

### Empty states

- Không kết quả search → gợi ý từ khóa + link liên hệ
- Chưa có FAQ → ẩn section (dev/staging)

---

## 7. Trang chi tiết SEO — `/tro-giup/[categorySlug]/[faqSlug]`

### Mục đích

- URL indexable cho Google
- Share link trực tiếp 1 câu hỏi
- FAQ Schema JSON-LD

### Layout (minimal)

```
Breadcrumb: Trang chủ > Trợ giúp > [Category] > [Question]
H1: Câu hỏi
Answer: (cms-prose)
─────────────────
Câu hỏi liên quan (cùng category, max 5)
[← Quay lại Trung tâm trợ giúp]
```

### Internal linking

- Hub → detail
- Detail → related FAQs (same category)
- Detail → hub
- Footer "Hỗ trợ" thêm link `/tro-giup`

---

## 8. SEO — URL strategy

### So sánh 2 phương án

| | `/tro-giup#slug` | `/tro-giup/[category]/[slug]` |
|--|------------------|-------------------------------|
| **Google index** | ❌ Hash fragment thường không index riêng | ✅ Mỗi FAQ = 1 URL |
| **Share link** | ⚠️ Copy link có thể mất hash | ✅ URL sạch, ổn định |
| **Structured Data** | ⚠️ Chỉ FAQPage trên hub | ✅ FAQPage per URL + BreadcrumbList |
| **Độ phức tạp dev** | Thấp | Trung bình |
| **UX accordion hub** | ✅ Scroll to hash | ✅ Hub accordion + optional detail page |
| **Phù hợp CardOn** | Không đủ SEO | **✅ Khuyến nghị** |

### Khuyến nghị: **Hybrid**

1. **Hub** `/tro-giup` — accordion + search (primary UX)
2. **Detail** `/tro-giup/[category-slug]/[faq-slug]` — SEO + direct link
3. **Hash** `#slug` — optional scroll helper trên hub, **không** thay detail URL

### Metadata

**Hub `/tro-giup`:**

```html
<title>Trung tâm trợ giúp — CardOn.vn</title>
<meta name="description" content="Giải đáp thắc mắc mua thẻ game, thẻ điện thoại, nạp cước và data 4G/5G tại CardOn.vn">
```

**Detail page:**

```html
<title>{question} — Trợ giúp CardOn.vn</title>
<meta name="description" content="{first 160 chars of answer plain text}">
<link rel="canonical" href="https://cardon.vn/tro-giup/{cat}/{slug}">
```

### JSON-LD — FAQPage (detail)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "{question}",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "{answer plain text or sanitized HTML}"
    }
  }]
}
```

**Hub:** có thể emit FAQPage với `mainEntity[]` cho các FAQ trên trang hiện tại (paginated — chỉ items visible hoặc top 10).

### Sitemap

Thêm vào `apps/web/app/sitemap.ts`:

- `/tro-giup` (priority 0.7)
- `/tro-giup/[category]/[slug]` cho mỗi FAQ ACTIVE (priority 0.5)

---

## 9. Component changes

| Component | Action |
|-----------|--------|
| `FaqSection.tsx` | Thêm props `limit`, `position`, `featured`, `showViewAll` |
| `FaqAccordion.tsx` | Render HTML answer (`dangerouslySetInnerHTML` + sanitizer) |
| `FaqHubPageClient.tsx` | **Mới** — hub layout |
| `FaqDetailPageClient.tsx` | **Mới** — detail + schema |
| `GuideFaqBlock.tsx` | **Mới** — search + pills cho /huong-dan |
| `HomePageClient.tsx` | `featured limit=10 showViewAll` |
| `ContactPageClient.tsx` | `position=contact limit=10 showViewAll` |
| `HuongDanPageClient.tsx` | Dùng `GuideFaqBlock` |

---

## 10. Footer & navigation

**Footer cột "Hỗ trợ"** — thêm:

```
Trung tâm trợ giúp → /tro-giup
```

Giữ: Hướng dẫn, Liên hệ, Ticket.

---

## 11. Responsive

| Breakpoint | Hub layout |
|------------|------------|
| Mobile | Category → horizontal scroll pills; accordion full width |
| Desktop | Sidebar category + content |

Giữ visual language CardOn (cardon-navy, border-cardon-border, rounded-2xl).

---

## 12. Performance

| Concern | Giải pháp |
|---------|-----------|
| 200+ FAQ load | Pagination API — không fetch all client-side |
| Search | Server-side `ILIKE` hoặc `tsvector` (phase 2 nếu cần) — MVP: ILIKE đủ |
| Cache | `Cache-Control: public, s-maxage=60` cho public FAQ list; `no-store` admin |
| HTML sanitize | Server sanitize on write; client re-sanitize on render |

---

## 13. Giới hạn rõ ràng (scope guard)

Trang `/tro-giup` **KHÔNG** bao gồm:

- ❌ Hệ thống tài liệu đa cấp
- ❌ Tutorial step-by-step portal
- ❌ User comments / rating phức tạp (có thể thêm "Bài này hữu ích?" sau)
- ❌ Ticket integration (link sang `/lien-he` là đủ)
- ❌ Gộp blog bài viết vào hub (blog vẫn ở `/huong-dan`)
