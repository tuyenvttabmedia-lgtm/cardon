# CardOn — Master Roadmap (EPIC-based)

**Review date:** 2026-06-18 | **Not grouped by build numbers**

---

## Completion Overview by EPIC

| EPIC | Name | Est. % | Status |
|------|------|--------|--------|
| **A** | Foundation & Infrastructure | 85% | Stable |
| **B** | Admin Platform | 85% | Mature |
| **C** | Customer Platform | 45% | Split (legacy vs stub) |
| **D** | Partner Platform | 70% | Active development |
| **E** | Commerce Engine (Order/Payment/Product) | 85% | Core complete |
| **F** | Finance Engine (Ledger/Deposit/Settlement) | 65% | Agent deposits done |
| **G** | Marketing & CMS | 80% | Strong |
| **H** | Promotion & Campaigns | 15% | Minimal |
| **I** | Reports & Analytics | 50% | Admin strong; partner partial |
| **J** | AI & Automation | 0% | Not started |

**Recommended next EPIC:** **Platform Hardening** (cross-cutting, precedes H/J)

---

## EPIC A — Foundation & Infrastructure

**Goal:** Reliable deploy, auth, database, queue, observability baseline.

| Item | Status | % |
|------|--------|---|
| PostgreSQL + Prisma (56 models) | Done | 95% |
| Redis + BullMQ (6 queues, 3 workers) | Partial | 70% |
| Docker local-full stack | Done | 85% |
| NestJS modular architecture (27 modules) | Done | 90% |
| BuildInfo unified package | Done | 100% |
| Worker heartbeat + health | Done | 80% |
| Deploy runbook / env-file enforcement | Missing | 40% |
| CI/CD production pipeline | Unknown | — |

**Next:** Document mandatory `--env-file`; add email/reconciliation workers or remove dead queues.

---

## EPIC B — Admin Platform

**Goal:** Full operational control for staff roles.

| Item | Status | % |
|------|--------|---|
| Dashboard + orders + products | Done | 90% |
| Provider runtime + health | Done | 85% |
| Finance + reconciliation views | Done | 80% |
| Monitoring suite (activity, queue, webhook, notifications) | Done | 85% |
| Configuration + maintenance centers | Done | 80% |
| CMS / marketing (12 sub-modules) | Done | 85% |
| RBAC permission matrix | Partial | 75% |
| Staff/agents nav discoverability | Partial | 60% |

**Next:** Permission seed sync; nav cleanup; settings/configuration dedup.

---

## EPIC C — Customer Platform

**Goal:** Unified logged-in customer experience.

| Item | Status | % |
|------|--------|---|
| Public storefront (browse, checkout) | Done | 85% |
| Legacy account (`/tai-khoan`, `/account`) | Done | 75% |
| New customer portal `(customer)/*` | Stub | 5% |
| customer.localhost host routing | Done | 90% |
| Order lookup (guest + logged-in) | Done | 80% |
| PIN security / view audit | Done | 85% |
| Customer notifications in new portal | Missing | 0% |

**Next:** Implement `(customer)/*` pages using existing account APIs OR deprecate stub routes and document legacy as canonical.

---

## EPIC D — Partner Platform

**Goal:** B2B API-first operations center for agents.

| Item | Status | % |
|------|--------|---|
| API gateway (HMAC, idempotent buy) | Done | 90% |
| Wallet + ledger portal | Done | 80% |
| Finance deposits (gateway) | Done | 85% |
| Order operations center (6033.4) | Partial | 70% |
| API docs + test console | Partial | 65% |
| Webhook config | Partial | 50% |
| Webhook delivery monitor | Partial | 40% |
| Settlement / withdraw / credit | Partial | 35% |
| Multi-user RBAC | Missing | 10% |
| Enterprise modules (hidden) | Stub | 25% |

**Next:** Backend RBAC; webhook delivery table; settlement/withdraw completion.

---

## EPIC E — Commerce Engine

**Goal:** Product catalog → payment → fulfillment → delivery.

| Item | Status | % |
|------|--------|---|
| Product engine (variants, pricing) | Done | 90% |
| B2C checkout + guest orders | Done | 85% |
| Payment strategy (MegaPay + SePay) | Done | 85% |
| Payment webhooks + expiration | Done | 85% |
| Agent wallet payment (no gateway) | Done | 90% |
| Provider eSale card + topup | Done | 85% |
| Fulfillment retry + idempotency | Done | 90% |
| Order events + admin recovery | Done | 85% |
| Additional payment gateways | Missing | 0% |
| iMedia provider | Missing | 0% |

**Next:** No engine rewrite needed; extend gateways only when business requires.

---

## EPIC F — Finance Engine

**Goal:** Ledger integrity, deposits, settlement, reconciliation.

| Item | Status | % |
|------|--------|---|
| Agent ledger HOLD/COMMIT/RELEASE | Done | 90% |
| Agent gateway deposit + webhook credit | Done | 85% |
| Admin finance + reconcile reports | Done | 75% |
| Payment gateway invoices | Partial | 60% |
| Agent settlement cycles | Missing | 20% |
| Agent withdraw processing | Missing | 15% |
| Credit limit enforcement UI | Partial | 40% |
| Append-only ledger schema alignment | Partial | 70% |

**Next:** Settlement engine; withdraw workflow; partner finance completion.

---

## EPIC G — Marketing & CMS

| Item | Status | % |
|------|--------|---|
| CMS pages, articles, FAQ, media | Done | 85% |
| SEO metadata admin | Done | 80% |
| Banners + appearance | Done | 75% |
| Email templates admin | Partial | 60% |
| Public blog/news UX | Done | 80% |
| Contact form | Done | 90% |

**Next:** Email template delivery pipeline; promotion integration.

---

## EPIC H — Promotion & Campaigns

| Item | Status | % |
|------|--------|---|
| `/khuyen-mai` public page | Partial | 30% |
| Promotion rules engine | Missing | 0% |
| Coupon/discount at checkout | Partial | 40% |
| Agent discount tiers | Stub | 20% |

**Next:** Define promotion schema and engine before UI expansion.

---

## EPIC I — Reports & Analytics

| Item | Status | % |
|------|--------|---|
| Admin finance dashboards | Done | 80% |
| Admin operations health | Done | 75% |
| Partner dashboard stats | Partial | 60% |
| Partner order reports (6033.4) | Partial | 55% |
| Export (CSV/Excel/PDF/JSON) | Partial | 50% |
| Real-time analytics | Missing | 10% |

**Next:** Partner report depth; background export to storage.

---

## EPIC J — AI & Automation

| Item | Status | % |
|------|--------|---|
| All AI features | Not started | 0% |

**Next:** Out of scope until platform hardening complete.

---

## Recommended Sequence (Post-Review)

```
1. Platform Hardening (P0)
   ├── Permission seed sync
   ├── Docker runbook
   ├── Partner RBAC backend
   └── Dual-system consolidation (audit/notification)

2. EPIC C — Customer Platform unification

3. EPIC D — Partner completion (webhook, settlement, teams)

4. EPIC F — Finance settlement/withdraw

5. EPIC H — Promotion engine

6. EPIC J — AI (when prioritized)
```

**Estimated time to 90% platform completeness:** 3–4 EPIC cycles after hardening.
