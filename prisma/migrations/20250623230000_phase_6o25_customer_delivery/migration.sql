-- Phase 6O.25 — Customer delivery experience

ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'PIN_VIEWED';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'TOPUP_SUCCESS';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'DATA_SUCCESS';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'ORDER_DELIVERED';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'ORDER_NEED_SUPPORT';

ALTER TABLE "card_records"
  ADD COLUMN IF NOT EXISTS "first_viewed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "view_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pin_first_viewed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "pin_view_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "email_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "html_body" TEXT NOT NULL,
    "text_body" TEXT,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_code_key" ON "email_templates"("code");

INSERT INTO "email_templates" ("id", "code", "name", "subject", "html_body", "text_body", "variables", "is_active", "updated_at")
VALUES
  (
    gen_random_uuid(),
    'PAYMENT_SUCCESS',
    'Thanh toán thành công',
    'Thanh toán thành công — đơn {{orderCode}}',
    '<p>Xin chào {{customerName}},</p><p>Chúng tôi đã nhận thanh toán cho đơn hàng <strong>{{orderCode}}</strong>.</p><p>Sản phẩm: {{items}}</p><p>Tổng tiền: {{total}} VND</p><p>Cảm ơn bạn đã mua hàng tại CardOn.vn!</p>',
    'Xin chào {{customerName}},\nThanh toán thành công cho đơn {{orderCode}}.\nSản phẩm: {{items}}\nTổng: {{total}} VND',
    '["customerName","orderCode","items","total"]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'CARD_DELIVERED',
    'Giao thẻ thành công',
    'Thẻ của bạn — đơn {{orderCode}}',
    '<p>Xin chào {{customerName}},</p><p>Đơn hàng <strong>{{orderCode}}</strong> đã hoàn tất.</p><p>Sản phẩm: {{items}}</p><p>Tổng tiền: {{total}} VND</p><p>Vui lòng tra cứu đơn hàng trên CardOn.vn để xem mã thẻ an toàn.</p>',
    'Xin chào {{customerName}},\nĐơn {{orderCode}} đã hoàn tất.\nSản phẩm: {{items}}\nTổng: {{total}} VND\nTra cứu đơn trên CardOn.vn để xem mã thẻ.',
    '["customerName","orderCode","items","total"]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'TOPUP_SUCCESS',
    'Nạp cước thành công',
    'Nạp cước thành công — đơn {{orderCode}}',
    '<p>Xin chào {{customerName}},</p><p>Đơn nạp cước <strong>{{orderCode}}</strong> đã được nhà mạng xác nhận.</p><p>Sản phẩm: {{items}}</p><p>Tổng tiền: {{total}} VND</p>',
    'Xin chào {{customerName}},\nNạp cước thành công — đơn {{orderCode}}.\nSản phẩm: {{items}}\nTổng: {{total}} VND',
    '["customerName","orderCode","items","total"]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'DATA_SUCCESS',
    'Nạp data thành công',
    'Nạp data thành công — đơn {{orderCode}}',
    '<p>Xin chào {{customerName}},</p><p>Đơn nạp data <strong>{{orderCode}}</strong> đã được nhà mạng xác nhận.</p><p>Sản phẩm: {{items}}</p><p>Tổng tiền: {{total}} VND</p>',
    'Xin chào {{customerName}},\nNạp data thành công — đơn {{orderCode}}.\nSản phẩm: {{items}}\nTổng: {{total}} VND',
    '["customerName","orderCode","items","total"]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO NOTHING;
