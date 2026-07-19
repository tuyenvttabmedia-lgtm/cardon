# CardOn — Master Module Matrix

**Review date:** 2026-06-18 | **Source:** `src/modules/*`, `apps/*`, `prisma/schema.prisma`

Legend: **Done** | **Partial** | **Stub** | **Deprecated** | **Missing**

| Module | Purpose | Status | Backend | Frontend | Tests | Tech Debt | Owner |
|--------|---------|--------|---------|----------|-------|-----------|-------|
| **auth** | JWT login, refresh, register, password reset | Done | 19 endpoints | 3 apps login | 4 specs | Throttle tuning for local | Core |
| **rbac** | Permission cache, guards | Partial | Guards exist | Admin only | 1 spec | Partner not wired | Core |
| **admin** | Admin operations hub | Done | 86 endpoints | 60 pages | 8 specs | Nav gaps for agents/staff | Platform |
| **order** | B2C + agent order lifecycle | Done | 9 endpoints | Admin + public | 2 specs | — | Commerce |
| **payment** | MegaPay, SePay, webhooks | Done | 3+ endpoints | Admin settings | 8 specs | payment_queue no worker | Commerce |
| **provider** | eSale card/topup fulfillment | Done | 0 public ctrl | Admin providers | 8 specs | Empty ProviderController | Commerce |
| **agent** | Agent profile, ledger, KYC | Done | 12 endpoints | Partner account | 1 spec | Legacy tx API overlaps platform | B2B |
| **agent-api** | B2B machine API (HMAC) | Done | 3 endpoints | Partner API test | 2 specs | — | B2B |
| **agent-deposit** | Gateway deposit to wallet | Done | 0 ctrl (via payment) | Partner finance | 0 specs | Circular import history (fixed) | Finance |
| **agent-platform** | Partner portal aggregation | Partial | 44 endpoints | Partner UI | 0 specs | RBAC hardcoded OWNER | B2B |
| **finance** | Admin finance/reconciliation | Done | 26 endpoints | Admin finance | 2 specs | — | Finance |
| **product** | Catalog, variants, pricing | Done | 25 endpoints | Admin + public | 4 specs | — | Commerce |
| **cms** | Pages, SEO, banners, media | Done | 40 endpoints | Admin marketing | 4 specs | — | Marketing |
| **notification** | Email/in-app legacy | Partial | 0 ctrl | All apps | 2 specs | Dual with notification-center | Platform |
| **notification-center** | System notifications admin | Done | 8 endpoints | Admin monitoring | 0 specs | Not wired to partner alerts | Platform |
| **audit-log** | System audit (config changes) | Done | 4 endpoints | Admin config/audit | 0 specs | Overlap with legacy AuditLog | Platform |
| **activity-log** | System activity monitor | Done | 4 endpoints | Admin monitoring | 0 specs | Permission seed gap | Platform |
| **activity-event** | Event dispatcher (internal) | Done | 0 ctrl | — | 0 specs | — | Platform |
| **queue-monitor** | BullMQ admin UI API | Done | 20 endpoints | Admin queues | 0 specs | Permission seed gap | Platform |
| **webhook-monitor** | Webhook admin UI API | Done | 11 endpoints | Admin webhooks | 0 specs | Permission seed gap | Platform |
| **configuration-center** | Runtime config admin | Done | 10 endpoints | Admin config | 0 specs | Permission seed gap | Platform |
| **maintenance-center** | Maintenance mode | Done | 4 endpoints | Admin + public bao-tri | 0 specs | — | Platform |
| **settings** | Settings store (internal) | Done | 0 ctrl | Admin via settings-admin | 2 specs | Duplicate with configuration | Platform |
| **health** | Liveness/readiness | Done | 2 endpoints | Admin health | 0 specs | — | Ops |
| **contact** | Contact form | Done | 5 endpoints | Public + admin | 1 spec | — | Marketing |
| **support** | Support tickets | Partial | 9 endpoints | Admin + account | 1 spec | Partner support stub | Platform |
| **email-template** | Email templates | Partial | 0 ctrl | Admin marketing | 0 specs | No dedicated API surface | Marketing |

---

## Dependency Graph (Simplified)

```
AuthModule ←── most modules
PaymentModule ←── OrderModule, AgentDepositModule (ModuleRef pattern)
ProviderModule ←── OrderModule, AgentPlatformModule (retry)
AgentModule ←── AgentApiModule, AgentPlatformModule
NotificationModule ←── Payment, Provider, Agent, Maintenance
ActivityEventModule ←── cross-cutting dispatch
AuditLogModule ←── AuthModule (forwardRef cycle — stabilized 6033.3.1)
```

---

## Frontend Module Mapping

| App area | Backend modules consumed | Completion |
|----------|-------------------------|------------|
| Admin dashboard | admin, finance, health | 85% |
| Admin orders | admin, order, provider | 90% |
| Admin monitoring | activity-log, queue-monitor, webhook-monitor, notification-center | 80% |
| Admin configuration | configuration-center, maintenance-center, settings-admin | 75% |
| Admin marketing/CMS | cms, contact, email-template | 85% |
| Partner dashboard | agent-platform | 70% |
| Partner wallet/finance | agent-wallet, agent-finance, agent-deposit | 75% |
| Partner orders ops | agent-order-operations | 70% (6033.4) |
| Partner API center | agent-api, agent-platform | 65% |
| Public storefront | product, cms, order, payment | 80% |
| Customer portal (new) | account (planned) | 5% stub |
| Customer legacy account | account, order, support | 70% |

---

## Missing Features by Module

| Module | Missing |
|--------|---------|
| agent-platform | Multi-member teams, real role enforcement, settlement engine UI |
| provider | iMedia adapter (documented, not in active code path) |
| payment | Additional gateways beyond MegaPay/SePay |
| notification | Unified delivery; partner export-ready push |
| agent-platform webhooks | Outbound delivery persistence table |
| finance | Full agent settlement cycles |
| cms | Customer portal content personalization |
| queue | email_queue, reconciliation_queue processors |

---

## Module Health Summary

| Health | Count | Modules |
|--------|-------|---------|
| Production-ready core | 12 | auth, order, payment, provider (engine), product, agent-api, admin (core), cms, finance |
| Operational with gaps | 10 | agent-platform, notification*, monitoring*, configuration*, support, agent-deposit |
| Internal/supporting | 5 | activity-event, settings, rbac, health, email-template |
| Empty/stub surface | 1 | provider controller (engine works via services) |

*Dual-system or permission drift issues
