import { Injectable } from '@nestjs/common';
import { ContentAiConfigService } from '../config/content-ai-config.service';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
  AiProviderError,
} from './ai-provider.interface';

@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  readonly providerId = 'openai-compatible';

  constructor(private readonly aiConfig: ContentAiConfigService) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const cfg = await this.aiConfig.resolveConfig();
    if (!cfg) {
      throw new AiProviderError('AI not configured', 'INVALID_REQUEST', false);
    }

    const started = Date.now();
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model || cfg.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          response_format: request.jsonMode ? { type: 'json_object' } : undefined,
          temperature: request.temperature ?? cfg.temperature,
          max_tokens: request.maxTokens ?? cfg.maxTokens,
        }),
        signal: AbortSignal.timeout(request.timeoutMs || cfg.timeoutMs),
      });
    } catch (err) {
      const kind =
        err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE';
      throw new AiProviderError(
        err instanceof Error ? err.message : 'Provider request failed',
        kind,
        true,
      );
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
      error?: { message?: string };
    };

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      throw this.mapHttpError(response.status, body.error?.message ?? 'Provider error');
    }

    const rawText = body.choices?.[0]?.message?.content ?? '';
    if (!rawText.trim()) {
      throw new AiProviderError('Empty provider response', 'MALFORMED_OUTPUT', false);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      throw new AiProviderError('Provider returned non-JSON output', 'MALFORMED_OUTPUT', false);
    }

    const tokensIn =
      body.usage?.prompt_tokens != null ? body.usage.prompt_tokens : null;
    const tokensOut =
      body.usage?.completion_tokens != null ? body.usage.completion_tokens : null;

    return {
      rawText,
      parsedJson,
      tokensIn,
      tokensOut,
      model: body.model ?? request.model ?? cfg.model,
      latencyMs,
    };
  }

  private mapHttpError(status: number, message: string): AiProviderError {
    if (status === 401 || status === 403) {
      return new AiProviderError(message.slice(0, 500), 'AUTH', false);
    }
    if (status === 429) {
      return new AiProviderError(message.slice(0, 500), 'RATE_LIMIT', true);
    }
    if (status >= 500) {
      return new AiProviderError(message.slice(0, 500), 'PROVIDER_UNAVAILABLE', true);
    }
    return new AiProviderError(message.slice(0, 500), 'INVALID_REQUEST', false);
  }
}
