import { getSepayPgCheckoutUrl, SepayPgEnvironment } from './sepay.pg';

export interface EsimSepayGatewayConfig {
  merchantId: string;
  merchantSecret: string;
  ipnSecret: string;
  environment: SepayPgEnvironment;
  checkoutUrl: string;
  publicUrl: string;
}

export type EsimSepayGatewayConfigResult =
  | { ok: true; config: EsimSepayGatewayConfig }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'LIVE_SECRET' | 'TEST_SECRET' };

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

/**
 * Same Payment Gateway fields as the working SePay checkout.
 * Sandbox and production differ by merchant, merchant secret, and IPN secret.
 * The environment picks the checkout host. Production does not use a tunnel.
 */
export function readEsimSepayGatewayConfig(input: {
  environment?: string;
  merchantId?: string;
  merchantSecret?: string;
  ipnSecret?: string;
  publicUrl?: string;
}): EsimSepayGatewayConfigResult {
  const environment = clean(input.environment);
  const merchantId = clean(input.merchantId);
  const merchantSecret = clean(input.merchantSecret);
  const ipnSecret = clean(input.ipnSecret);
  const publicUrl = clean(input.publicUrl).replace(/\/$/, '');
  if (
    (environment !== 'sandbox' && environment !== 'production') ||
    !merchantId ||
    !merchantSecret ||
    !ipnSecret ||
    !publicUrl
  ) {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }
  if (environment === 'sandbox' && (merchantSecret.startsWith('spsk_live_') || ipnSecret.startsWith('spsk_live_'))) {
    return { ok: false, reason: 'LIVE_SECRET' };
  }
  if (environment === 'production' && (merchantSecret.startsWith('spsk_test_') || ipnSecret.startsWith('spsk_test_'))) {
    return { ok: false, reason: 'TEST_SECRET' };
  }
  return {
    ok: true,
    config: {
      merchantId,
      merchantSecret,
      ipnSecret,
      environment,
      checkoutUrl: getSepayPgCheckoutUrl(environment),
      publicUrl,
    },
  };
}
