-- Phase 6O.18.1 — payment method display name on order snapshot

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "method_display_name" VARCHAR(128);

UPDATE "orders"
SET "method_display_name" = CASE
  WHEN "payment_method_code" = 'SEPAY_VA_QR' THEN 'VietQR'
  WHEN "payment_method_code" = 'SEPAY_NAPAS_QR' THEN 'NAPAS 247'
  WHEN "payment_method_code" = 'MEGAPAY_ATM' THEN 'ATM nội địa'
  WHEN "payment_method_code" = 'MEGAPAY_VISA' THEN 'Visa / Mastercard'
  WHEN "payment_method_code" = 'MEGAPAY_WALLET' THEN 'Ví điện tử'
  WHEN "payment_method_code" = 'VIETQR' THEN 'VietQR'
  WHEN "payment_method_code" = 'NAPAS_247' THEN 'NAPAS 247'
  WHEN "payment_method_code" = 'ATM' THEN 'ATM nội địa'
  WHEN "payment_method_code" = 'VISA' THEN 'Visa / Mastercard'
  ELSE COALESCE("payment_method_code", '')
END
WHERE "method_display_name" IS NULL;

UPDATE "orders"
SET "payment_method_code" = CASE
  WHEN "payment_method_code" = 'SEPAY_VA_QR' THEN 'VIETQR'
  WHEN "payment_method_code" = 'SEPAY_NAPAS_QR' THEN 'NAPAS_247'
  WHEN "payment_method_code" = 'MEGAPAY_ATM' THEN 'ATM'
  WHEN "payment_method_code" = 'MEGAPAY_VISA' THEN 'VISA'
  WHEN "payment_method_code" = 'MEGAPAY_WALLET' THEN 'WALLET'
  ELSE "payment_method_code"
END
WHERE "payment_method_code" IN (
  'SEPAY_VA_QR', 'SEPAY_NAPAS_QR', 'MEGAPAY_ATM', 'MEGAPAY_VISA', 'MEGAPAY_WALLET'
);
