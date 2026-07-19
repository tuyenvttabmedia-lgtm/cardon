# SEO & CMS

## Overview

The SEO/CMS module manages public-facing content for CardOn.vn — product pages, landing pages, blog posts, and SEO metadata. This is Phase 12 (last development phase).

```
Public Website (Next.js)
    ↓
CMS API (NestJS)
    ↓
CmsService
    ↓
CmsRepository
    ↓
Database
```

CMS content is separate from the product/order engine. Product catalog data comes from `ProductEngine`; CMS adds marketing content and SEO layers on top.

## Content Types

| Type | Purpose | URL Pattern |
|------|---------|-------------|
| `PAGE` | Static pages (About, FAQ, Terms) | `/pages/{slug}` |
| `PRODUCT_LANDING` | SEO landing for product categories | `/the/{slug}` |
| `BLOG_POST` | News, guides, promotions | `/blog/{slug}` |
| `BANNER` | Homepage/promotional banners | Component embed |
| `FAQ` | Frequently asked questions | `/faq` or embedded |

## Data Model (Design Reference)

### cms_pages

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| type | ENUM | PAGE, PRODUCT_LANDING, BLOG_POST |
| slug | VARCHAR UNIQUE | URL-friendly identifier |
| title | VARCHAR | Page title |
| content | TEXT | HTML / Markdown content |
| excerpt | VARCHAR | Short description |
| featured_image | VARCHAR | Image URL |
| status | ENUM | DRAFT, PUBLISHED, ARCHIVED |
| author_id | UUID FK → users | |
| published_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### cms_seo

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| page_id | UUID FK → cms_pages | |
| meta_title | VARCHAR | `<title>` tag (max 60 chars) |
| meta_description | VARCHAR | `<meta description>` (max 160 chars) |
| meta_keywords | VARCHAR | Optional keywords |
| og_title | VARCHAR | Open Graph title |
| og_description | VARCHAR | Open Graph description |
| og_image | VARCHAR | Open Graph image URL |
| canonical_url | VARCHAR | Canonical link |
| robots | VARCHAR | index/noindex, follow/nofollow |
| structured_data | JSONB | JSON-LD schema markup |

### cms_banners

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| title | VARCHAR | Internal name |
| image_url | VARCHAR | Banner image |
| link_url | VARCHAR | Click destination |
| position | ENUM | HOME_HERO, HOME_SIDEBAR, CATEGORY_TOP |
| sort_order | INT | Display order |
| status | ENUM | ACTIVE, INACTIVE |
| start_at | TIMESTAMPTZ | Schedule start |
| end_at | TIMESTAMPTZ | Schedule end |

## SEO Strategy

### Product Category Pages

Auto-generated landing pages for product categories:

```
/the/game-card          → Game cards listing + SEO content
/the/mobile-card        → Mobile cards listing
/the/topup              → Topup services
/the/{game-name}        → Game-specific landing (e.g., /the/pubg-mobile)
```

Each page combines:

- Product listing from `ProductEngine` (live prices, availability)
- CMS content (descriptions, guides, FAQs)
- SEO metadata from `cms_seo`

### Structured Data (JSON-LD)

Product pages include schema markup:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Thẻ PUBG Mobile 660 UC",
  "description": "...",
  "offers": {
    "@type": "Offer",
    "price": "199000",
    "priceCurrency": "VND",
    "availability": "https://schema.org/InStock"
  }
}
```

Generated server-side in Next.js for SEO crawlers.

### URL Structure

| Page | URL | SEO Priority |
|------|-----|-------------|
| Homepage | `/` | Highest |
| Category | `/the/{slug}` | High |
| Product detail | `/san-pham/{sku}` | High |
| Blog | `/blog/{slug}` | Medium |
| Static page | `/pages/{slug}` | Low-Medium |

Clean URLs, no query parameters for primary content.

## CMS Admin (in Admin Panel)

Managed by ADMIN role under Admin Panel → CMS:

| Feature | Description |
|---------|-------------|
| Page editor | WYSIWYG or Markdown editor |
| SEO fields | meta_title, meta_description, og tags per page |
| Banner manager | Upload, schedule, position banners |
| Blog manager | Create/edit/publish blog posts |
| FAQ manager | Category-based FAQ entries |
| Preview | Preview draft before publish |
| Slug management | Auto-generate from title, manual override |

## CmsService

```typescript
class CmsService {
  getPageBySlug(slug: string): Promise<CmsPageWithSeo>;
  getPublishedPages(type: PageType): Promise<CmsPage[]>;
  getActiveBanners(position: BannerPosition): Promise<Banner[]>;
  createPage(dto: CreatePageDto, authorId: string): Promise<CmsPage>;
  updatePage(pageId: string, dto: UpdatePageDto): Promise<CmsPage>;
  publishPage(pageId: string): Promise<CmsPage>;
  archivePage(pageId: string): Promise<CmsPage>;
}
```

## Next.js Integration

### Static Generation (SSG) + ISR

```
Product landing pages  → ISR (revalidate: 3600)
Blog posts              → SSG at build + ISR
Static pages            → SSG at build
Product detail          → SSR (live price)
```

Product prices must be fresh — use SSR or ISR with short revalidation for product detail pages.

### Sitemap

Auto-generated sitemap at `/sitemap.xml`:

```
/                          priority: 1.0
/the/*                     priority: 0.8
/san-pham/*                priority: 0.8
/blog/*                    priority: 0.6
/pages/*                   priority: 0.5
```

Regenerated on CMS publish event or daily cron.

### robots.txt

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /api/v1/agent/

Sitemap: https://cardon.vn/sitemap.xml
```

## Performance & SEO

| Requirement | Implementation |
|-------------|---------------|
| Core Web Vitals | Next.js Image optimization, lazy loading |
| Mobile-first | TailwindCSS responsive design |
| Page speed | Static assets via CDN, gzip/brotli |
| Meta tags | Server-rendered in `<head>` via Next.js metadata API |
| Canonical URLs | Prevent duplicate content |
| Alt text | Required on all CMS images |

## Content Workflow

```
Author creates content (status: DRAFT)
    ↓
Preview in admin panel
    ↓
Admin reviews
    ↓
Publish (status: PUBLISHED, published_at set)
    ↓
Next.js ISR revalidation triggered
    ↓
Sitemap updated
```

Draft content never visible on public site.

## Banners

Time-scheduled promotional banners:

```
cms_banners
  position: HOME_HERO
  status: ACTIVE
  start_at: 2024-06-01
  end_at: 2024-06-30
```

Frontend fetches active banners via API, caches with short TTL.

## API Endpoints (Public)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/cms/pages/:slug` | Get published page with SEO |
| `GET /api/v1/cms/banners?position=HOME_HERO` | Active banners |
| `GET /api/v1/cms/blog?page=1&limit=10` | Blog listing |
| `GET /sitemap.xml` | Auto-generated sitemap |

Public endpoints — no authentication required. Only PUBLISHED content returned.

## API Endpoints (Admin)

| Endpoint | Purpose |
|----------|---------|
| `POST /admin/api/v1/cms/pages` | Create page |
| `PUT /admin/api/v1/cms/pages/:id` | Update page |
| `POST /admin/api/v1/cms/pages/:id/publish` | Publish |
| `CRUD /admin/api/v1/cms/banners` | Banner management |

Requires ADMIN role.

## Development Phase Note

SEO/CMS is **Phase 12** — implement last, after:

1. Database Schema
2. Auth + RBAC
3. Product Engine
4. Payment Gateway
5. Provider Integration
6. Order Fulfillment
7. Admin Panel
8. Agent Platform
9. Finance Ledger
10. Reconciliation
11. Invoice

CMS depends on Product Engine (for product landing pages) and Admin Panel (for CMS editor UI).

## Related Docs

- [00_PROJECT_OVERVIEW.md](./00_PROJECT_OVERVIEW.md)
- [11_ADMIN_PANEL.md](./11_ADMIN_PANEL.md)
- [12_SECURITY_DEPLOY.md](./12_SECURITY_DEPLOY.md)
