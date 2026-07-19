#!/usr/bin/env bash
# Restore .env.production secrets from running worker, sync DB password, restart api/admin/partner.
set -eu
cd /opt/cardon

docker exec cardon-prod-worker env > /tmp/worker.env

python3 - <<'PY'
import pathlib
import re
from urllib.parse import unquote, urlparse

worker = dict(
    line.split("=", 1)
    for line in pathlib.Path("/tmp/worker.env").read_text().splitlines()
    if "=" in line
)

db_url = worker.get("DATABASE_URL", "")
pg_pass = ""
if db_url:
    parsed = urlparse(db_url.replace("postgresql://", "http://", 1))
    pg_pass = unquote(parsed.password or "")

keys = [
    "POSTGRES_USER",
    "POSTGRES_DB",
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "SEED_SUPER_ADMIN_EMAIL",
    "SEED_SUPER_ADMIN_PASSWORD",
]
path = pathlib.Path(".env.production")
text = path.read_text()

if pg_pass:
    if re.search(r"^POSTGRES_PASSWORD=", text, re.M):
        text = re.sub(r"^POSTGRES_PASSWORD=.*$", f"POSTGRES_PASSWORD={pg_pass}", text, flags=re.M)
    else:
        text += f"\nPOSTGRES_PASSWORD={pg_pass}\n"

for key in keys:
    value = worker.get(key)
    if not value:
        continue
    if re.search(rf"^{re.escape(key)}=", text, re.M):
        text = re.sub(rf"^{re.escape(key)}=.*$", f"{key}={value}", text, flags=re.M)
    else:
        text += f"\n{key}={value}\n"

path.write_text(text)
pathlib.Path("/tmp/worker.env").unlink(missing_ok=True)
print("ENV_SYNCED_FROM_WORKER")
PY

pg_pass="$(grep '^POSTGRES_PASSWORD=' .env.production | cut -d= -f2-)"
pg_sql="${pg_pass//\'/\'\'}"
docker exec cardon-prod-postgres psql -U cardon -d cardon -c "ALTER USER cardon PASSWORD '${pg_sql}';"
echo "DB_PASSWORD_SYNCED"

docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate api admin partner
sleep 60
docker compose --env-file .env.production -f docker-compose.production.yml ps api admin partner nginx
curl -sk https://cardon.vn/health/ready | head -c 200 || true
echo
curl -sk -o /dev/null -w "admin:%{http_code}\n" https://admin.cardon.vn/login
curl -sk -o /dev/null -w "partner:%{http_code}\n" https://partner.cardon.vn/login
