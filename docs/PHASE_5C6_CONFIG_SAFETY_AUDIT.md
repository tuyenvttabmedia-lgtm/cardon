# Phase 5C.6 — Config Safety Audit

**Ngày:** 2026-06-20  
**Trạng thái:** ✅ PASS (audit only — không thêm feature, không đổi business logic)  
**Phạm vi:** Runtime config safety sau Phase 5C.5 Admin System Settings

---

## Executive summary

| Check | Kết quả | Ghi chú |
|-------|---------|---------|
| CHECK 1 — Config cache | ✅ PASS | `persist()` → `reload()` ngay sau upsert |
| CHECK 2 — Secret handling | ✅ PASS | Mask API, không log, audit chỉ tên field |
| CHECK 3 — Encryption recovery | ✅ DOCUMENTED | Mất `ENCRYPTION_KEY` → không decrypt được |
| CHECK 4 — Fallback safety | ✅ PASS | ENV fallback; invalid → throw rõ ràng |
| CHECK 5 — Deploy docs | ✅ UPDATED | `DEPLOY_CHECKLIST.md` |

---

## CHECK 1 — Config cache

### Luồng đã xác minh

```
Admin PUT /admin/settings/*
  → SettingsAdminService.persist()
  → settingsRepository.upsert()
  → settingsStore.reload()        ← cache clear + load DB
  → MegapayConfigService / EsaleConfigService / …
  → resolve*Config() đọc cache mới
```

### Bằng chứng code

- `SettingsAdminService.persist()` gọi `await this.settingsStore.reload()` **ngay sau** `upsert` (không cần restart container).
- `MegapayConfigService.getConfig()` delegate `SettingsStoreService.resolveMegapayConfig()` — luôn đọc cache in-memory hiện tại.
- `SettingsStoreService.reload()` xóa `Map` cache và nạp lại từ DB.

### Tests

| Test | File |
|------|------|
| Admin update → reload → payment dùng giá trị mới | `settings.config-safety.spec.ts` |
| Provider eSale reflect sau reload | `settings.config-safety.spec.ts` |
| persist() upsert trước reload | static audit trong test |

**Kết luận:** ✅ Không cần restart container sau khi Super Admin lưu settings.

---

## CHECK 2 — Secret handling

### API response (backend → frontend)

| Nguồn | Cơ chế |
|-------|--------|
| `getMegapayAdminView()` | `maskSecret()` → `********123` |
| `getSepayAdminView()` | mask `apiKey`, `webhookSecret` |
| `getEsaleAdminView()` | mask `secretKey`; PEM → `***********` |
| `getSmtpAdminView()` | mask `password` |

- JSON admin **không** chứa field `*Enc` (chỉ lưu DB).
- Test xác nhận serialized view không chứa plaintext secret.

### Logging

| Module | Kết quả |
|--------|---------|
| `settings-store.service.ts` | Không logger secret |
| `settings-admin.service.ts` | Không logger secret |
| `megapay.client.ts` | `logSafe()` — chỉ request_id, payment_reference, status |
| `sepay.provider.ts` | `logSafe()` — transaction_id, amount, status |
| `esale.client.ts` | `logSafe()` — endpoint, retCode, transId |

### Audit log

- Action: `SETTING_UPDATED`
- Metadata: `{ settingKey, updatedFields }` — **chỉ tên field**, không ghi giá trị secret

### Frontend

- Form dùng `type="password"` cho secret fields
- Hiển thị mask từ API; gửi lại mask (`********…`) → backend giữ secret cũ (`mergeSecretField`)

**Kết luận:** ✅ PASS

---

## CHECK 3 — Encryption recovery

### Yêu cầu vận hành

| Secret | Hậu quả mất key | Backup |
|--------|-----------------|--------|
| `ENCRYPTION_KEY` | Không decrypt settings DB (`*Enc`), không decrypt card data (CardEncryptionService cùng derivation) | **Bắt buộc** — password manager / vault |
| `JWT_SECRET` | Toàn bộ session/access token invalid | Bắt buộc |
| Provider credentials (MegaPay/SePay/eSale) | Mất nếu chỉ có trong DB đã mã hóa và mất ENCRYPTION_KEY | Backup ENV + ghi chép Admin Settings |

### Hành vi khi key sai

- Decrypt ciphertext với `ENCRYPTION_KEY` khác → **throw** (crypto auth tag fail) — test đã xác minh.
- Không có silent fallback sang plaintext.

### Khuyến nghị

1. Backup `ENCRYPTION_KEY` trước mọi deploy / rotate key.
2. Rotate key cần quy trình re-encrypt (chưa implement — ngoài scope 5C.6).
3. Giữ bản sao ENV production (`MEGAPAY_*`, `SEPAY_*`, `ESALE_*`) độc lập với DB.

**Kết luận:** ✅ DOCUMENTED — không thay đổi code

---

## CHECK 4 — Fallback safety

### DB trống → ENV

| Resolver | Hành vi |
|----------|---------|
| `resolveMegapayConfig()` | Merge: DB override nếu có, else `ConfigService` ENV |
| `resolveSepayConfig()` | Tương tự |
| `resolveEsaleConfig()` | Tương tự |
| `resolveSmtpConfig()` | Host từ ENV nếu DB trống |

- `source: 'environment'` trong admin view khi không có DB row meaningful.

### DB invalid → lỗi rõ ràng

| Tình huống | Hành vi |
|------------|---------|
| DB partial (thiếu secret, ENV cũng thiếu) | `throw new Error('MegaPay is not configured…')` |
| eSale thiếu field bắt buộc | `throw new Error('eSale is not configured…')` |
| `is*Configured()` | `try/catch` → `false` (không nuốt lỗi im lặng ở runtime call site) |
| Admin view khi invalid | `configured: false` |

### Lưu ý vận hành (không FAIL)

- DB có `secretKeyEnc` nhưng `ENCRYPTION_KEY` sai → crypto exception khi resolve (không message thân thiện). **Mitigation:** backup key + giữ ENV fallback cho tới khi sửa DB.

**Kết luận:** ✅ PASS

---

## CHECK 5 — Production operation docs

Đã cập nhật `DEPLOY_CHECKLIST.md`:

- [ ] Backup `JWT_SECRET`
- [ ] Backup `ENCRYPTION_KEY`
- [ ] Backup provider credentials (MegaPay, SePay, eSale)
- [ ] Backup SMTP nếu cấu hình qua Admin
- [ ] Sau deploy: verify settings reload không cần restart

---

## Tests & Build

```text
npm run build                              ✅
npm run build:admin                        ✅
npm test -- --testPathPattern=settings     ✅ 21/21

npm test (full suite)                      ⚠️ 299 tests passed; 3 suites failed to compile (pre-existing / 5C.5 constructor drift):
  - esale.provider.spec.ts — thiếu mock SettingsStoreService
  - agent.service.spec.ts — thiếu mock CardEncryptionService
  - order.service.spec.ts — TS (pre-existing)
```

Settings audit tests **PASS** đầy đủ. Full suite compile failures không thuộc scope sửa 5C.6.

### Phase 5C.6 test coverage

| Nhóm | Tests |
|------|-------|
| Cache reload | payment + provider sau reload, persist order |
| Secret masking | admin view không leak plaintext |
| Audit metadata | chỉ field names |
| No secret logs | static scan settings modules |
| Encryption recovery | wrong key throws |
| ENV fallback | DB absent |
| Invalid config | explicit throw + configured false |

**Files:**

- `src/modules/settings/settings.security.spec.ts` (Phase 5C.5 — 7 tests)
- `src/modules/settings/settings.config-safety.spec.ts` (Phase 5C.6 — 14 tests)

---

## Findings / không đổi code

| # | Mức | Mô tả | Hành động |
|---|-----|-------|-----------|
| F1 | INFO | SMTP `deliver()` vẫn stub — test email xác nhận config, chưa transport thật | Documented 5C.5 |
| F2 | LOW | Sai `ENCRYPTION_KEY` → crypto error generic | Backup key (CHECK 3) |
| F3 | INFO | System thresholds lưu DB; provider health threshold runtime vẫn ưu tiên ENV trừ khi mở rộng sau | Không scope 5C.6 |

**Không có finding FAIL** — không cần hotfix.

---

## Sign-off

Phase 5C.6 hoàn tất ở mức **audit + tests + docs**. Runtime config an toàn cho vận hành production với Admin Settings 5C.5.

**Dừng sau audit** — không deploy production.
