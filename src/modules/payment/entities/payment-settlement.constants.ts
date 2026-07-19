import type { PaymentMethodGateway } from '../../settings/entities/settings.constants';

export type PaymentSettlementType =
  | 'DIRECT_TO_MERCHANT'
  | 'GATEWAY_SETTLEMENT';

export const PAYMENT_SETTLEMENT_TYPES: PaymentSettlementType[] = [
  'DIRECT_TO_MERCHANT',
  'GATEWAY_SETTLEMENT',
];

/** Default settlement model per gateway when not configured explicitly. */
export function defaultSettlementType(
  gatewayCode: PaymentMethodGateway,
): PaymentSettlementType {
  return gatewayCode === 'MEGAPAY' ? 'GATEWAY_SETTLEMENT' : 'DIRECT_TO_MERCHANT';
}

export function normalizeSettlementType(
  value: unknown,
  gatewayCode: PaymentMethodGateway,
): PaymentSettlementType {
  if (value === 'DIRECT_TO_MERCHANT' || value === 'GATEWAY_SETTLEMENT') {
    return value;
  }
  return defaultSettlementType(gatewayCode);
}
