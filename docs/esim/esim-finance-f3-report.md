# F3-B — Báo cáo PayPal Capture & Fee Reconciliation

**Ngày:** 2026-11-07  
**Trạng thái:** Implementation xong trên local-full — **chờ nghiệm thu**. Không mở F4.

## 1. Architecture & data flow

```
Admin /finance/esim → tab PayPal fee
  → POST /admin/finance/esim/paypal/imports (multipart CSV)
  → SHA-256 fileHash (idempotent)
  → parsePaypalActivityCsv (provisional Activity Download headers)
  → classify kind (SALE / REFUND / PAYOUT / …)
  → persist paypal_report_imports + paypal_report_lines
  → buildPaypalFeeMatchDrafts (P1 Capture ID, P2 Custom Number)
  → paypal_fee_matches (1 active / payment)
  → UI queue + export CSV
```

**Không** đụng: Payment.status, Order.paymentStatus, fulfillment, capture/refund API, `paymentFeeAmount`, F1 revenue math, SePay, TDR/SFTP, PayPal live API.

## 2. Migration / schema

Additive migration: `prisma/migrations/20261107180000_esim_finance_f3_paypal_fee_reconcile/`

Tables: `paypal_report_imports`, `paypal_report_lines`, `paypal_fee_matches`  
Partial unique: one active match per `payment_id`.

Applied on Docker Postgres `cardon-local-full-postgres` (manual SQL + `_prisma_migrations` row).  
**Không** deploy production.

## 3. Changed files (chính)

- `prisma/schema.prisma` + migration
- `src/modules/finance/entities/paypal-activity-csv.ts` (+ spec)
- `src/modules/finance/entities/paypal-fee-match.engine.ts`
- `src/modules/finance/services/paypal-fee-reconcile.service.ts` (+ integrity spec)
- `src/modules/finance/controllers/finance.controller.ts`, `finance.module.ts`, dto, audit constants
- `apps/admin/app/finance/esim/page.tsx` (tabs Doanh thu | PayPal fee)
- `apps/admin/components/finance/FinanceEsimPaypalPanel.tsx`, FinanceShell, api-client, types
- Docs: plan, fixtures README, báo cáo này

## 4. API / UI

| API | Perm |
|-----|------|
| `POST /admin/finance/esim/paypal/imports` | manage |
| `GET …/imports`, `GET …/imports/:id` | view |
| `POST …/imports/:id/match` | manage |
| `GET …/matches`, `POST …/matches/:id/resolve` | view / manage |
| `GET …/export` | view |

UI: `/finance/esim` — tab **Doanh thu** (F1) / **PayPal fee** (F3).

## 5. CSV compatibility evidence

| Nguồn | Trạng thái |
|-------|------------|
| KEYON Activity Download thật | **Chưa có** |
| Parser header map | **PROVISIONAL** (PayPal Developer Activity Download docs) |
| Unit fixture | Synthetic CSV trong `paypal-activity-csv.spec.ts` — **không** coi là evidence KEYON |

Import ghi `headerProvisional=true` và note trên UI. Cần KEYON gửi file thật để lock header (F3-B0b follow-up).

## 6. Test results

```
PASS paypal-activity-csv.spec.ts
PASS paypal-fee-reconcile.integrity.spec.ts
PASS esim-finance-revenue.spec.ts
PASS esim-finance-revenue.permission.spec.ts
PASS finance.integrity-audit.spec.ts / finance.service.spec.ts (regression)
```

Covered: valid/invalid CSV, hash, duplicate txn, P1/P2 match, missing, amount mismatch, refund/payout classify, NEEDS_REVIEW on changed amounts, fee≠estimated, F1 permission routes.

## 7. Financial integrity

- Reconcile-only; không mutate Payment/Order/fulfillment.
- Estimated vs actual tách cột.
- Payout → `NON_SALE` / `PAYOUT_OR_BALANCE`.
- Re-import cùng hash → idempotent.
- Conflict gross/fee vs active match → `NEEDS_REVIEW`, không silent overwrite.
- Một active match / payment (DB partial unique + service).

## 8. Screenshots

- `docs/esim/evidence/f3-finance-esim-paypal-tab.png` — tab PayPal fee (upload + KPI match)
- `docs/esim/evidence/f3-finance-esim-revenue-tab.png` — tab Doanh thu F1 vẫn tách estimated / actual UNAVAILABLE

## 9. Known limitations

1. Header map provisional — chờ CSV KEYON.  
2. Manual resolve UI tối giản (API có; panel chưa form gán paymentId).  
3. F1 `gatewayActualFees` vẫn `UNAVAILABLE` (chưa wire optional B4).  
4. Classifier Type/T-code heuristic — tinh chỉnh khi có file thật.  
5. Không production deploy.

## 10. Dừng

Chờ PASS F3-B. **Không** mở F4 / F2-B / F2-I.
