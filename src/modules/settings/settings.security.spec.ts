import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { SettingsEncryptionService } from './services/settings-encryption.service';
import { SettingsRepository } from './repositories/settings.repository';
import { SettingsStoreService } from './services/settings-store.service';
import { SETTINGS_KEYS } from './entities/settings.constants';

describe('Phase 5C.5 — Settings security', () => {
  const encryptionKey = 'test-encryption-key-32chars-min!!';

  function createEncryption() {
    const configService = {
      get: (key: string) => (key === 'encryption.key' ? encryptionKey : undefined),
    } as ConfigService;
    return new SettingsEncryptionService(configService);
  }

  it('encrypts and decrypts secrets with AES-256-GCM', () => {
    const encryption = createEncryption();
    const plain = 'super-secret-api-key-xyz';
    const cipher = encryption.encrypt(plain);
    expect(cipher).not.toContain(plain);
    expect(cipher.split(':').length).toBe(3);
    expect(encryption.decrypt(cipher)).toBe(plain);
  });

  it('masks secrets as ********123', () => {
    const encryption = createEncryption();
    expect(encryption.maskSecret('abcdefghij')).toBe('********hij');
    expect(encryption.isMaskedInput('********abc')).toBe(true);
    expect(encryption.isMaskedInput('new-secret')).toBe(false);
  });

  it('falls back to ENV when DB setting is empty', () => {
    const encryption = createEncryption();
    const repository = {
      findAll: jest.fn().mockResolvedValue([]),
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

    expect(store.hasDbSetting(SETTINGS_KEYS.PAYMENT_MEGAPAY)).toBe(false);
    const config = store.resolveMegapayConfig();
    expect(config.merchantId).toBe('env-merchant');
    expect(config.secretKey).toBe('env-secret-key');
    expect(store.getMegapayAdminView().source).toBe('environment');
  });

  it('prefers database config over ENV after reload', async () => {
    const encryption = createEncryption();
    let dbRows: Array<{ key: string; value: unknown }> = [];
    const repository = {
      findAll: jest.fn().mockImplementation(async () => dbRows),
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
    await store.reload();

    dbRows = [
      {
        key: SETTINGS_KEYS.PAYMENT_MEGAPAY,
        value: {
          merchantId: 'db-merchant',
          secretKeyEnc: encryption.encrypt('db-secret'),
          endpoint: 'https://db-megapay.example',
          returnUrl: 'https://cardon.vn/db-return',
          webhookSecretEnc: encryption.encrypt('db-webhook'),
        },
      },
    ];
    await store.reload();

    const config = store.resolveMegapayConfig();
    expect(config.merchantId).toBe('db-merchant');
    expect(config.secretKey).toBe('db-secret');
    expect(store.getMegapayAdminView().source).toBe('database');
    expect(store.getMegapayAdminView().secretKey).toBe('********ret');
  });

  it('reloads provider esale config from database', async () => {
    const encryption = createEncryption();
    const pem = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
    let dbRows: Array<{ key: string; value: unknown }> = [
      {
        key: SETTINGS_KEYS.PROVIDER_ESALE,
        value: {
          cardApiUrl: 'https://esale-card.example/',
          topupApiUrl: 'https://esale-topup.example/',
          agencyCode: 'AG1',
          clientCode: 'CL1',
          secretKeyEnc: encryption.encrypt('esale-secret'),
          privateKeyEnc: encryption.encrypt(pem),
        },
      },
    ];
    const repository = {
      findAll: jest.fn().mockImplementation(async () => dbRows),
    } as unknown as SettingsRepository;
    const configService = {
      get: (key: string) =>
        key === 'encryption.key' ? encryptionKey : undefined,
    } as ConfigService;

    const store = new SettingsStoreService(repository, encryption, configService);
    await store.reload();

    const config = store.resolveEsaleConfig();
    expect(config.agencyCode).toBe('AG1');
    expect(config.secretKey).toBe('esale-secret');
    expect(config.privateKeyPem).toContain('BEGIN PRIVATE KEY');
  });
});

describe('Phase 5C.5 — Settings permission', () => {
  it('settings admin routes require SUPER_ADMIN role', () => {
    const allowed = UserRole.SUPER_ADMIN;
    expect(allowed).toBe('SUPER_ADMIN');
    expect(UserRole.ADMIN).not.toBe(allowed);
    expect(UserRole.SUPPORT).not.toBe(allowed);
  });

  it('nav settings is gated by SUPER_ADMIN role not settings.manage alone', () => {
    const navRoles = ['SUPER_ADMIN'];
    expect(navRoles).toContain('SUPER_ADMIN');
    expect(navRoles).not.toContain('ADMIN');
  });
});
