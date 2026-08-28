import { ContentAiConfigService } from './content-ai-config.service';

describe('ContentAiConfigService', () => {
  const settingsRepository = { findByKey: jest.fn(), upsert: jest.fn() };
  const encryption = {
    decrypt: jest.fn(),
    encrypt: jest.fn(),
    maskSecret: jest.fn(),
    isMaskedInput: jest.fn(),
  };
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

  it('returns masked admin view and keeps key when update sends mask', async () => {
    settingsRepository.findByKey.mockResolvedValue({
      key: 'content.ai',
      value: {
        providerId: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        apiKeyEnc: 'enc',
        timeoutMs: 170000,
      },
    });
    encryption.decrypt.mockReturnValue('sk-live-secret');
    encryption.maskSecret.mockReturnValue('********ret');
    encryption.isMaskedInput.mockReturnValue(true);
    settingsRepository.upsert = jest.fn().mockResolvedValue({});

    const view = await service.getAdminView();
    expect(view.configured).toBe(true);
    expect(view.apiKey).toBe('********ret');

    await service.updateFromAdmin({
      model: 'gpt-4.1-mini',
      apiKey: '********ret',
    });

    expect(settingsRepository.upsert).toHaveBeenCalledWith(
      'content.ai',
      expect.objectContaining({ apiKeyEnc: 'enc', model: 'gpt-4.1-mini' }),
      expect.any(String),
    );
  });

  it('clamps timeout above job soft wall-clock', async () => {
    settingsRepository.findByKey.mockResolvedValue({
      key: 'content.ai',
      value: {
        providerId: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        apiKeyEnc: 'enc',
        timeoutMs: 300_000,
      },
    });
    encryption.decrypt.mockReturnValue('sk-test-key');

    const cfg = await service.resolveConfig();
    expect(cfg?.timeoutMs).toBeLessThanOrEqual(170_000);

    const view = await service.getAdminView();
    expect(view.maxAllowedTimeoutMs).toBe(170_000);
    expect(view.jobTimeoutMs).toBe(180_000);
  });

  it('resolveConfigForProbe uses unsaved api key override', async () => {
    settingsRepository.findByKey.mockResolvedValue(null);
    encryption.isMaskedInput.mockReturnValue(false);

    const cfg = await service.resolveConfigForProbe({
      apiKey: 'sk-form-key',
      baseUrl: 'https://example.com/v1',
      model: 'custom-model',
    });

    expect(cfg?.apiKey).toBe('sk-form-key');
    expect(cfg?.baseUrl).toBe('https://example.com/v1');
    expect(cfg?.model).toBe('custom-model');
  });
});
