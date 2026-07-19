# Build 6033.0 — Agent Platform Foundation

Transforms `partner.localhost` from a lightweight Partner Portal into the **Enterprise Agent Platform** architecture. This build adds navigation, dashboard aggregation, RBAC foundation, and API shells — **not** deposit, withdraw, or settlement business logic.

## Scope

| In scope | Out of scope |
|----------|--------------|
| Sidebar navigation (12 modules) | Deposit / withdraw flows |
| Dashboard cards (aggregated) | Settlement engine |
| Wallet overview + ledger reuse | Payment / order / provider engine changes |
| Order center with status tabs | CMS, marketing, configuration, maintenance |
| Products list (agent prices) | Duplicated finance logic |
| API / webhooks / invoices / users shells | |
| RBAC roles (foundation) | |
| Legacy route redirects | |

## Partner app routes

| Route | Module |
|-------|--------|
| `/dashboard` | Dashboard |
| `/wallet` | Wallet overview |
| `/wallet/transactions` | Ledger (existing `/agents/me/ledger`) |
| `/orders` | Order center |
| `/products` | Allowed products & pricing |
| `/settlement` | Foundation placeholder |
| `/reports` | Summary reports |
| `/api` | API keys + usage shell |
| `/api/docs` | API documentation |
| `/webhooks` | Webhook config view |
| `/invoices` | Agent invoices list |
| `/users` | Team / RBAC foundation |
| `/support` | Foundation placeholder |
| `/settings` | Profile & KYC link |
| `/settings/kyc` | KYC (existing flow) |

### Legacy redirects

- `/balance` → `/wallet`
- `/transactions` → `/orders`
- `/api-keys` → `/api`
- `/kyc` → `/settings/kyc`
- `/docs` → `/api/docs`

## Backend API (`src/modules/agent-platform/`)

All routes under **`/agents/me/platform/*`** (JWT). Reuses `AgentService`, `LedgerService`, `NotificationService`, and Prisma reads — no changes to payment/order/provider modules.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/agents/me/platform/session` | RBAC session (role + permissions) |
| GET | `/agents/me/platform/dashboard` | Dashboard cards |
| GET | `/agents/me/platform/wallet` | Wallet overview |
| GET | `/agents/me/platform/orders` | Orders with `?status=` filter |
| GET | `/agents/me/platform/products` | Agent product prices |
| GET | `/agents/me/platform/settlement` | Foundation shell |
| GET | `/agents/me/platform/reports` | Report summaries |
| GET | `/agents/me/platform/api` | API center metadata |
| GET | `/agents/me/platform/webhooks` | Webhook config |
| GET | `/agents/me/platform/invoices` | Invoices list |
| GET | `/agents/me/platform/users` | Members foundation |
| GET | `/agents/me/platform/notifications` | User notifications |

## RBAC foundation

Roles: **Owner**, **Manager**, **Finance**, **Operator**, **Readonly**

- Frontend: `lib/agent-platform/rbac.ts`, `hooks/useAgentPlatform.ts`
- Backend: `entities/agent-platform.constants.ts`
- Current release: primary account user is **Owner** until multi-user `AgentMember` schema ships

## Dashboard cards

Wallet Balance · Today's Orders · Revenue Today · Profit Today · Pending Settlement · Pending Deposit · API Calls Today · Success Rate · Last Webhook · Unread Notifications

Profit, settlement, and deposit fields return placeholder zeros until their respective milestones.

## Wallet engine

Ledger continues to use the existing **`LedgerService`** via `/agents/me/ledger`. No duplicate finance module.

## Footer

**6033.0 AGENT PLATFORM FOUNDATION** (partner sidebar)

## Deploy verification

1. `docker compose -f docker-compose.local-full.yml up --build -d`
2. Open http://partner.localhost
3. Confirm sidebar modules and dashboard cards
4. Confirm `/wallet/transactions` shows ledger
5. Confirm legacy URLs redirect
6. Confirm footer build string

## File layout

```
apps/partner/
  app/(platform)/          # Authenticated agent platform routes
  components/layout/       # AgentShell, Sidebar
  components/platform/     # Shared section UI
  lib/agent-platform/      # navigation, rbac
  hooks/useAgentPlatform.ts

src/modules/agent-platform/
  controllers/agent-platform.controller.ts
  services/agent-platform.service.ts
  entities/agent-platform.constants.ts
```
