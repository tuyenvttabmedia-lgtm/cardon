import type { PaymentGatewayCode } from '@/types/api';
import { formatVnd } from '@/lib/utils';

export type PublicPaymentMethod = {
  methodCode: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  logoUrl: string | null;
  enabled: boolean;
  percentageFee: number;
  fixedFee: number;
  gatewayCode: PaymentGatewayCode;
};

const METHOD_ICONS: Record<string, string> = {
  VIETQR: '🏦',
  NAPAS_247: '🔷',
  ATM: '🏧',
  VISA: '💳',
  WALLET: '👛',
};

export function methodIcon(methodCode: string): string {
  return METHOD_ICONS[methodCode.toUpperCase()] ?? '💳';
}

export function formatPaymentFeeHint(percentageFee: number, fixedFee: number): string | null {
  if (percentageFee > 0 && fixedFee > 0) {
    return `Phí ${percentageFee}% + ${formatVnd(fixedFee)}`;
  }
  if (percentageFee > 0) {
    return `Phí ${percentageFee}%`;
  }
  if (fixedFee > 0) {
    return `Phí ${formatVnd(fixedFee)}`;
  }
  return null;
}

export function enabledMethods(methods: PublicPaymentMethod[]): PublicPaymentMethod[] {
  return methods.filter((m) => m.enabled);
}

export function findPaymentMethod(
  methods: PublicPaymentMethod[],
  methodCode: string | null,
): PublicPaymentMethod | null {
  if (!methodCode) return null;
  const normalized = methodCode.toUpperCase();
  return methods.find((m) => m.methodCode.toUpperCase() === normalized && m.enabled) ?? null;
}

export function methodGateway(method: PublicPaymentMethod): PaymentGatewayCode {
  return method.gatewayCode;
}

/** @deprecated use method.gatewayCode */
export function publicCodeToGateway(code: string): PaymentGatewayCode | null {
  if (code === 'BANK_QR' || code.startsWith('SEPAY') || code === 'VIETQR' || code === 'NAPAS_247') {
    return 'SEPAY';
  }
  if (code === 'BANK_GATEWAY' || code.startsWith('MEGAPAY') || code === 'ATM' || code === 'VISA' || code === 'WALLET') {
    return 'MEGAPAY';
  }
  return null;
}
