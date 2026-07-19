# CardOn.vn — Phase 6C: Launch Assets Preparation Report

**Ngày:** 2026-06-19  
**Phạm vi:** Chuẩn bị nội dung, checklist, template go-live — **không deploy**, **không đổi backend logic**, **không import production data**  
**Verdict:** **PASS** — đủ bộ tài liệu launch để team ops/legal/marketing triển khai trước VPS cutover

**Tiền đề:** Phase 6B.1 E2E Smoke Test PASS

---

## Executive summary

| Task | Deliverable | Trạng thái |
|------|-------------|------------|
| 1 — Production checklist | `launch/PRODUCTION_CHECKLIST.md` | **PASS** |
| 2 — Legal CMS content | `launch/cms/pages.json` + README | **PASS** (DRAFT — cần luật sư) |
| 3 — SEO basics | `launch/seo/*` | **PASS** |
| 4 — Catalog import template | `launch/catalog/*` | **PASS** (template only) |
| 5 — Operation SOP | `launch/operations/*` (5 docs) | **PASS** |
| 6 — Security checklist | `launch/security/*` (3 docs) | **PASS** |

---

## TASK 1 — Production checklist

**File:** [`launch/PRODUCTION_CHECKLIST.md`](../launch/PRODUCTION_CHECKLIST.md)

Bao gồm checklist chi tiết:

| Nhóm | Nội dung |
|------|----------|
| MegaPay production | Merchant ID, secrets, webhook, callback URLs |
| SePay production | API key, bank account, webhook, transfer content |
| eSale production | Agency keys, PEM, mock disabled, sync products |
| SMTP | Host, SPF/DKIM/DMARC, alert email |
| DNS | A/CNAME apex + partner + admin, MX/TXT |
| Cloudflare | Full strict, origin cert, WAF, cache rules |
| Go/No-Go gates | Payment + fulfillment + legal + ops |

---

## TASK 2 — Legal pages (CMS)

**Files:**

- [`launch/cms/README.md`](../launch/cms/README.md) — hướng dẫn publish qua Admin
- [`launch/cms/pages.json`](../launch/cms/pages.json) — 4 trang DRAFT

| Slug | Tiêu đề | Status |
|------|---------|--------|
| `terms-of-service` | Điều khoản sử dụng | DRAFT |
| `privacy-policy` | Chính sách bảo mật | DRAFT |
| `refund-policy` | Chính sách hoàn tiền | DRAFT |
| `agent-agreement` | Thỏa thuận đại lý | DRAFT |

Mỗi entry có block `seo` (meta + OpenGraph + canonical).

**Placeholder cần thay:** `[TÊN CÔNG TY]`, `[MST]`, `[ĐỊA CHỈ]`, `[EMAIL]`, `[HOTLINE]`

**Không import DB** — copy thủ công hoặc script nội bộ sau legal sign-off.

---

## TASK 3 — SEO basics

| Asset | Path | Ghi chú |
|-------|------|---------|
| robots.txt | `launch/seo/robots.txt` | Disallow checkout/login/order; sitemap URL |
| sitemap.xml | `launch/seo/sitemap.xml` | Static starter; bổ sung `/product/*` sau catalog |
| Site metadata | `launch/seo/site-metadata.json` | Map Next.js + JSON-LD Organization |
| OpenGraph | `launch/seo/opengraph/` | README specs + `og-default.svg` wireframe |

**Deploy:** copy `robots.txt` / `sitemap.xml` → `apps/web/public/` hoặc nginx static khi go-live.

**Metadata hiện có trong code:** `apps/web/lib/seo.ts` — align với `site-metadata.json`.

---

## TASK 4 — Default product catalog (template)

| File | Mục đích |
|------|----------|
| [`launch/catalog/README.md`](../launch/catalog/README.md) | Schema + quy trình import Admin |
| [`launch/catalog/catalog-import-template.csv`](../launch/catalog/catalog-import-template.csv) | 2 category, 2 product, 3 variant, 3 mapping **mẫu** |

**Không import production** — giá/cost trong CSV là ví dụ cấu trúc; verify với eSale trước khi bật bán.

---

## TASK 5 — Operation SOP

| SOP | File |
|-----|------|
| Order issue handling | [`launch/operations/ORDER_ISSUE_HANDLING.md`](../launch/operations/ORDER_ISSUE_HANDLING.md) |
| Payment manual review | [`launch/operations/PAYMENT_MANUAL_REVIEW.md`](../launch/operations/PAYMENT_MANUAL_REVIEW.md) |
| Provider retry | [`launch/operations/PROVIDER_RETRY.md`](../launch/operations/PROVIDER_RETRY.md) |
| Agent support | [`launch/operations/AGENT_SUPPORT.md`](../launch/operations/AGENT_SUPPORT.md) |
| Reconciliation daily | [`launch/operations/RECONCILIATION_DAILY.md`](../launch/operations/RECONCILIATION_DAILY.md) |

Align với Admin permissions và finance module hiện có (`docs/09_RECONCILIATION.md`).

---

## TASK 6 — Security checklist

| Policy | File |
|--------|------|
| Admin account policy | [`launch/security/ADMIN_ACCOUNT_POLICY.md`](../launch/security/ADMIN_ACCOUNT_POLICY.md) |
| Password policy | [`launch/security/PASSWORD_POLICY.md`](../launch/security/PASSWORD_POLICY.md) |
| API key rotation | [`launch/security/API_KEY_ROTATION.md`](../launch/security/API_KEY_ROTATION.md) |

Bổ sung cho `docs/12_SECURITY_DEPLOY.md` — tập trung quy trình vận hành con người.

---

## Cấu trúc thư mục `launch/`

```
launch/
├── PRODUCTION_CHECKLIST.md
├── cms/
│   ├── README.md
│   └── pages.json
├── seo/
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── site-metadata.json
│   └── opengraph/
│       ├── README.md
│       └── og-default.svg
├── catalog/
│   ├── README.md
│   └── catalog-import-template.csv
├── operations/
│   └── (5 SOP files)
└── security/
    └── (3 policy files)
```

---

## Việc còn lại trước go-live (ngoài Phase 6C)

| # | Việc | Owner |
|---|------|-------|
| 1 | Legal review & publish CMS pages | Legal |
| 2 | Design export OG PNG 1200×630 | Marketing |
| 3 | Điền production secrets + checklist §1–6 | Ops |
| 4 | Import catalog thật sau verify eSale cost | Product/Ops |
| 5 | VPS deploy (Phase tiếp theo) | Dev/Ops |
| 6 | Footer web: link Terms/Privacy/Refund | Frontend (post-launch) |

---

## Ràng buộc đã tuân thủ

- Không thay đổi backend / business logic
- Không thêm feature code
- Không deploy VPS
- Không import dữ liệu production vào DB

---

*Phase 6C hoàn tất — dừng tại tài liệu. Bước tiếp theo: triển khai VPS + cutover theo `launch/PRODUCTION_CHECKLIST.md`.*
