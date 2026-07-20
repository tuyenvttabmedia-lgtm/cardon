/**
 * Phase 5C.6 — Runtime config safety audit (read-only verification)
 */
import { ConfigService } from '@nestjs/config';
import { MegapayConfigService } from '../payment/providers/megapay/megapay.config';
import { EsaleConfigService } from '../provider/adapters/esale/esale.config';
import { SettingsEncryptionService } from './services/settings-encryption.service';
import { SettingsRepository } from './repositories/settings.repository';
import { SettingsStoreService } from './services/settings-store.service';
import { SETTINGS_KEYS } from './entities/settings.constants';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Phase 5C.6 — Config cache reload', () => {
  const encryptionKey = 'test-encryption-key-32chars-min!!';

  function createStack(dbRows: Array<{ key: string; value: unknown }> = []) {
    const encryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const repository = {
      findAll: jest.fn().mockResolvedValue(dbRows),
      upsert: jest.fn().mockImplementation(async (key: string, value: unknown) => {
        const idx = dbRows.findIndex((r) => r.key === key);
        if (idx >= 0) dbRows[idx] = { key, value };
        else dbRows.push({ key, value });
        return { key, value };
      }),
    } as unknown as SettingsRepository;
    const configService = {
      get: (key: string) => {
        const map: Record<string, string> = {
          'encryption.key': encryptionKey,
          'megapay.merchantId': 'env-merchant',
          'megapay.secretKey': 'env-secret-key',
          'megapay.endpoint': 'https://megapay.example',
          'megapay.returnUrl': 'https://cardon.vn/return',
          'megapay.webhookSecret': 'env-webhook',
          'appPublicUrl': 'https://cardon.vn',
          'app.apiPrefix': 'api/v1',
        };
        return map[key];
      },
    } as ConfigService;
    const store = new SettingsStoreService(repository, encryption, configService);
    const megapayConfig = new MegapayConfigService(store);
    return { store, megapayConfig, repository, encryption, dbRows };
  }

  it('admin update → reload() → payment config reads new value (no restart)', async () => {
    const { store, megapayConfig, dbRows, encryption } = createStack();

    await store.reload();
    expect(megapayConfig.getConfig().merchantId).toBe('env-merchant');

    dbRows.push({
      key: SETTINGS_KEYS.PAYMENT_MEGAPAY,
      value: {
        merchantId: 'db-merchant-after-save',
        secretKeyEnc: encryption.encrypt('db-secret'),
        endpoint: 'https://db-megapay.example',
        returnUrl: 'https://cardon.vn/db-return',
        webhookSecretEnc: encryption.encrypt('db-webhook'),
      },
    });

    await store.reload();

    expect(megapayConfig.getConfig().merchantId).toBe('db-merchant-after-save');
    expect(megapayConfig.getConfig().secretKey).toBe('db-secret');
  });

  it('provider esale config reflects cache after reload', async () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
    const preEncryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const { store, encryption, dbRows } = createStack([
      {
        key: SETTINGS_KEYS.PROVIDER_ESALE,
        value: {
          cardApiUrl: 'https://esale-card.example/',
          topupApiUrl: 'https://esale-topup.example/',
          agencyCode: 'AG1',
          clientCode: 'CL1',
          secretKeyEnc: preEncryption.encrypt('esale-secret'),
          privateKeyEnc: preEncryption.encrypt(pem),
        },
      },
    ]);
    const esaleConfig = new EsaleConfigService(
      { get: (key: string) => (key === 'app.env' ? 'development' : undefined) } as ConfigService,
      store,
    );

    await store.reload();
    expect(esaleConfig.getConfig().agencyCode).toBe('AG1');

    dbRows[0] = {
      key: SETTINGS_KEYS.PROVIDER_ESALE,
      value: {
        cardApiUrl: 'https://esale-card.example/',
        topupApiUrl: 'https://esale-topup.example/',
        agencyCode: 'AG2-reloaded',
        clientCode: 'CL1',
        secretKeyEnc: encryption.encrypt('esale-secret'),
        privateKeyEnc: encryption.encrypt(pem),
      },
    };
    await store.reload();
    expect(esaleConfig.getConfig().agencyCode).toBe('AG2-reloaded');
  });

  it('persist path in settings-admin.service calls reload after upsert', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/modules/admin/services/settings-admin.service.ts'),
      'utf8',
    );
    const persistStart = source.indexOf('private async persist(');
    const persistBlock = source.slice(persistStart);
    expect(persistBlock).toMatch(/await this\.settingsRepository\.upsert/);
    expect(persistBlock).toMatch(/await this\.settingsStore\.reload\(\)/);
    const upsertIdx = persistBlock.indexOf('await this.settingsRepository.upsert');
    const reloadIdx = persistBlock.indexOf('await this.settingsStore.reload()');
    expect(reloadIdx).toBeGreaterThan(upsertIdx);
  });
});

describe('Phase 5C.6 — Secret handling', () => {
  const encryptionKey = 'test-encryption-key-32chars-min!!';

  function createStore(dbRows: Array<{ key: string; value: unknown }>) {
    const encryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const repository = {
      findAll: jest.fn().mockResolvedValue(dbRows),
    } as unknown as SettingsRepository;
    const configService = {
      get: (key: string) => {
        const map: Record<string, string> = {
          'encryption.key': encryptionKey,
          'megapay.merchantId': 'env-merchant',
          'megapay.secretKey': 'raw-env-secret-never-in-api',
          'megapay.endpoint': 'https://megapay.example',
          'megapay.returnUrl': 'https://cardon.vn/return',
          'megapay.webhookSecret': 'raw-env-webhook-never-in-api',
          'appPublicUrl': 'https://cardon.vn',
          'app.apiPrefix': 'api/v1',
        };
        return map[key];
      },
    } as ConfigService;
    return new SettingsStoreService(repository, encryption, configService);
  }

  it('admin API views never return raw secrets', async () => {
    const encryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const store = createStore([
      {
        key: SETTINGS_KEYS.PAYMENT_MEGAPAY,
        value: {
          merchantId: 'm1',
          secretKeyEnc: encryption.encrypt('super-raw-secret-key'),
          endpoint: 'https://megapay.example',
          returnUrl: 'https://cardon.vn/return',
          webhookSecretEnc: encryption.encrypt('super-raw-webhook'),
        },
      },
    ]);
    await store.reload();

    const view = store.getMegapayAdminView();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('super-raw-secret-key');
    expect(serialized).not.toContain('super-raw-webhook');
    expect(view.secretKey).toMatch(/^\*{8}/);
    expect(view.webhookSecret).toMatch(/^\*{8}/);
    expect(serialized).not.toContain('secretKeyEnc');
    expect(serialized).not.toContain('webhookSecretEnc');
  });

  it('audit metadata records field names only, not secret values', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/modules/admin/services/settings-admin.service.ts'),
      'utf8',
    );
    expect(source).toContain('{ settingKey: key, updatedFields }');
    expect(source).not.toMatch(/metadata.*secretKey.*value/i);
  });

  const noSecretLogFiles = [
    'src/modules/settings/services/settings-store.service.ts',
    'src/modules/settings/services/settings-encryption.service.ts',
    'src/modules/admin/services/settings-admin.service.ts',
    'src/modules/admin/controllers/settings-admin.controller.ts',
  ];

  it.each(noSecretLogFiles)('%s does not log secrets', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/logger\.(log|debug|warn|error).*secret/i);
    expect(source).not.toMatch(/console\.(log|debug|warn|error).*secret/i);
    expect(source).not.toMatch(/logger\.(log|debug|warn|error).*password/i);
  });
});

describe('Phase 5C.6 — Encryption recovery', () => {
  it('decrypt fails when ENCRYPTION_KEY differs (document backup requirement)', () => {
    const encA = new SettingsEncryptionService({
      get: () => 'encryption-key-alpha-32-characters!!',
    } as unknown as ConfigService);
    const encB = new SettingsEncryptionService({
      get: () => 'encryption-key-beta--32-characters!!',
    } as unknown as ConfigService);

    const cipher = encA.encrypt('provider-credential');
    expect(() => encB.decrypt(cipher)).toThrow();
  });

  it('missing ENCRYPTION_KEY throws on encrypt', () => {
    const enc = new SettingsEncryptionService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(() => enc.encrypt('x')).toThrow('ENCRYPTION_KEY is not configured');
  });
});

describe('Phase 5C.6 — Fallback safety', () => {
  const encryptionKey = 'test-encryption-key-32chars-min!!';

  it('ENV fallback works when DB setting is absent', () => {
    const encryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const repository = { findAll: jest.fn().mockResolvedValue([]) } as unknown as SettingsRepository;
    const configService = {
      get: (key: string) => {
        const map: Record<string, string> = {
          'encryption.key': encryptionKey,
          'sepay.apiKey': 'env-sepay-key',
          'sepay.bankAccount': '123456',
          'sepay.bankCode': 'VCB',
          'sepay.accountName': 'CardOn',
        };
        return map[key];
      },
    } as ConfigService;
    const store = new SettingsStoreService(repository, encryption, configService);

    const config = store.resolveSepayConfig();
    expect(config.apiKey).toBe('env-sepay-key');
    expect(store.getSepayAdminView().source).toBe('environment');
  });

  it('invalid DB config throws explicit error (not silent)', () => {
    const encryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const repository = {
      findAll: jest.fn().mockResolvedValue([
        { key: SETTINGS_KEYS.PAYMENT_MEGAPAY, value: { merchantId: 'only-partial' } },
      ]),
    } as unknown as SettingsRepository;
    const configService = {
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService;
    const store = new SettingsStoreService(repository, encryption, configService);

    expect(() => store.resolveMegapayConfig()).toThrow(
      /DepositCode is not configured|MegaPay is not configured/,
    );
    expect(store.isMegapayConfigured()).toBe(false);
    expect(store.getMegapayAdminView().configured).toBe(false);
  });

  it('isConfigured returns false instead of swallowing invalid config', () => {
    const encryption = new SettingsEncryptionService({
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService);
    const repository = {
      findAll: jest.fn().mockResolvedValue([
        { key: SETTINGS_KEYS.PROVIDER_ESALE, value: { agencyCode: 'X' } },
      ]),
    } as unknown as SettingsRepository;
    const configService = {
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService;
    const store = new SettingsStoreService(repository, encryption, configService);

    expect(store.isEsaleConfigured()).toBe(false);
    expect(() => store.resolveEsaleConfig()).toThrow(/eSale is not configured/);
  });
});
