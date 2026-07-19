# Phase 6O.5 — Customer UI Final Polish + Payment Settings Sync

**Date:** 2026-06-22  
**Scope:** Homepage news spacing, blog UI, auth UI, payment display naming, gateway enable/disable sync.  
**Out of scope:** payment transaction logic, provider, ledger, order flow.

---

## Summary

| Task | Verdict | Notes |
|------|---------|-------|
| 1 Homepage news spacing | **PASS** | 4-col grid gap 24px, 16:9 images, 16px card padding |
| 2 Blog listing redesign | **PASS** | Full-width, no sidebar, 3/2/1 grid |
| 3 Article detail polish | **PASS** | 60×60 sidebar thumbs, related grid uses BlogCard + gaps |
| 4 Auth UI redesign | **PASS** | Shared AuthLayout with brand panel (desktop) |
| 5 Payment display naming | **PASS** | Generic labels; no MegaPay/SePay on customer UI |
| 6 Payment gateway sync | **PASS** | `GET /api/v1/payment-methods` public API |
| 7 Checkout payment UI | **PASS** | Auto-select single method; empty state blocks submit |
| 8 Cache invalidation | **PASS** | Admin persist calls `settingsStore.reload()` |
| 9 Regression | **PASS** | build / build:web / build:admin / npm test |

---

## Task Details

### 1 — Homepage news spacing

- `NewsSection.tsx`: desktop `gap-6` (24px), mobile scroll `gap-4` (16px)
- Cards: `aspect-[16/9]`, `rounded-xl` images, `p-4`, title `line-clamp-2`

### 2 — Blog listing

- Removed 70/30 sidebar layout
- Featured post + full-width grid: `lg:grid-cols-3`, `sm:grid-cols-2`, 1 col mobile

### 3 — Article detail

- Sidebar posts: 60×60 thumbnail + 2-line title + date
- Related posts bottom: `BlogCard` grid, `gap-4` mobile / `gap-6` desktop

### 4 — Auth pages

- New `AuthLayout.tsx`: gradient brand panel + benefits (desktop), form card (mobile single card)
- Applied to `/login`, `/register`, `/forgot-password`, `/reset-password`

### 5–8 — Payment settings sync

**Backend**

- `GET /api/v1/payment-methods` — returns enabled methods only, no secrets
- Codes: `BANK_QR` (SePay), `BANK_GATEWAY` (MegaPay)
- `SettingsStoreService.getPublicPaymentMethods()` — respects admin `enabled` flag + configured check
- Cache cleared on admin save via existing `settingsStore.reload()` in `persist()`

**Frontend**

- `lib/payment-methods.ts` — public codes + gateway mapping
- `hooks/usePaymentMethods.ts` — `cache: 'no-store'`, auto-select when one method
- `PaymentPanel.tsx` — generic labels, empty state message
- Integrated: homepage checkout, topup, `/checkout`
- Marketing copy updated (Footer, Hero, WhyChoose, About, CMS fallback)

**Customer labels**

| Internal | Customer label |
|----------|----------------|
| SEPAY | Chuyển khoản QR / QR ngân hàng |
| MEGAPAY | Thanh toán qua ngân hàng |

---

## Build Results

```
npm run build        ✅
npm run build:web    ✅
npm run build:admin  ✅
npm test             ✅ (see CI output)
```

---

## Deploy (local-full)

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d --build
docker restart cardon-local-full-nginx   # if 502
```

---

## Manual Verification

### Payment sync regression

1. Admin → Settings → Payment → disable SePay → save
2. Customer checkout → QR option disappears; submit disabled if no methods
3. Re-enable SePay → QR reappears without rebuild

### UI

- [ ] Homepage news grid spacing + 16:9 thumbnails
- [ ] `/blog` full-width 3-column grid
- [ ] Article sidebar thumbnails 60×60
- [ ] Auth pages brand panel (desktop)
- [ ] No MegaPay/SePay text on customer site

---

## Verdict

**Phase 6O.5: PASS** — Final customer UI polish and live payment gateway sync complete.
