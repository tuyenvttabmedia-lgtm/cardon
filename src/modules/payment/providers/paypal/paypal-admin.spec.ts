import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { SettingsAdminService } from '../../../admin/services/settings-admin.service';
import { PaypalClient } from './paypal.client';
import { isPaypalPlaceholder, paypalCredentialStatus } from './paypal.rules';

describe('PayPal admin configuration', () => {
  it('reports NOT_CONFIGURED, INCOMPLETE, and CONFIGURED without claiming CONNECTED', () => {
    expect(paypalCredentialStatus({ clientId: '', clientSecret: '', webhookId: '' })).toBe('NOT_CONFIGURED');
    expect(paypalCredentialStatus({ clientId: 'id', clientSecret: '', webhookId: 'wh' })).toBe('INCOMPLETE');
    expect(
      paypalCredentialStatus({ clientId: 'id', clientSecret: 'secret', webhookId: 'wh', lastProbeOk: null }),
    ).toBe('CONFIGURED');
    expect(
      paypalCredentialStatus({ clientId: 'id', clientSecret: 'secret', webhookId: 'wh', lastProbeOk: false }),
    ).toBe('CONNECTION_ERROR');
    expect(Object.values({
      a: paypalCredentialStatus({ clientId: '', clientSecret: '', webhookId: '' }),
    })).not.toContain('CONNECTED');
  });

  it('rejects placeholder text and treats a mask as not a new secret', () => {
    expect(isPaypalPlaceholder('Dán PayPal client_secret')).toBe(true);
    expect(isPaypalPlaceholder('real-secret')).toBe(false);
    expect(isPaypalPlaceholder('********abc')).toBe(false);
  });

  it('keeps the existing secret when the update omits it, blanks it, or resends the mask', async () => {
    const secret = 'super-secret-value';
    const harness = buildHarness({ clientSecretEnc: `enc:${secret}` });
    await harness.service.updatePaymentPaypal('admin-1', { clientId: 'new-client', mode: 'sandbox' });
    await harness.service.updatePaymentPaypal('admin-1', { clientSecret: '', webhookId: 'wh-1' });
    await harness.service.updatePaymentPaypal('admin-1', { clientSecret: '********ret' });
    expect(harness.saved.clientSecretEnc).toBe(`enc:${secret}`);
    expect(JSON.stringify(harness.audit)).not.toContain(secret);
    expect(harness.saved.esimEnabled).toBe(false);
  });

  it('does not store a placeholder or turn checkout flags on when the mode changes', async () => {
    const harness = buildHarness({ clientSecretEnc: 'enc:kept-secret', esimEnabled: false });
    await expect(
      harness.service.updatePaymentPaypal('admin-1', {
        clientSecret: 'Dán PayPal client_secret',
        mode: 'sandbox',
        esimEnabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.repo.upsert).not.toHaveBeenCalled();

    await harness.service.updatePaymentPaypal('admin-1', { mode: 'sandbox', esimEnabled: true, clientId: 'id-only' });
    expect(harness.saved.esimEnabled).toBe(false);
    expect(harness.saved.clientSecretEnc).toBe('enc:kept-secret');
    expect(harness.audit.at(-1)).toMatchObject({
      actorId: 'admin-1',
      modeBefore: 'sandbox',
      modeAfter: 'sandbox',
      paypalEsimEnabledBefore: false,
      paypalEsimEnabledAfter: false,
      customerEsimEnabledBefore: false,
      customerEsimEnabledAfter: false,
      salesOpenBefore: false,
      salesOpenAfter: false,
    });
    expect(JSON.stringify(harness.audit)).not.toContain('kept-secret');
  });

  it('does not call PayPal when the admin probes LIVE', async () => {
    const fetchImpl = jest.fn();
    const harness = buildHarness({
      clientIdEnc: 'enc:id',
      clientSecretEnc: 'enc:secret',
      webhookIdEnc: 'enc:wh',
      mode: 'live',
    });
    (harness.service as unknown as { paypalClient: PaypalClient }).paypalClient = new PaypalClient(fetchImpl);
    const result = await harness.service.testPaypalConnection('admin-1');
    expect(result).toMatchObject({ connectionStatus: 'CONNECTION_ERROR', reason: 'LIVE_PROBE_DISABLED', connected: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks customer and agent from the settings role guard', () => {
    const guard = new RolesGuard({
      getAllAndOverride: () => [UserRole.SUPER_ADMIN],
    } as never);
    const activate = (role: UserRole) =>
      guard.canActivate({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', role } }) }),
      } as never);
    expect(() => activate(UserRole.CUSTOMER)).toThrow(ForbiddenException);
    expect(() => activate(UserRole.AGENT)).toThrow(ForbiddenException);
    expect(activate(UserRole.SUPER_ADMIN)).toBe(true);
  });
});

function buildHarness(stored: Record<string, unknown>) {
  let saved: Record<string, unknown> = { ...stored };
  const audit: Record<string, unknown>[] = [];
  const view = () => ({
    connectionStatus: paypalCredentialStatus({
      clientId: saved.clientIdEnc ? 'id' : '',
      clientSecret: saved.clientSecretEnc ? 'secret' : '',
      webhookId: saved.webhookIdEnc ? 'wh' : '',
    }),
    paypalEsimEnabled: saved.esimEnabled === true,
    customerEsimEnabled: false,
    salesOpen: false,
    mode: saved.mode === 'live' ? 'live' : 'sandbox',
    clientSecret: saved.clientSecretEnc ? '********ret' : undefined,
  });
  const store = {
    getRawStored: jest.fn(async () => ({ ...saved })),
    decryptField: (enc?: string) => (typeof enc === 'string' && enc.startsWith('enc:') ? enc.slice(4) : undefined),
    reload: jest.fn(async () => undefined),
    getPaypalAdminView: jest.fn(() => view()),
    resolvePaypalConfig: jest.fn(() => ({
      esimEnabled: saved.esimEnabled === true,
      mode: saved.mode === 'live' ? 'live' : 'sandbox',
      clientId: saved.clientIdEnc ? 'id' : '',
      clientSecret: saved.clientSecretEnc ? 'secret-value' : '',
      webhookId: saved.webhookIdEnc ? 'wh' : '',
    })),
  };
  const repo = {
    upsert: jest.fn(async (_key: string, value: Record<string, unknown>) => {
      saved = value;
    }),
  };
  const encryption = {
    isMaskedInput: (value?: string) => !!value && /^\*{8}/.test(value),
    encrypt: (value: string) => `enc:${value}`,
    maskSecret: (value?: string) => (value ? `********${value.slice(-3)}` : undefined),
  };
  const adminAudit = {
    record: jest.fn(async (_id: string, _action: string, _type: string, _target: string, metadata: Record<string, unknown>) => {
      audit.push(metadata);
    }),
  };
  const service = new SettingsAdminService(
    store as never,
    repo as never,
    encryption as never,
    adminAudit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
  );
  return {
    service,
    repo,
    audit,
    get saved() {
      return saved;
    },
  };
}
