/** Master Spec v1.0 — encrypted AI config in system_settings (no schema change). */
export const CONTENT_AI_SETTINGS_KEY = 'content.ai';

export const CONTENT_AI_PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible';

export const CONTENT_AI_PROMPT_KEY_ANALYZE = 'content.analyze';
export const CONTENT_AI_PROMPT_KEY_OUTLINE = 'content.outline';
export const CONTENT_AI_PROMPT_KEY_WRITE = 'content.write';

/** Default model when content.ai.model is unset — runtime default only, not hard-coded in provider calls. */
export const CONTENT_AI_DEFAULT_MODEL = 'gpt-4.1-mini';

export const CONTENT_AI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export const CONTENT_AI_DEFAULT_TIMEOUT_MS = 170_000;

export interface StoredContentAiConfig {
  providerId?: string;
  baseUrl?: string;
  model?: string;
  apiKeyEnc?: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface ResolvedContentAiConfig {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
}
