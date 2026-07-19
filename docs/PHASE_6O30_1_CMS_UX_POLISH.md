# Phase 6O30.1 — Professional CMS UX Polish

**Build marker:** `6O30.1`  
**Scope:** Admin Marketing CMS only (editor, list, dashboard).  
**No changes:** Database, API, frontend website, checkout, payment, provider.

## Summary

Phase 6O30.1 polishes the Marketing CMS experience for the content team: a dedicated dashboard, WordPress/Medium-style editor layout, enhanced article list with filters and trash workflow, and performance-oriented panel memoization.

## Marketing Dashboard (`/marketing`)

- Default entry point for Marketing (Dashboard tab first in nav).
- Stats: total articles, drafts, published, pages, categories, tags, media, FAQ, banners.
- Attention panel: SEO &lt; 80, missing featured image, missing meta, stale posts (&gt;30 days).
- Quick actions: new article, upload media, SEO settings.

## Editor UX (Tasks 1–17)

| Feature | Implementation |
|---------|----------------|
| Editor header | `EditorHeader.tsx` — back link, full-width title, autosave status, Preview / Lưu nháp / Xuất bản |
| Sticky toolbar | TipTap toolbar `sticky top-0 z-20` |
| Editor width | Content column `max-w-[860px] mx-auto` |
| Left sidebar | `EditorMetaSidebar` — icons, category counts, tag chips, featured image preview |
| Right panel cards | `EditorRightPanel` — Publish / SEO / Statistics cards |
| SEO score | `SeoScoreBadge` — 0–100 with Excellent / Good / Need Improve / Poor |
| Google preview | `SeoPanel` → `GooglePreview` |
| OpenGraph preview | Facebook, Telegram, Zalo, X card previews |
| Featured image | Replace / Crop / Remove via `FeaturedImageField` |
| Tags | `TagChipInput` — autocomplete, Enter to create, chips |
| Slash commands | Categorized menu with icons and search |
| Empty state | Placeholder: "Bắt đầu viết hoặc nhập '/' để chèn block..." |
| Save status | idle / saving / saved / error + "Auto Saved X giây trước" |
| Performance | `memo()` on editor, panels, list; stable `onChange` ref |

## Article List UX (Tasks 19–37)

| Feature | Implementation |
|---------|----------------|
| Toolbar | Search, category, status, author, date range, filter reset |
| Quick filters | All, Published, Draft, Scheduled, Archived, Trash |
| Columns | Thumbnail (80×45), title, category, tags, author, views, SEO, status, updated, publish, actions |
| Hover actions | Sửa, Preview, Quick Edit, Duplicate, Delete |
| Bulk actions | Publish, Draft, Archive, Delete (trash), Move Category, Replace Tag |
| Smart search | Title, slug, focus keyword, meta, category, tag names |
| Pagination | Showing 1–20 / total, page size 20/50/100 |
| Thumbnail hover | Large preview popover |
| SEO / status badges | `SeoScoreBadge`, `CmsStatusBadge` |
| Empty state | "Bạn chưa có bài viết" + CTA |
| Sort | Title, Views, SEO, Published, Updated |
| Remember filters | `localStorage` via `loadArticleFilters` / `saveArticleFilters` |
| Media icons | Image / video / table counts per row |
| Duplicate | Preserves SEO, category, tags, image; slug `-copy`, `-copy-2`, … |
| Trash | `moveToTrash` / `restoreFromTrash` / `deleteForever` (localStorage) |
| Virtualization | Scroll windowing when &gt;1000 rows |

## Key Files

```
apps/admin/
  app/marketing/page.tsx                    # Dashboard
  components/marketing/
    MarketingNav.tsx                        # Dashboard tab
    cms-editor/
      EditorHeader.tsx
      EditorMetaSidebar.tsx
      EditorRightPanel.tsx
      ProfessionalEditor.tsx
      ProfessionalCmsManager.tsx
      ArticleListTable.tsx
      CmsBadges.tsx
      FeaturedImageField.tsx
      TagChipInput.tsx
      StatisticsPanel.tsx
  lib/cms-editor-utils.ts
  lib/cms-revisions.ts
  lib/build-version.ts                      # 6O30.1
```

## Verify

```bash
docker compose -f docker-compose.local-full.yml build api admin web
docker compose -f docker-compose.local-full.yml up -d
```

- http://admin.localhost/marketing — Dashboard
- http://admin.localhost/marketing/articles — List + Editor
- Sticky toolbar, autosave label, SEO badges, trash/duplicate, responsive layout

## Constraints Respected

- Trash, schedule, views, revisions, filters: **localStorage only**
- Delete → trash (not immediate API delete)
- Archive uses existing `status: ARCHIVED` API
- No database migrations or API contract changes
