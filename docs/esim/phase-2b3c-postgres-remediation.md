# Phase 2B.3C — Siết PostgreSQL local về localhost

Ngày: 2026-11-06. Chỉ đổi port mapping của stack `cardon-local-full`. Không sửa production, Redis, `DATABASE_URL`, network, source, schema. Không migration, seed, reset, tunnel hay DNS.

Kết quả: **PASS**. Postgres chỉ còn `127.0.0.1:5433`. API và worker vẫn healthy và vẫn nối `postgres:5432`.

## 1. Preflight

Khớp báo cáo Phase 2B.3B trước khi sửa:

| Mục | Trước khi sửa |
| --- | --- |
| Project | `cardon-local-full` |
| Container | `cardon-local-full-postgres`, healthy |
| Port | `5432/tcp -> 0.0.0.0:5433` và `[::]:5433` |
| API / worker | `postgres:5432` |
| Volume | `cardon-local-full_cardon_local_full_postgres` |
| Script host | vẫn trỏ `127.0.0.1:5433` |
| Redis | không publish port, healthy |

Tám container local đang chạy. Partner đã unhealthy từ trước và không nằm trong đường Postgres.

## 2. Thay đổi

File: `docker-compose.local-full.yml`, service `postgres`.

| | Mapping |
| --- | --- |
| Trước | `5433:5432` |
| Sau | `127.0.0.1:5433:5432` |

Cổng nội bộ giữa các container vẫn là 5432. Không sửa `docker-compose.production.yml`.

Recreate bằng `docker compose up -d --no-deps --force-recreate postgres`. Lần đầu Docker báo cổng 5433 chưa nhả. Container ở trạng thái Created, volume không bị xóa. Lần start ngay sau đó thành công. Không dùng `docker compose down` và không dùng `-v`.

## 3. Volume và container

Volume sau khi recreate vẫn là `cardon-local-full_cardon_local_full_postgres`.

Container được tạo lại: `cardon-local-full-postgres`. API, worker và Redis không bị recreate. Image API vẫn `sha256:b541448d1551063fd0ad4749de9d3056c14e681b8f492b9b63398543c72d0f0c`.

## 4. Kiểm tra

| Hạng mục | Kết quả |
| --- | --- |
| Postgres health | healthy |
| TCP `127.0.0.1:5433` | thành công |
| TCP địa chỉ LAN cổng 5433 | thất bại |
| Publish `0.0.0.0:5433` hoặc `[::]:5433` | không còn. Binding chỉ `127.0.0.1:5433` |
| API `DATABASE_URL` | `postgres:5432` |
| Worker `DATABASE_URL` | `postgres:5432` |
| Session database | `172.18.0.6` là API, `172.18.0.8` là worker, cộng local socket |
| `GET /health` | 200 |
| API health | healthy |
| Worker health | healthy |
| Redis | healthy, không có port publish |
| Backup / restore | script vẫn gọi `docker exec` vào container, không phụ thuộc port host. Không chạy restore |

Không có log migration hay seed. Entrypoint API không chạy lại.

## 5. Kết luận

Stack local giữ dữ liệu cũ. Máy host vẫn vào được `127.0.0.1:5433`. Máy khác trên LAN không còn mở được cổng này. Không khôi phục cấu hình cũ vì API và worker đều healthy.

Phase 2B.3C dừng tại đây. Không cài Cloudflare Tunnel.
