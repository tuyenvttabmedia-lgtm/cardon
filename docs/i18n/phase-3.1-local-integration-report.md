# Phase 3.1 — Biên bản kiểm thử tích hợp local

Ngày kiểm thử: 6/11/2026. Phạm vi: xác minh Admin CMS, API CMS và storefront VI/EN sau khi build lại API Docker từ source Phase 3. Không sửa code. Không chạy migration, seed, hay xóa volume. Không gọi API thanh toán, PayPal, Airalo hoặc nhà cung cấp eSIM.

Kết luận: **PASS**.

## 1. Môi trường trước và sau build

Compose project: `cardon-local-full`. File: `docker-compose.local-full.yml`. Env file: `.env.local-full`.

API không publish cổng 3000 ra host. Nginx `cardon-local-full-nginx` publish `0.0.0.0:80` và chuyển `/health` cùng `/api/` vào API. Postgres publish `127.0.0.1:5433`. Redis chỉ trong mạng Docker.

Trước khi build, API đang chạy image `cardon-api:local-full` `sha256:9ff9c0d571c487314851d4b6a21f0b4d794314cf9e2f5875c154518df87b3bc4`, tạo lúc 2026-11-05T14:37:21Z. Container `cardon-local-full-api` healthy. `APP_ENV=staging`, `APP_PUBLIC_URL=http://localhost`, database host `postgres:5432/cardon`, Redis host `redis:6379`. `RUN_MIGRATIONS=false`, `RUN_SEED=false` trên container đang chạy. `ESALE_USE_MOCK=true`. Không có biến nào trỏ host production.

Health trước build: `GET http://localhost/health` trả `app`, `database`, `redis`, `workers` đều `ok`.

Migration mới nhất trong database và trong `prisma/migrations` đều là `20261105120000_cms_content_translations`. Không có thư mục migration mới hơn. Phase 3 không thêm migration.

Storefront dev `http://localhost:3001` và admin dev `http://localhost:3003` đều trả 200 trước khi build. Hai process next dev lúc đó không có `API_INTERNAL_URL`, nên SSR storefront không tới được API Docker. Để kiểm thử đúng source Phase 3 với API vừa build, hai dev server được khởi động lại và giữ chạy:

- Storefront: `API_INTERNAL_URL=http://localhost/api/v1`, `NEXT_PUBLIC_API_URL=http://localhost/api/v1`.
- Admin: `NEXT_PUBLIC_API_URL=http://[::1]/api/v1`. Trình duyệt admin trên cổng 3003 luôn gọi cùng origin khi URL cấu hình chứa `localhost`. `http://[::1]/api/v1` đi qua nginx tới API mới. CORS ngoài production đang phản chiếu origin.

Container admin Docker `cardon-admin:local-full` không được recreate. UI kiểm thử là next dev trên cổng 3003.

## 2. Image và container API được build lại

Lệnh build: `docker compose -f docker-compose.local-full.yml --env-file .env.local-full build api`.

Image mới: `cardon-api:local-full` `sha256:6165ce08a364f32b0ee1715c965f755ee6e80c86373c1cbd5f4e90c6a0bc4376`.

Chỉ recreate `cardon-local-full-api` bằng `up -d --no-deps --force-recreate api`. Container khởi động 2026-11-05T17:14:17Z, trạng thái `running`, health `healthy`.

Worker giữ container cũ, image `sha256:3c49ede351a6831d4aeb4dd705658d5b229ac49857ec87bdf7600e1e358efa91`, không recreate. Postgres và Redis vẫn healthy. Volume `cardon-local-full_cardon_local_full_postgres` và `cardon-local-full_cardon_local_full_redis` còn nguyên.

Log khởi động bắt đầu bằng `Starting Nest application`. Có `Database connected` và `Nest application successfully started` trên cổng 3000, `APP_ROLE=api`. Route Phase 3 có mặt:

- `PUT /api/v1/admin/cms/pages/:id/translations/:locale`
- `PUT /api/v1/admin/cms/categories/:id/translations/:locale`
- `PUT /api/v1/admin/cms/tags/:id/translations/:locale`

Có cảnh báo `LegacyRouteConverter` cho `health/(.*)`, `api/partner/v1/(.*)` và `/api/v1/*`. API vẫn healthy. Không có lỗi Prisma làm dừng process.

`GET http://localhost/health` sau build vẫn `ok` cho app, database, redis và workers.

## 3. Không migration, không seed, không reset volume

Trước `up`, config đã resolve `RUN_MIGRATIONS=false` và `RUN_SEED=false` cho API. Container mới in cùng hai giá trị `false`.

Log entrypoint không có `prisma migrate` hay seed. Migration mới nhất sau khi API lên lại vẫn là `20261105120000_cms_content_translations`. Không chạy migration. Không chạy seed. Không `down -v`. Không recreate Postgres hay Redis.

## 4. Kết quả Test A–E

Không sửa trang CMS đang dùng. Tạo một trang thử nghiệm, không đưa vào menu:

| Trường | Giá trị |
| --- | --- |
| ID | `b2e80ce3-e978-42ce-9218-029ec35a958a` |
| Slug | `phase-3-1-integration-test` |
| Loại | `PAGE` |
| Trạng thái trang | `PUBLISHED` |
| Hiện menu | không |

Nội dung VI lúc tạo: title `Phase 3.1 VI ban dau`, excerpt `Noi dung VI ban dau`, content `Day la noi dung tieng Viet ban dau cua bai thu nghiem.`

### Test A — Lưu English DRAFT

Admin `http://localhost:3003/marketing/pages`, đăng nhập tài khoản local, mở đúng trang thử nghiệm. Tab English hiển thị title, excerpt và content đã lưu. Bấm **Lưu nháp** không báo lỗi. API `PUT /admin/cms/pages/{id}/translations/en` với `status=DRAFT` thành công.

Database:

- `locale=en`, `status=DRAFT`, title `Phase 3 Integration Test`, excerpt `English draft integration test`, content `This is a local integration test.`
- Cột gốc của `cms_pages` và dòng `locale=vi` giữ nguyên nội dung tiếng Việt. Trạng thái trang vẫn `PUBLISHED`.

### Test B — Public API khi EN là DRAFT

`GET /api/v1/cms/pages/phase-3-1-integration-test?locale=en`

- Title, excerpt, content là bản tiếng Việt.
- `requestedLocale=en`, `contentLocale=vi`, `fallback=true`.
- Không trả nội dung English DRAFT.

`locale=vi` trả tiếng Việt, `fallback=false`.

### Test C — Xuất bản English

Bấm **Xuất bản** trên tab English. Public `locale=en` trả:

- title `Phase 3 Integration Test`
- excerpt `English draft integration test`
- content `This is a local integration test.`
- `contentLocale=en`, `fallback=false`

Bản tiếng Việt không đổi.

### Test D — VI và EN độc lập

`PUT .../translations/vi` đổi title thành `Phase 3.1 VI da cap nhat`, excerpt `Noi dung VI sau khi sua`, content `Day la noi dung tieng Viet sau khi sua, khong duoc de len ban English.`

Đọc lại:

- `locale=vi`: nội dung mới, `fallback=false`.
- `locale=en`: vẫn đúng ba chuỗi English đã xuất bản, `fallback=false`.
- Cột gốc `cms_pages` khớp bản VI. Dòng EN không bị ghi đè.

### Test E — Storefront

Trang không có cookie locale:

- `http://localhost:3001/phase-3-1-integration-test` trả 200, chỉ nội dung VI đã cập nhật.
- Khi EN đang `PUBLISHED`, `http://localhost:3001/en/phase-3-1-integration-test` trả 200 và chỉ nội dung English. Không có câu VI trong thân bài.
- Sau khi EN về `DRAFT`, request kế tiếp của `/en/...` trả thân bài VI và thông báo tiếng Anh: `This content is shown in Vietnamese because an English version is not published yet.`

Trình duyệt xác nhận cùng trạng thái cuối: URL `/en/phase-3-1-integration-test`, chrome tiếng Anh, H1 và excerpt là bản VI, có thông báo fallback tiếng Anh. Không có HTTP 500.

Request ngay sau khi đổi trạng thái vẫn có thể trả HTML cũ khoảng một vòng, vì fetch CMS của storefront dùng `revalidate` 60 giây. Request sau đó đúng dữ liệu mới. API public đổi ngay, không chờ cache.

## 5. Kết quả API và database

Đếm sau kiểm thử:

| Bảng | Số dòng |
| --- | --- |
| `cms_pages` | 107 |
| `cms_page_translations` locale `vi` | 107 |
| `cms_page_translations` locale `en` | 1 |
| `cms_categories` / bản dịch `vi` | 5 / 5 |
| `cms_category_translations` locale `en` | 0 |
| `cms_tags` / bản dịch `vi` | 123 / 123 |
| `cms_tag_translations` locale `en` | 0 |

Chỉ trang thử nghiệm có bản `en`. 106 trang cũ cộng trang mới thành 107.

Trạng thái cuối của trang thử nghiệm, giữ lại để nghiệm thu:

- Trang `PUBLISHED`, không nằm trong menu.
- VI `PUBLISHED`: `Phase 3.1 VI da cap nhat`.
- EN `DRAFT`: `Phase 3 Integration Test`.
- SEO title/description gốc vẫn là giá trị lúc tạo (`Phase 3.1 VI ban dau` / `Noi dung VI ban dau`) vì Test D không gửi SEO. `<title>` storefront vì vậy vẫn là SEO cũ, còn H1 là title VI mới.

Public không truyền `locale` với `/cms/pages/gioi-thieu` trả title, không có field `fallback`.

## 6. Kết quả storefront VI/EN

Trang tiếng Việt của bài thử nghiệm hiển thị VI. Trang `/en/...` hiển thị EN khi bản EN đã xuất bản, và fallback về VI kèm thông báo tiếng Anh khi EN là DRAFT.

Header/footer của trang VI dùng nhãn tiếng Việt (`Trang chủ`, `Mua thẻ`, `Đăng nhập`). Trên `/en/the-game`, chrome dùng nhãn tiếng Anh (`Home`, `Buy cards`, `Game cards`, `Pay`). Bài tin và mục menu CMS chưa có bản EN xuất bản vẫn là tiếng Việt, kèm thông báo chưa có bản tiếng Anh ở khối tin tức. Đó là fallback đã định ở Phase 2, không phải trộn trong cùng một bài.

## 7. Regression

- Admin vẫn mở được trang cũ: Giới thiệu, Liên hệ và các trang chính sách trong menu sidebar.
- Danh mục vẫn đúng 5 tên tiếng Việt: Hướng dẫn, Khuyến mãi, Nạp cước điện thoại, Thẻ game, Thẻ điện thoại. Public category `locale=en` trả cùng tên vì không có dòng EN. Không sửa category hay tag.
- Public API không truyền `locale` giữ contract cũ, không thêm `fallback`.
- `http://localhost:3001/`, `/the-game`, `/the-dien-thoai`, `/nap-cuoc` đều 200. `/en/the-game` mở được, có danh sách nhà phát hành thẻ, không bấm thanh toán.
- Không có thay đổi code trong lần kiểm thử này.

## 8. Lỗi phát hiện và vấn đề còn tồn tại

Không có lỗi làm FAIL Phase 3.

Quan sát, không sửa vì ngoài phạm vi:

- Storefront cache fetch khoảng 60 giây. Lần tải đầu sau khi đổi DRAFT/PUBLISHED có thể còn HTML cũ. Lần sau đúng.
- Menu CMS và tin tức chưa có bản EN vẫn hiện tiếng Việt trên `/en`, có thông báo fallback. Đúng contract Phase 2.
- Trên `/en/the-game`, nút cộng/trừ số lượng vẫn là `Giảm số lượng`, `Số lượng`, `Tăng số lượng`. Phần còn lại của hub là tiếng Anh. Không chặn kiểm thử CMS.
- Trang thử nghiệm còn trong database local. Chưa xóa, vì xóa không cần thiết cho nghiệm thu.

## 9. Kết luận

**PASS.**

Admin lưu và xuất bản bản English đúng locale, không ghi đè tiếng Việt. Public API giấu English DRAFT và trả `fallback: true`, rồi trả English với `fallback: false` sau khi xuất bản. Sửa VI không đụng EN. Storefront VI và `/en` khớp trạng thái đó, không 500. Category, tag và trang CMS cũ không đổi. API Docker mới healthy. Không migration, không seed, không đụng volume Postgres/Redis.

Dừng tại Phase 3.1 để nghiệm thu. Không chuyển Phase 4.

Server local vẫn chạy: API Docker, storefront `http://localhost:3001`, admin `http://localhost:3003`.
