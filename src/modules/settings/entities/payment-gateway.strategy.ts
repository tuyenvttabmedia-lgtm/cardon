export type MvpPaymentGatewayCode = 'MEGAPAY' | 'SEPAY';

/** PayPal is eSIM-international only — never a card/topup MVP gateway. */
export type EsimInternationalGatewayCode = 'PAYPAL';

export type FuturePaymentGatewayCode =
  | 'PAYOS'
  | 'VNPAY'
  | 'MOMO'
  | 'ZALOPAY'
  | EsimInternationalGatewayCode;

export type PaymentGatewayCode = MvpPaymentGatewayCode | FuturePaymentGatewayCode;

export const MVP_PAYMENT_GATEWAYS: Array<{
  code: MvpPaymentGatewayCode;
  label: string;
}> = [
  { code: 'SEPAY', label: 'SePay' },
  { code: 'MEGAPAY', label: 'MegaPay' },
];

export const COMING_SOON_PAYMENT_GATEWAYS: Array<{ id: string; label: string }> = [
  { id: 'payos', label: 'PayOS' },
  { id: 'momo', label: 'MoMo' },
  { id: 'zalopay', label: 'ZaloPay' },
  { id: 'vnpay', label: 'VNPay' },
];

export const DEFAULT_PAYMENT_GATEWAY: MvpPaymentGatewayCode = 'SEPAY';
