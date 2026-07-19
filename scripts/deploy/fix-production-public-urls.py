import pathlib
import re

path = pathlib.Path("/opt/cardon/.env.production")
text = path.read_text()
fixes = {
    "WEB_NEXT_PUBLIC_API_URL": "https://cardon.vn/api/v1",
    "WEB_NEXT_PUBLIC_SITE_URL": "https://cardon.vn",
    "PARTNER_NEXT_PUBLIC_API_URL": "https://partner.cardon.vn/api/v1",
    "PARTNER_NEXT_PUBLIC_PARTNER_API_URL": "https://partner.cardon.vn/api/partner/v1",
    "PARTNER_NEXT_PUBLIC_SITE_URL": "https://partner.cardon.vn",
    "PARTNER_NEXT_PUBLIC_CUSTOMER_SITE_URL": "https://cardon.vn",
    "ADMIN_NEXT_PUBLIC_API_URL": "https://admin.cardon.vn/api/v1",
    "ADMIN_NEXT_PUBLIC_SITE_URL": "https://admin.cardon.vn",
    "ADMIN_NEXT_PUBLIC_FRONTEND_URL": "https://cardon.vn",
    "ADMIN_NEXT_PUBLIC_CUSTOMER_SITE_URL": "https://cardon.vn",
    "APP_PUBLIC_URL": "https://cardon.vn",
    "BUILD_VERSION": "6035.2 AGENT REGISTRATION & KYC CENTER",
    "WEB_INTERNAL_URL": "http://web:3001",
    "ADMIN_INTERNAL_URL": "http://admin:3003",
    "BACKUP_ENABLED": "true",
    "BACKUP_DIR": "backups",
}
for key, value in fixes.items():
    if re.search(rf"^{re.escape(key)}=", text, re.M):
        text = re.sub(rf"^{re.escape(key)}=.*$", f"{key}={value}", text, flags=re.M)
    else:
        text += f"\n{key}={value}\n"
path.write_text(text)
print("PUBLIC_URLS_FIXED")
