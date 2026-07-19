# CardOn — Master Regression Report

**Review date:** 2026-06-18 | Verified against source + recent deploy history

---

## Active / Recurring Regressions

| # | Regression | Severity | Affected | Root cause | Fix status |
|---|------------|----------|----------|------------|------------|
| R01 | **502 Bad Gateway all portals** when API container crash-loops | Critical | Admin, Partner, Public | Empty `DATABASE_URL` when `docker compose up` without `--env-file .env.local-full` | Ops issue; not code. **Recurring.** |
| R02 | **Admin 502** from NestJS bootstrap failure | Critical | Admin | Circular DI: AgentDepositModule ↔ PaymentModule ↔ AuditLogModule ↔ AuthModule | **Fixed** 6033.3.1; **regression risk** if DI touched |
| R03 | **Admin SUPER_ADMIN 403** on monitoring/configuration modules | High | Admin | Permission codes in controllers not seeded (`maintenance.read`, `configuration.read`, etc.) | **Open** |
| R04 | Partner login blank screen / redirect loop | High | Partner | Cookie/localStorage mismatch + AuthGuard | **Fixed** 6033.3.1 |
| R05 | Partner login ThrottlerException (429) | Medium | Partner | Auth throttle 5/15min during redirect loop | **Mitigated** AUTH_LOGIN_THROTTLE_LIMIT=100 local |
| R06 | Postgres recreated with wrong env while volume persists | High | All | POSTGRES_USER empty at compose time vs existing volume credentials | **Open** ops |

---

## Fixed Regressions (Historical)

| # | Regression | Fixed in | Evidence |
|---|------------|----------|----------|
| F01 | Admin Provider Settings 502 | 6033.3.1 | forwardRef in audit-log, auth, maintenance modules |
| F02 | Partner `/settings` vs `/account` routing confusion | 6033.3.2 | Canonical `/account` |
| F03 | Partner `/invoices` orphan route | 6033.3.2 | Redirect to settlements |
| F04 | Inconsistent build footer across apps | 6033.3.2 | `@cardon/build-info` |
| F05 | Agent deposit webhook circular import | 6033.3.1 | ModuleRef for AgentDepositWebhookService |

---

## Potential Regressions (Not Confirmed Broken)

| # | Risk | Trigger | Mitigation |
|---|------|---------|------------|
| P01 | AgentPlatformModule imports ProviderModule | 6033.4 retry feature | Monitor bootstrap; use ModuleRef if cycle appears |
| P02 | Duplicate order list APIs | Platform vs operations | Clients may call wrong endpoint; document canonical paths |
| P03 | Legacy `agents/me/transactions` vs new orders API | Partner migration | Keep both until deprecated explicitly |
| P04 | Customer host shows stub portal while legacy works on localhost | Host routing | Users on customer.localhost see empty stubs |

---

## Application Regression Matrix

| Application | Known broken now? | Last verified | Notes |
|-------------|-------------------|---------------|-------|
| **Admin** | Depends on API up | 6033.4 session | 502 when API down; functional when API healthy |
| **Partner** | Depends on API up | 6033.4 session | Same; orders ops needs new endpoints |
| **Customer (new portal)** | **By design stub** | 6033.4 | Not regression — incomplete feature |
| **Public web** | Depends on API up | Stable | Checkout requires payment API |
| **Worker** | Independent | Healthy when redis up | Provider/topup processing |

---

## Regression Verification Checklist (for next cycle)

```
□ docker compose --env-file .env.local-full up → API healthy
□ admin.localhost/dashboard → 200, data loads
□ admin.localhost/monitoring/* → no 403 for superadmin
□ partner.localhost/login → no blank screen
□ partner.localhost/orders → dashboard loads
□ localhost/checkout → payment flow initiates
□ customer.localhost → document expected stub vs legacy
□ npm run build (api) → no TS errors
□ No UndefinedModuleException in API logs
```

---

## Top 20 Regressions (Ranked by Impact)

1. API 502 from missing env-file (ops)
2. Admin 502 from DI circular import (fixed, fragile)
3. Admin 403 on Phase 6 modules (permission seed)
4. Postgres volume/credential mismatch on recreate
5. Partner login blank screen (fixed)
6. Partner auth throttle loop (mitigated)
7. Customer portal stub mistaken for regression
8. Dual account paths confusing QA
9. Settings vs configuration duplicate routes
10. `/kyc` redirect target mismatch
11. Enterprise partner routes accessible despite hidden nav
12. Export permission not enforced server-side for all paths
13. Webhook monitor shows synthetic data (expectation gap)
14. Build footer not visible on public site (QA false negative)
15. Legacy Notification vs SystemNotification inconsistency
16. PIN permission check bypass via role hardcode
17. email_queue jobs never processed
18. reconciliation_queue jobs never processed
19. Provider HTTP controller empty (404 on `/providers`)
20. Agent session always OWNER (security regression if multi-user expected)
