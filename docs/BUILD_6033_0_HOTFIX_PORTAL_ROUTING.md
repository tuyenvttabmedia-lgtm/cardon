# Build 6033.0 HOTFIX — Portal Routing & Architecture

**Build footer:** `6033.0 HOTFIX PORTAL ROUTING`

---

## Root Cause

Build 6033.0 introduced the Agent Platform (`AgentShell`, `(platform)/` route group, sidebar modules) but the partner portal still appeared legacy because:

1. **No edge middleware** — Partner auth lived in `localStorage` only. Without a session cookie, Next.js could not route anonymous vs authenticated users before client hydration.
2. **Legacy route folders** — Old paths (`/balance`, `/transactions`, `/api-keys`, etc.) still existed alongside `(platform)/` routes, with duplicate client panels and stale build artifacts.
3. **Customer host missing** — `customer.localhost` was not in nginx; the web app wrapped all hosts in the public marketing chrome (`Header`/`Footer`), so customer and public sites looked identical.

---

## Portal Architecture

| Host | App | Shell | Purpose |
|------|-----|-------|---------|
| `localhost` | `apps/web` | `PublicSiteChrome` | Public sales website (unchanged) |
| `customer.localhost` | `apps/web` | `CustomerShell` | Customer Center (foundation placeholders) |
| `partner.localhost` | `apps/partner` | `AgentShell` | Enterprise Agent Platform |
| `admin.localhost` | `apps/admin` | Admin layout | Back office (unchanged) |

Each portal has its own shell and navigation. No shared layouts across portals.

---

## Partner — Routing

### Entry points

| Path | Anonymous | Authenticated |
|------|-----------|---------------|
| `/` | → `/login` | → `/dashboard` |
| `/login` | Login page | → `/dashboard` |
| Platform paths | → `/login?next=…` | Agent module page |

### Platform routes (`(platform)/`)

- `/dashboard` — Agent Dashboard
- `/wallet`, `/wallet/transactions`
- `/orders`, `/products`, `/settlement`, `/reports`
- `/api`, `/api/docs`, `/webhooks`, `/invoices`, `/users`
- `/support`, `/settings`, `/settings/kyc`

### Legacy redirects

| Legacy | Canonical |
|--------|-----------|
| `/balance` | `/wallet` |
| `/transactions` | `/orders` |
| `/api-keys` | `/api` |
| `/kyc` | `/settings/kyc` |
| `/docs` | `/api/docs` |

Implemented in `apps/partner/middleware.ts` and `apps/partner/next.config.ts`.

---

## Partner — Layouts

```
app/layout.tsx          → html/body only (no legacy chrome)
app/login/              → standalone login (no AgentShell)
app/(platform)/layout.tsx → AgentShell (sidebar + AuthGuard)
```

Legacy panel clients moved to `components/platform/panels/` (`ApiKeysPanel`, `KycPanel`, `DocsPanel`).

---

## Partner — Middleware

File: `apps/partner/middleware.ts`

- Cookie: `cardon_partner_session=1` (set on login via `lib/auth-storage.ts`)
- Sync helper: `syncPartnerSessionCookie()` for existing sessions after deploy
- Protects all platform paths; redirects unknown paths to dashboard or login

---

## Customer Portal — Foundation

### Route group `(customer)/`

| Route | Page |
|-------|------|
| `/dashboard` | Customer Dashboard (placeholder) |
| `/orders` | My Orders (placeholder) |
| `/pins` | Purchased PINs (placeholder) |
| `/notifications` | Notifications (placeholder) |
| `/profile` | Profile (placeholder) |
| `/security` | Security (placeholder) |
| `/support` | Support (placeholder) |

### Shell

- `components/customer/CustomerShell.tsx` — sidebar + auth guard
- `lib/customer-portal/navigation.ts` — menu definitions

### Host detection

- `lib/portal-host.ts` — resolves `customer.localhost` → `customer` portal
- Middleware sets `x-cardon-portal: customer` header for layout branching

### Root layout split

- `customer.localhost` → children only (no public Header/Footer)
- `localhost` → `PublicSiteChrome` (unchanged marketing site)

### Customer middleware

File: `apps/web/middleware.ts`

- Cookie: `cardon_customer_session=1`
- `customer.localhost/` → login or dashboard
- Blocks public marketing paths on customer host (`/cards`, `/checkout`, etc.)
- Blocks customer platform paths on public host (`/dashboard`, `/orders`, … → `/`)

### Nginx

`infra/nginx/conf.d.local/00-local-production.conf` — added `customer.localhost` → `cardon_web`.

**Hosts file:** add `127.0.0.1 customer.localhost`

---

## Verification

### Partner (`http://partner.localhost`)

- [ ] Anonymous `/` → login page (no legacy sidebar)
- [ ] After login → `/dashboard` with AgentShell sidebar
- [ ] All sidebar links resolve (Dashboard, Wallet, Orders, Products, Settlement, Reports, API, Webhooks, Invoices, Users, Support, Settings)
- [ ] Legacy URLs redirect (`/balance` → `/wallet`, etc.)
- [ ] HTML comment / sidebar shows `6033.0 HOTFIX PORTAL ROUTING`

### Customer (`http://customer.localhost`)

- [ ] Anonymous `/` → login (no public homepage/marketing chrome)
- [ ] After login → Customer Dashboard with Customer Center sidebar
- [ ] Public paths blocked (`/cards` → dashboard or login)
- [ ] Placeholder pages load for all menu items

### Public (`http://localhost`)

- [ ] Homepage, products, checkout unchanged
- [ ] Customer routes not exposed (`/dashboard` → `/`)

### Admin (`http://admin.localhost`)

- [ ] Unchanged

---

## Docker Deploy

```bash
docker compose -f docker-compose.local-full.yml --env-file .env.local-full build --no-cache partner web
docker compose -f docker-compose.local-full.yml --env-file .env.local-full up -d
```

---

## Out of Scope (unchanged)

Payment engine, order engine, wallet/deposit/settlement business logic, monitoring, configuration, maintenance modules.

---

**6033.0 HOTFIX PORTAL ROUTING**
