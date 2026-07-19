# CMS Legal Pages — Hướng dẫn import

**Không import tự động vào production.** Nội dung trong `pages.json` là bản nháp — cần **luật sư / compliance** review trước khi publish.

## Cách đăng (Admin Panel)

1. Đăng nhập `https://admin.cardon.vn` với quyền `cms.manage`
2. **CMS → Pages → Create**
3. Điền fields theo từng entry trong `pages.json`
4. Tab SEO: copy block `seo` tương ứng
5. **Publish** khi nội dung đã duyệt

## URL public (đề xuất)

| Slug | Trang | Footer link |
|------|-------|-------------|
| `terms-of-service` | Điều khoản sử dụng | `/pages/terms-of-service` |
| `privacy-policy` | Chính sách bảo mật | `/pages/privacy-policy` |
| `refund-policy` | Chính sách hoàn tiền | `/pages/refund-policy` |
| `agent-agreement` | Thỏa thuận đại lý | Partner portal footer |

## Placeholder cần thay

Trước publish, tìm và thay:

- `[TÊN CÔNG TY]` — tên pháp nhân
- `[MST]` — mã số thuế
- `[ĐỊA CHỈ]` — trụ sở
- `[EMAIL]` — email liên hệ pháp lý
- `[HOTLINE]` — số hỗ trợ

## Schema tham chiếu

- `CmsPage`: type `PAGE`, status `PUBLISHED`
- `CmsSeo`: meta_title ≤ 128, meta_description ≤ 256
