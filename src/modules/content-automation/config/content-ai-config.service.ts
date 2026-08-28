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
import type { UpdateContentAiSettingsDto } from '../dto/content-ai-settings.dto';

export interface ContentAiAdminView {
  configured: boolean;
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  source: 'database' | 'none';
}

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

  async getAdminView(): Promise<ContentAiAdminView> {
    const stored = await this.getStoredConfig();
    if (!stored) {
      return {
        configured: false,
        providerId: CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE,
        baseUrl: CONTENT_AI_DEFAULT_BASE_URL,
        model: CONTENT_AI_DEFAULT_MODEL,
        apiKey: null,
        timeoutMs: CONTENT_AI_DEFAULT_TIMEOUT_MS,
        maxTokens: 4096,
        temperature: 0.3,
        source: 'none',
      };
    }

    let masked: string | null = null;
    if (stored.apiKeyEnc) {
      try {
        masked = this.encryption.maskSecret(this.encryption.decrypt(stored.apiKeyEnc)) ?? null;
      } catch {
        masked = '********';
      }
    }

    return {
      configured: Boolean(stored.apiKeyEnc && masked),
      providerId: stored.providerId?.trim() || CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE,
      baseUrl: stored.baseUrl?.trim() || CONTENT_AI_DEFAULT_BASE_URL,
      model: stored.model?.trim() || CONTENT_AI_DEFAULT_MODEL,
      apiKey: masked,
      timeoutMs: stored.timeoutMs ?? CONTENT_AI_DEFAULT_TIMEOUT_MS,
      maxTokens: stored.maxTokens ?? 4096,
      temperature: stored.temperature ?? 0.3,
      source: 'database',
    };
  }

  async updateFromAdmin(dto: UpdateContentAiSettingsDto): Promise<ContentAiAdminView> {
    const existing = (await this.getStoredConfig()) ?? {};

    let apiKeyEnc = existing.apiKeyEnc;
    if (dto.apiKey !== undefined && dto.apiKey.trim() && !this.encryption.isMaskedInput(dto.apiKey)) {
      apiKeyEnc = this.encryption.encrypt(dto.apiKey.trim());
    }

    const next: StoredContentAiConfig = {
      providerId:
        dto.providerId?.trim() ||
        existing.providerId ||
        CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE,
      baseUrl: dto.baseUrl?.trim() || existing.baseUrl || CONTENT_AI_DEFAULT_BASE_URL,
      model: dto.model?.trim() || existing.model || CONTENT_AI_DEFAULT_MODEL,
      apiKeyEnc,
      timeoutMs: dto.timeoutMs ?? existing.timeoutMs ?? CONTENT_AI_DEFAULT_TIMEOUT_MS,
      maxTokens: dto.maxTokens ?? existing.maxTokens ?? 4096,
      temperature: dto.temperature ?? existing.temperature ?? 0.3,
    };

    await this.settingsRepository.upsert(
      CONTENT_AI_SETTINGS_KEY,
      next as object,
      'Content Automation AI provider config',
    );

    return this.getAdminView();
  }
}
