# CardOn — Master Technical Debt Report

**Review date:** 2026-06-18 | Priority: Critical → Low

---

## Critical

| # | Debt | Location | Impact |
|---|------|----------|--------|
| TD-C01 | Docker compose without `--env-file` breaks entire stack | `docker-compose.local-full.yml` | Production-like local outages |
| TD-C02 | Admin permission seed out of sync with Phase 6 controllers | `scripts/create-admin-local.ts` vs monitoring modules | SUPER_ADMIN 403 |
| TD-C03 | Partner RBAC not enforced on backend | `agent-platform.service.ts` getSession() | Any JWT agent = OWNER |
| TD-C04 | NestJS circular import risk in payment/agent-deposit/audit | Multiple modules | API bootstrap failure |

---

## High

| # | Debt | Location | Impact |
|---|------|----------|--------|
| TD-H01 | Dual notification systems | `Notification` + `SystemNotification` | Duplicate logic, missed alerts |
| TD-H02 | Dual audit systems | `AuditLog` + `SystemAuditLog` | Compliance confusion |
| TD-H03 | Customer portal 100% stub while legacy account works | `apps/web/(customer)/*` | Wrong host UX |
| TD-H04 | No agent outbound webhook delivery table | Missing model | 6033.4 monitor is synthetic |
| TD-H05 | email_queue registered, no processor | `queue.module.ts` | Jobs stall |
| TD-H06 | reconciliation_queue registered, no processor | `queue.module.ts` | Jobs stall |
| TD-H07 | PIN view: permission vs hardcoded role check | admin order detail | RBAC bypass |
| TD-H08 | LedgerEntry has deletedAt despite append-only rule | `schema.prisma` | Data integrity ambiguity |
| TD-H09 | CardAccessLog.cardId no FK to CardRecord | `schema.prisma` | Referential integrity gap |
| TD-H10 | FinancialTransaction maps to table `transactions` | Naming | Onboarding confusion |

---

## Medium

| # | Debt | Location | Impact |
|---|------|----------|--------|
| TD-M01 | Duplicate agent order APIs | platform/orders vs me/orders | Client confusion |
| TD-M02 | Duplicate agent wallet APIs | platform/wallet vs me/wallet | Client confusion |
| TD-M03 | Duplicate agent ledger paths | me/ledger vs wallet/ledger | Client confusion |
| TD-M04 | Settings vs configuration admin routes | `apps/admin/settings/*` + redirects | Maintenance burden |
| TD-M05 | Dual customer account URL schemes | `/account/*` + `/tai-khoan/*` | SEO, analytics split |
| TD-M06 | Partner enterprise routes hidden but accessible | navigation.ts ENTERPRISE_MODULE_PREFIXES | UX/security expectation |
| TD-M07 | FoundationNotice English defaults in VI app | `PlatformSection.tsx` | Language inconsistency |
| TD-M08 | ProviderController empty | `provider.controller.ts` | Dead route prefix |
| TD-M09 | LEDGER_TRANSACTION_GROUPS unused constant | agent-platform.constants.ts | Dead code |
| TD-M10 | In-memory export job map for large orders | agent-order-operations.service.ts | Lost on restart |
| TD-M11 | Admin pages without nav entries | agents, staff, audit | Discoverability |
| TD-M12 | Partner reports top products placeholder | reports page | Incomplete analytics |
| TD-M13 | Agent platform 0 unit tests | agent-platform module | Regression risk |
| TD-M14 | iMedia provider documented but not implemented | docs only | Doc drift |
| TD-M15 | payment_queue no dedicated worker | queue module | Monitoring-only queue |

---

## Low

| # | Debt | Location | Impact |
|---|------|----------|--------|
| TD-L01 | Public web build version in console not UI | `Footer.tsx` | QA visibility |
| TD-L02 | Partner missing BuildVersionComment | partner layout | Parity with admin/web |
| TD-L03 | `/kyc` middleware vs page redirect target | partner middleware + kyc/page | Minor inconsistency |
| TD-L04 | Mixed EN/VI in admin Monitoring labels | admin nav | Polish |
| TD-L05 | Mixed EN/VI partner page titles | reports, products, invoices | Polish |
| TD-L06 | cards.reveal legacy permission in seed | create-admin-local.ts | Cleanup |
| TD-L07 | Provider module naming vs ProviderController | provider module | Naming |
| TD-L08 | Virtual table spec not implemented | 6033.4 doc | Performance at scale |
| TD-L09 | Readonly partner export gate partial server-side | orders export | Defense in depth |
| TD-L10 | customer.localhost vs localhost feature split | portal-host middleware | User confusion |

---

## Debt by Area

| Area | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| Infrastructure | 1 | 0 | 0 | 0 | 1 |
| Security/RBAC | 2 | 1 | 1 | 1 | 5 |
| Architecture | 1 | 4 | 5 | 2 | 12 |
| Frontend | 0 | 1 | 6 | 5 | 12 |
| Database | 0 | 3 | 0 | 0 | 3 |
| Queue | 0 | 2 | 1 | 0 | 3 |
| Testing | 0 | 0 | 1 | 0 | 1 |
| Documentation | 0 | 1 | 1 | 0 | 2 |

**Total identified:** 39 items

---

## Top 20 Technical Debts (Priority Order)

1. TD-C01 — Docker env-file requirement
2. TD-C02 — Admin permission seed drift
3. TD-C03 — Partner RBAC backend gap
4. TD-C04 — Circular DI fragility
5. TD-H01 — Dual notification systems
6. TD-H02 — Dual audit systems
7. TD-H03 — Customer portal stub vs legacy
8. TD-H04 — Missing webhook delivery persistence
9. TD-H05 — email_queue no worker
10. TD-H06 — reconciliation_queue no worker
11. TD-H07 — PIN permission inconsistency
12. TD-H08 — Ledger schema vs business rule
13. TD-M01 — Duplicate agent order APIs
14. TD-M04 — Admin settings/configuration dup
15. TD-M05 — Dual account URL schemes
16. TD-M06 — Hidden but accessible enterprise routes
17. TD-M10 — In-memory export jobs
18. TD-M13 — Zero agent-platform tests
19. TD-H09 — CardAccessLog FK gap
20. TD-M08 — Empty ProviderController

---

## Remediation Strategy

**Sprint 1 (Hardening):** TD-C01, TD-C02, TD-C03, TD-C04  
**Sprint 2 (Consolidation):** TD-H01, TD-H02, TD-M01–03, TD-M04  
**Sprint 3 (Customer/Partner):** TD-H03, TD-H04, TD-M06, TD-M07  
**Sprint 4 (Queue/Finance):** TD-H05, TD-H06, settlement completion  

No code changes in this review — remediation is roadmap input only.
