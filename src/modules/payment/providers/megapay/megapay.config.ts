import { Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';

export interface MegapayConfig {
  merchantId: string;
  secretKey: string;
  endpoint: string;
  returnUrl: string;
  webhookSecret: string;
  callbackUrl: string;
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
