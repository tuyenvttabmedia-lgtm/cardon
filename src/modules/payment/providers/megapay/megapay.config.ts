import { Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';

export interface MegapayConfig {
  /** DepositCode merchant_code / PG merId */
  merchantId: string;
  /** TripleDES encode key (24 chars) for DepositCode registerVA */
  secretKey: string;
  /**
   * MegaPay PG encodeKey (V1.4.6 merchantToken).
   * Falls back to secretKey when PG encode key is not set separately.
   */
  pgEncodeKey: string;
  /** sandbox | production — PG domain / JS assets */
  pgEnvironment: 'sandbox' | 'production';
  /** Full registerVA URL (DepositCode) */
  endpoint: string;
  returnUrl: string;
  /** @deprecated HMAC placeholder — DepositCode uses notifyPublicKey */
  webhookSecret: string;
  callbackUrl: string;
  /** WOORIBANK | SHINHANBANK | ... (DepositCode bank) */
  bankCode: string;
  /** EPAY RSA public key PEM for DepositCode notify verify */
  notifyPublicKey: string;
  /** Public site domain passed as reqDomain to MegaPay PG */
  reqDomain: string;
}

@Injectable()
export class MegapayConfigService {
  constructor(private readonly settingsStore: SettingsStoreService) {}

  isConfigured(): boolean {
    return this.settingsStore.isMegapayConfigured();
  }

  getConfig(): MegapayConfig {
    return this.settingsStore.resolveMegapayConfig();
  }
}
