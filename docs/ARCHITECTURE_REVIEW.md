# CardOn.vn — Architecture Documentation Review

> **Superseded by [ARCHITECTURE_REVIEW_V2.md](./ARCHITECTURE_REVIEW_V2.md)** — all conflicts below have been resolved in documentation.

> Review date: 2026-06-18  
> Scope: All files in `/docs` (00–13) + `.cursor/rules/cardon.mdc`  
> Purpose: Identify missing tables, incomplete flows, and cross-document conflicts before Phase 1 implementation.

---

## Executive Summary

Documentation coverage is **strong** for core architecture principles (layered services, provider/payment abstraction, queue-based fulfillment, ledger, idempotency). The 14 docs form a coherent foundation.

However, **`02_DATABASE_SCHEMA.md` is incomplete** relative to other docs — at least **9 tables** are referenced elsewhere but absent from the central schema. There are **12 notable conflicts** that must be resolved before Prisma implementation to avoid rework.

**Recommendation:** Resolve conflicts in Section 3 and add missing tables to `02_DATABASE_SCHEMA.md` (or a new `02b_SCHEMA_EXTENSIONS.md`) before writing any code.

---

## 1. Schema Coverage Matrix

### 1.1 Tables Defined in `02_DATABASE_SCHEMA.md`

| Table | Status |
|-------|--------|
| `users` | ✅ Defined |
| `agents` | ✅ Defined |
| `products` | ✅ Defined |
| `providers` | ✅ Defined |
| `orders` | ✅ Defined |
| `order_items` | ✅ Defined |
| `payments` | ✅ Defined |
| `ledger_entries` | ✅ Defined |
| `provider_transactions` | ✅ Defined |
| `webhook_logs` | ✅ Defined |

**Total: 10 tables**

### 1.2 Tables Referenced Elsewhere but Missing from `02`

| Table | Referenced In | Priority |
|-------|--------------|----------|
| `invoices` | `10_INVOICE_SYSTEM.md` | **High** — Phase 11 |
| `audit_logs` | `11_ADMIN_PANEL.md` | **High** — compliance, admin actions |
| `reconcile_reports` | `09_RECONCILIATION.md` | **High** — reports "stored for accountant" |
| `reconcile_items` | `09_RECONCILIATION.md` (implied by `ReconcileItem[]`) | **High** |
| `cms_pages` | `13_SEO_CMS.md` | Medium — Phase 12 |
| `cms_seo` | `13_SEO_CMS.md` | Medium |
| `cms_banners` | `13_SEO_CMS.md` | Medium |
| `agent_product_prices` | `07_AGENT_API.md` ("future table") | **High** — agent pricing is core B2B |
| `notifications` | `06`, `11` (notification center, admin alerts) | Medium |
| `agent_webhook_configs` | `07_AGENT_API.md` (callback URL + HMAC secret) | Medium |

### 1.3 Missing Columns on Existing Tables

| Table | Missing Column | Referenced In |
|-------|---------------|---------------|
| `orders` | `channel` or `source` (B2C / AGENT) | Implicit across 06, 07 — currently inferred from `agent_id IS NULL` |
| `orders` | `phone` (topup recipient) | `04`, `05`, `07` topup flows |
| `orders` | `unit_price` / `agent_price` / `sell_price` at time of order | Pricing snapshot for reconciliation & invoice |
| `agents` | `callback_url` | `07_AGENT_API.md` |
| `agents` | `webhook_secret` (encrypted) | `07_AGENT_API.md` HMAC signing |
| `agents` | `rate_limit` | `07`, `12` (per-agent configurable) |
| `agents` | `contact_email` | `10_INVOICE_SYSTEM.md` monthly summary email |
| `providers` | `last_balance_synced_at` | `11_ADMIN_PANEL.md` dashboard |
| `providers` | `last_product_synced_at` | `11_ADMIN_PANEL.md` dashboard |
| `products` | `agent_price` or FK to `agent_product_prices` | `07_AGENT_API.md` |
| `order_items` | `quantity` index within order | Multi-quantity orders unclear |
| `webhook_logs` | `signature_valid` | `12_SECURITY_DEPLOY.md` |
| `webhook_logs` | `ip_address` | `12_SECURITY_DEPLOY.md` |
| `ledger_entries` | `created_by` (admin user ID) | `08`, `11` admin topup audit |

### 1.4 Missing Dedicated Documentation (Phases Without Docs)

| Phase | Topic | Status |
|-------|-------|--------|
| 2 | Auth + RBAC | ❌ No doc file — only scattered in `11`, `12` |
| 3 | Product Engine | ❌ No doc file — referenced in `05`, `07`, `13` but undefined |
| — | B2C Checkout Flow | ❌ No end-to-end doc (order create → pay → fulfill) |
| — | Guest Checkout | ❌ Mentioned in `12` only |
| — | Refund Flow (full) | ⚠️ Partial — B2C in `11`, agent refund undefined |

---

## 2. Missing or Incomplete Flows

### 2.1 Critical (Blocks Implementation)

| Flow | Gap | Affected Docs |
|------|-----|---------------|
| **Agent debit → order creation ordering** | `08` debits using `orderCode` as ledger reference, but `07` says debit BEFORE order exists — **order_code not yet generated at debit time** | `07`, `08` |
| **Multi-quantity buyCard** | `orders.quantity` exists but `order_items` has no quantity field — unclear if 1 row per card or 1 row with quantity | `02`, `06`, `04` |
| **Topup order storage** | Topup needs `phone` on order; `order_items.card_serial/card_pin` not applicable — no topup result fields | `04`, `05`, `02` |
| **Agent failed fulfillment → balance** | Agent debited on order create; if fulfillment permanently fails (`FAILED`), **no documented ledger CREDIT (refund)** flow | `06`, `07`, `08`, `11` |
| **B2C order creation** | No doc for: select product → create order → redirect payment. Only webhook onward is documented | `03`, `06` |

### 2.2 Important (Should Document Before Phase)

| Flow | Gap |
|------|-----|
| Payment expiration | `payment_status = PENDING` orders — timeout/cleanup job undefined |
| Guest checkout | No email/phone capture for receipt delivery and order lookup |
| Agent duplicate request | Idempotency behavior inconsistent (200 vs 409) — see Conflict #6 |
| Provider reassignment + retry | `05` says admin may reassign product to eSale and retry — **no step-by-step flow** |
| Product sync scheduling | `syncProduct()` mentioned but no cron schedule doc (unlike reconciliation jobs in `09`) |
| Provider balance sync scheduling | `getBalance()` cron mentioned but no schedule defined |
| Invoice number sequence | Atomic daily sequence mentioned — no `invoice_sequences` table or locking strategy |
| Agent suspension mid-flight | Agent suspended while orders are PROCESSING — behavior undefined |
| SePay vs MegaPay selection | Checkout gateway selection logic not documented |

### 2.3 Lower Priority (Can Defer)

| Flow | Gap |
|------|-----|
| JWT refresh token rotation | Mentioned in `12`, no flow |
| Password reset | Not documented |
| 2FA for admin | Marked future in `12` |
| CMS FAQ | Content type in `13` but no `cms_faqs` table or API |
| Agent API access logs | Security requirement in `07` — no `agent_api_logs` table |
| Partial refund | Mentioned as future in `08` — no flow |
| Payment `FAILED` → order cleanup | Order stays forever PENDING? |

---

## 3. Cross-Document Conflicts

### CONFLICT-01: Agent API Key Storage Method

| Source | Statement |
|--------|-----------|
| `02_DATABASE_SCHEMA.md` | `agents.api_key_hash` — **Encrypted** |
| `07_AGENT_API.md` | stored **hashed**, never plain text |
| `12_SECURITY_DEPLOY.md` | **bcrypt hash** |

**Resolution needed:** API keys must be **hashed** (bcrypt/argon2), not encrypted. Encryption implies reversibility — unnecessary for API keys. Update `02`.

---

### CONFLICT-02: `agent_request_id` Uniqueness Scope

| Source | Statement |
|--------|-----------|
| `02_DATABASE_SCHEMA.md` | `agent_request_id` VARCHAR **UNIQUE** (global) |
| `07_AGENT_API.md` | UNIQUE **per agent** |
| `cardon.mdc` | UNIQUE (global) |

**Resolution needed:** Uniqueness should be **composite `(agent_id, agent_request_id)`** — two different agents may use the same request ID string. Update `02` index and `cardon.mdc`.

---

### CONFLICT-03: Agent Debit Before Order — Reference Field

| Source | Statement |
|--------|-----------|
| `07_AGENT_API.md` | Debit balance **before** creating order |
| `08_AGENT_BALANCE_LEDGER.md` | Debit uses reference = **`order_code`** (e.g. `CO-20240618-ABC123`) |

**Resolution needed:** Choose one approach:

- **Option A:** Generate `order_code` first (within transaction), then debit, then insert order row.
- **Option B:** Debit with temporary reference (`PENDING-{uuid}`), update ledger reference after order created.

Document chosen approach in `07` and `08`.

---

### CONFLICT-04: Duplicate `agent_request_id` HTTP Response

| Source | Statement |
|--------|-----------|
| `07_AGENT_API.md` (idempotency section) | Return existing order **200** |
| `07_AGENT_API.md` (error table) | **409** `DUPLICATE_REQUEST` |

**Resolution needed:** Standard idempotent APIs return **200 with existing resource**. Remove 409 or reserve 409 for a different scenario. Update `07`.

---

### CONFLICT-05: Payment Gateway Credential Storage

| Source | Statement |
|--------|-----------|
| `03_PAYMENT.md` | Store gateway API credentials **encrypted in database** |
| `12_SECURITY_DEPLOY.md` | `MEGAPAY_API_KEY`, `SEPAY_API_KEY` as **environment variables** |
| `02` + providers table | Provider credentials in DB (encrypted JSON) |

**Resolution needed:** Align with provider pattern — store gateway config in DB (encrypted) **or** env vars consistently. Recommended: DB table `payment_gateways` with encrypted credentials (allows admin config without redeploy), matching `providers` pattern.

---

### CONFLICT-06: `provider_transaction_id` Duplication

| Source | Statement |
|--------|-----------|
| `02_DATABASE_SCHEMA.md` | On both `orders.provider_transaction_id` AND `provider_transactions.provider_transaction_id` |
| `04`, `05` | Source of truth is `provider_transactions` |

**Resolution needed:** Remove from `orders` table — derive via JOIN. Avoids sync issues. One order may have multiple provider attempts (retries) → **1:N relationship** actually needed, not 1:1 on orders.

---

### CONFLICT-07: Provider Retry vs Multiple `provider_transactions`

| Source | Statement |
|--------|-----------|
| `02` | `orders.provider_transaction_id` UNIQUE — implies one provider tx per order |
| `04`, `06` | Admin retry creates **new `request_id`** and new provider call |

**Resolution needed:** One order → many `provider_transactions` (one per attempt). Remove `provider_transaction_id` from `orders`. Document 1:N in `02` and `06`.

---

### CONFLICT-08: Provider Class Naming

| Source | Name |
|--------|------|
| `01`, `04`, `cardon.mdc` | `EsaleProvider` |
| `05` | `IMediaProvider` |

**Resolution needed:** Standardize: `EsaleProvider` + `ImediaProvider` (consistent PascalCase).

---

### CONFLICT-09: `payment_reference` on Both `orders` and `payments`

| Source | Statement |
|--------|-----------|
| `02` | UNIQUE on both tables |
| `03` | UNIQUE across orders and payments |

**Resolution needed:** Single source of truth on `payments.payment_reference`. `orders` links via `payments.order_id`. Agent orders have no payment row — `orders.payment_reference` should be **nullable** and B2C-only, or removed from orders entirely.

---

### CONFLICT-10: Invoice Trigger Timing

| Source | Trigger |
|--------|---------|
| `10_INVOICE_SYSTEM.md` B2C | On `payment_status = PAID` |
| `10_INVOICE_SYSTEM.md` Agent | On `fulfillment_status = COMPLETED` |

**Assessment:** Likely **intentional** (B2C = payment receipt; Agent = delivery statement). Not a bug — but should be explicitly marked as intentional in `10` to avoid confusion during implementation.

---

### CONFLICT-11: STAFF Role Missing from Admin RBAC User Management

| Source | Statement |
|--------|-----------|
| `00_PROJECT_OVERVIEW.md` | STAFF role exists |
| `11_ADMIN_PANEL.md` | User management by ADMIN — STAFF cannot manage users (correct) |
| `11` Orders retry | STAFF **can** retry |

**Assessment:** Consistent. No action needed.

---

### CONFLICT-12: `users.role = AGENT` vs `agents` Table

| Source | Statement |
|--------|-----------|
| `02` | `users.role` includes AGENT enum |
| `07` | Agent authenticates via API key on `agents` table |

**Resolution needed:** Document relationship: Agent user account (role AGENT) ↔ `agents` business entity (balance, API key). Can one user have multiple agent accounts? Define cardinality.

---

## 4. Queue Inventory vs Documentation

Docs mention these queues — no central registry doc exists:

| Queue | Documented In | Documented? |
|-------|--------------|-------------|
| `fulfillment` | `06` | ✅ |
| `fulfillment-retry` | `06` | ✅ |
| `notification` | `06`, `07` | ✅ |
| `invoice` | `10` | ✅ |
| `reconciliation` | `09` | ✅ |
| `product-sync` | implied by `04`, `05` | ❌ Missing |
| `provider-balance-sync` | implied by `04`, `05` | ❌ Missing |

**Recommendation:** Add queue registry section to `01_SYSTEM_ARCHITECTURE.md` or create `14_QUEUE_REGISTRY.md`.

---

## 5. Idempotency Key Summary — Gaps

| Key | Table | Scope | Issue |
|-----|-------|-------|-------|
| `payment_reference` | orders + payments | B2C | Duplicated across tables (CONFLICT-09) |
| `agent_request_id` | orders | Should be per-agent | Global UNIQUE (CONFLICT-02) |
| `request_id` | provider_transactions | Per provider call | ✅ OK |
| `provider_transaction_id` | provider_transactions + orders | Global | Duplicated + 1:N issue (CONFLICT-06, 07) |
| `invoice_number` | invoices | Daily sequence | Table exists in `10` but not `02` |

---

## 6. RBAC Consistency Check

| Action | 08 Permissions | 11 Admin Panel | Match? |
|--------|---------------|----------------|--------|
| Topup agent | ACCOUNTANT+ | ACCOUNTANT+ | ✅ |
| Ledger adjust | SUPER_ADMIN only | SUPER_ADMIN only | ✅ |
| Order retry | not listed in 08 | STAFF+ | ⚠️ 08 silent |
| Reconciliation | not listed in 08 | ACCOUNTANT+ | ⚠️ 08 silent |
| Invoice void | not listed | ADMIN | ⚠️ gap |

**Recommendation:** Create unified RBAC matrix doc or extend `02` with a permissions reference table.

---

## 7. Security Documentation Gaps

| Topic | Status |
|-------|--------|
| Encryption at rest (AES-256-GCM) | ✅ `12` |
| Card PIN encryption | ✅ |
| API key hashing | ⚠️ Conflicts with `02` (CONFLICT-01) |
| Agent webhook HMAC | ✅ `07` — no secret storage schema |
| PCI scope | ❌ Not discussed (card PIN handling may have compliance implications) |
| Key rotation procedure | ❌ Not documented |
| Data deletion / GDPR | ❌ Not documented |

---

## 8. Recommended Actions (Priority Order)

### Before Phase 1 (Database Schema)

1. **Resolve CONFLICT-01** — api_key_hash = bcrypt, not encrypted
2. **Resolve CONFLICT-02** — composite unique `(agent_id, agent_request_id)`
3. **Resolve CONFLICT-03** — agent debit/order creation transaction order
4. **Resolve CONFLICT-06/07** — remove `provider_transaction_id` from orders; document 1:N
5. **Resolve CONFLICT-09** — clarify `payment_reference` ownership
6. **Add missing tables to `02`:** `invoices`, `audit_logs`, `reconcile_reports`, `reconcile_items`, `agent_product_prices`
7. **Add missing columns:** `orders.phone`, `orders.unit_price`, price snapshot fields
8. **Define topup result storage** — extend `order_items` or add `order_topup_results`

### Before Phase 2–3

9. Create **`15_AUTH_RBAC.md`** — login, JWT, guest, role guards
10. Create **`16_PRODUCT_ENGINE.md`** — catalog, pricing, provider binding, sync
11. Create **`17_B2C_CHECKOUT.md`** — end-to-end customer purchase flow
12. Resolve CONFLICT-04 (duplicate agent request HTTP code)
13. Resolve CONFLICT-05 (gateway credential storage)
14. Document agent refund flow on permanent fulfillment failure

### Before Phase 6–8

15. Add queue registry doc
16. Document product/provider sync cron schedules
17. Document payment PENDING expiration policy

---

## 9. Documentation Quality Assessment

| Doc | Completeness | Notes |
|-----|-------------|-------|
| `00_PROJECT_OVERVIEW` | ✅ Good | Missing links to review doc |
| `01_SYSTEM_ARCHITECTURE` | ✅ Good | Needs queue registry |
| `02_DATABASE_SCHEMA` | ⚠️ Incomplete | Central gap — many tables missing |
| `03_PAYMENT` | ✅ Good | Missing B2C order creation upstream |
| `04_PROVIDER_ESALE` | ✅ Good | — |
| `05_PROVIDER_IMEDIA` | ✅ Good | Naming inconsistency |
| `06_ORDER_FULFILLMENT` | ✅ Good | Multi-qty + topup gaps |
| `07_AGENT_API` | ⚠️ Good | Conflicts on idempotency response, debit order |
| `08_AGENT_BALANCE_LEDGER` | ✅ Good | Agent refund on failure missing |
| `09_RECONCILIATION` | ⚠️ Good | Report storage schema missing |
| `10_INVOICE_SYSTEM` | ✅ Good | Trigger timing should note intentional diff |
| `11_ADMIN_PANEL` | ✅ Good | audit_logs table missing from schema |
| `12_SECURITY_DEPLOY` | ⚠️ Good | Conflicts with DB credential storage |
| `13_SEO_CMS` | ✅ Good | FAQ table missing |

**Overall score: 7.5/10** — Architecture principles are solid and consistent. Schema doc lagging behind feature docs is the primary risk.

---

## 10. Architecture Rules Compliance

Verified against `cardon.mdc` and original project rules:

| Rule | Documented? | Consistent? |
|------|------------|-------------|
| Controller → Service → Repository | ✅ All docs | ✅ |
| ProviderInterface abstraction | ✅ | ✅ |
| PaymentInterface abstraction | ✅ | ⚠️ Credential storage conflict |
| payment_status ≠ fulfillment_status | ✅ | ✅ |
| Webhook → Queue → Worker | ✅ | ✅ |
| Timeout → checkTransaction | ✅ | ✅ |
| Ledger required for balance | ✅ | ⚠️ Debit/order ordering issue |
| No auto-refund on provider fail | ✅ | ✅ |
| Encrypt secrets + card PIN | ✅ | ⚠️ API key hash vs encrypt |
| Provider low balance → still sell | ✅ | ✅ |
| Idempotency keys | ✅ | ⚠️ Scope conflicts |
| Development phase order | ✅ | ⚠️ Phases 2–3 lack docs |

---

## Appendix A: Proposed Additional Tables (Not Yet in Any Doc)

For consideration when updating `02_DATABASE_SCHEMA.md`:

```
invoices
invoice_sequences
audit_logs
reconcile_reports
reconcile_items
agent_product_prices
agent_webhook_configs
notifications
cms_pages
cms_seo
cms_banners
cms_faqs                    ← FAQ content type in 13
payment_gateways            ← if resolving CONFLICT-05 via DB
order_fulfillment_events    ← timeline in admin order detail
agent_api_logs              ← security requirement in 07
refresh_tokens              ← auth phase
```

## Appendix B: Entity Relationship Gaps

```
users 1──1 agents              ← cardinality undefined (1:1 assumed)
agents 1──N orders             ← OK
agents 1──N ledger_entries     ← OK
orders 1──N order_items        ← OK for cards, unclear for topup
orders 1──N provider_transactions  ← NOT documented (currently implied 1:1)
orders 1──0..1 payments        ← B2C only; agent orders have no payment row
products N──1 providers        ← OK
products 1──N agent_product_prices ← missing table
orders 1──0..1 invoices        ← B2C receipt
agents 1──N invoices           ← agent statements
```

---

*This review is documentation-only. No code or schema changes were made.*
