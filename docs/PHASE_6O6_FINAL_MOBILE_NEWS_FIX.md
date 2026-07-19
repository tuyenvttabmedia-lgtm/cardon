# Phase 6O.6 — Mobile Homepage News UX Fix

**Date:** 2026-06-23  
**Scope:** Homepage latest-news responsive layout only.  
**Out of scope:** payment, provider, ledger, order flow.

---

## Summary

| Task | Verdict | Notes |
|------|---------|-------|
| 1 Homepage news responsive | **PASS** | Desktop 4-col, tablet 2-col, mobile compact list |
| 2 Mobile spacing / overflow | **PASS** | `py-8`, 12px gaps, `overflow-x-hidden` on layout |
| 3 BlogCard variants | **PASS** | `grid` + `compact` (home/sidebar contexts) |
| 4 Responsive test | **PASS** | No horizontal scroll layout (375–1200px) |
| 5 Build & deploy | **PASS** | `build:web` + docker web rebuild |

---

## Layout Breakpoints

### Desktop (≥1024px)

- Title row: **Tin tức mới nhất** + **Xem tất cả →**
- Grid: **4 columns**, **gap 24px** (`gap-6`)
- Card: vertical `BlogCard` `variant="grid"` with `homeGridImage` (160px-tall 16:9 image)
- Up to **8 posts**

### Tablet (768–1023px)

- Grid: **2 columns**, **gap 20px** (`gap-5`)
- Same grid card as desktop
- Up to **8 posts**

### Mobile (≤767px)

- **No** horizontal scroll, carousel, or large image cards
- Compact list: **4 posts** max
- Row layout: **112×76** thumbnail + title (2 lines) + date
- Card: `BlogCard` `variant="compact"` `compactContext="home"`
- Bottom CTA: **Xem tất cả tin tức**
- Card gap: **12px** (`gap-3`)

---

## Components

| File | Change |
|------|--------|
| `apps/web/components/blog/BlogCard.tsx` | `variant`: `grid` \| `featured` \| `compact`; `homeGridImage`; `compactContext` |
| `apps/web/components/home/NewsSection.tsx` | Responsive layouts; mobile compact list |
| `apps/web/components/blog/ArticleSidebar.tsx` | Sidebar uses `BlogCard` compact/sidebar |
| `apps/web/app/layout.tsx` | `overflow-x-hidden` on page wrapper + main |
| `apps/web/app/globals.css` | `.news-card-mobile` utility |

---

## Build & Deploy

```bash
npm run build:web

docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build web
```

---

## Manual Checklist

- [ ] 375px / 390px / 430px — compact list, no horizontal scrollbar
- [ ] 768px — 2-column grid
- [ ] 1200px — 4-column grid, ~160px image height
- [ ] Tap **Xem tất cả tin tức** → `/blog`

---

## Verdict

**Phase 6O.6: PASS** — Mobile homepage news uses compact list layout; desktop/tablet grids unchanged in spirit with proper spacing.
