# SEO & CMS

## Overview

The SEO/CMS module manages public-facing content for CardOn.vn — product pages, service hubs, blog posts, FAQ, and SEO metadata (Phase 12).

```
Public Website (Next.js apps/web)
    ↓
CMS / Product / FAQ APIs (NestJS)
    ↓
Database
```

CMS content is separate from the product/order engine. Catalog prices come from Product Engine; CMS adds marketing copy, banners, blog, and SEO layers.

## Runtime URL map (source of truth)

| Surface | URL | Notes |
|---------|-----|--------|
| Homepage | `/` | Hero H1 + checkout shell |
| Thẻ game hub | `/the-game` | Filter GAME_CARD |
| Thẻ ĐT hub | `/the-dien-thoai` | Filter PHONE_CARD |
| Nạp cước | `/nap-cuoc` | TOPUP checkout |
| Nạp data | `/nap-data` | DATA checkout |
| Product detail | `/product/{slug}` | e.g. `/product/viettel-card` |
| Blog list | `/tin-tuc` | |
| Blog category | `/tin-tuc/{category}` | |
| Blog article | `/tin-tuc/{category}/{slug}` | |
| FAQ hub | `/tro-giup` | |
| FAQ detail | `/tro-giup/{category}/{slug}` | |
| Agent register | `/dang-ky-dai-ly` | |
| Static CMS pages | `/{slug}` | e.g. `/gioi-thieu`, policies |

### Legacy redirects (permanent)

| From | To |
|------|-----|
| `/cards`, `/cards?service=GAME_CARD` | `/the-game` |
| `/cards?service=PHONE_CARD` | `/the-dien-thoai` |
| `/cards?service=TOPUP` | `/nap-cuoc` |
| `/cards?service=DATA` | `/nap-data` |
| `/partner/register` | `/dang-ky-dai-ly` |
| `/huong-dan` | `/tin-tuc/huong-dan` |
| `/khuyen-mai` | `/tin-tuc/khuyen-mai` |
| `/account` | `/tai-khoan` |

Private routes (`/login`, `/checkout`, `/tai-khoan`, `/orders`, …) are **noindex** and listed in `robots.txt` Disallow.

## Content Types

| Type | Purpose | Public URL |
|------|---------|------------|
| `PAGE` | Static pages | `/{slug}` |
| `BLOG_POST` | News / guides | `/tin-tuc/{category}/{slug}` |
| `BANNER` | Home hero, etc. | Embedded |
| FAQ (module) | Help center | `/tro-giup` (+ embeds) |

> Design-era paths `/the/{slug}`, `/san-pham/{sku}`, `/blog/{slug}`, `/pages/{slug}` are **obsolete** — do not use in new content or sitemaps.

## Data Model (reference)

### cms_pages / cms_seo / cms_banners

Unchanged conceptually: pages carry title/content; `cms_seo` holds meta/OG/canonical/robots/`structured_data` (JSON-LD override for articles when set). Banners are scheduled by position (`HOME_HERO`, …).

Admin SEO panel edits meta/OG/canonical/robots. Custom `structured_data` write UI is optional / not required for core Product/Org/FAQ schemas (generated in Next.js).

## SEO implementation (web)

| Piece | Location |
|-------|----------|
| Metadata builder | `apps/web/lib/seo.ts` (`buildMetadata`, `absolutePublicUrl`, `metadataBase`) |
| robots.txt | `apps/web/lib/robots-txt.ts` + `app/robots.txt/route.ts` |
| Sitemap | `apps/web/app/sitemap.ts` |
| Product JSON-LD | `ProductJsonLd` (Offer / AggregateOffer + brand heuristic) |
| Site JSON-LD | `SiteJsonLd` (Organization + WebSite) |
| Hub / home copy | `HubSeoJsonLd` (schema) + H1 in `HeroBanner` via `hub-seo-copy.ts` |
| FAQ schema | `FaqSchema` |
| Breadcrumbs | `BreadcrumbJsonLd` |
| On-demand revalidate | `POST /api/revalidate` + API `CmsWebRevalidateService` |

Product detail passes **server-fetched** product into the client so `<h1>` exists in SSR HTML (not only after `useProducts` hydrate).

## Structured Data (JSON-LD)

Product pages (server):

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Viettel Card",
  "brand": { "@type": "Brand", "name": "Viettel" },
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "VND",
    "lowPrice": "...",
    "highPrice": "..."
  }
}
```

Also: Organization / WebSite on layout; WebPage on hubs; FAQPage on `/tro-giup`; Article/BlogPosting on posts; BreadcrumbList where wired.

Do **not** invent `AggregateRating` without a real review system.

## On-demand revalidate

```
POST {WEB_INTERNAL_URL}/api/revalidate
Header: x-revalidate-secret: {WEB_REVALIDATE_SECRET}
Body: { paths: [...], tags: ["cms"|"products"] }
```

Triggers: CMS publish, SEO settings, banners/theme, FAQ CRUD (incl. detail paths), product + **variant** price/status changes.

Requires `WEB_INTERNAL_URL` + `WEB_REVALIDATE_SECRET`. Missing secret → no-op.

`robots.txt` always merges required private Disallows and appends `Sitemap:` (CMS custom robotsTxt cannot remove them).

Compose web build arg: `WEB_NEXT_PUBLIC_SITE_URL:-https://cardon.vn`.

## Sitemap (`/sitemap.xml`)

Includes roughly:

```
/ , /tin-tuc , /the-game , /the-dien-thoai , /nap-cuoc , /nap-data
/gioi-thieu , /tro-giup , /dang-ky-dai-ly , static policy pages
/tin-tuc/{category} , /tin-tuc/{category}/{slug}
/product/{slug}
/tro-giup/{category}/{slug}
```

Disabled when CMS `sitemapEnabled === false`.

## robots.txt (runtime)

```
User-agent: *
Allow: /
Disallow: /checkout
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /order/
Disallow: /orders/
Disallow: /tra-cuu-don-hang
Disallow: /account
Disallow: /tai-khoan
Disallow: /api/

Sitemap: https://cardon.vn/sitemap.xml
```

## Blog view counts

Published posts: `cms_pages.view_count`. Public `POST /cms/blog/posts/:slug/view` from article client (once per tab). Not tied to GET detail (SSR/crawlers do not inflate).

## CMS Admin

Admin → Marketing / CMS: pages, blog, banners, global SEO, FAQ. Preview drafts; only `PUBLISHED` on public site.

## Public API (representative)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/cms/pages/:slug` | Static page + SEO |
| `GET /api/v1/cms/blog/...` | Blog list / post / categories |
| `GET /api/v1/cms/faqs...` | FAQ public |
| `GET /api/v1/products/by-slug/:slug` | Product for SSR meta + H1 |
| `GET /sitemap.xml` | Next.js sitemap |
| `GET /robots.txt` | Next.js robots |

## Related Docs

- [00_PROJECT_OVERVIEW.md](./00_PROJECT_OVERVIEW.md)
- [11_ADMIN_PANEL.md](./11_ADMIN_PANEL.md)
- [12_SECURITY_DEPLOY.md](./12_SECURITY_DEPLOY.md)
