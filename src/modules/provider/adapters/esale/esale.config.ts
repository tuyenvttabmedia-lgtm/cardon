import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';

export interface EsaleConfig {
  cardApiUrl: string;
  topupApiUrl: string;
  agencyCode: string;
  clientCode: string;
  secretKey: string;
  privateKeyPem: string;
  esalePublicKeyPem?: string;
  timeoutMs: number;
  defaultCardType: string;
  verifyResponseSignature: boolean;
}

@Injectable()
export class EsaleConfigService {
  constructor(
    private readonly configService: ConfigService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  isConfigured(): boolean {
    return this.settingsStore.isEsaleConfigured();
  }

  shouldUseMock(): boolean {
    const explicit = this.configService.get<boolean>('esale.useMock');
    if (explicit === true) {
      return true;
    }
    if (this.configService.get<string>('app.env') === 'test') {
      return true;
    }
    return !this.isConfigured();
  }

  getConfig(): EsaleConfig {
    return this.settingsStore.resolveEsaleConfig();
  }
}
