# Phase 6O28.1 — Hotfix (FAQ + Product Grid + Footer)

**Build marker:** `6O28.1`  
**Date:** 2026-06-18  
**Scope:** Bug fixes and UI regressions from Phase 6O28. No payment, provider, finance, order, checkout logic, or database schema changes.

---

## Summary

| Task | Fix |
|------|-----|
| FAQ regression | Restored homepage FAQ display; added `/cms/faqs` endpoint; admin save toast |
| Product grid | 3 cols mobile / 4 tablet / 5 desktop for type & denomination selectors |
| Footer | Removed hardcoded "Thông tin pháp lý" line from CardOn column |

---

## Task 1 — Homepage FAQ

**Root cause:** Phase 6O28 filtered `category=homepage` only. Seed/legacy FAQ items use `category=general`, so `GET /cms/faq?category=homepage` returned `[]`.

**Backend fixes:**
- `GET /api/v1/cms/faqs?category=homepage` (alias of `/cms/faq`)
- Homepage filter includes legacy `general` category items
- `status !== 'INACTIVE'` filter; default `ACTIVE` on save
- `Cache-Control: no-store` on FAQ endpoints

**Frontend fixes:**
- `FaqSection` uses `fetchFaqClient()` → `/cms/faqs`
- All ACTIVE items shown; accordion collapsed by default; no limit

**Admin UX:**
- Success toast: **"Đã lưu FAQ thành công"**
- Error toast on API failure
- Refetch list after successful save

---

## Task 2–3 — Product selector grid

Shared class `CATALOG_SELECTOR_GRID_CLASS`:

```
grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5 lg:gap-3
```

Applied in `CheckoutShell` for:
- Chọn loại thẻ
- Chọn nhà mạng
- Chọn mệnh giá / gói Data

Also applied in `ProductPageClient` variant grid.

Card width reduced via layout only — logo size, height, hover, selected state unchanged.

---

## Task 4 — Footer

Removed unconditional **"Thông tin pháp lý"** link from CardOn column.

Column now shows only: company name, MST, address (when configured).

Legal pages remain under **Chính sách** column.

---

## Deploy

```powershell
docker compose --env-file .env.local-full -f docker-compose.local-full.yml build api admin web
docker compose --env-file .env.local-full -f docker-compose.local-full.yml up -d api admin web
```

**Verify:**
- `http://localhost` — FAQ visible, 5-col desktop grid, clean footer
- `http://admin.localhost/marketing/faq` — save shows success toast
- HTML comment: `<!-- CardOn build 6O28.1 -->`

---

**CardOn build 6O28.1**
