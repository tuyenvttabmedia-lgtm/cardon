import { Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';
import { SepayPgEnvironment, SepayPgPaymentMethod } from './sepay.pg';

export type SepayIntegrationMode = 'legacy_qr' | 'payment_gateway';

export interface SepayConfig {
  mode: SepayIntegrationMode;
  /** Legacy bank-transfer QR (SePay webhook) */
  apiKey?: string;
  webhookSecret?: string;
  bankAccount?: string;
  bankCode?: string;
  accountName?: string;
  qrTemplate?: string;
  /** SePay Payment Gateway (checkout + IPN) */
  merchantId?: string;
  merchantSecretKey?: string;
  ipnSecretKey?: string;
  environment?: SepayPgEnvironment;
  paymentMethod?: SepayPgPaymentMethod;
  publicUrl?: string;
}

@Injectable()
export class SepayConfigService {
  constructor(private readonly settingsStore: SettingsStoreService) {}

  isConfigured(): boolean {
    return this.settingsStore.isSepayConfigured();
  }

  getConfig(): SepayConfig {
    return this.settingsStore.resolveSepayConfig();
  }
}
