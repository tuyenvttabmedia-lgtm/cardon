# CardOn — Master Phase Status (6032.x → 6033.4)

**Review date:** 2026-06-18 | **Method:** `docs/BUILD_*`, `docs/PHASE_*` vs source verification

---

## Build Series 6032.x (Admin Platform Operations)

| Build | Document | Claimed scope | Verified status | Notes |
|-------|----------|---------------|-----------------|-------|
| **6032.0** | BUILD_6032_0_AUDIT_LOG | System audit log admin UI | **Done** | `audit-log` module + admin config/audit pages |
| **6032.1** | BUILD_6032_1_ACTIVITY_LOG | Activity log monitor | **Done** | `activity-log` module + `/monitoring/activity` |
| **6032.2** | BUILD_6032_2_NOTIFICATION_CENTER | Notification center | **Done** | `notification-center` + admin UI; legacy Notification coexists |
| **6032.3** | BUILD_6032_3_QUEUE_MONITOR | Queue monitor | **Done** | 20 admin endpoints; 6 queues visible |
| **6032.3.1** | BUILD_6032_3_1_QUEUE_MONITOR_HOTFIX | Queue hotfix | **Done** | Hotfix applied in queue-monitor utils |
| **6032.4** | BUILD_6032_4_WEBHOOK_MONITOR | Webhook monitor | **Done** | Read/retry/cancel admin; inbound webhooks |
| **6032.5** | BUILD_6032_5_CONFIGURATION_CENTER | Configuration center | **Partial** | UI + API exist; overlaps `/settings/*` redirects |
| **6032.6** | BUILD_6032_6_MAINTENANCE_CENTER | Maintenance center | **Done** | Guard on auth mutations; public `/bao-tri` page |

**6032 regression:** Admin permission codes for new modules **not in seed script** → Partial enforcement.

---

## Build Series 6033.x (Partner Platform)

| Build | Document | Claimed scope | Verified status | Notes |
|-------|----------|---------------|-----------------|-------|
| **6033.0** | BUILD_6033_0_AGENT_PLATFORM_FOUNDATION | Partner platform shell | **Done** | Dashboard, nav, session, platform APIs |
| **6033.0** | BUILD_6033_0_HOTFIX_PORTAL_ROUTING | Portal routing fix | **Done** | Host-based routing stable |
| **6033.1** | BUILD_6033_1_AGENT_WALLET_LEDGER_CENTER | Wallet + ledger portal | **Done** | `/agents/me/wallet/*`, ledger UI |
| **6033.2** | BUILD_6033_2_AGENT_FINANCE_CENTER | Finance center | **Partial** | Deposits real; withdraws/settlement foundation |
| **6033.3** | BUILD_6033_3_AGENT_MONEY_FLOW | Agent deposit money flow | **Done** | AgentDepositModule, gateway deposit, webhook |
| **6033.3.1** | BUILD_6033_3_1_HOTFIX | Admin 502 circular DI fix | **Done** | forwardRef + ModuleRef pattern; **regression risk if DI changed** |
| **6033.3.2** | BUILD_6033_3_2_ARCHITECTURE_STABILIZATION | BuildInfo, routing cleanup | **Done** | Unified build-info; legacy partner redirects |
| **6033.4** | BUILD_6033_4_API_ORDER_OPERATIONS_CENTER | Partner order ops center | **Partial** | Aggregation APIs + UI done; webhook monitor synthesized |

---

## Selected Legacy Phases (Pre-6032)

| Phase | Document | Verified status | Notes |
|-------|----------|-----------------|-------|
| 1A–1C | Database / Prisma | **Done** | 56 models, 37 migrations |
| 2B–2B2 | Auth hardening | **Done** | Throttle, refresh, password reset |
| 2C–2C1 | Product engine | **Done** | Variants, categories, admin CRUD |
| 2E–2E2 | Payment core + MegaPay | **Done** | Adapters + webhook tests |
| 2F–2F2 | Provider core + safety | **Done** | eSale mock/real, retry backoff |
| 3A | Agent core | **Done** | KYC, credentials, ledger |
| 4A–4D | Admin panel | **Done** | Core admin operational |
| 5A–5C7 | Customer web + admin CMS | **Partial** | Public done; new customer portal stub |
| 5B | Agent portal (original) | **Deprecated** | Replaced by agent-platform 6033.x |
| 6E | Local full deployment | **Done** | docker-compose.local-full.yml |
| 6L | Customer final functional | **Partial** | Legacy account yes; `(customer)/*` stub contradicts doc |
| 6O* series | UX/payment/provider polish | **Mostly Done** | Many incremental UX phases applied |
| 6O31* | Payment strategy refactor | **Done** | Gateway priority in settings store |
| 6O22 | Provider runtime eSale | **Done** | ProviderRuntimeSetting model + admin UI |

---

## Status Summary Count

| Status | Approx. count (6032–6033 builds) |
|--------|-----------------------------------|
| Implemented | 14 |
| Partial | 5 |
| Deprecated | 2 (legacy partner pages, old agent portal patterns) |
| Regression (fixed) | 1 (6033.3.1 admin 502) |
| Regression (ops) | 1 (502 without --env-file) |
| Missing | Agent outbound webhook persistence, partner team RBAC |

---

## Phase vs Code Discrepancy Log

| Phase doc | Doc claim | Code reality |
|-----------|-----------|--------------|
| PHASE_6L | Customer portal complete | `(customer)/*` = 100% FoundationNotice |
| BUILD_6033.2 | Full finance center | Withdraws/settlements = foundation stubs |
| BUILD_6033.4 | Webhook monitor | Aggregated from orders; no delivery table |
| PHASE_5B | Agent portal report | Superseded by 6033.x; old routes redirect only |

---

## Abandoned / Not Started (from docs, unverified in code)

| Item | Evidence |
|------|----------|
| iMedia provider adapter | Documented in `05_PROVIDER_IMEDIA.md`; no active adapter in ProviderModule |
| AI features | Mentioned in roadmap examples only; zero implementation |
| Promotion engine (full) | `/khuyen-mai` page exists; no dedicated promotion module |
| email_queue processor | Queue registered, no worker |
| reconciliation_queue processor | Queue registered, no worker |
| Partner multi-user teams | UI stub + hardcoded OWNER |
