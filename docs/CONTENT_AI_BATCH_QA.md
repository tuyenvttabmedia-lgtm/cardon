# Content AI — Batch QA (sau prompt v1.23)

## Mục tiêu

Ngừng vòng **1 bài → 1 bản prompt**. Dùng soft checks + 4 họ cấu trúc để scale; chỉ xiết khi regression lặp hoặc topic mới.

## 4 họ (trong prompt)

| Họ | Ví dụ topic |
|----|-------------|
| **A Buy** | mua thẻ, Scoin/Zing/Garena, ĐT 24/7, mua nhiều, sai mệnh giá |
| **B Tx TS** | lỗi mua thẻ, treo đơn, gian lận, giao dịch bất thường |
| **C Topup** | nạp tiền nhà mạng, guest không cần đăng ký TK |
| **D Telecom** | gọi khẩn cấp, SMS lỗi, mất sóng, SIM khóa |

## Quy trình batch

1. Lên plan 5–10 bài **cùng họ**.
2. Generate → duyệt soft warnings trên admin (không cần sửa prompt ngay).
3. Reject outline + regenerate bài fail.
4. Nếu **cùng lỗi ≥2–3 bài** → mới mở PR xiết soft check + prompt (bump version, seed prod).

## Seed / deploy

```bash
# VPS /opt/cardon sau git reset --hard origin/main
docker compose -p cardon-production -f docker-compose.production.yml --env-file .env.production build api worker
docker compose -p cardon-production -f docker-compose.production.yml --env-file .env.production up -d --force-recreate api worker
docker exec -w /app cardon-prod-api node scripts/deploy/seed-content-ai-prompts.mjs
```

Phiên bản hiện tại sau seed: `content.outline@1.23.0`, `content.write@1.23.0`.

## Cluster nên sample tiếp (chưa stress-test nhiều)

- COMPARISON / PRODUCT thuần
- Nạp sâu My Viettel/MobiFone (USSD)
- 4G / data / MMS / chuyển mạng giữ số
