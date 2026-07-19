# CardOn — Master API Review

**Review date:** 2026-06-18 | **Global prefix:** `/api/v1` (except `/health`, `/api/partner/v1`)

**Total:** ~344 HTTP endpoints across 32 controllers

---

## API Groups

### Public (no auth)
| Prefix | Endpoints | Module | Status |
|--------|-----------|--------|--------|
| `/health` | 2 | health | Active |
| `/auth/*` | 8+ | auth | Active |
| `/products/*` | ~10 | product-public | Active |
| `/cms/*` | ~15 | cms-public | Active |
| `/contact` | 2 | contact-public | Active |
| `/payment-methods` | 1+ | payment | Active |
| `/orders` (guest checkout) | partial | order | Active |

### Customer (JWT CUSTOMER)
| Prefix | Endpoints | Status |
|--------|-----------|--------|
| `/account/*` | ~12 | Active |
| `/account/support/*` | ~4 | Active |
| `/orders` (authenticated) | ~3 | Active |

### Partner Machine API (HMAC — no JWT prefix)
| Prefix | Endpoints | Status |
|--------|-----------|--------|
| `/api/partner/v1/balance` | GET | Active |
| `/api/partner/v1/buy` | POST | Active |
| `/api/partner/v1/transactions/:id` | GET | Active |

### Partner Portal (JWT agent user)
| Prefix | Endpoints | Status | Notes |
|--------|-----------|--------|-------|
| `/agents/me/platform/*` | 12 | Active | Dashboard aggregation |
| `/agents/me/wallet/*` | 9 | Active | Wallet center 6033.1 |
| `/agents/me/finance/*` | 12 | Active | Finance center 6033.2 |
| `/agents/me/orders/*` | 11 | Active | **6033.4** operations center |
| `/agents/me/ledger` | 1 | Active | **Legacy** — prefer wallet/ledger |
| `/agents/me/transactions` | 2 | Active | **Legacy** — prefer orders API |
| `/agents/register`, `/agents/kyc` | 3 | Active | Onboarding |
| `/agents/me/credentials` | 1 | Active | API key status |

### Admin (JWT staff + permissions)
| Prefix | Endpoints | Status |
|--------|-----------|--------|
| `/admin/*` | 51 | Active |
| `/admin/settings/*` | 28 | Active |
| `/admin/finance/*` | 26 | Active |
| `/admin/products/*` | ~15 | Active |
| `/admin/cms/*` | ~25 | Active |
| `/admin/audit` | 4 | Active (System Audit) |
| `/admin/activity` | 4 | Active |
| `/admin/notifications` | 8 | Active |
| `/admin/webhooks` | 11 | Active |
| `/admin/configuration` | 10 | Active |
| `/admin/maintenance` | 4 | Active |
| `/admin/system/health` | 7 | Active |
| `/admin/agents/*` | ~6 | Active |
| `/admin/support/tickets` | ~5 | Active |

### Webhooks (inbound, signature verified)
| Prefix | Method | Status |
|--------|--------|--------|
| `/payments/webhook/:gateway` | POST | Active |
| Agent deposit via payment controller | POST | Active |

---

## Duplicate / Overlapping Endpoints

| Domain | Path A | Path B | Recommendation |
|--------|--------|--------|----------------|
| Agent orders list | `GET /agents/me/platform/orders` | `GET /agents/me/orders` | Use `/orders` (rich) |
| Agent wallet | `GET /agents/me/platform/wallet` | `GET /agents/me/wallet` | Use `/wallet` (rich) |
| Agent ledger | `GET /agents/me/ledger` | `GET /agents/me/wallet/ledger` | Deprecate `/ledger` |
| Agent tx detail | `GET /agents/me/transactions/:id` | `GET /agents/me/orders/:id` | Deprecate transactions |
| Admin audit | `GET /admin/audit-logs` | `GET /admin/audit` | Different systems; rename docs |
| Admin orders | `GET /admin/orders/:id` | `GET /admin/orders/:id/detail` | Complementary |

---

## Unused / Empty Endpoints

| Endpoint | Issue |
|----------|-------|
| `/api/v1/providers/*` | ProviderController registered with **zero handlers** |
| Modules without controllers | activity-event, agent-deposit (service only), email-template, notification (service), rbac, settings |

---

## Deprecated (implicit)

| Endpoint | Replacement |
|----------|-------------|
| `GET /agents/me/platform/orders` | `GET /agents/me/orders` |
| `GET /agents/me/ledger` | `GET /agents/me/wallet/ledger` |
| `GET /agents/me/transactions` | `GET /agents/me/orders` |

Not marked `@Deprecated` in code — documentation gap.

---

## Aggregation APIs (6033.x pattern)

Read-only composition over existing engines — **no engine rewrite**:

| API | Build | Aggregates from |
|-----|-------|-----------------|
| `/agents/me/platform/dashboard` | 6033.0 | orders, wallet, notifications |
| `/agents/me/wallet/*` | 6033.1 | ledger, deposits, balance |
| `/agents/me/finance/*` | 6033.2 | agent deposits, ledger |
| `/agents/me/orders/*` | 6033.4 | Order, ProviderTransaction, OrderEvent, SystemActivityLog |

Admin monitoring modules follow same pattern (read from BullMQ, WebhookLog, SystemActivityLog).

---

## Missing Endpoints (documented/planned)

| Missing | Expected by |
|---------|-------------|
| Partner team CRUD | Partner users page |
| Agent outbound webhook delivery list (real) | 6033.4 |
| Customer portal dedicated API namespace | customer.localhost |
| Promotion API | Marketing |
| Settlement cycle API (partner) | Finance docs |
| iMedia provider admin API | Provider docs |

---

## Broken Endpoints (conditional)

| Condition | Effect |
|-----------|--------|
| API container down | All endpoints 502 via nginx |
| Missing permission seed | Phase 6 admin endpoints 403 |
| Invalid agent JWT | Partner endpoints 401 |

No statically broken routes found in source when API is healthy.

---

## API Security Patterns

| Pattern | Used where |
|---------|------------|
| JwtAuthGuard | Most authenticated routes |
| RolesGuard + @Roles | Admin role restrictions |
| PermissionsGuard + @Permissions | Admin fine-grained |
| AgentApiAuthGuard | `/api/partner/v1` HMAC |
| PlatformMaintenanceGuard | Auth mutations when maintenance |
| ThrottlerGuard | Global 100/min; auth custom limits |

**Gap:** Partner portal routes use JwtAuthGuard only — no AgentPlatformPermission guard.

---

## Endpoint Count by Module

```
admin ............ 86
agent-platform ... 44
finance .......... 26
product .......... 25
cms .............. 40
queue-monitor .... 20
auth ............. 19
agent ............ 12
webhook-monitor .. 11
configuration .... 10
order ............ 9
support .......... 9
notification-center 8
agent-api ........ 3
payment .......... 3
activity-log ..... 4
audit-log ........ 4
maintenance ...... 4
contact .......... 5
health ........... 2
provider ......... 0 (controller empty)
```

---

## Recommendations

1. Document canonical partner API paths; mark legacy deprecated in OpenAPI/internal docs
2. Seed missing admin permissions or align controller codes with seed
3. Implement or remove empty ProviderController
4. Add OpenAPI/Swagger generation (not present in review)
5. Add partner permission guard middleware before multi-user launch
