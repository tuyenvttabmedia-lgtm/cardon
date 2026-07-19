# CardOn — Master UI Review

**Review date:** 2026-06-18 | **Apps:** admin, partner, web (public + customer)

---

## Design System

| Element | Admin | Partner | Web Public | Web Customer |
|---------|-------|---------|------------|--------------|
| Framework | Next.js App Router | Next.js App Router | Next.js App Router | Same app |
| CSS | TailwindCSS | TailwindCSS | TailwindCSS | TailwindCSS |
| Component lib | Local `components/ui/*` | Local `components/ui/*` | Local + CMS | Shared |
| Shared package | `@cardon/build-info` | `@cardon/build-info` | `@cardon/build-info` | Same |
| Dark mode | Partial (partner orders) | Partial | Public theme | Partial |
| Stat cards | ✓ | ✓ | — | — |
| Badge component | ✓ | ✓ | ✓ | — |

**No unified design system package** — components duplicated across apps.

---

## Language Consistency

| App | Nav | Page content | Errors | Target |
|-----|-----|--------------|--------|--------|
| Admin | Mixed VI/EN | Vietnamese | Vietnamese | VI (docs say VI) |
| Partner | Vietnamese | Mixed EN/VI | Vietnamese | VI (6033.3+) |
| Public web | Vietnamese | Vietnamese | Vietnamese | VI |
| Customer portal | Vietnamese | Vietnamese stubs | — | VI |
| Legacy account | EN paths | Mixed | Vietnamese | VI |

**Issues:**
- Partner: "Reports", "Products", "Invoices", "Users" page titles in English
- Admin: "Monitoring", "Queue Monitor", "Configuration" in English
- FoundationNotice default title: English "Foundation module"

---

## Layout Consistency

| Pattern | Admin | Partner | Web |
|---------|-------|---------|-----|
| Sidebar + main | ✓ AdminShell | ✓ AgentShell | Public header + footer |
| Sub-nav tabs | ConfigurationNav, MarketingNav | OrdersSubNav, WalletSubNav | — |
| Mobile nav | Limited | MobileNav | Mobile bottom nav |
| Breadcrumbs | Sparse | Link back on detail | CMS-driven |
| Page shell (title + description) | ✓ | ✓ OrdersPageShell | ✓ |

---

## Build Version / Footer

| App | Visible footer | HTML comment | Source |
|-----|----------------|--------------|--------|
| Admin | ✓ Sidebar bottom | ✓ layout | BuildInfoService |
| Partner | ✓ Sidebar bottom | ✗ | BuildInfoService |
| Web public | ✗ (console.log only) | ✓ PublicSiteChrome | BuildInfoService |
| Web customer | ✓ CustomerShell sidebar | ✓ | BuildInfoService |

**Current version:** `6033.4 API ORDER OPERATIONS CENTER`

---

## Application Page Inventory

### Admin (~60 routes) — ~85% real

| Category | Status |
|----------|--------|
| Dashboard, orders, products, providers | Real |
| Finance (5 sub-pages) | Real |
| Monitoring (4 sub-pages) | Real |
| Marketing/CMS (12 sub-pages) | Real |
| Configuration (14 sub-pages) | Real (+ settings aliases) |
| Agents, staff, audit standalone | Real but no nav link |
| Settings health | Partial (Coming Soon badges) |

### Partner (~45 routes) — ~70% real

| Category | Status |
|----------|--------|
| Dashboard | Real |
| Wallet/ledger/deposit-history | Real |
| Orders ops center (6033.4) | Real |
| API + docs + test | Real/partial |
| Finance deposits | Real |
| Finance withdraws/settlements | Foundation stub |
| Support, settlement, users | Foundation stub |
| Enterprise hidden routes | Accessible, partial |
| Legacy redirects | Working |

### Public web (~40 routes) — ~80% real

| Category | Status |
|----------|--------|
| Homepage, catalog, checkout | Real |
| Topup, data, blog, CMS pages | Real |
| Account (legacy EN + VI paths) | Real |
| Maintenance page `/bao-tri` | Real |
| Customer `(customer)/*` | **100% stub** |

---

## UI Patterns

### Loading states
- Partner orders: skeleton rows (6033.4)
- Admin: mixed spinner/text
- Web: Next.js loading.tsx sparse

### Empty states
- Partner orders: Vietnamese empty message (6033.4)
- Other pages: inconsistent

### Error states
- ApiClientError with Vietnamese messages (partner)
- Admin 502: "Yêu cầu thất bại (502)"

### FoundationNotice pattern
- English default in partner PlatformSection
- Vietnamese default in web CustomerPlaceholder

---

## Responsive

| App | Mobile | Notes |
|-----|--------|-------|
| Admin | Partial | Sidebar collapse limited |
| Partner | ✓ MobileNav | Orders table horizontal scroll |
| Public | ✓ Mobile nav | Phase 6O UX phases applied |
| Checkout | ✓ | Unified shell |

---

## Duplicated UI Code

| Duplication | Apps |
|-------------|------|
| Badge, Button, Card, Input | admin + partner (separate copies) |
| formatVnd, formatDateTime | Each app lib/utils |
| RBAC permission types | partner types + backend constants |
| FoundationNotice | partner + web customer |
| Export CSV helpers | partner finance + wallet constants |

**No shared `packages/ui`** — tech debt for consistency.

---

## Hidden / Dead Routes

### Partner (redirect stubs — intentional)
`/balance`, `/api-keys`, `/docs`, `/kyc`, `/transactions`, `/settings`

### Partner (hidden from nav, URL accessible)
`/finance/*`, `/products`, `/users`, `/support`, `/settlement`

### Admin (no nav link)
`/agents`, `/staff`, `/audit`

### Web (legacy parallel)
`/account/*` vs `/tai-khoan/*`

---

## Broken Pages (when API healthy)

None statically broken in source review. Conditional failures:
- All apps when API 502
- Admin monitoring when permission 403

---

## UI Consistency Score

| Dimension | Score |
|-----------|-------|
| Visual design (tailwind) | 75% |
| Language (Vietnamese) | 70% |
| Navigation patterns | 80% |
| Loading/empty states | 55% |
| Build footer parity | 75% |
| Shared components | 40% |
| Responsive | 75% |
| **Overall UI consistency** | **~68%** |

---

## Recommendations

1. Create `packages/ui` for Badge, Button, Card, Input, StatCard
2. Vietnamese pass on partner page titles and FoundationNotice
3. Vietnamese pass on admin Monitoring/Configuration labels
4. Visible build version on public footer (or remove console.log)
5. Complete customer portal OR remove from customer.localhost routing
6. Add nav links for admin agents/staff or remove routes
7. Standardize empty/loading states across apps
8. Document enterprise hidden routes behavior for QA
