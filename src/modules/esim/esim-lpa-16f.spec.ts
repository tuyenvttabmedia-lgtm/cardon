import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuditTargetType, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { EsimOpsAdminController } from '../admin/controllers/esim-ops.controller';
import { ADMIN_AUDIT_ACTIONS } from '../admin/entities/admin.constants';
import { canAdminViewPin } from '../admin/entities/card-pin.util';
import { EsimAdminService } from './esim-admin.service';

const FIXTURE_LPA = 'LPA:1$smdp.example.test$FIXTURE-16F';
const root = join(__dirname, '../../..');

describe('LPA-16F admin reveal fail-closed', () => {
  const handler = EsimOpsAdminController.prototype.reveal;

  it('exposes POST /admin/esim-ops/orders/:id/reveal for ADMIN and SUPER_ADMIN only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EsimOpsAdminController)).toBe('admin/esim-ops');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('orders/:id/reveal');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    expect(canAdminViewPin(UserRole.SUPPORT)).toBe(false);
    expect(canAdminViewPin(UserRole.CUSTOMER)).toBe(false);
  });

  it('returns LPA only after audit succeeds', async () => {
    const revealInstallSecret = jest.fn().mockResolvedValue({
      orderCode: 'ORD-1',
      profileId: 'profile-1',
      installSecret: FIXTURE_LPA,
      qrSvg: '<svg></svg>',
      appleSetupUrl: null,
    });
    const record = jest.fn().mockResolvedValue(undefined);
    const controller = new EsimOpsAdminController(
      { revealInstallSecret } as never,
      {} as never,
      {} as never,
      {} as never,
      { record } as never,
    );
    const result = await controller.reveal(
      { id: 'admin-1', role: UserRole.ADMIN } as never,
      'order-1',
      { headers: {}, socket: {} } as never,
    );
    expect(record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ESIM_LPA_REVEALED,
      AuditTargetType.ORDER,
      'order-1',
      { orderCode: 'ORD-1', profileId: 'profile-1', role: UserRole.ADMIN, outcome: 'revealed' },
      undefined,
    );
    expect(JSON.stringify(record.mock.calls[0][4])).not.toContain(FIXTURE_LPA);
    expect(JSON.stringify(record.mock.calls[0][4])).not.toContain('<svg');
    expect(result.installSecret).toBe(FIXTURE_LPA);
    expect(revealInstallSecret.mock.invocationCallOrder[0]).toBeLessThan(
      record.mock.invocationCallOrder[0],
    );
  });

  it('does not return LPA when audit throws', async () => {
    const controller = new EsimOpsAdminController(
      {
        revealInstallSecret: jest.fn().mockResolvedValue({
          orderCode: 'ORD-1',
          profileId: 'profile-1',
          installSecret: FIXTURE_LPA,
          qrSvg: '<svg></svg>',
          appleSetupUrl: 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn().mockRejectedValue(new Error('audit down')) } as never,
    );
    await expect(
      controller.reveal({ id: 'admin-1', role: UserRole.SUPER_ADMIN } as never, 'order-1', {
        headers: {},
        socket: {},
      } as never),
    ).rejects.toThrow('audit down');
  });

  it('rejects SUPPORT before decrypt', async () => {
    const revealInstallSecret = jest.fn();
    const controller = new EsimOpsAdminController(
      { revealInstallSecret } as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
    );
    await expect(
      controller.reveal({ id: 'support-1', role: UserRole.SUPPORT } as never, 'order-1', {
        headers: {},
        socket: {},
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(revealInstallSecret).not.toHaveBeenCalled();
  });

  it('admin GET ops never returns the install secret', async () => {
    const service = new EsimAdminService(
      {
        orderItem: {
          findFirst: async () => ({
            variant: { name: '1GB' },
            esimQuote: {
              providerProductCode: 'pkg',
              providerMode: 'LIVE',
              provider: { code: 'AIRALO', name: 'Airalo' },
            },
            esimProfile: { id: 'p1', installSecretEnc: 'enc' },
            esimAttempts: [],
          }),
        },
      } as never,
      {} as never,
      undefined,
      { decrypt: () => FIXTURE_LPA } as never,
    );
    const ops = await service.getOrderOps('order-1', { canReveal: true });
    expect(ops.installSecret).toBeNull();
    expect(ops.canRevealInstallSecret).toBe(true);
    expect(ops.installSecretMasked).not.toBe(FIXTURE_LPA);
  });
});

describe('LPA-16F source contract', () => {
  it('throttles guest reveal separately and leaves lookup limiters unchanged', () => {
    const source = readFileSync(join(root, 'src/modules/order/controllers/order.controller.ts'), 'utf8');
    expect(source).toContain("@Post(':id/esim/reveal')");
    expect(source).toContain('@Throttle({ default: { limit: 5, ttl: 900_000 } })');
    expect(source).toContain("@Get('lookup/delivery')");
    expect(source).toContain("@Get('lookup/cards')");
    expect(source).toContain("@Get('lookup')");
    const revealBlock = source.slice(source.indexOf("@Post(':id/esim/reveal')"));
    expect(revealBlock).toMatch(/@Throttle\(\{\s*default:\s*\{\s*limit:\s*5,\s*ttl:\s*900_000\s*\}\s*\}\)/);
    expect(revealBlock).not.toContain('PIN_VIEWED');
    expect(revealBlock).not.toContain('getTracker');
    expect(revealBlock).not.toContain('generateKey');
  });

  it('does not write customer or guest eSIM view events', () => {
    const source = readFileSync(join(root, 'src/modules/order/services/order-delivery.service.ts'), 'utf8');
    const reveal = source.slice(
      source.indexOf('async revealEsimInstall'),
      source.indexOf('private async buildDeliveryResponse'),
    );
    expect(reveal).not.toContain('PIN_VIEWED');
    expect(reveal).not.toContain('orderEvents');
    expect(reveal).not.toContain('ESIM_LPA_VIEWED');
  });

  it('keeps web secrets in React state and polls metadata only', () => {
    const panel = readFileSync(join(root, 'apps/web/components/esim/EsimInstallPanel.tsx'), 'utf8');
    const account = readFileSync(join(root, 'apps/web/app/account/esim/page.tsx'), 'utf8');
    const delivery = readFileSync(join(root, 'apps/web/app/orders/[id]/OrderDeliveryClient.tsx'), 'utf8');
    const content = readFileSync(join(root, 'apps/web/components/order/OrderDeliveryContent.tsx'), 'utf8');
    expect(panel).toContain('orderApi.revealEsim');
    expect(panel).toContain('revealStateForOrder');
    expect(panel).toContain('applyRevealForOrder');
    expect(panel).toContain('retainRevealAfterMetadataPoll');
    expect(panel).toContain('setRevealed(null)');
    expect(panel).toContain("t('esim.hideCode')");
    expect(panel).not.toContain('localStorage');
    expect(panel).not.toContain('sessionStorage');
    expect(panel).not.toContain('console.log');
    expect(account).toContain('listEsimProfiles');
    expect(account).not.toContain('revealEsim');
    expect(delivery).not.toContain('getEsimProfile');
    expect(delivery).not.toContain('setEsimSecret');
    expect(content).not.toContain('esimSecret');
  });
});
