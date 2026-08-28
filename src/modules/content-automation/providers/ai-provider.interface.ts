export type AiProviderErrorKind =
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'INVALID_REQUEST'
  | 'MALFORMED_OUTPUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';

export interface AiCompletionRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AiCompletionResponse {
  rawText: string;
  parsedJson?: unknown;
  tokensIn: number | null;
  tokensOut: number | null;
  model: string;
  latencyMs: number;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: AiProviderErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiProvider {
  readonly providerId: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
