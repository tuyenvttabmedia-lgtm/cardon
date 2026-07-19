# CardOn — Master RBAC Review

**Review date:** 2026-06-18

---

## RBAC Systems Overview

CardOn has **three separate authorization models**:

| Portal | Model | Storage | Enforcement |
|--------|-------|---------|-------------|
| **Admin** | DB permissions + UserRole | `permissions`, `role_permissions` | Backend guards + frontend nav |
| **Partner** | In-memory AgentPlatformRole | TypeScript constants only | **Frontend only** |
| **Customer** | Role = CUSTOMER | JWT claim | JwtAuthGuard + RolesGuard |
| **Agent API** | API key + HMAC | Agent table | AgentApiAuthGuard |

---

## Admin RBAC

### Roles (UserRole enum — 7 values)

| Role | Purpose |
|------|---------|
| CUSTOMER | End user (no admin permissions) |
| AGENT | B2B partner user (no admin permissions) |
| SUPPORT | Orders, customers, retry |
| MARKETING | CMS manage |
| ACCOUNTANT | Finance, ledger, invoices |
| ADMIN | Broad admin minus users.manage |
| SUPER_ADMIN | Full access |

### Permission codes (seed script — 25)

```
users.read, users.manage
orders.read, orders.manage, orders.retry
payments.view, payments.review
ledger.view
agents.read, agents.manage, agents.kyc.review, agents.credit
providers.manage
pricing.manage
products.manage
invoice.manage
cms.manage
settings.manage
admin.dashboard
audit.view
finance.view, finance.manage
customers.read, customers.manage
cards.reveal (legacy)
card.pin.view
```

### Phase 6 permissions (in controllers, NOT in seed)

```
maintenance.read, maintenance.manage
configuration.read, configuration.manage
webhook.read, webhook.export, webhook.manage
queue.read, queue.export, queue.manage
activity.read, activity.export
notification.read, notification.manage
audit.read, audit.export
```

**Impact:** Non-seeded SUPER_ADMIN may get **403** on monitoring/configuration UIs.

### Frontend (apps/admin)

- `NAV_ITEMS` filtered by `canAccessNavItem(role, permission)`
- `RequirePermission` wrapper on pages
- Role-based default routes (ACCOUNTANT → finance, MARKETING → marketing)

### Backend guards

```
JwtAuthGuard → PermissionsGuard (@Permissions('code'))
            → RolesGuard (@Roles(UserRole.ADMIN))  [some routes]
```

### Permission matrix gaps

| Action | Expected permission | Actual check |
|--------|--------------------|--------------|
| View PIN | card.pin.view | Hardcoded ADMIN/SUPER_ADMIN role |
| Settings admin | settings.manage | @Roles SUPER_ADMIN only (no @Permissions) |
| Dashboard | admin.dashboard + @Roles ADMIN/SUPER_ADMIN | Hybrid |

---

## Partner RBAC

### Roles (AgentPlatformRole — 5, in-memory)

| Role | Export | Retry | Manage API | Manage users |
|------|--------|-------|------------|--------------|
| OWNER | ✓ | ✓ | ✓ | ✓ |
| MANAGER | ✓ | ✓ | ✓ | read only |
| FINANCE | ✗ | ✗ | ✗ | ✗ |
| OPERATOR | ✓ | ✓ | read | ✗ |
| READONLY | ✗ | ✗ | read | read |

### Permissions (21 codes)

Defined in:
- `src/modules/agent-platform/entities/agent-platform.constants.ts`
- `apps/partner/lib/agent-platform/rbac.ts` (duplicate)

Categories: dashboard, wallet, finance, orders, products, settlement, reports, api, webhooks, invoices, users, support, settings, notifications

### Enforcement reality

| Layer | Enforced? |
|-------|-----------|
| Frontend sidebar filter | ✓ (via useAgentPlatform.can) |
| Frontend export/retry buttons | ✓ (partial) |
| Backend GET endpoints | ✗ (JwtAuthGuard only) |
| Backend POST export/retry | Partial (readonly check in service) |
| Session role | **Always OWNER** in `getSession()` |

**Critical gap:** Any authenticated agent user has full backend access regardless of displayed role.

### UserRole.AGENT vs AgentPlatformRole

- KYC approval sets `User.role = AGENT`
- Platform uses separate `AgentPlatformRole` — **not stored in DB**
- No `AgentMember` or team table

---

## Customer RBAC

| Pattern | Detail |
|---------|--------|
| Register | Creates User with role CUSTOMER |
| Account routes | `@Roles(CUSTOMER)` + JwtAuthGuard |
| Guest checkout | OptionalJwtAuthGuard |
| Customer portal (new) | Session check only — no permissions |
| Support tickets | CUSTOMER role required |

No fine-grained customer permissions (expected for B2C).

---

## Agent API (Machine) Auth

| Check | Detail |
|-------|--------|
| API Key header | Lookup via hash |
| HMAC signature | Secret from encrypted store |
| Request ID | Required; idempotency key |
| Rate limit | Per-agent in-memory |
| IP whitelist | Documented; not verified in review |

No RBAC — single credential per agent.

---

## Unused Permissions

| Permission | Status |
|------------|--------|
| cards.reveal | Legacy; superseded by card.pin.view |
| LEDGER_TRANSACTION_GROUPS | Constant defined, never used |

---

## Duplicate Permissions

| Area | Duplication |
|------|-------------|
| audit.view (seed) vs audit.read (module) | Different codes, same domain |
| Partner rbac.ts vs agent-platform.constants.ts | Identical matrix duplicated |
| Admin frontend permissions.ts vs backend seed | Must stay in sync manually |

---

## Missing Permissions

| Needed for | Missing |
|------------|---------|
| Phase 6 admin modules | maintenance.*, configuration.*, webhook.*, queue.*, activity.*, notification.*, audit.read/export |
| Partner server enforcement | orders.retry, orders.export guards on all routes |
| Multi-user partner | users.manage backend checks |

---

## Role Mapping Diagram

```
                    ┌─────────────┐
                    │  SUPER_ADMIN │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          ADMIN      ACCOUNTANT     MARKETING
              │            │            │
              ▼            ▼            ▼
          SUPPORT      (finance)    (cms only)

Partner (separate, not mapped to UserRole):
  OWNER → MANAGER → OPERATOR → FINANCE → READONLY
  (all collapse to OWNER at backend today)

Customer:
  CUSTOMER (single role)
```

---

## Recommendations

1. **P0:** Add Phase 6 permissions to seed script
2. **P0:** Implement `AgentPlatformPermissionGuard` on partner routes
3. **P1:** Store partner role in DB when multi-user launches
4. **P1:** Align PIN reveal with `card.pin.view` permission only
5. **P2:** Merge audit.view → audit.read or document distinction
6. **P2:** Single source for partner permission matrix (shared package)
7. **P3:** Remove cards.reveal from seed

---

## Permission Matrix (Admin — condensed)

| Permission | SUPER | ADMIN | SUPPORT | MARKETING | ACCOUNTANT |
|------------|-------|-------|---------|-----------|------------|
| admin.dashboard | ✓ | ✓ | — | — | — |
| orders.* | ✓ | ✓ | read/retry | — | — |
| finance.* | ✓ | ✓ | — | — | ✓ |
| cms.manage | ✓ | ✓ | — | ✓ | — |
| users.manage | ✓ | — | — | — | — |
| maintenance.* | ? | ? | — | — | — |
| configuration.* | ? | ? | — | — | — |

`?` = controller expects permission but seed may not grant it.
