-- PayPal as eSIM-international gateway only (not used by cards/topup).
ALTER TYPE "PaymentGatewayCode" ADD VALUE IF NOT EXISTS 'PAYPAL';
