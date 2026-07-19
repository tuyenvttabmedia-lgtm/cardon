# CardOn — luồng code chuẩn

## Nguồn sự thật

Local → GitHub (`main`) → VPS (`/opt/cardon`)

Baseline ban đầu lấy từ code đang chạy trên VPS.

## Dev hàng ngày

1. Sửa trên **localhost**
2. `git commit` + `git push origin main`
3. Trên VPS:

```bash
cd /opt/cardon
git pull origin main
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

## Không làm

- Không lấy VPS làm nguồn sửa code thường xuyên
- Không commit `.env*`, `secrets/`, `*.key`

## Kiểm tra khớp

Local và VPS: `git rev-parse --short HEAD` phải giống nhau sau khi pull.
