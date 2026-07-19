# CardOn — Master TODO

**Review date:** 2026-06-18 | Grouped by priority | References originating phase/build

---

## P0 — Critical (blocks production / causes outages)

| ID | Item | Status | Origin | Evidence |
|----|------|--------|--------|----------|
| P0-01 | Docker deploy must use `--env-file .env.local-full` | NOT STARTED (ops) | 6033.4 deploy | Empty DATABASE_URL → API crash → 502 all portals |
| P0-02 | Seed Phase 6 admin permissions (maintenance, configuration, queue, webhook, activity, audit.read) | NOT STARTED | 6032.x | Controllers use codes absent from `create-admin-local.ts` |
| P0-03 | Verify NestJS bootstrap after any AgentPlatformModule DI change | PARTIAL | 6033.3.1 | Circular import history with PaymentModule/AuditLogModule |
| P0-04 | Partner backend RBAC enforcement | NOT STARTED | 6033.0 | `getSession()` hardcodes OWNER |

---

## P1 — High (security / data integrity)

| ID | Item | Status | Origin |
|----|------|--------|--------|
| P1-01 | Agent outbound webhook delivery persistence | NOT STARTED | 6033.4 |
| P1-02 | Unify notification systems (Notification vs SystemNotification) | PARTIAL | 6032.2 |
| P1-03 | Unify audit systems (AuditLog vs SystemAuditLog) | PARTIAL | 6032.0 |
| P1-04 | Enforce `card.pin.view` permission consistently (vs hardcoded ADMIN role) | NOT STARTED | 4A1 |
| P1-05 | Ledger append-only: reconcile schema `deletedAt` with business rule | NOT STARTED | 08_AGENT_BALANCE |
| P1-06 | email_queue BullMQ processor | NOT STARTED | Architecture doc |
| P1-07 | reconciliation_queue BullMQ processor | NOT STARTED | 09_RECONCILIATION |

---

## P2 — Medium (feature completion)

| ID | Item | Status | Origin |
|----|------|--------|--------|
| P2-01 | Customer portal `(customer)/*` — replace stubs with real pages | NOT STARTED | 6L / 6033.3.2 |
| P2-02 | Deprecate or redirect legacy `/account/*` vs `/tai-khoan/*` | PARTIAL | 5A |
| P2-03 | Partner settlement engine UI (beyond foundation) | PARTIAL | 6033.2 |
| P2-04 | Partner withdraw flow (beyond foundation) | PARTIAL | 6033.2 |
| P2-05 | Partner multi-user team management | NOT STARTED | 6033.0 |
| P2-06 | Partner support module (real, not FoundationNotice) | PARTIAL | 6033.0 |
| P2-07 | Admin nav links for `/agents`, `/staff`, `/audit` | NOT STARTED | 4A |
| P2-08 | Remove settings/configuration route duplication | PARTIAL | 6032.5 / 6033.3.2 |
| P2-09 | ProviderController HTTP surface (currently empty) | NOT STARTED | 2F |
| P2-10 | Export large orders via object storage + signed URL | NOT STARTED | 6033.4 |
| P2-11 | Partner reports — top products real data | PARTIAL | 6033.4 |
| P2-12 | Finance role: block enterprise URLs server-side | NOT STARTED | 6033.4 RBAC spec |

---

## P3 — Low (polish / consistency)

| ID | Item | Status | Origin |
|----|------|--------|--------|
| P3-01 | Partner UI language — English titles → Vietnamese | PARTIAL | 6033.3.2 |
| P3-02 | Admin Monitoring nav labels → Vietnamese | NOT STARTED | 6032.x |
| P3-03 | Public web footer build version visible (not console only) | NOT STARTED | 6033.3.2 |
| P3-04 | Partner `/kyc` redirect target consistency (middleware vs page) | NOT STARTED | 6033.3.2 |
| P3-05 | Add BuildVersionComment to partner layout | NOT STARTED | 6033.3.2 |
| P3-06 | Virtual table for large order lists (6033.4 spec) | PARTIAL | 6033.4 |
| P3-07 | iMedia provider adapter | NOT STARTED | 05_PROVIDER_IMEDIA |
| P3-08 | Promotion engine module | NOT STARTED | Roadmap |
| P3-09 | AI integration | NOT STARTED | Roadmap |
| P3-10 | Test coverage for agent-platform, monitoring modules | NOT STARTED | — |

---

## DONE (verified in 6033.4 review)

| Item | Origin |
|------|--------|
| Admin audit log center | 6032.0 |
| Activity log monitor | 6032.1 |
| Notification center admin | 6032.2 |
| Queue monitor | 6032.3 |
| Webhook monitor (inbound) | 6032.4 |
| Configuration center | 6032.5 |
| Maintenance center | 6032.6 |
| Partner platform foundation | 6033.0 |
| Agent wallet/ledger center | 6033.1 |
| Agent finance deposits | 6033.2–6033.3 |
| Agent deposit gateway flow | 6033.3 |
| Admin 502 circular DI fix | 6033.3.1 |
| Unified BuildInfoService | 6033.3.2 |
| Partner API-first nav + legacy redirects | 6033.3.2 |
| API Order Operations Center (aggregation) | 6033.4 |
| B2C checkout + payment webhooks | 2E |
| eSale provider fulfillment + retry | 2F |
| Agent API HMAC gateway | 3A / 07 |
| CMS + marketing admin | 5C2 |
| Public storefront catalog/checkout | 5A |

---

## REMOVED / DEPRECATED

| Item | Origin | Replacement |
|------|--------|-------------|
| Partner `/balance`, `/api-keys`, `/docs`, `/transactions` pages | 6033.3.2 | Redirect stubs → wallet/api/orders |
| Partner manual checkout UI | 6033.3.1 | API-only ordering |
| Legacy agent portal transaction UI as primary | 6033.0 | agent-platform module |
| `cards.reveal` permission (legacy) | Seed script | `card.pin.view` |

---

## Priority Summary

| Priority | Open items |
|----------|------------|
| P0 Critical | 4 |
| P1 High | 7 |
| P2 Medium | 12 |
| P3 Low | 10 |
| Done (6032–6033) | 20+ |
