# CardOn.vn — Architecture Review V2

> Date: 2026-06-18  
> Status: **All V1 conflicts resolved**  
> Supersedes: `ARCHITECTURE_REVIEW.md`  
> Action taken: Documentation updated across `/docs` and `.cursor/rules/cardon.mdc`. No application code written.

---

## Summary

All 12 architecture decisions from the owner have been applied. Documentation is now internally consistent and ready for Phase 1 (Prisma schema implementation).

| Area | V1 Status | V2 Status |
|------|-----------|-----------|
| Schema completeness | 10 tables | **24 tables** |
| Cross-doc conflicts | 12 conflicts | **0 unresolved** |
| Agent ledger model | Simple DEBIT | **HOLD → DEBIT / RELEASE** |
| Card multi-quantity | Undefined | **order_items + card_records** |
| Topup storage | Missing | **topup_transactions** |
| Provider retries | 1:1 on orders | **1:N provider_transactions** |

---

## Decisions Applied

### DEC-01: API Key Storage ✅

**Decision:** `api_key_hash` = bcrypt hash. Never encrypt for comparison. Show plain key once on generate.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — agents table
- `07_AGENT_API.md`
- `11_ADMIN_PANEL.md`
- `12_SECURITY_DEPLOY.md`
- `cardon.mdc`

**New fields on `agents`:**
- `api_key_hash` (bcrypt)
- `secret_key_encrypted` (AES, webhook HMAC)
- `last_used_at`

---

### DEC-02: Agent Request Idempotency ✅

**Decision:** `UNIQUE(agent_id, agent_request_id)` — per agent, not global.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — composite index
- `07_AGENT_API.md`
- `01_SYSTEM_ARCHITECTURE.md`
- `cardon.mdc`

---

### DEC-03: Ledger Flow ✅

**Decision:** Use `transaction_id`. Flow: Create transaction → ledger HOLD → create order → provider. Reference via `reference_type` + `reference_id`.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — new `transactions` table, updated `ledger_entries`
- `08_AGENT_BALANCE_LEDGER.md` — full rewrite
- `07_AGENT_API.md` — updated order flow
- `01_SYSTEM_ARCHITECTURE.md`
- `cardon.mdc`

**Removed:** Using `order_code` as ledger reference.

---

### DEC-04: Duplicate API Request ✅

**Decision:** HTTP 200 with original result. No 409.

**Applied in:**
- `07_AGENT_API.md` — removed 409 from error table
- `01_SYSTEM_ARCHITECTURE.md`
- `cardon.mdc`

---

### DEC-05: Gateway Credential Storage ✅

**Decision:** Hybrid — production secrets in ENV, dynamic admin config in DB encrypted.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — new `payment_gateways` table
- `03_PAYMENT.md`
- `12_SECURITY_DEPLOY.md`

---

### DEC-06: Provider Transaction ✅

**Decision:** Remove `provider_transaction_id` from orders. Use `provider_transactions` table. Order 1:N ProviderTransactions.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — removed from orders, added `attempt` column
- `04_PROVIDER_ESALE.md`, `05_PROVIDER_IMEDIA.md`
- `06_ORDER_FULFILLMENT.md`
- `01_SYSTEM_ARCHITECTURE.md`

---

### DEC-07: Class Naming ✅

**Decision:** `ESaleProvider`, `IMediaProvider` (PascalCase, consistent).

**Applied in:**
- All provider docs (04, 05)
- `01_SYSTEM_ARCHITECTURE.md`
- `cardon.mdc`

---

### DEC-08: Payment Reference ✅

**Decision:** `payment_reference` only on `payments`. Orders use `payment_id` FK.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — removed from orders, added `payment_id`
- `03_PAYMENT.md`
- `01_SYSTEM_ARCHITECTURE.md`
- `cardon.mdc`

---

### DEC-09: Missing Tables ✅

**Decision:** Add all referenced tables to schema doc.

**Added to `02_DATABASE_SCHEMA.md`:**

| Table | Purpose |
|-------|---------|
| `invoices` | Invoice generation |
| `audit_logs` | Admin action audit |
| `reconcile_reports` | Reconciliation header |
| `reconcile_items` | Reconciliation line items |
| `agent_product_prices` | Agent-specific pricing |
| `agent_webhook_configs` | Agent callback URLs |
| `notifications` | In-app / admin alerts |
| `cms_pages` | CMS content |
| `cms_seo` | SEO metadata |
| `cms_banners` | Promotional banners |
| `payment_gateways` | Hybrid gateway config |
| `transactions` | Pre-order financial intent |

---

### DEC-10: Topup Support ✅

**Decision:** Add `topup_transactions` table.

**Fields:** phone_number, telco, amount, provider_reference, status, result_message.

**Applied in:**
- `02_DATABASE_SCHEMA.md`
- `04_PROVIDER_ESALE.md`, `05_PROVIDER_IMEDIA.md`
- `06_ORDER_FULFILLMENT.md`
- `07_AGENT_API.md`

---

### DEC-11: Multi-Quantity Card Orders ✅

**Decision:** 1 order → order_items (quantity=N) → N card_records.

**Example:** 10 Garena cards = 1 order, 1 order_item (qty=10), 10 card_records.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — restructured order_items, new card_records
- `06_ORDER_FULFILLMENT.md`
- `07_AGENT_API.md`
- `04_PROVIDER_ESALE.md`

**Removed:** card_serial/card_pin from order_items (moved to card_records).

---

### DEC-12: Agent Provider Failure Flow ✅

**Decision:** HOLD on request → DEBIT on success → RELEASE on failure.

**Applied in:**
- `02_DATABASE_SCHEMA.md` — ledger types HOLD/RELEASE, agents.held_balance
- `08_AGENT_BALANCE_LEDGER.md`
- `07_AGENT_API.md`
- `06_ORDER_FULFILLMENT.md`
- `cardon.mdc`

---

## Updated Schema Inventory (24 Tables)

| # | Table | Phase |
|---|-------|-------|
| 1 | users | 1 |
| 2 | agents | 1, 8 |
| 3 | products | 1, 3 |
| 4 | providers | 1, 5 |
| 5 | payment_gateways | 4 |
| 6 | transactions | 1, 8 |
| 7 | orders | 1, 6 |
| 8 | order_items | 1, 6 |
| 9 | card_records | 1, 6 |
| 10 | topup_transactions | 1, 6 |
| 11 | payments | 1, 4 |
| 12 | ledger_entries | 1, 8 |
| 13 | provider_transactions | 1, 5 |
| 14 | webhook_logs | 1, 4 |
| 15 | invoices | 11 |
| 16 | audit_logs | 7 |
| 17 | reconcile_reports | 10 |
| 18 | reconcile_items | 10 |
| 19 | agent_product_prices | 8 |
| 20 | agent_webhook_configs | 8 |
| 21 | notifications | 7 |
| 22 | cms_pages | 12 |
| 23 | cms_seo | 12 |
| 24 | cms_banners | 12 |

---

## Files Modified

| File | Change Level |
|------|-------------|
| `02_DATABASE_SCHEMA.md` | **Major rewrite** |
| `08_AGENT_BALANCE_LEDGER.md` | **Major rewrite** |
| `07_AGENT_API.md` | **Major rewrite** |
| `06_ORDER_FULFILLMENT.md` | **Major rewrite** |
| `03_PAYMENT.md` | Major update |
| `04_PROVIDER_ESALE.md` | Major update |
| `05_PROVIDER_IMEDIA.md` | Major update |
| `01_SYSTEM_ARCHITECTURE.md` | Updated |
| `09_RECONCILIATION.md` | Updated |
| `10_INVOICE_SYSTEM.md` | Updated |
| `11_ADMIN_PANEL.md` | Updated |
| `12_SECURITY_DEPLOY.md` | Updated |
| `00_PROJECT_OVERVIEW.md` | Link added |
| `.cursor/rules/cardon.mdc` | Updated |
| `ARCHITECTURE_REVIEW_V2.md` | **New** |

---

## Remaining Gaps (Updated)

| Gap | Status | Doc |
|-----|--------|-----|
| Auth + RBAC end-to-end | ✅ Documented | `14_AUTH_RBAC.md` |
| Product Engine | ✅ Documented | `15_PRODUCT_ENGINE.md` |
| B2C checkout flow | ✅ Documented | `16_B2C_CHECKOUT_FLOW.md` |
| Guest checkout (email capture) | ✅ In 14 + 16 | |
| Queue registry | ⏳ Open | Phase 6 |
| Payment PENDING expiration | ⏳ Open | Extend `03_PAYMENT.md` |
| CMS FAQ table | ⏳ Open | Phase 12 |
| Merge schema extensions into `02` | ⏳ Before Prisma | See Section below |

---

## Documentation Pass — Phase 2–4 Docs (2026-06-18)

Three architecture documents added. No Prisma code. No conflicts with V2 decisions.

| Doc | Phase | Key Topics |
|-----|-------|------------|
| `14_AUTH_RBAC.md` | 2 | Customer auth, guest claim, agent KYC, admin roles (SUPPORT, MARKETING), granular permissions |
| `15_PRODUCT_ENGINE.md` | 3 | Category → Product → Variant, multi-provider mapping, pricing priority, routing |
| `16_B2C_CHECKOUT_FLOW.md` | 4 | Guest/authenticated checkout, topup, VAT invoice, customer-facing status messages |

### Admin Role Change

| Before (02) | After (14) |
|-------------|------------|
| `STAFF` | `SUPPORT` |
| — | `MARKETING` (new) |

Update `users.role` ENUM in `02` before Prisma implementation.

---

## Planned Schema Extensions (Docs 14–16)

These are documented in each file's **Schema Extensions** section. Merge into `02` before implementing the corresponding phase — they do **not** conflict with DEC-01 through DEC-12.

### From `14_AUTH_RBAC`

| Change | Purpose |
|--------|---------|
| `users.email_verified`, `email_verified_at` | Email verification |
| `users.role`: STAFF → SUPPORT, +MARKETING | Admin roles |
| `orders.guest_email`, `orders.guest_phone` | Guest checkout |
| `agents.kyc_status`, `agents.api_enabled` | Agent KYC gate |
| `password_reset_tokens`, `email_verification_tokens` | Auth tokens |

### From `15_PRODUCT_ENGINE`

| Change | Purpose |
|--------|---------|
| `categories`, `products` (brand), `product_variants` | Catalog hierarchy |
| `product_provider_mappings` | Multi-provider per variant (replaces single `products.provider_id`) |
| `agent_levels`, `agent_level_prices` | Tier pricing |
| `agents.agent_level_id` | Agent tier |
| `agent_product_prices.product_id` → `variant_id` | FK update |
| `order_items.product_id` → `variant_id` | FK update |

### From `16_B2C_CHECKOUT_FLOW`

| Change | Purpose |
|--------|---------|
| `orders.invoice_request` JSONB | VAT invoice at checkout |

### Compatibility Notes

- **V2 ledger (HOLD→DEBIT/RELEASE):** unchanged
- **payment_reference on payments only:** unchanged
- **provider_transactions 1:N:** unchanged; routing picks one provider per attempt via `15`
- **Multi-quantity cards:** unchanged (order_items + card_records)
- **Customer message on provider fail:** "Order processing" — UX rule in `16`, no schema impact

---

## Files Modified (Phase 2–4 Doc Pass)

| File | Change |
|------|--------|
| `14_AUTH_RBAC.md` | **New** |
| `15_PRODUCT_ENGINE.md` | **New** |
| `16_B2C_CHECKOUT_FLOW.md` | **New** |
| `00_PROJECT_OVERVIEW.md` | Links added |
| `11_ADMIN_PANEL.md` | RBAC → 14, roles updated |
| `ARCHITECTURE_REVIEW_V2.md` | This update |

---

## Remaining Gaps (Non-Blocking) — Original List

These were noted in V1 review. Updated status above.

| Gap | Recommended Doc | Phase |
|-----|----------------|-------|
| Queue registry | Section in `01` or `18_QUEUE_REGISTRY.md` | 6 |
| Payment PENDING expiration | Part of payment doc | 4 |
| CMS FAQ table | `cms_faqs` if FAQ becomes structured data | 12 |
| Merge extensions into `02` | Single schema update pass | Before Prisma |

None of these block starting Phase 1 base schema — extensions merge before Phase 2–4 implementation.

---

## V1 → V2 Conflict Resolution Map

| V1 Conflict | Resolution | Decision |
|-------------|-----------|----------|
| CONFLICT-01 API key encrypted vs bcrypt | bcrypt hash | DEC-01 |
| CONFLICT-02 agent_request_id global vs per-agent | per-agent composite | DEC-02 |
| CONFLICT-03 debit before order_code exists | transaction_id first | DEC-03 |
| CONFLICT-04 duplicate 200 vs 409 | always 200 | DEC-04 |
| CONFLICT-05 gateway ENV vs DB | hybrid | DEC-05 |
| CONFLICT-06 provider_transaction_id duplicated | removed from orders | DEC-06 |
| CONFLICT-07 retry 1:N not supported | provider_transactions 1:N | DEC-06 |
| CONFLICT-08 EsaleProvider vs IMediaProvider | ESaleProvider, IMediaProvider | DEC-07 |
| CONFLICT-09 payment_reference on orders | payment_id FK only | DEC-08 |
| CONFLICT-10 invoice trigger timing | intentional; clarified in 10 | N/A |
| CONFLICT-11 STAFF RBAC | STAFF → SUPPORT + MARKETING in 14 | Doc 14 |
| CONFLICT-12 users.role AGENT vs agents | 1:1 documented in 02 | DEC-09 |

---

## Entity Relationship (Final)

```
                    ┌─────────────┐
                    │   users     │
                    └──────┬──────┘
                           │ 1:1
                    ┌──────▼──────┐
                    │   agents    │────── agent_product_prices
                    └──────┬──────┘────── agent_webhook_configs
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼─────┐ ┌───▼────┐ ┌─────▼──────────┐
       │transactions│ │ orders │ │ ledger_entries │
       └──────┬─────┘ └───┬────┘ └────────────────┘
              │           │
              │     ┌─────┼─────────────────┐
              │     │     │                 │
              │  ┌──▼──┐ ┌▼────────┐ ┌─────▼──────────────┐
              │  │pay- │ │order_   │ │provider_transact.  │
              │  │ments│ │items    │ │ (1:N per order)     │
              │  └─────┘ └┬────────┘ └────────────────────┘
              │           │
              │     ┌─────┴──────┐
              │     │            │
              │  card_records  topup_transactions
              │
         (Agent: HOLD→DEBIT/RELEASE via ledger)
         (B2C: payments.payment_reference → webhook)
```

---

## Pre-Phase-1 Checklist

- [x] All 12 owner decisions applied
- [x] Schema doc covers 24 tables
- [x] Agent HOLD/RELEASE flow documented
- [x] Multi-quantity cards documented
- [x] Topup transactions documented
- [x] Provider 1:N retries documented
- [x] Payment reference ownership clarified
- [x] API key storage clarified
- [x] Class naming standardized
- [x] Cursor rules updated
- [x] Auth + RBAC doc (`14_AUTH_RBAC.md`)
- [x] Product Engine doc (`15_PRODUCT_ENGINE.md`)
- [x] B2C checkout doc (`16_B2C_CHECKOUT_FLOW.md`)
- [x] Merge schema extensions from 14–16 into `02` (before Prisma)
- [x] Fix STAFF → SUPPORT/MARKETING doc drift
- [x] Payment expiration + queue registry documented
- [x] FINAL_ARCHITECTURE_CHECK — **FULL PASS**
- [ ] Prisma schema implementation (not started)

---

## Final Architecture Check

See [`FINAL_ARCHITECTURE_CHECK.md`](./FINAL_ARCHITECTURE_CHECK.md) — **Verdict: FULL PASS** (2026-06-18, post-cleanup).

---

## Recommendation

Proceed to **Phase 1: Prisma schema** using `02_DATABASE_SCHEMA.md` as base, then merge extensions from `14`, `15`, `16` before implementing Phases 2–4.

**Phase 1 base tables** (dependency order):

1. users, providers, payment_gateways, products
2. agents, agent_product_prices, agent_webhook_configs
3. transactions, orders, order_items, payments
4. card_records, topup_transactions, provider_transactions
5. ledger_entries, webhook_logs
6. invoices, audit_logs, reconcile_reports, reconcile_items, notifications
7. cms_pages, cms_seo, cms_banners

---

*Documentation-only update. No application code was written.*
