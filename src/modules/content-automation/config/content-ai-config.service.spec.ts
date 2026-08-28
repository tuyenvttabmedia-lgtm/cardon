import { ContentAiConfigService } from './content-ai-config.service';

describe('ContentAiConfigService', () => {
  const settingsRepository = { findByKey: jest.fn() };
  const encryption = { decrypt: jest.fn() };
  let service: ContentAiConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentAiConfigService(settingsRepository as never, encryption as never);
  });

  it('returns null when config missing', async () => {
    settingsRepository.findByKey.mockResolvedValue(null);
    await expect(service.resolveConfig()).resolves.toBeNull();
    await expect(service.isConfigured()).resolves.toBe(false);
  });

  it('resolves config with model from settings', async () => {
    settingsRepository.findByKey.mockResolvedValue({
      key: 'content.ai',
      value: {
        providerId: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        apiKeyEnc: 'enc',
      },
    });
    encryption.decrypt.mockReturnValue('sk-test-key');

    const cfg = await service.resolveConfig();
    expect(cfg?.model).toBe('gpt-4.1-mini');
    expect(cfg?.apiKey).toBe('sk-test-key');
  });
});
