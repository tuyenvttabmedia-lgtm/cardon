# Catalog Import Template

**Không import tự động vào production.** File CSV này là **template + ví dụ cấu trúc** — điền dữ liệu thật sau khi thương lượng giá với eSale và phê duyệt nội bộ.

## Files

| File | Sheet |
|------|-------|
| `catalog-import-template.csv` | Tất cả entity (section headers) |

## Quy trình import đề xuất (Admin)

1. **Provider** — Admin → Providers → đảm bảo `ESALE` ACTIVE, credentials production
2. **Categories** — Admin → Products → Categories → tạo từ section `category`
3. **Products** — tạo product gắn `category_slug`
4. **Variants** — tạo variant với SKU unique, `type` = `CARD` hoặc `TOPUP`
5. **Provider mappings** — map `variant_sku` → `provider_product_code` (format eSale: `TELCO|AMOUNT|Card`)

Hoặc dùng script nội bộ (ngoài scope Phase 6C) đọc CSV sau khi review.

## Cột bắt buộc

### category

| Column | Type | Example |
|--------|------|---------|
| entity | literal | `category` |
| slug | string unique | `the-game` |
| name | string | `Thẻ game` |
| parent_slug | string optional | *(empty)* |
| sort_order | int | `1` |
| status | ACTIVE/INACTIVE | `ACTIVE` |

### product

| Column | Type | Example |
|--------|------|---------|
| entity | literal | `product` |
| slug | string unique | `zing-card` |
| name | string | `Thẻ Zing` |
| category_slug | FK | `the-game` |
| description | text optional | Mô tả SEO |
| status | ACTIVE/INACTIVE | `ACTIVE` |

### variant

| Column | Type | Example |
|--------|------|---------|
| entity | literal | `variant` |
| sku | string unique | `ZING-100K` |
| product_slug | FK | `zing-card` |
| name | string | `Zing 100.000đ` |
| type | CARD/TOPUP | `CARD` |
| face_value | decimal VND | `100000` |
| sell_price | decimal VND | `100000` |
| status | ACTIVE/INACTIVE | `ACTIVE` |

### provider_mapping

| Column | Type | Example |
|--------|------|---------|
| entity | literal | `provider_mapping` |
| variant_sku | FK | `ZING-100K` |
| provider_code | string | `ESALE` |
| provider_product_code | string | `ZING|100000|Card` |
| provider_cost | decimal | `95000` |
| priority | int | `1` |
| status | ACTIVE/INACTIVE | `ACTIVE` |

## Lưu ý giá

- `sell_price` ≥ `provider_cost` + margin tối thiểu
- Profit report dùng `provider_cost` từ mapping khi order COMPLETED
- **Không** copy giá từ competitor mà chưa verify cost eSale

## Validation trước import

- [ ] SKU không trùng
- [ ] Mọi variant CARD có ≥ 1 mapping ACTIVE
- [ ] `provider_product_code` khớp catalog eSale sync
- [ ] Test buy 1 SKU trên staging trước bulk import
