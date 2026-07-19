# Phase 6O.4 — Blog UX + Catalog Operation Polish

**Date:** 2026-06-22  
**Scope:** Customer blog UX, header typography, product provider mapping fix, banner hard delete, footer editor polish.  
**Out of scope:** payment, order, ledger, fulfillment, agent API, auth.

---

## Summary

| Task | Verdict | Notes |
|------|---------|-------|
| 1 Homepage news 4×2 grid | **PASS** | Compact cards, mobile horizontal scroll, 8 posts |
| 2 Blog listing redesign | **PASS** | 70/30 layout, sidebar popular/latest, pagination |
| 3 Article detail SEO layout | **PASS** | 760px content column, demoted H1, structured layout |
| 4 Auto TOC | **PASS** | `prepareArticleHtml()` injects ids; mobile + desktop TOC |
| 5 Related posts | **PASS** | `pickRelatedPosts()` + bottom 4-column grid |
| 6 Article sidebar widgets | **PASS** | TOC, related, popular, latest |
| 7 Header typography | **PASS** | `text-[15px] font-semibold`, active underline |
| 8 Provider mapping fix | **PASS** | Always fetch from API (empty array no longer skips) |
| 9 Banner hard delete | **PASS** | `DELETE /admin/cms/banners/:id` + confirm dialog |
| 10 Footer editor polish | **PASS** | Column badges, empty state, clearer link rows |
| 11 Build | **PASS** | `build:web`, `build:admin`, `build` (API) |

---

## Task Details

### 1 — Homepage news (4×2)

- `apps/web/components/home/NewsSection.tsx` — compact cards, `aspect-video`, mobile snap scroll
- `apps/web/app/page.tsx` — fetches `take: 8`

### 2–6 — Blog UX

**New utilities:**
- `apps/web/lib/blog-utils.ts` — `prepareArticleHtml()`, `pickRelatedPosts()`

**Components:**
- `apps/web/components/blog/ArticleSidebar.tsx` — TOC, sidebar widgets, related grid
- `apps/web/components/blog/BlogListClient.tsx` — 70/30 main + sidebar
- `apps/web/components/blog/BlogCard.tsx` — `basePath` prop, `aspect-video`

**Article page:**
- `apps/web/app/blog/[slug]/page.tsx` — processed HTML, mobile TOC, sidebar, related grid

**Prose:**
- `apps/web/app/globals.css` — paragraph `font-size: 16px`, `line-height: 1.7`

### 7 — Header typography

- `apps/web/components/layout/Header.tsx` — `text-[15px] font-semibold`, active route underline via `usePathname()`

### 8 — Provider mapping empty list bug

**Root cause:** `loadMappings()` returned early when `variant.providerMappings` was truthy — including `[]` after create.

**Fix:** Always call `productAdminApi.listProviderMappings(variantId)`.

**File:** `apps/admin/app/products/page.tsx`

### 9 — Banner hard delete

**Backend:**
- `DELETE /admin/cms/banners/:id` in `cms-admin.controller.ts`
- `deleteBanner()` in `cms.service.ts` + `cms.repository.ts`

**Admin:**
- `cmsAdminApi.deleteBanner()` in `api-client.ts`
- Confirm dialog before permanent delete in `marketing/banners/page.tsx`

### 10 — Footer editor polish

- `apps/admin/app/marketing/appearance/page.tsx` — column number badges (Cột 2+), empty state, labeled link rows, wider card

---

## Build Results

```
npm run build:web    ✅ PASS
npm run build:admin  ✅ PASS
npm run build        ✅ PASS (NestJS API)
```

---

## Deploy (local-full)

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build api web admin
docker restart cardon-local-full-nginx   # if 502 after recreate
```

---

## Manual Verification Checklist

### Customer web
- [ ] Homepage shows 8 news cards (4×2 desktop, horizontal scroll mobile)
- [ ] `/blog` — 70/30 layout, sidebar popular/latest, pagination works
- [ ] `/blog/[slug]` — TOC scroll, sidebar widgets, related posts grid
- [ ] Header menu — 15px semibold, active underline on current page

### Admin
- [ ] Products → variant → create provider mapping → list refreshes immediately
- [ ] Marketing → Banners → Delete → confirm → row removed permanently
- [ ] Marketing → Appearance → footer columns show badges, add/reorder links

---

## Verdict

**Phase 6O.4: PASS** — Blog UX polish, header typography, provider mapping fix, banner hard delete, and footer editor improvements complete. Rebuild local-full stack and run manual checklist before owner sign-off.
