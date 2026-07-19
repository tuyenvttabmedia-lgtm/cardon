# Phase 5A — Customer Website Foundation

> Date: 2026-06-19  
> Scope: Customer-facing Next.js app (`apps/web/`)  
> Not included: Agent Portal, Admin UI

---

## Executive Summary

| Overall | **FULL PASS** |
|---------|---------------|
| `npm run build` (web) | **PASS** |
| Tasks completed | **10/10** |

---

## Module Structure

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Homepage
│   ├── cards/                      # Catalog
│   ├── product/[slug]/             # Product detail
│   ├── checkout/                   # Checkout flow
│   ├── checkout/success/           # Post-payment
│   ├── order/[code]/               # Order tracking + cards
│   └── login/
├── components/
│   ├── layout/                     # Header, Footer
│   ├── home/                       # Hero, sections
│   ├── product/
│   ├── checkout/
│   └── order/                      # CardRevealPanel
├── services/
│   └── api-client.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useProducts.ts
│   └── useOrderPolling.ts
├── lib/
│   ├── utils.ts
│   ├── auth-storage.ts
│   └── seo.ts
└── types/
    └── api.ts
```

Tech: **Next.js 15**, **TypeScript**, **Tailwind CSS 3**

---

## Deliverables

### TASK 1: Frontend structure — **DONE**

### TASK 2: API client — **DONE**

- JWT bearer + refresh token retry
- Guest checkout (no auth header)
- Unified error handling (`ApiClientError`)
- Endpoints: auth, products, orders, payments

### TASK 3: Layout — **DONE**

- Header (nav, auth)
- Footer (links, support)
- Mobile responsive (Tailwind breakpoints)
- SEO metadata via `lib/seo.ts`

### TASK 4: Homepage — **DONE**

- Hero CTA
- Popular cards / Game cards / Phone topup sections
- Why choose CardOn

### TASK 5: Product pages — **DONE**

- `/cards` — category/type filter
- `/product/[slug]` — variant selection, quantity

### TASK 6: Checkout — **DONE**

Flow: product → quantity → guest email / login → create order → payment

- **MegaPay** — redirect to `paymentUrl`
- **SePay** — QR image display

### TASK 7: Payment status — **DONE**

- `/checkout/success` — polling order status
- `/order/[code]` — payment + fulfillment status

### TASK 8: Card security — **DONE**

- PIN shown only when `PAID` + `COMPLETED`
- Copy serial/PIN buttons
- Hide/show PIN toggle
- Backend: `GET /orders/lookup/cards`, `GET /orders/:id/cards`

### TASK 9: SEO — **DONE**

- `title`, `description`, `canonical`, OpenGraph per page

### TASK 10: Build — **DONE**

```bash
cd apps/web && npm run build
# or from root:
npm run build:web
```

---

## Configuration

| Env | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Backend API (`http://localhost:3000/api/v1`) |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for SEO |

---

## Backend additions (customer card delivery)

Minimal read-only endpoints added to support TASK 7–8:

| Endpoint | Auth |
|----------|------|
| `GET /orders/lookup/cards?orderCode&email` | Public (guest) |
| `GET /orders/:id/cards` | JWT (customer) |

---

## Out of Scope

- Agent Portal
- Admin UI
- Account order history page (login + list available via API)

---

## Previous Phases

Backend production ready — **PASS**
