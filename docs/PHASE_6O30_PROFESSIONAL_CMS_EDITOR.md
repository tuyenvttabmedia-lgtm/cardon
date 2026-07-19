# Phase 6O30 — Professional CMS Editor

Build marker: **6O30**

## Summary

Upgraded Marketing CMS (Articles + Static Pages editor) to a professional three-column layout inspired by WordPress + Notion + Shopify. **Admin-only** — no frontend, payment, or order changes.

**No database schema changes.** Revisions and scheduled publish metadata use browser `localStorage`.

---

## Layout (Task 1)

```
Sidebar (Category, Tags, Featured Image) | TipTap Editor | Publish / SEO Panel
```

Full-screen editor mode with list ↔ editor navigation.

---

## TipTap Editor (Tasks 2–4)

Toolbar: H1–H3, Bold, Italic, Underline, Strike, lists, Quote, Code, Table, Link, Image, Youtube, Divider, Undo, Redo.

- **Slash commands** (`/`): Heading, Image, Table, Youtube, Quote, Code, Button
- **Drag & drop** image upload
- **Paste** (Ctrl+V) image upload
- **Media Library** picker integration

---

## Publish Panel (Task 6)

Status (Draft / Published), Schedule Publish (localStorage), Author, Reading Time, Word Count, Character Count, Autosave indicator.

---

## SEO Panel (Tasks 7, 13)

Focus Keyword, SEO Title, Meta, Slug, Canonical, Robots, OG fields.

- Google Preview (realtime)
- OpenGraph Preview: Facebook, Telegram, Zalo, X
- SEO Checklist with score /100

---

## Internal Links (Task 9)

`Ctrl+K` — search Articles, Static Pages, Categories.

---

## Autosave & Revisions (Tasks 10–11)

- Autosave draft every **30 seconds** (when title present)
- Version history in **localStorage** (max 20) with restore

---

## Preview (Task 12)

Desktop / Tablet / Mobile preview without publishing.

---

## Article List (Tasks 14–16)

DataTable with columns: Title, Category, Tags, Author, Status, Views, Published, Updated, SEO Score.

Quick actions: Edit, Preview, Duplicate, Delete (archive).

Bulk: Publish, Draft, Delete, Move Category, Change Tags.

Search/filter: title, slug, keyword, category, tags, status, date range.

---

## Unchanged Modules

Banner, FAQ, Static Pages list route, SEO Settings, Media Library, Email Templates, Categories, Tags admin pages, Appearance.

---

## Files

| Area | Path |
|------|------|
| Manager | `apps/admin/components/marketing/cms-editor/ProfessionalCmsManager.tsx` |
| Editor | `apps/admin/components/marketing/cms-editor/ProfessionalEditor.tsx` |
| List | `apps/admin/components/marketing/cms-editor/ArticleListTable.tsx` |
| Utils | `apps/admin/lib/cms-editor-utils.ts`, `cms-revisions.ts` |

---

## Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
```

Admin: http://admin.localhost/marketing/articles
