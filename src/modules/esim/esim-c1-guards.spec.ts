import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { EsimOrderService } from './esim-order.service';

const root = join(__dirname, '../../..');

describe('C-1 eSIM guards', () => {
  it('C-1a keeps Airalo catalogue admin on SUPER_ADMIN and account profiles on JWT', () => {
    const settings = readFileSync(
      join(root, 'src/modules/admin/controllers/settings-admin.controller.ts'),
      'utf8',
    );
    expect(settings).toContain('@Roles(UserRole.SUPER_ADMIN)');
    expect(settings).toContain("provider/airalo/catalogue");
    expect(settings).toContain("provider/airalo/import");
    expect(settings).toContain("provider/airalo/packages/:id");

    const publicEsim = readFileSync(join(root, 'src/modules/esim/esim.controller.ts'), 'utf8');
    expect(publicEsim).toContain('@UseGuards(JwtAuthGuard)');
    expect(publicEsim).toContain("profiles");
    expect(publicEsim).not.toContain('UserRole.CUSTOMER');
  });

  it('C-1b refuses a sale when AIRALO is not published, including leftover ESIM_GO rows', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const findActiveById = jest.fn().mockResolvedValue({
      id: 'variant-1',
      type: 'ESIM',
      faceValue: '1000',
    });
    const listForVariant = jest.fn();
    const service = new EsimOrderService(
      { $transaction: jest.fn(), providerProductMapping: { findFirst } } as never,
      {
        createFinancialTransaction: jest.fn(),
        createWithTransaction: jest.fn(),
        createOrderItem: jest.fn(),
      } as never,
      { findActiveById } as never,
      { getCustomerPrice: jest.fn() } as never,
      { listForVariant } as never,
      {
        resolveSystemConfig: () => ({ customerEsimEnabled: true }),
        getPublicPaymentMethods: () => [],
        resolvePaymentMethod: () => {
          throw new Error('payment should not be resolved');
        },
      } as never,
      {
        get: (key: string) =>
          ({ 'esim.enabled': true, 'esim.providerMode': 'live', 'esim.liveArm': true })[key],
      } as never,
    );

    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' } as never,
      ),
    ).rejects.toThrow('No AIRALO mapping is published for this eSIM');
    expect(listForVariant).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalled();
  });

  it('does not print Airalo on customer eSIM pages', () => {
    const files = [
      'apps/web/components/esim/EsimDetailClient.tsx',
      'apps/web/components/esim/EsimInstallGuide.tsx',
      'apps/web/components/esim/EsimCountryPlans.tsx',
      'apps/web/components/esim/EsimCatalogClient.tsx',
      'apps/web/app/account/esim/page.tsx',
      'apps/web/components/esim/EsimInstallPanel.tsx',
    ];
    for (const file of files) {
      expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/Airalo/i);
    }
    const panel = readFileSync(join(root, 'apps/web/components/esim/EsimInstallPanel.tsx'), 'utf8');
    expect(panel).toContain('Đây là mã thử nghiệm, không phải eSIM thật. Không cài hoặc kích hoạt trên máy.');
    expect(panel).toContain('Thử nghiệm');
    expect(readFileSync(join(root, 'apps/web/components/esim/EsimDetailClient.tsx'), 'utf8')).not.toContain(
      'EsimFlag',
    );
  });

  it('does not add an admin sales bypass on public POST /orders', () => {
    const orderService = readFileSync(join(root, 'src/modules/order/services/order.service.ts'), 'utf8');
    const publicController = readFileSync(
      join(root, 'src/modules/order/controllers/order.controller.ts'),
      'utf8',
    );
    expect(orderService).not.toContain('adminTest');
    expect(publicController).not.toContain('adminTest');
    expect(publicController).not.toContain('createAdminTest');
  });

  it('does not let the Japan catalogue import flip customer sales', () => {
    const script = readFileSync(join(root, 'scripts/esim/import-japan-catalogue.mjs'), 'utf8');
    expect(script).not.toMatch(/customerEsimEnabled\s*:/);
  });
});
