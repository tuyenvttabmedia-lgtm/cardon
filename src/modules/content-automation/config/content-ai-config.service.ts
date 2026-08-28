import { Injectable } from '@nestjs/common';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import { SettingsEncryptionService } from '../../settings/services/settings-encryption.service';
import {
  CONTENT_AI_DEFAULT_BASE_URL,
  CONTENT_AI_DEFAULT_MODEL,
  CONTENT_AI_DEFAULT_TIMEOUT_MS,
  CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE,
  CONTENT_AI_SETTINGS_KEY,
  type ResolvedContentAiConfig,
  type StoredContentAiConfig,
} from '../entities/content-ai.constants';

@Injectable()
export class ContentAiConfigService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly encryption: SettingsEncryptionService,
  ) {}

  async getStoredConfig(): Promise<StoredContentAiConfig | null> {
    const row = await this.settingsRepository.findByKey(CONTENT_AI_SETTINGS_KEY);
    if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
      return null;
    }
    return row.value as StoredContentAiConfig;
  }

  async isConfigured(): Promise<boolean> {
    const resolved = await this.resolveConfig();
    return resolved !== null;
  }

  async resolveConfig(): Promise<ResolvedContentAiConfig | null> {
    const stored = await this.getStoredConfig();
    if (!stored?.apiKeyEnc) {
      return null;
    }

    let apiKey: string;
    try {
      apiKey = this.encryption.decrypt(stored.apiKeyEnc);
    } catch {
      return null;
    }

    if (!apiKey.trim()) {
      return null;
    }

    return {
      providerId: stored.providerId?.trim() || CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE,
      baseUrl: stored.baseUrl?.trim() || CONTENT_AI_DEFAULT_BASE_URL,
      model: stored.model?.trim() || CONTENT_AI_DEFAULT_MODEL,
      apiKey,
      timeoutMs: stored.timeoutMs ?? CONTENT_AI_DEFAULT_TIMEOUT_MS,
      maxTokens: stored.maxTokens ?? 4096,
      temperature: stored.temperature ?? 0.3,
    };
  }
}
