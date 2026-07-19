# Phase 6O.9 — SEO Routing + Responsive UX Fix

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O9`  
**Scope:** Customer UI/SEO + admin URL preview — no payment, provider, order, ledger, or auth logic changes.

---

## Summary

| Task | Root cause | Fix |
|------|------------|-----|
| 1 Category cards | Left-aligned, tiny icons | Centered layout, 56×56 icon box, 112/105px card height |
| 2 Product logos | Logo area too small vs card | 70px logo zone desktop, max 56×150px image |
| 3 Mobile footer | Columns stacked unevenly | Company full-width, then `grid-cols-2` link columns |
| 4 Homepage spacing | Extra padding / flex-grow | News `pb-8`, FAQ `mt-8`, removed `main flex-1` |
| 5 FAQ missing | API filter `homepage` ≠ DB category `general` | Admin category `homepage` + API alias for legacy `general` |
| 6 Admin preview URL | Used admin host + `/pages/` prefix | `getPublicBaseUrl()` strips `admin.`, SEO paths |
| 7 SEO routes | `/pages/*` and `/blog/*` | Root static URLs + `/tin-tuc` + 301 redirects |
| 8 SEO validation | Canonical/H1 paths | Metadata via `buildCmsMetadata`, sitemap added |
| 9 Deploy | Stale build | Docker `--no-cache` web/admin/api, nginx recreate |

---

## Task 1 — Category card UX

**File:** `apps/web/components/home/CategoryQuickSelect.tsx`

- Center-aligned icon, title, description
- Desktop: `h-[112px]`, icon wrapper 56×56, image max 42×42
- Mobile: `h-[105px]`, icon wrapper 48×48
- 2-column grid on mobile, 4 on desktop

---

## Task 2 — Product card logo UX

**File:** `apps/web/components/home/HomePageClient.tsx`

| Breakpoint | Card height | Logo area | Image max |
|------------|-------------|-----------|-----------|
| Mobile | 110px | 48px | 48px height |
| Desktop | 130px | 70px | 56×150px |

Text below logo, centered.

---

## Task 3 — Mobile footer

**File:** `apps/web/components/layout/Footer.tsx`

- Company column: full width on mobile (`mb-8`)
- Link columns: `grid grid-cols-2 gap-x-8 gap-y-7`
- Desktop: 4 columns (`lg:grid-cols-4`)

---

## Task 4 — Homepage bottom spacing

- `NewsSection`: `pt-6 pb-8` (32px bottom on mobile)
- `FaqSection`: `mt-8`
- `layout.tsx`: removed `flex-1` from `<main>` to avoid empty stretch

---

## Task 5 — Homepage FAQ restore

**Root cause:** Frontend queried `category=homepage`; admin saved `category=general`.

**Fixes:**
- `src/modules/cms/services/cms.service.ts` — `homepage` filter includes legacy `general`
- `apps/admin/app/marketing/faq/page.tsx` — category value `homepage`, admin hint added
- `FaqSection` — hide until loaded; show nothing when API returns `[]`

Flow: News → FAQ → Footer (FAQ hidden if no homepage items).

---

## Task 6 — CMS public URL builder

**File:** `apps/admin/lib/site-url.ts`

```typescript
getPublicBaseUrl()
// 1. NEXT_PUBLIC_SITE_URL
// 2. window.location.origin.replace('admin.', '')
// 3. http://localhost
```

**Preview paths:** blog → `/tin-tuc/{slug}`, static → `/{slug}`

---

## Task 7 — SEO-friendly routes

| Old | New | Redirect |
|-----|-----|----------|
| `/pages/chinh-sach-bao-mat` | `/chinh-sach-bao-mat` | 301 via `pages/[slug]` |
| `/blog` | `/tin-tuc` | 301 via `blog/page.tsx` |
| `/blog/{slug}` | `/tin-tuc/{slug}` | 301 via `blog/[slug]/page.tsx` |

**New files:**
- `apps/web/app/[slug]/page.tsx` — CMS static pages at root
- `apps/web/app/tin-tuc/page.tsx`, `tin-tuc/[slug]/page.tsx`
- `apps/web/lib/routes.ts`, `lib/cms-static-page.tsx`
- `apps/web/app/sitemap.ts`

**Updated links:** header menu, footer defaults, BlogCard, NewsSection, register T&C links.

---

## Task 8 — SEO validation

| Page type | H1 | URL pattern | Canonical |
|-----------|----|-------------|-----------|
| Article | Post title only | `/tin-tuc/{slug}` | Same path via `buildCmsMetadata` |
| Static | Page title | `/{slug}` | Same path (no `/pages/` duplicate) |

Verified locally:
- `GET /chinh-sach-bao-mat` → 200, H1 present
- `GET /tin-tuc` → 200
- `GET /blog` → 301 → `/tin-tuc`
- `GET /pages/chinh-sach-bao-mat` → 301 → `/chinh-sach-bao-mat`

---

## Task 9 — Deploy verification

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build --no-cache web admin api
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
docker compose ... up -d --force-recreate nginx
```

| Check | Result |
|-------|--------|
| http://localhost/ | 200, build `6O9` |
| /tin-tuc | 200 |
| /blog → /tin-tuc | 200 (redirect) |
| /chinh-sach-bao-mat | 200 |
| /pages/* → /* | 200 (redirect) |
| GET /cms/faq?category=homepage | Returns legacy `general` items |

---

## Screenshot checklist

### Mobile 375px

| Area | Check | Pass |
|------|-------|------|
| Category cards | Centered icon + text, 2-col | ☐ |
| Product logos | Garena/Zing clearly visible | ☐ |
| Footer | Company full width, 2×2 links | ☐ |
| News → FAQ gap | No huge empty space | ☐ |
| FAQ section | Visible when homepage items exist | ☐ |
| Bottom nav | No overlap with content | ☐ |

### Desktop 1440px

| Area | Check | Pass |
|------|-------|------|
| Category cards | 4-col, 112px height | ☐ |
| Product cards | 130px, large logos | ☐ |
| Footer | 4 columns | ☐ |
| /tin-tuc | List loads, links work | ☐ |
| Static page | Sidebar links use `/{slug}` | ☐ |
| Admin page preview | Shows localhost URL not admin.localhost | ☐ |

---

## Files changed

```
apps/web/components/home/CategoryQuickSelect.tsx
apps/web/components/home/HomePageClient.tsx
apps/web/components/home/NewsSection.tsx
apps/web/components/layout/Footer.tsx
apps/web/components/faq/FaqSection.tsx
apps/web/components/layout/StaticPageLayout.tsx
apps/web/components/blog/BlogCard.tsx
apps/web/components/blog/BlogListClient.tsx
apps/web/components/blog/ArticleSidebar.tsx
apps/web/app/[slug]/page.tsx
apps/web/app/tin-tuc/page.tsx
apps/web/app/tin-tuc/[slug]/page.tsx
apps/web/app/blog/page.tsx
apps/web/app/blog/[slug]/page.tsx
apps/web/app/pages/[slug]/page.tsx
apps/web/app/sitemap.ts
apps/web/lib/routes.ts
apps/web/lib/cms-static-page.tsx
apps/web/lib/seo.ts
apps/web/lib/footer-config.ts
apps/web/hooks/useThemeSettings.ts
apps/web/app/layout.tsx
apps/web/app/register/RegisterPageClient.tsx
apps/web/lib/build-version.ts
apps/admin/lib/site-url.ts
apps/admin/lib/theme-normalize.ts
apps/admin/components/marketing/CmsPageManager.tsx
apps/admin/app/marketing/faq/page.tsx
src/modules/cms/services/cms.service.ts
docker-compose.local-full.yml
docs/PHASE_6O9_SEO_RESPONSIVE_FINAL_FIX.md
```

---

## Notes

- Re-save FAQ items in admin with category **homepage** for new entries; legacy `general` still works on homepage.
- CMS theme/footer links saved in DB may still use old `/pages/` paths until re-saved in admin theme settings.
- Host `npm` unavailable; builds run inside Docker.
