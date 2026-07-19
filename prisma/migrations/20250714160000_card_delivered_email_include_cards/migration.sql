-- Include serial/PIN in CARD_DELIVERED customer email
UPDATE "email_templates"
SET
  "html_body" = '<p>Xin chào {{customerName}},</p><p>Đơn hàng <strong>{{orderCode}}</strong> đã hoàn tất.</p><p>Sản phẩm: {{items}}</p><p>Tổng tiền: {{total}} VND</p>{{cardsHtml}}',
  "text_body" = 'Xin chào {{customerName}},
Đơn {{orderCode}} đã hoàn tất.
Sản phẩm: {{items}}
Tổng: {{total}} VND

{{cardsText}}',
  "variables" = '["customerName","orderCode","items","total","cardsHtml","cardsText"]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'CARD_DELIVERED';
