# Phase 2B.3B — PostgreSQL network exposure

Ngày: 2026-11-06. Chỉ đọc. Không sửa Compose, không restart, không đổi firewall, network, port, Redis, payment, volume hay dữ liệu. Không triển khai Cloudflare Tunnel.

Kết luận: không có ứng dụng nào cần Postgres từ máy khác. API và worker đi qua mạng Docker `postgres:5432`. Công cụ trên chính máy host dùng `127.0.0.1:5433`. Cổng đang publish ra mọi interface và địa chỉ LAN của máy này chấp nhận TCP. Phương án phù hợp là đổi mapping thành `127.0.0.1:5433:5432` ở lần triển khai sau. Lần này chưa áp dụng.

## 1. Port binding hiện tại

Service là `postgres` trong project `cardon-local-full`, container `cardon-local-full-postgres`, image `postgres:16-alpine`.

Compose khai báo:

```yaml
ports:
  - "5433:5432"
```

`HostIp` đang rỗng. Docker map thực tế:

- `5432/tcp -> 0.0.0.0:5433`
- `5432/tcp -> [::]:5433`

Không có `expose` riêng. Container nằm trên network `cardon-local-full_cardon-local-full`. Volume dữ liệu là `cardon-local-full_cardon_local_full_postgres`.

TCP tới `127.0.0.1:5433` thành công. TCP tới địa chỉ IPv4 LAN của chính máy host cũng thành công. Redis không có port publish và không nằm trong phương án này.

Compose production `docker-compose.production.yml` không publish Postgres. File đang chạy là local-full, không phải production.

## 2. Dependency của cổng 5433

Ba lớp kết nối:

| Lớp | Ai dùng | Đích | Có cần 5433 publish ra ngoài không |
| --- | --- | --- | --- |
| Docker network | API, worker | `postgres:5432` | Không |
| Máy host | Script và công cụ dev | `127.0.0.1:5433` | Không, chỉ cần localhost |
| Máy khác, LAN hoặc Internet | Không thấy cấu hình nào | — | Không |

Đã kiểm tra trong container, không in credential:

- API: `DATABASE_URL` là `postgres:5432`.
- Worker: `postgres:5432`.
- Web: không có `DATABASE_URL`.
- `.env.local-full`: không có `DATABASE_URL`. Compose tự ghép host `postgres` cổng 5432 cho API và worker.
- `.env` ở root: `localhost:5432`. Đó không phải Postgres của stack này.
- `.env.example`: `localhost:5432`.

`pg_stat_activity` tại thời điểm audit:

| Client | Số session | Container |
| --- | ---: | --- |
| `172.18.0.6` | 8 | `cardon-local-full-api` |
| `172.18.0.8` | 5 | `cardon-local-full-worker` |
| local socket | 6 | healthcheck và lệnh trong container |

Không có session nào đi từ địa chỉ LAN hay từ port publish.

Script trên host cố ý dùng `127.0.0.1:5433`, không dùng IP máy khác:

- `scripts/create-admin-local.ts`
- `scripts/create-smoke-data.ts`
- `scripts/esim/cleanup-stale-unconfirmed.mjs`
- `scripts/esim/lpa-07-sandbox-once.mjs`
- `scripts/esim/lpa-07a-token-audit.mjs`
- `scripts/esim/lpa-07b-lpa-shape.mjs`
- `scripts/esim/lpa-07b-resume.mjs`
- `scripts/esim/lpa-08-inspect-order.mjs`
- `scripts/esim/lpa-08-probe-admin.mjs`
- `scripts/esim/lpa-09-review-order.mjs`

Backup và restore (`scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/verify-backup-restore.sh`) chạy `docker exec` vào container, mặc định container production `cardon-prod-postgres`. Chúng không mở TCP 5433.

Test `scripts/test/assert-cardon-it-database.test.mjs` từ chối cổng 5432 và 5433 cho database integration riêng. Nó không cần Postgres local mở ra LAN.

`docker-compose.local-full.uat-override.yml` chỉ đổi host port sang 5434 khi 5433 đã bị stack khác chiếm. Override đó không đang được dùng. `docker-compose.local-production.yml` cũng khai báo `"5433:5432"` không gắn localhost, nhưng không phải stack đang chạy.

## 3. Phạm vi truy cập thực tế

- Container khác trong cùng Docker network vào được `postgres:5432` dù có bỏ port publish.
- Process trên máy host vào được `127.0.0.1:5433` và `[::1]` nếu stack còn bind IPv6.
- Máy khác cùng LAN vào được địa chỉ LAN cổng 5433, vì probe TCP trên interface đó thành công.
- Internet chỉ vào được nếu router chuyển tiếp cổng 5433. Audit không thấy cấu hình chuyển tiếp. Binding `0.0.0.0` vẫn là cửa mở nếu chuyển tiếp hoặc một máy LAN được thêm sau này.

## 4. Rủi ro

Postgres local đang chấp nhận TCP từ ngoài loopback trong khi mật khẩu database nằm trên cổng đó. API và website không cần cửa này. Redis đã đúng vì không publish. Đổi tunnel IPN sau này không được kèm theo việc để 5433 tiếp tục nghe mọi interface.

Chưa có session từ xa tại thời điểm đọc. Rủi ro là khả năng kết nối, không phải một kết nối đang mở.

## 5. Phương án remediation

Đổi một dòng trong `docker-compose.local-full.yml`, khi được phép triển khai:

```yaml
ports:
  - "127.0.0.1:5433:5432"
```

Không thêm mapping `[::]:5433`. Không đổi cổng 5432 giữa các container. Không đổi tên volume. Không dùng `docker compose down -v`.

Không có dependency từ máy khác nên không cần giữ `0.0.0.0`. Nếu sau này một máy khác cần đọc database, dùng tunnel hoặc SSH tới localhost của máy host, không mở lại mọi interface.

Khi sửa, cập nhật cùng kiểu cho `docker-compose.local-production.yml` để một lần simulation sau không publish lại `0.0.0.0:5433`. File UAT `5434:5432` cũng nên thành `127.0.0.1:5434:5432` nếu được dùng lại. Production compose không publish Postgres, để nguyên.

Áp dụng sau này bằng recreate riêng service `postgres`, giữ volume. API và worker sẽ mất kết nối trong lúc container Postgres khởi động lại, rồi tự nối lại `postgres:5432`. Không chạy migration, seed, hay đổi dữ liệu.

## 6. Ảnh hưởng dự kiến

| Thành phần | Sau khi bind localhost |
| --- | --- |
| API, worker | Không đổi connection string. Gián đoạn ngắn lúc recreate |
| Web, admin, partner | Không nối database |
| Script host `127.0.0.1:5433` | Vẫn dùng được |
| `.env` cổng 5432 | Không liên quan, không đổi |
| Máy LAN và `0.0.0.0` | Hết vào được |
| Redis | Không đổi |
| Payment, IPN, tunnel | Không đổi |
| Volume Postgres | Giữ nguyên nếu không dùng `-v` |

## 7. Checklist sau khi được phép đổi

1. Volume vẫn là `cardon-local-full_cardon_local_full_postgres`.
2. Log Postgres không chạy migration hay seed.
3. API và worker vẫn có `DATABASE_URL` host `postgres` cổng 5432.
4. `GET /health` của API trả 200 sau khi Postgres healthy.
5. TCP `127.0.0.1:5433` thành công.
6. TCP tới địa chỉ LAN cổng 5433 thất bại.
7. Không còn listener `0.0.0.0:5433` hay `[::]:5433`.
8. `pg_stat_activity` chỉ còn IP Docker và local socket.
9. Redis vẫn không có port publish.
10. Không tạo tunnel và không đổi payment.

Phase 2B.3B dừng tại báo cáo. Chưa sửa cấu hình.
