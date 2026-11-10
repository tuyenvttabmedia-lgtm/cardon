import { readFileSync } from 'fs';
import { join } from 'path';
import { SettingsAdminService } from '../admin/services/settings-admin.service';
import { SETTINGS_KEYS } from '../settings/entities/settings.constants';
import { EsimOrderService } from './esim-order.service';
import { EsimPublicCatalogService } from './esim-public-catalog.service';

const root = join(__dirname, '../../..');

function liveEnv(getKey: string) {
  return (
    {
      'esim.enabled': true,
      'esim.providerMode': 'live',
      'esim.liveArm': true,
    } as Record<string, boolean | string>
  )[getKey];
}

describe('eSIM customer sales toggle', () => {
  function settingsAdmin(current: Record<string, unknown>) {
    const upsert = jest.fn();
    let stored = { ...current };
    const service = new SettingsAdminService(
      {
        getRawStored: async () => stored,
        reload: async () => undefined,
        getSystemAdminView: () => ({
          ...stored,
          customerEsimEnabled: stored.customerEsimEnabled === true,
        }),
      } as never,
      { upsert } as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
    );
    upsert.mockImplementation(async (_key: string, value: Record<string, unknown>) => {
      stored = value;
    });
    return { service, upsert };
  }

  it('updateSystem turns customerEsimEnabled off and keeps unrelated JSON fields', async () => {
    const { service, upsert } = settingsAdmin({
      siteName: 'CardOn.vn',
      publicUrl: 'https://cardon.vn',
      customerTopupEnabled: true,
      customerDataEnabled: false,
      customerEsimEnabled: true,
      mysteryOpsFlag: true,
    });

    const view = await service.updateSystem('admin-1', { customerEsimEnabled: false });

    expect(upsert).toHaveBeenCalledWith(
      SETTINGS_KEYS.SYSTEM,
      expect.objectContaining({
        siteName: 'CardOn.vn',
        publicUrl: 'https://cardon.vn',
        customerTopupEnabled: true,
        customerDataEnabled: false,
        customerEsimEnabled: false,
        mysteryOpsFlag: true,
      }),
    );
    expect(view.customerEsimEnabled).toBe(false);
  });

  it('updateSystem can turn customerEsimEnabled back on without dropping topup/data', async () => {
    const { service, upsert } = settingsAdmin({
      customerTopupEnabled: true,
      customerDataEnabled: true,
      customerEsimEnabled: false,
    });

    await service.updateSystem('admin-1', { customerEsimEnabled: true });

    expect(upsert).toHaveBeenCalledWith(
      SETTINGS_KEYS.SYSTEM,
      expect.objectContaining({
        customerTopupEnabled: true,
        customerDataEnabled: true,
        customerEsimEnabled: true,
      }),
    );
  });

  it('GET offers salesOpen follows the settings flag under live env', async () => {
    const closed = new EsimPublicCatalogService(
      {} as never,
      { resolveSystemConfig: () => ({ customerEsimEnabled: false }) } as never,
      { get: liveEnv } as never,
    );
    const open = new EsimPublicCatalogService(
      {} as never,
      { resolveSystemConfig: () => ({ customerEsimEnabled: true }) } as never,
      { get: liveEnv } as never,
    );
    expect(closed.salesOpen()).toBe(false);
    expect(open.salesOpen()).toBe(true);
  });

  it('create rejects a new eSIM order when the settings flag is off', async () => {
    const transaction = jest.fn();
    const service = new EsimOrderService(
      { $transaction: transaction } as never,
      {} as never,
      { findActiveById: jest.fn() } as never,
      {} as never,
      {} as never,
      { resolveSystemConfig: () => ({ customerEsimEnabled: false }) } as never,
      { get: liveEnv } as never,
    );
    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' } as never,
      ),
    ).rejects.toThrow('eSIM sales are disabled');
    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        { id: 'admin-1', email: 'admin@test.invalid', role: 'ADMIN' } as never,
      ),
    ).rejects.toThrow('eSIM sales are disabled');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not gate fulfillment or card/topup dispatch on the sales flag', () => {
    expect(readFileSync(join(root, 'src/modules/esim/esim-fulfillment.service.ts'), 'utf8')).not.toContain(
      'evaluateEsimSale',
    );
    expect(
      readFileSync(join(root, 'src/modules/provider/services/fulfillment-dispatch.service.ts'), 'utf8'),
    ).not.toContain('evaluateEsimSale');
    expect(
      readFileSync(join(root, 'src/modules/provider/services/fulfillment-dispatch.service.ts'), 'utf8'),
    ).toContain('esimQueue');
  });

  it('admin system settings exposes the eSIM toggle beside topup/data', () => {
    const page = readFileSync(join(root, 'apps/admin/app/configuration/system/page.tsx'), 'utf8');
    expect(page).toContain('customerEsimEnabled');
    expect(page).toContain('customerTopupEnabled');
    expect(page).toContain('customerDataEnabled');
    expect(readFileSync(join(root, 'apps/admin/app/products/esim/page.tsx'), 'utf8')).not.toContain(
      'customerEsimEnabled',
    );
  });
});
