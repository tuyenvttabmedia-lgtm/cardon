import { Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';

export interface MegapayConfig {
  /** DepositCode merchant_code */
  merchantId: string;
  /** TripleDES encode key (24 chars) */
  secretKey: string;
  /** Full registerVA URL */
  endpoint: string;
  returnUrl: string;
  /** @deprecated HMAC placeholder — DepositCode uses notifyPublicKey */
  webhookSecret: string;
  callbackUrl: string;
  /** WOORIBANK | SHINHANBANK | ... */
  bankCode: string;
  /** EPAY RSA public key PEM for notify verify */
  notifyPublicKey: string;
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
