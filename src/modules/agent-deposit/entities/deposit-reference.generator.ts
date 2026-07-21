import { generateSepayPaymentCode } from '../../payment/entities/payment-reference.generator';

/**
 * Agent deposit payment codes use the same SePay DH* format as B2C checkout
 * so bank webhooks with a DH payment-code filter deliver to CardOn.
 */
export function generateDepositReference(): string {
  return generateSepayPaymentCode();
}

/** @deprecated Prefer DB lookup on agent_deposits; kept for legacy DEP-* rows. */
export function isAgentDepositReference(reference: string): boolean {
  return reference.startsWith('DEP-') || /^DH[0-9A-Z]{4,30}$/i.test(reference.trim());
}
