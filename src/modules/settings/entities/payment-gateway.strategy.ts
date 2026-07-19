export type MvpPaymentGatewayCode = 'MEGAPAY' | 'SEPAY';

export type FuturePaymentGatewayCode =
  | 'PAYOS'
  | 'VNPAY'
  | 'MOMO'
  | 'ZALOPAY';

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
