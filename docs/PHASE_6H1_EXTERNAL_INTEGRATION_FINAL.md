# Phase 6H.1 — External Integration Final Verification

**Ngày:** 2026-06-21  
**Phạm vi:** Xác minh tích hợp dịch vụ ngoài thật trước VPS launch. **Không thêm feature.** Không đổi business logic.  
**Stack kiểm tra:** `cardon-prod-*` (production sim local)  
**Verdict tổng thể:** **BLOCKED** — thiếu credentials external thật; 2 gap implementation (SMTP transport, Wasabi S3) chưa sẵn sàng deliver thật.

---

## Executive summary

| Task | Kết quả | Blocker |
|------|---------|---------|
| 1 — eSale real sandbox | ❌ BLOCKED | Credentials giả; URL `partner-esale.example.com`; catalog thiếu Garena/Viettel |
| 2 — SMTP real (Brevo/Zoho) | ❌ BLOCKED | `SmtpEmailProvider.deliver()` là **stub rỗng** — không gửi SMTP thật |
| 3 — Wasabi S3 media | ❌ BLOCKED | Chỉ có `saveLocal()`; không có `@aws-sdk`; chưa config Wasabi |
| 4 — MegaPay sandbox merchant | ⚠️ PARTIAL | Logic callback/duplicate/amount qua jest; live merchant endpoint giả |
| 5 — Final smoke | ⚠️ PARTIAL | Partner API + admin dashboard OK; register/eSale buy card chưa E2E thật |

**Khuyến nghị:** Hoàn tất checklist VPS (cuối doc) với credentials thật **trước** mở traffic production.

---

## Điều kiện tiên quyết (chưa đáp ứng trên local)

| Dịch vụ | Trạng thái env hiện tại | Cần trên VPS |
|---------|-------------------------|--------------|
| eSale sandbox | `ESALE_*` placeholder + PEM invalid | Credentials từ eSale (`partner3sb-esale.zing.vn`) |
| SMTP | `smtp.local-sim.invalid` | Brevo hoặc Zoho SMTP host/user/pass |
| Wasabi | Không có env S3 | Bucket + access key + endpoint |
| MegaPay | `sandbox.megapay.example.com` | Merchant sandbox ID + secret + webhook secret |

Sandbox URL eSale (theo docs): `https://partner3sb-esale.zing.vn/esale/cardshop/`

---

## TASK 1 — eSale Real Sandbox

### Cấu hình

Admin Settings → Provider eSale (`PUT /api/v1/admin/settings/provider/esale`) + `POST /admin/settings/reload`.

Env hiện tại (`configured=true`, `source=environment`):

```
ESALE_API_URL_CARD=https://partner-esale.example.com/esale/cardshop/   ← không resolve
ESALE_PRIVATE_KEY=INVALID PEM
```

### API probe (2026-06-21)

| Endpoint | Kết quả |
|----------|---------|
| `POST /admin/settings/provider/esale/test-connection` | ❌ `INTERNAL_ERROR` |
| `POST /admin/settings/provider/esale/check-balance` | ❌ `INTERNAL_ERROR` |
| `GET /admin/settings/provider/esale` | ✅ configured flag true |

### Catalog production sim

| SKU | Có trong DB |
|-----|-------------|
| GARENA-100K | ❌ |
| VIETTEL-100K | ❌ |
| SMOKE-ZING-100K | ✅ (smoke data only) |

> Garena/Viettel có trong `seed-local-full.ts` (stack staging), **không** có trong `create-smoke-data.ts` (prod sim).

### Test cases yêu cầu (chưa chạy được)

| Case | qty | Trạng thái |
|------|-----|------------|
| Garena CARD | 1 | ❌ BLOCKED |
| Garena CARD | 10 | ❌ BLOCKED |
| Viettel CARD | 1 | ❌ BLOCKED |
| Viettel CARD | 10 | ❌ BLOCKED |

### Verify checklist (reference Phase 6H)

| Artifact | Phase 6H (sim) | 6H.1 (real) |
|----------|----------------|-------------|
| `provider_transactions` | ✅ row FAILED | ❌ cần SUCCESS |
| `provider_transaction_date` | ✅ persisted | ❌ cần live txn |
| `card_records` encrypted PIN | ❌ | ❌ |
| Order `COMPLETED` | ❌ `WAITING_ADMIN_RETRY` | ❌ |
| Worker restart + `checkTransaction` | Health OK; unit test ✅ | ❌ live chưa test |

**Verdict:** ❌ **BLOCKED** — cần credentials eSale sandbox + seed catalog Garena/Viettel trên VPS staging.

### VPS procedure (owner)

```text
1. Admin → Settings → eSale: nhập agencyCode, clientCode, secretKey, PEM keys
2. cardApiUrl = https://partner3sb-esale.zing.vn/esale/cardshop/
3. topupApiUrl = https://partner3sb-esale.zing.vn/esale/mobiletopup/
4. POST test-connection → ok: true
5. Seed/ensure variants GARENA-100K, VIETTEL-100K + provider mappings
6. Guest order → SePay/MegaPay → verify COMPLETED + card PIN
7. Restart worker giữa lúc PROCESSING → verify checkTransaction recovery
```

---

## TASK 2 — SMTP Real

### Cấu hình

Admin Settings → SMTP (`PUT /admin/settings/smtp`) hoặc ENV `SMTP_HOST/USER/PASS`.

### Gap implementation (critical)

`SmtpEmailProvider.deliver()` hiện **không gọi transport thật**:

```typescript
// src/modules/notification/providers/smtp-email.provider.ts
protected async deliver(params: SendEmailParams): Promise<void> {
  void from;
  void params;  // ← stub: không nodemailer / không TCP
}
```

API `POST /admin/settings/smtp/test` trả `ok: true, messageId: smtp-*` nhưng **không deliver email thật**.

### Test cases yêu cầu

| Flow | Trạng thái |
|------|------------|
| Register verification email | ❌ BLOCKED (stub + validation register cần username/phone/terms) |
| Forgot password | ⚠️ API OK (`200` message) — email không gửi thật |
| Card delivery | ❌ BLOCKED |
| `notification_queue` retry | ✅ Unit test PASS (`notification.service.spec.ts`) |
| Email content templates | ✅ Unit render PASS |

### VPS procedure

```text
1. Implement nodemailer (hoặc Brevo API) trong deliver() — phase riêng trước go-live
2. Admin → SMTP: Brevo smtp-relay.brevo.com:587 hoặc Zoho smtp.zoho.com
3. POST /admin/settings/smtp/test → verify inbox
4. Register user mới → verify email
5. Forgot password → verify reset link
6. Order COMPLETED → verify CARD_DELIVERY template
7. Redis: bull:notification_queue failed → retry → completed
```

**Verdict:** ❌ **BLOCKED** — transport SMTP chưa wired; cần implement `deliver()` + credentials thật.

---

## TASK 3 — Media Production Storage (Wasabi)

### Hiện trạng code

| Component | Implementation |
|-----------|----------------|
| `CmsMediaStorageService` | Chỉ `saveLocal()` → `uploads/cms/` |
| `StoredMediaFile.storage` | Type `'local' \| 's3'` — **s3 chưa implement** |
| `package.json` | Không có `@aws-sdk/client-s3` |
| Docker compose | **Không mount** volume `uploads/` |

### Test cases yêu cầu

| Upload | Trạng thái |
|--------|------------|
| Logo | ❌ BLOCKED |
| Favicon | ❌ BLOCKED |
| Banner | ❌ BLOCKED |
| Blog image | ❌ BLOCKED |
| Persist sau container restart | ❌ BLOCKED (local ephemeral) |

### Wasabi switch plan (VPS)

```text
1. Thêm env: CMS_STORAGE=s3, S3_ENDPOINT=https://s3.wasabisys.com,
   S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION
2. Implement saveS3() + wire CmsMediaService.upload()
3. Public URL: CDN hoặc presigned Wasabi URL
4. Short-term fallback: named volume cardon_uploads:/app/uploads
5. Upload logo/banner/blog → docker restart api → verify URL still works
```

**Verdict:** ❌ **BLOCKED** — Wasabi adapter chưa có; verification không thể hoàn tất trên stack hiện tại.

---

## TASK 4 — MegaPay Sandbox Merchant

### Registry production

`PaymentProviderRegistry` dùng **MegaPayProvider thật** (không mock) + **SePayProvider thật**.

Env sim: `MEGAPAY_ENDPOINT=https://sandbox.megapay.example.com` — không reachable.

### Live probe

| Test | Kết quả |
|------|---------|
| `POST /payments` gateway MEGAPAY | ❌ HTTP fail / unreachable (endpoint giả) |
| SePay (reference) | ✅ PASS từ Phase 6H |

### Jest verification (logic đầy đủ)

| Case | Suite | Kết quả |
|------|-------|---------|
| Payment create | `payment.final-audit.spec.ts` | ✅ |
| Callback signature verify | `payment.final-audit.spec.ts` | ✅ |
| Duplicate callback idempotent | `payment.final-audit.spec.ts` | ✅ |
| Wrong amount rejected | `payment.final-audit.spec.ts` | ✅ |
| Admin payment trace | Live Phase 6H | ✅ |

**Verdict:** ⚠️ **PARTIAL** — business logic verified in tests; **live MegaPay sandbox BLOCKED** until merchant credentials on VPS.

### VPS procedure

```text
1. Admin → MegaPay: merchantId, secretKey, endpoint, webhookSecret
2. Create payment → redirect paymentUrl
3. Complete sandbox checkout → callback POST /api/v1/payments/webhooks/megapay
4. Replay callback → duplicate: true
5. Callback wrong amount → rejected
6. Admin → Payments → trace timeline
```

---

## TASK 5 — Final Smoke

### Customer

| Step | Kết quả |
|------|---------|
| Register | ❌ Validation requires username, phone, confirmPassword, acceptTerms |
| Buy card + pay + PIN | ❌ eSale BLOCKED (order → WAITING_ADMIN_RETRY) |
| Forgot password API | ✅ `200` generic message |

### Admin

| Step | Kết quả |
|------|---------|
| Dashboard metrics | ✅ PASS |
| Search/view order | ⚠️ API auth intermittent in probe — manual UI verify on VPS |
| View payment | ✅ PASS |
| View provider | ✅ ESALE listed |
| Fraud / client trace | ⚠️ Field `clientTrace` on order detail mapper — verify on order with trace data |

### Partner

| Step | Kết quả |
|------|---------|
| `POST /api/partner/v1/cards/buy` | ✅ HTTP 201 |
| Transaction settle | ⚠️ Depends on eSale fulfillment (BLOCKED) |

**Verdict:** ⚠️ **PARTIAL** — API plumbing OK; end-to-end customer PIN delivery blocked by eSale.

---

## Automated test baseline (unchanged)

```text
jest payment.final-audit + payment.audit + notification + provider + cms  → 58/58 PASS
jest full suite                                                           → 369/369 PASS
docker compose build web partner admin                                    → PASS
```

---

## Implementation gaps blocking external verification

| # | Gap | Impact | Action |
|---|-----|--------|--------|
| 1 | `SmtpEmailProvider.deliver()` stub | No real email | Wire nodemailer/Brevo before TASK 2 |
| 2 | No S3/Wasabi in CMS storage | Media lost on restart | Implement `saveS3()` or volume mount |
| 3 | Prod sim catalog missing Garena/Viettel | Cannot run TASK 1 cases | Seed on VPS staging |
| 4 | All external credentials placeholder | All live calls fail | Owner provides secrets |

---

## VPS launch checklist (complete 6H.1)

```text
[ ] eSale sandbox credentials in Admin Settings
[ ] POST test-connection → ok: true
[ ] GARENA-100K qty=1, qty=10 → COMPLETED + card_records
[ ] VIETTEL-100K qty=1, qty=10 → COMPLETED + card_records
[ ] Worker restart mid-PROCESSING → checkTransaction recovery
[ ] SMTP deliver() implemented + Brevo/Zoho configured
[ ] Register / forgot / card delivery emails received
[ ] notification_queue retry observed on transient failure
[ ] Wasabi S3 OR uploads volume — media survives restart
[ ] MegaPay sandbox merchant — create + callback + duplicate + wrong amount
[ ] Full smoke: customer register → buy → PIN → admin trace → partner API
```

---

## Kết luận

Phase 6H.1 **không thể PASS** trên môi trường local hiện tại vì:

1. Không có credentials eSale / MegaPay / SMTP / Wasabi thật  
2. SMTP và Wasabi **chưa có implementation deliver/storage thật**  
3. Catalog prod sim thiếu Garena/Viettel  

**Payment webhook logic (SePay + MegaPay jest) và Partner API signature** đã verified. **Pipeline fulfillment + settings runtime** đã verified ở Phase 6H.

**Next step:** Deploy VPS staging → nhập credentials thật → chạy checklist trên → cập nhật doc này với kết quả PASS/FAIL từng dòng.

**Không deploy production traffic** cho đến khi checklist VPS hoàn tất.
