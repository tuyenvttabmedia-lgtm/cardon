# CardOn — Master Architecture Review

**Review date:** 2026-06-18  
**Build line reviewed:** 6032.x → 6033.4  
**Method:** Source code first; documentation cross-checked  
**Scope:** Read-only audit — no code changes

---

## Executive Summary

CardOn is a **multi-portal digital product distribution platform** (B2C storefront + B2B agent API + admin operations) built as a **pnpm/npm monorepo**:


| Layer                | Technology                | Location                        |
| -------------------- | ------------------------- | ------------------------------- |
| API + Worker         | NestJS 10, Prisma         | `src/`                          |
| Admin UI             | Next.js App Router        | `apps/admin/`                   |
| Partner UI           | Next.js App Router        | `apps/partner/`                 |
| Public + Customer UI | Next.js App Router        | `apps/web/`                     |
| Shared build info    | TypeScript package        | `packages/build-info/`          |
| Database             | PostgreSQL 16             | `prisma/schema.prisma`          |
| Queue                | Redis + BullMQ (6 queues) | `src/queue/`                    |
| Deploy               | Docker Compose + Nginx    | `docker-compose.local-full.yml` |


**Overall project completion (weighted): ~72%**

The **engines** (Payment, Provider, Order, Ledger) are substantially implemented and tested. The **admin platform** is the most complete surface (~~85%). The **partner portal** is API-first and maturing (~~70%). The **customer portal redesign** is largely stub (~~25% of new portal). The **public website** is functional (~~80%).

---

## Architecture Layers (Verified)

```
┌─────────────────────────────────────────────────────────────┐
│  Portals: Admin | Partner | Customer (web) | Public (web)   │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST /api/v1 (+ /api/partner/v1)
┌───────────────────────────▼─────────────────────────────────┐
│  NestJS API (344 HTTP endpoints, 27 module folders)         │
│  Guards: JWT, Roles, Permissions, AgentApiAuth, Maintenance│
└───────┬───────────────┬───────────────┬─────────────────────┘
        │               │               │
   PostgreSQL         Redis          BullMQ Workers
   (56 models)     (cache/queue)   (provider, topup, notification)
```

### Process roles

- `APP_ROLE=api` — HTTP only  
- `APP_ROLE=worker` — queue processors only (`src/worker.ts`)  
- `APP_ROLE=all` — combined (local dev default)

---

## Application State

### 1. Admin (`http://admin.localhost`) — ~85%

- **60 routes**, rich sidebar (Dashboard, Orders, Products, Providers, Customers, Marketing, Finance, Monitoring, Configuration)
- **Real:** orders, products, providers, finance, monitoring (activity, notifications, queues, webhooks), CMS/marketing, configuration center, maintenance
- **Gaps:** `/staff`, `/agents`, `/audit` exist but not in main nav; settings/configuration duplicate paths; some health badges "Coming Soon"
- **Language:** Vietnamese dominant; English mixed in Monitoring/Configuration labels
- **RBAC:** DB-driven permissions + `RequirePermission` guards (mature)

### 2. Partner (`http://partner.localhost`) — ~70%

- **45 routes**, API-first Vietnamese sidebar (6033.3+)
- **Real:** dashboard, wallet/ledger, finance deposits, orders operations center (6033.4), API keys, webhooks config, notifications, account/KYC
- **Foundation/stub:** support, settlement, users (partial), wallet withdraws, finance withdraws
- **Hidden enterprise modules:** finance sub-pages, products, users, support, settlement (accessible by URL, not sidebar)
- **RBAC:** Frontend matrix only; backend hardcodes `OWNER` session

### 3. Customer (`http://customer.localhost` → `apps/web` `(customer)/*`) — ~25%

- **7 routes — all FoundationNotice stubs** ("Sắp ra mắt")
- **Real customer features** live under legacy `/tai-khoan/*` and `/account/*` on public web host

### 4. Public Website (`http://localhost`) — ~80%

- **Real:** homepage, catalog (cards, topup, data), checkout, CMS pages, blog/news, order lookup
- **Dual account paths:** Vietnamese `/tai-khoan/*` + English `/account/*` (technical debt)

---

## Engine State


| Engine               | Completion | Source truth                                                                    |
| -------------------- | ---------- | ------------------------------------------------------------------------------- |
| **Payment**          | ~85%       | MegaPay + SePay adapters, webhooks, expiration, agent deposit webhooks          |
| **Provider (eSale)** | ~80%       | Card + topup fulfillment, retry, mock mode, runtime settings, health cron       |
| **Order**            | ~85%       | B2C checkout + agent orders, events, fulfillment dispatch                       |
| **Wallet/Ledger**    | ~75%       | HOLD/COMMIT/RELEASE for agents; portal aggregation APIs                         |
| **Webhook**          | ~70%       | Inbound payment webhooks + admin monitor; agent outbound delivery table missing |
| **Notification**     | ~65%       | Dual system: legacy `Notification` + `SystemNotification` center                |
| **Monitoring**       | ~80%       | Activity log, audit log, queue monitor, webhook monitor, health                 |
| **Configuration**    | ~75%       | Configuration center + maintenance center + settings store                      |
| **CMS/Marketing**    | ~80%       | Full admin CMS; public rendering                                                |
| **RBAC**             | ~70%       | Admin mature; partner/customer gaps                                             |


---

## Documentation vs Source Code Discrepancies


| Topic                       | Documentation says              | Source code shows                                                  |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Customer portal             | Phase 6L "final functional"     | New `(customer)/*` routes are 100% stubs                           |
| Partner RBAC                | Roles OWNER→READONLY enforced   | `getSession()` always returns OWNER; no backend guard              |
| Agent webhook delivery      | Operations center monitor       | Synthesized from order events; no `agent_webhook_deliveries` table |
| Ledger append-only          | Business rule in docs           | Schema has `deletedAt`/`updatedAt` on `LedgerEntry`                |
| Provider controller         | Module exists                   | `@Controller('providers')` has **zero handlers**                   |
| Email/Reconciliation queues | Architecture docs imply workers | Queues registered; **no `@Processor`**                             |
| Admin permissions Phase 6   | Monitoring modules documented   | Controllers use permissions **not in seed script** → potential 403 |
| Build 6033.3 Partner        | "Enterprise hidden"             | Routes still reachable by direct URL                               |


**Rule applied:** Source code is truth when conflicts exist.

---

## Infrastructure (Docker)

- Stack: `docker-compose.local-full.yml` + `.env.local-full`
- **Critical ops note:** Must use `--env-file .env.local-full` or `DATABASE_URL` is empty → API crash loop → **502 on all portals** (observed during 6033.4 deploy; not a code regression)
- Services: postgres, redis, api, worker, admin, partner, web, nginx
- Current build label: `6033.4 API ORDER OPERATIONS CENTER`

---

## Test Coverage

- **47** `*.spec.ts` files in `src/`
- Strongest: payment (8), provider (8), admin (8), auth (4)
- Weakest: agent-platform, monitoring modules, agent-deposit (0 dedicated specs visible)

---

## Recommended Next EPIC

**EPIC: Platform Hardening & RBAC** — before new features:

1. Fix admin permission seed drift (Phase 6 monitoring permissions)
2. Enforce partner RBAC on backend
3. Resolve dual notification/audit systems
4. Docker deploy runbook (`--env-file` mandatory)
5. Complete customer portal or deprecate stub routes explicitly

See `docs/MASTER_ROADMAP.md` for full EPIC breakdown.

---

## Related Master Documents


| Document                    | Purpose                 |
| --------------------------- | ----------------------- |
| `MASTER_MODULE_MATRIX.md`   | Per-module status       |
| `MASTER_PHASE_STATUS.md`    | Build/phase history     |
| `MASTER_TODO.md`            | Global prioritized TODO |
| `MASTER_ROADMAP.md`         | EPIC-based roadmap      |
| `MASTER_REGRESSION.md`      | Known regressions       |
| `MASTER_TECH_DEBT.md`       | Technical debt          |
| `MASTER_DATABASE_REVIEW.md` | Prisma/schema           |
| `MASTER_API_REVIEW.md`      | REST endpoints          |
| `MASTER_RBAC_REVIEW.md`     | Permissions             |
| `MASTER_UI_REVIEW.md`       | Frontend consistency    |


