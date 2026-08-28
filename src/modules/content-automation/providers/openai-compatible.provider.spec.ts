import { ContentAiConfigService } from '../config/content-ai-config.service';
import { AiProviderError } from './ai-provider.interface';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

describe('OpenAiCompatibleProvider', () => {
  const aiConfig = { resolveConfig: jest.fn() };
  let provider: OpenAiCompatibleProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new OpenAiCompatibleProvider(aiConfig as unknown as ContentAiConfigService);
    aiConfig.resolveConfig.mockResolvedValue({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });
  });

  it('returns null token usage when provider omits usage block', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"relatedContent":[],"cannibalization":{"risk":"NONE","matches":[]},"recommendations":[],"internalLinkCandidates":[]}' } }],
        model: 'gpt-4.1-mini',
      }),
    }) as never;

    const result = await provider.complete({
      model: 'gpt-4.1-mini',
      systemPrompt: 'system',
      userPrompt: 'user',
      timeoutMs: 1000,
      jsonMode: true,
    });

    expect(result.tokensIn).toBeNull();
    expect(result.tokensOut).toBeNull();
  });

  it('maps HTTP 401 to non-retryable AUTH error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    }) as never;

    await expect(
      provider.complete({
        model: 'gpt-4.1-mini',
        systemPrompt: 'system',
        userPrompt: 'user',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ kind: 'AUTH', retryable: false });
  });

  it('maps HTTP 429 to retryable RATE_LIMIT error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit' } }),
    }) as never;

    await expect(
      provider.complete({
        model: 'gpt-4.1-mini',
        systemPrompt: 'system',
        userPrompt: 'user',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ kind: 'RATE_LIMIT', retryable: true });
  });

  it('maps HTTP 500 to retryable PROVIDER_UNAVAILABLE error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Unavailable' } }),
    }) as never;

    await expect(
      provider.complete({
        model: 'gpt-4.1-mini',
        systemPrompt: 'system',
        userPrompt: 'user',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ kind: 'PROVIDER_UNAVAILABLE', retryable: true });
  });

  it('maps non-JSON body to non-retryable MALFORMED_OUTPUT', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not-json' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    }) as never;

    await expect(
      provider.complete({
        model: 'gpt-4.1-mini',
        systemPrompt: 'system',
        userPrompt: 'user',
        timeoutMs: 1000,
        jsonMode: true,
      }),
    ).rejects.toMatchObject({ kind: 'MALFORMED_OUTPUT', retryable: false });
  });

  it('probeConnection succeeds via GET /models', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }) as never;

    const result = await provider.probeConnection({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe('models');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('probeConnection falls back to chat when /models is unavailable', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'not found' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: 'gpt-4.1-mini', choices: [{ message: { content: 'ok' } }] }),
      }) as never;

    const result = await provider.probeConnection({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe('chat');
  });

  it('probeConnection throws AUTH on 401 from /models', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'bad key' } }),
    }) as never;

    await expect(
      provider.probeConnection({
        providerId: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        apiKey: 'sk-bad',
        timeoutMs: 1000,
        maxTokens: 1000,
        temperature: 0.3,
      }),
    ).rejects.toBeInstanceOf(AiProviderError);
  });
});
