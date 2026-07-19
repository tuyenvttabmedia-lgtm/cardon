# Phase 6O.15 — Article TOC + Mobile Navigation UX Polish

**Date:** 2026-06-23  
**Build marker:** `WEB_BUILD_VERSION=6O15`  
**Scope:** UI only — article TOC, sidebar, mobile bottom nav.

---

## TASK 1 — Article TOC

### Problem
- Sidebar TOC only detected one heading when headings already had `id` attributes
- Flat numbering (no H2/H3 hierarchy)
- Shown even with a single heading

### Fix
- New component: `ArticleTableOfContents`
- Position: inside article, after H1 + meta, before thumbnail + body
- Parses H2/H3 from `prepareArticleHtml()` (ignores H1)
- Auto-generates `id` when missing; reuses existing ids
- Numbering: `1. H2`, `1.1 H3`, `1.2 H3`, `2. H2`
- Show only when `headings.length >= 2`
- Desktop: expanded by default; mobile: collapsed by default
- Smooth expand/collapse via CSS grid transition
- Card: `rounded-xl`, border, white background; header semibold primary blue; items 14px / line-height 1.6

### Root cause (parse bug)
`prepareArticleHtml` skipped headings that already had `id` — only the first heading without id was indexed.

---

## TASK 2 — Sidebar cleanup

- Removed TOC from sidebar
- Removed "Phổ biến" block
- Sidebar sections: **Bài viết liên quan**, **Bài viết mới**
- Related compact thumbnail: **64×64** mobile, **72×72** desktop
- Title: 2-line clamp + date (no category in sidebar rows)

---

## TASK 3 — Mobile bottom nav

- Removed center "Mua thẻ" FAB (gradient circle, negative margin)
- All 5 items equal width/height (**64px** nav bar)
- Icons: **22px** (normal and active — no scale)
- Active: primary blue + semibold label
- Active indicator: **24×3px** blue line above item, rounded full

---

## Files changed

```
apps/web/components/blog/ArticleTableOfContents.tsx   (new)
apps/web/components/blog/ArticleSidebar.tsx
apps/web/components/blog/BlogCard.tsx
apps/web/app/tin-tuc/[slug]/page.tsx
apps/web/lib/blog-utils.ts
apps/web/components/layout/MobileBottomNav.tsx
apps/web/lib/build-version.ts
docker-compose.local-full.yml
docs/PHASE_6O15_ARTICLE_NAV_UX_FIX.md
```

**Unchanged:** API, DB, payment, provider, order logic.

---

## Verify

| Case | Expected | Result |
|------|----------|--------|
| Article with H2,H3,H3,H2 | TOC with hierarchy | ✅ |
| Paragraph-only article | TOC hidden | ✅ |
| Mobile 375px bottom nav | 5 equal items, no FAB bump | ✅ |
| http://localhost/ build marker | `6O15` | ✅ |

---

## Deploy

```powershell
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build web
```
