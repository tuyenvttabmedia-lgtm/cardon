# Phase 6O.2 — Customer CMS & Product UAT Fix

**Date:** 2026-06-22  
**Scope:** CMS, Theme, Footer, Banner, Blog, Static pages, Product admin UX only.  
**Out of scope:** payment, provider, ledger, agent, auth.

---

## Summary

| Task | Verdict | Notes |
|------|---------|-------|
| 1 Footer column manager | **PASS** | Create / edit / delete / reorder; frontend reads saved config; defaults when empty |
| 2 Company footer UX | **PASS** | Column 1 from `theme.companyInfo`; duplicate block below footer removed |
| 3 Banner management | **PASS** | Full form with Save/Cancel, positions + hints; HOME_HERO on homepage |
| 4 Logo / favicon sync | **PASS** | `cache: 'no-store'` theme fetch; Header logo key; layout favicon from CMS |
| 5 Article category validation | **PASS** | `type` omitted on page update; category DTO unchanged (no spurious `type`) |
| 6 Published blog empty | **PASS** | SSR uses `API_INTERNAL_URL`; blog `force-dynamic`; `publishedAt` on publish |
| 7 CMS page URL env | **PASS** | `buildPublicPageUrl()` / `getSiteUrl()` — localhost in dev, env in prod |
| 8 Product variant management | **PASS** | SKU validation, uppercase, toast errors, form reset, immediate list refresh |
| 9 Product UX polish | **PASS** | Help text for Category → Product → Variant → Mapping flow |
| 10 Regression | **CONDITIONAL** | Builds pass; 5 pre-existing test suites fail (payment/provider/admin — out of scope) |

---

## Task Details

### 1–2 Footer & company info

**Admin:** Marketing → Appearance → Footer (link columns 2–4) + Company info section (column 1 data).

**Architecture:**
- Column 1 always built from `theme.companyInfo` via `buildCompanyFooterColumn()`.
- `footerColumns` in CMS stores link columns only; legacy company columns stripped on load/save.
- Defaults (Dịch vụ, Chính sách, Hỗ trợ) apply when saved link columns are empty.

**Key files:**
- `apps/web/lib/footer-config.ts`
- `apps/web/components/layout/Footer.tsx`
- `apps/admin/lib/theme-normalize.ts`
- `apps/admin/app/marketing/appearance/page.tsx`

### 3 Banner management

**Admin:** Marketing → Banners — Name, Position, Image, Link, Sort order, Status, Save/Cancel, edit flow.

**Positions:** `HOME_HERO`, `HOME_PROMOTION`, `SIDEBAR`, `MOBILE_HOME` (+ legacy positions).

**Frontend:** `HeroBanner` loads active `HOME_HERO` banner via public CMS API.

**Key files:**
- `apps/admin/app/marketing/banners/page.tsx`
- `apps/web/components/home/HeroBanner.tsx`
- `src/modules/cms/dto/cms.dto.ts` — `CmsBannerStatus` on create/update DTOs
- `prisma/migrations/20250622100000_phase_6o2_banner_positions/migration.sql`

### 4 Logo / favicon

- Client theme fetch: `fetchThemeSettingsClient()` with `cache: 'no-store'`.
- Header: logo `key` forces re-render after theme save.
- `apps/web/app/layout.tsx`: `generateMetadata()` reads favicon from CMS theme.

### 5 Category validation (`property type should not exist`)

**Root cause:** Admin sent `type` on CMS page **update**; `UpdateCmsPageDto` has no `type` field → ValidationPipe rejected payload.

**Fix:** `CmsPageManager` only includes `type` on create, not update.

### 6 Blog not showing after publish

**Fixes:**
1. `apps/web/lib/utils.ts` — server-side `getApiBaseUrl()` prefers `API_INTERNAL_URL` (Docker: `http://api:3000/api/v1`) so SSR blog fetch works inside web container.
2. `docker-compose.local-full.yml` — `API_INTERNAL_URL` on web service.
3. `apps/web/app/blog/page.tsx` — `dynamic = 'force-dynamic'`.
4. `apps/web/lib/cms-api.ts` — blog list `revalidate: 0`.
5. `cms.service.updatePage` — sets `publishedAt` when status → `PUBLISHED`.

### 7 CMS page URL

- `apps/admin/lib/site-url.ts` — `getSiteUrl()`, `buildPublicPageUrl()`.
- Admin page/article preview uses env-based URL (local: `http://localhost/pages/...`).

### 8–9 Product variants & UX

- `createVariant()` with SKU regex `^[A-Z0-9_]+$`, auto-uppercase, validation toasts, form reset.
- Help text on products page and variant tab.

---

## Build & Test Results

```
npm run build        ✅ PASS (NestJS API)
npm run build:web    ✅ PASS (Next.js 15.5.19)
npm run build:admin  ✅ PASS (Next.js 15.5.19)
npm test             ⚠️  38/43 suites pass, 5 fail (pre-existing, out of scope)
```

**Pre-existing failures (not introduced by 6O.2):**
- `payment.final-audit.spec.ts`, `payment.sepay-webhook.spec.ts` — fulfillment dispatch mock
- `esale.provider.spec.ts` — Node RSA_PKCS1_PADDING security revert
- `admin-operation.spec.ts`, `admin-operation.security.spec.ts` — topupTransactions mock

**CMS security:** `cms.security.spec.ts` ✅ PASS

---

## Deploy Notes (local-full)

After pulling these changes:

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api web admin
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

Migration `20250622100000_phase_6o2_banner_positions` adds enum values `HOME_PROMOTION`, `SIDEBAR`, `MOBILE_HOME`. Applied automatically when API starts with `RUN_MIGRATIONS=true`.

Set in `.env.local-full`:
```
WEB_NEXT_PUBLIC_SITE_URL=http://localhost
ADMIN_NEXT_PUBLIC_SITE_URL=http://admin.localhost
```

---

## Manual Verification Checklist

### Admin
- [ ] Appearance → Footer: add/edit/delete/reorder column → save → reload
- [ ] Appearance → Company info → save → footer col 1 updates on site
- [ ] Appearance → Logo desktop/mobile/favicon → save → header/favicon updates
- [ ] Banners → create HOME_HERO → homepage shows image
- [ ] Articles → create category → create article → assign category → publish
- [ ] Pages → preview URL shows `http://localhost/pages/...`
- [ ] Products → Garena → add variants GARENA_10K, GARENA_100K

### Frontend
- [ ] Homepage hero banner (if configured)
- [ ] Footer 4 columns, no duplicate company block below
- [ ] Header logo after admin upload
- [ ] `/blog` lists published posts
- [ ] `/blog/[slug]` renders post
- [ ] `/pages/[slug]` CMS static page

---

## Verdict

**Phase 6O.2: PASS** for CMS/theme/product UAT fixes. Rebuild local-full stack and run manual checklist before owner sign-off.
