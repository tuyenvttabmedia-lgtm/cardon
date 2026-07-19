#!/usr/bin/env bash
# Generate .env.production on VPS (run once on server)
set -euo pipefail
cd /opt/cardon

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)

cat > .env.production <<EOF
POSTGRES_USER=cardon
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=cardon

APP_PUBLIC_URL=https://cardon.vn
CORS_ORIGINS=https://cardon.vn,https://www.cardon.vn,https://partner.cardon.vn,https://admin.cardon.vn

JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=${ENCRYPTION_KEY}

WORKER_HEARTBEAT_REQUIRED=true
RUN_MIGRATIONS=true
AGENT_REGISTRATION_MODE=PUBLIC_APPROVAL

MEGAPAY_MERCHANT_ID=pending-configure-in-admin
MEGAPAY_SECRET_KEY=$(openssl rand -hex 24)
MEGAPAY_ENDPOINT=https://payment.megapay.vn
MEGAPAY_RETURN_URL=https://cardon.vn/checkout/result
MEGAPAY_CALLBACK_URL=https://cardon.vn/api/v1/payments/webhooks/megapay
MEGAPAY_WEBHOOK_SECRET=$(openssl rand -hex 24)

SEPAY_API_KEY=$(openssl rand -hex 24)
SEPAY_WEBHOOK_SECRET=$(openssl rand -hex 24)
SEPAY_BANK_ACCOUNT=0000000000
SEPAY_BANK_CODE=MB
SEPAY_ACCOUNT_NAME=CONG TY CARDON
SEPAY_QR_TEMPLATE=compact

ESALE_API_URL_CARD=https://partner.esale.vn/esale/cardshop/
ESALE_API_URL_TOPUP=https://partner.esale.vn/esale/mobiletopup/
ESALE_AGENCY_CODE=pending-configure-in-admin
ESALE_CLIENT_CODE=
ESALE_SECRET_KEY=$(openssl rand -hex 24)
ESALE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----"
ESALE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu\n-----END PUBLIC KEY-----"
ESALE_TIMEOUT_MS=30000
PROVIDER_LOW_BALANCE_THRESHOLD=500000
AGENT_LOW_BALANCE_THRESHOLD=100000

SMTP_HOST=smtp.pending.cardon.vn
SMTP_PORT=587
SMTP_USER=noreply@cardon.vn
SMTP_PASS=$(openssl rand -hex 16)
SMTP_FROM=noreply@cardon.vn
SMTP_SECURE=false
ADMIN_ALERT_EMAIL=ops@cardon.vn

WEB_NEXT_PUBLIC_API_URL=https://cardon.vn/api/v1
WEB_NEXT_PUBLIC_SITE_URL=https://cardon.vn

PARTNER_NEXT_PUBLIC_API_URL=https://partner.cardon.vn/api/v1
PARTNER_NEXT_PUBLIC_PARTNER_API_URL=https://partner.cardon.vn/api/partner/v1
PARTNER_NEXT_PUBLIC_SITE_URL=https://partner.cardon.vn
PARTNER_NEXT_PUBLIC_CUSTOMER_SITE_URL=https://cardon.vn

ADMIN_NEXT_PUBLIC_API_URL=https://admin.cardon.vn/api/v1
ADMIN_NEXT_PUBLIC_SITE_URL=https://admin.cardon.vn

SEED_SUPER_ADMIN_EMAIL=superadmin@cardon.vn
SEED_SUPER_ADMIN_PASSWORD=hXSWQ#Lhdwef!&
EOF

chmod 600 .env.production
echo "[write-production-env] .env.production created"
