# FAQ Migration Plan

> **Trạng thái:** Thiết kế — chưa triển khai  
> **Ngày:** 2026-07-09  
> **Nguồn:** `system_settings.key = 'cms.faq.items'` (JSON)  
> **Đích:** `faq_categories`, `faqs`, `faq_positions`

---

## 1. Tổng quan

CardOn **chưa go-live** → migration one-shot, không cần dual-write lâu dài.

| Mục tiêu | Cách đạt |
|----------|----------|
| Không mất dữ liệu | Backup JSON + verify count |
| An toàn | Transaction + validation script |
| Rollback | Restore JSON + revert migration |
| Backward compat | Alias API 1 sprint (optional) |

---

## 2. Dữ liệu nguồn (JSON hiện tại)

```typescript
interface CmsFaqItem {
  id: string;           // UUID — có thể giữ làm faqs.id
  question: string;
  answer: string;       // plain text hiện tại
  category: string;     // 'homepage' | 'contact' | 'guide' | 'general'
  sortOrder: number;
  status?: 'ACTIVE' | 'INACTIVE';
}
```

**Storage:** `system_settings` row `cms.faq.items` → JSON array

---

## 3. Mapping rules

### 3.1 Category mapping (JSON `category` → DB)

JSON `category` hiện là **placement**, không phải topic category. Cần tách:

| JSON `category` | → `faq_positions` | → `faqs.featured` | → `faqs.category_id` |
|-----------------|-------------------|-------------------|----------------------|
| `homepage` | *(none)* | `true` nếu sortOrder top 10 | Default: "Chung" |
| `general` | *(none)* | `true` (merge homepage) | Default: "Chung" |
| `guide` | `guide` | `false` | Default: "Chung" |
| `contact` | `contact` | `false` | Default: "Chung" |

**Topic categories mới (seed):**

| name | slug | sort_order |
|------|------|------------|
| Chung | `chung` | 0 |
| Thanh toán | `thanh-toan` | 1 |
| Mua thẻ | `mua-the` | 2 |
| Nạp cước | `nap-cuoc` | 3 |
| Data 4G/5G | `data-4g-5g` | 4 |
| Hoàn tiền | `hoan-tien` | 5 |
| Tài khoản | `tai-khoan` | 6 |

Migration gán tất cả FAQ cũ → category **"Chung"** (`chung`). Admin tự phân loại lại sau.

### 3.2 Featured logic

- Items `homepage` + `general`: `featured = true`
- Nếu > 10 items: featured=true cho 10 item `sortOrder` thấp nhất; còn lại `featured=false` nhưng vẫn ACTIVE

### 3.3 Status mapping

| JSON status | DB status |
|-------------|-----------|
| `ACTIVE` hoặc omitted | `ACTIVE` |
| `INACTIVE` | `INACTIVE` |

### 3.4 Slug generation

- Auto từ `question` qua `slugifyVi`
- Collision: append `-2`, `-3`, …
- Validate unique trước insert

### 3.5 Answer format

- Plain text cũ → wrap `<p>{text}</p>` (escape HTML entities)
- Đã có HTML → sanitize qua FAQ subset

### 3.6 ID preservation

- **Giữ UUID cũ** làm `faqs.id` nếu valid UUID → giữ reference ổn định
- Invalid/missing → generate new UUID

---

## 4. Migration steps

### Phase A — Preparation

```bash
# 1. Backup DB
pg_dump $DATABASE_URL > backup_pre_faq_migration_YYYYMMDD.sql

# 2. Export JSON snapshot
psql -c "SELECT value FROM system_settings WHERE key = 'cms.faq.items'" \
  > faq_json_backup_YYYYMMDD.json
```

### Phase B — Schema migration

```bash
# Prisma migration tạo 3 bảng mới
npx prisma migrate dev --name faq_database_migration
```

Tables: `faq_categories`, `faqs`, `faq_positions`

### Phase C — Data migration script

**File đề xuất:** `prisma/scripts/migrate-faq-json-to-db.ts`

```
1. BEGIN TRANSACTION
2. Seed faq_categories (7 default categories)
3. Read JSON from system_settings
4. For each item:
   a. Validate question/answer non-empty
   b. Map category → positions + featured
   c. Generate slug
   d. INSERT faqs
   e. INSERT faq_positions (if applicable)
5. Verify counts match
6. Write migration audit log (counts, skipped, errors)
7. COMMIT
```

**Skipped items:** empty question/answer → log warning, không insert

### Phase D — Verification

| Check | Expected |
|-------|----------|
| `COUNT(faqs)` | = valid JSON items count |
| Featured count | ≤ total homepage+general items |
| Positions guide | = JSON category=guide count |
| Positions contact | = JSON category=contact count |
| Sample spot-check | 5 random Q&A match |
| Public API | `/cms/faqs?featured=true&limit=10` returns data |
| Admin list | Pagination works |

Script verify: `prisma/scripts/verify-faq-migration.ts`

### Phase E — Cutover

1. Deploy API đọc DB (không đọc JSON)
2. Deploy admin UI mới
3. Deploy frontend `/tro-giup`
4. Giữ JSON row **unchanged** (backup)
5. Mark JSON key deprecated in code comments

### Phase F — Cleanup (sau UAT 7–14 ngày)

- Remove `getFaqItems()` / `saveFaqItems()` JSON repository methods
- Remove `CMS_FAQ_SETTING_KEY` constant usage
- Optional: delete `system_settings` row hoặc rename key → `cms.faq.items.backup`

---

## 5. Rollback plan

### Khi nào rollback

- Migration script fail mid-transaction → auto ROLLBACK
- Post-deploy: public API trả empty/wrong data
- Admin không save được

### Rollback steps

```
1. Revert deploy (API + admin + web) về commit trước
2. IF schema already applied:
   Option A: prisma migrate rollback (dev)
   Option B: DROP TABLE faq_positions, faqs, faq_categories (prod emergency)
3. JSON backup vẫn nguyên trong system_settings — old code đọc lại được
4. Restore DB từ pg_dump nếu cần
5. Verify old FAQ admin page works
```

**Thời gian rollback ước tính:** 15–30 phút (revert deploy + optional drop tables)

### Rollback risk

| Risk | Mitigation |
|------|------------|
| Admin đã sửa FAQ trên DB mới | Export DB FAQs trước rollback; merge manual nếu cần |
| Schema drop mất data | Backup trước migration |
| Production traffic | Pre-launch — risk thấp |

---

## 6. Backward compatibility

| Layer | Strategy |
|-------|----------|
| Public API `?category=homepage` | Alias → `?featured=true&limit=10` (1 release) |
| Public API `?category=guide` | Alias → `?position=guide` |
| Admin `PUT /admin/cms/faq` | **Remove** — admin mới dùng REST |
| JSON row | Giữ read-only backup, không ghi |

Pre-launch → có thể **bỏ alias ngay** nếu deploy đồng bộ 3 apps.

---

## 7. Risk analysis

| # | Rủi ro | Mức | Giảm thiểu |
|---|--------|-----|-------------|
| R1 | Mất FAQ khi migrate | 🔴 Cao | Transaction + backup + verify script |
| R2 | Slug collision | 🟡 Trung bình | Auto suffix + unique constraint |
| R3 | Plain text answer hiển thị xấu | 🟢 Thấp | Wrap `<p>` khi migrate |
| R4 | Featured > 10 trang chủ | 🟡 Trung bình | Migration cap 10; frontend limit 10 |
| R5 | Category "Chung" quá rộng | 🟢 Thấp | Admin re-categorize sau launch |
| R6 | Downtime deploy | 🟢 Thấp | Pre-launch; migration nhanh |
| R7 | Search ILIKE chậm 200+ rows | 🟢 Thấp | 200 rows OK; index sau nếu cần |

---

## 8. Migration audit log (output mẫu)

```
FAQ Migration Report — 2026-07-09T12:00:00+07
─────────────────────────────────────────────
Source JSON items:           47
Valid items migrated:        45
Skipped (empty):              2
Categories seeded:            7
Featured set:                10
Positions guide:             18
Positions contact:           12
Slug collisions resolved:     3
Errors:                       0
Status:                    SUCCESS
```

---

## 9. Pre-migration checklist

- [ ] Backup DB (`pg_dump`)
- [ ] Export JSON snapshot file
- [ ] Review FAQ count in admin hiện tại
- [ ] Confirm pre-launch (no live user edits during migration)
- [ ] Staging dry-run migration script
- [ ] UAT verify all 4 frontend surfaces

---

## 10. Post-migration checklist

- [ ] Public homepage shows ≤10 featured
- [ ] `/tro-giup` hub works with pagination
- [ ] `/huong-dan` FAQ section limited + search
- [ ] `/lien-he` FAQ section limited
- [ ] Admin CRUD save individual FAQ
- [ ] SEO detail URL + JSON-LD valid (Google Rich Results Test)
- [ ] Sitemap includes FAQ URLs
- [ ] Old JSON not written by any code path
