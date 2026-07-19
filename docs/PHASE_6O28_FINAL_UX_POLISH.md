# Phase 6O28 — Final UX Polish Before Production UAT

**Build marker:** `6O28`  
**Date:** 2026-06-18  
**Scope:** Customer web UI/UX only — no payment, provider, finance, ledger, order lifecycle, or database architecture changes.

---

## Summary

Final polish pass before Phase 6O production UAT: homepage FAQ display, footer label, editable quantity input, removal of duplicate trust bar, blog pagination verification, article share buttons.

---

## Task Checklist

### Task 1 — Homepage FAQ bug

| Item | Status |
|------|--------|
| Show all FAQ with `category=homepage` | Done |
| Filter `status=ACTIVE` (legacy items without status treated as ACTIVE) | Done |
| Sort `sortOrder ASC` | Done |
| Removed `maxItems` / slice limits on homepage | Done |
| FAQ endpoint `Cache-Control: no-store` for admin sync | Done |
| Accordion default: all closed, click to open | Done |

**Files:** `FaqSection.tsx`, `FaqAccordion.tsx`, `HomePageClient.tsx`, `cms.service.ts`, `cms-public.controller.ts`, `cms.constants.ts`

---

### Task 2 — Footer

| Item | Status |
|------|--------|
| First column label: **CardOn** (was "Thông tin công ty") | Done |
| Company column: name, MST, address, legal link | Done |
| Hotline & email remain in **Hỗ trợ** column | Done |

**File:** `footer-config.ts`

---

### Task 3 — Quantity input

| Item | Status |
|------|--------|
| `[-] [editable input] [+]` control | Done |
| Enter + blur validation, min 1, max 999 | Done |
| Live price update (thành tiền, chiết khấu, phí, tổng) | Done |

**Pages:** Homepage checkout (`CheckoutShell`), Nạp cước, Nạp Data (CARD qty only), `/checkout`

**Files:** `QuantityInput.tsx`, `CheckoutShell.tsx`, `CheckoutPageClient.tsx`

---

### Task 4 — Remove duplicated ServiceTrustBar

| Item | Status |
|------|--------|
| Removed from Homepage, Mua thẻ, Nạp cước, Nạp Data (via `CheckoutShell`) | Done |
| Trust badges remain in Hero Banner only | Done |
| Tighter spacing (`space-y-4` / `space-y-6`) | Done |

**Files:** `CheckoutShell.tsx`, `ServiceCheckoutPageLayout.tsx`

---

### Task 5 — Blog verification

| Item | Status |
|------|--------|
| 12 posts per page | Done (`PAGE_SIZE = 12`) |
| Numbered pagination (not Load More) | Already present |
| Canonical URLs via `buildMetadata` / `buildCmsMetadata` | Verified |
| Sitemap includes `/tin-tuc` + post slugs + `/nap-data` | Updated |
| SEO URL base `/tin-tuc` | Verified |

**Files:** `BlogListClient.tsx`, `sitemap.ts`, `tin-tuc/page.tsx`, `tin-tuc/[slug]/page.tsx`

---

### Task 6 — Article share buttons

| Item | Status |
|------|--------|
| Facebook, X, Telegram, Zalo, Copy Link | Done |
| Copy shows "Đã sao chép liên kết" | Done |

**Files:** `ArticleShareButtons.tsx`, `tin-tuc/[slug]/page.tsx`

---

### Task 7 — Build & deploy

| Service | Build marker |
|---------|--------------|
| web | `6O28` |
| admin | `6O28` |
| api | Rebuilt (FAQ filter + cache header) |

**Verify:**

- `http://localhost` — homepage FAQ, quantity, footer, blog
- `http://admin.localhost` — build comment `<!-- CardOn build 6O28 -->`

```powershell
docker compose --env-file .env.local-full -f docker-compose.local-full.yml build api admin web
docker compose --env-file .env.local-full -f docker-compose.local-full.yml up -d api admin web
```

---

## Constraints preserved

- Payment flow unchanged
- Provider / fulfillment unchanged
- Finance / ledger unchanged
- Order lifecycle unchanged
- Database schema unchanged (FAQ status is optional JSON field in existing `cms.faq.items` setting)

---

**CardOn build 6O28**
