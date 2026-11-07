import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { canAdminViewPin } from '../admin/entities/card-pin.util';
import { OrderDeliveryService } from '../order/services/order-delivery.service';
import { EsimAccountService } from './esim-account.service';
import { EsimAdminService, maskEsimInstallSecret } from './esim-admin.service';

/** Safe fixture — installable LPA shape, not a live matching_id. */
const FIXTURE_LPA = 'LPA:1$smdp.example.test$FIXTURE-ACCESS';

function paidEsimOrder() {
  const createdAt = new Date('2026-10-26T00:00:00.000Z');
  return {
    id: 'order-1',
    orderCode: 'ORD-TEST-1',
    channel: 'WEB',
    isGuestOrder: true,
    guestEmail: 'owner@test.invalid',
    guestPhone: null,
    userId: 'owner',
    invoiceRequired: false,
    invoiceMetadata: {},
    customerNote: null,
    totalAmount: 100000,
    faceValue: 0,
    sellAmount: 100000,
    discountAmount: 0,
    paymentMethodCode: 'VIETQR',
    methodDisplayName: 'VietQR',
    paymentGateway: 'SEPAY',
    settlementType: 'DIRECT_TO_MERCHANT',
    paymentFeePercent: 0,
    paymentFeeFixed: 0,
    paymentFeeAmount: 0,
    customerPaid: 100000,
    providerCost: 0,
    profit: 0,
    paymentStatus: 'PAID',
    fulfillmentStatus: 'COMPLETED',
    paymentExpiresAt: null,
    createdAt,
    orderItems: [
      {
        id: 'item-1',
        variantId: 'variant-1',
        quantity: 1,
        unitPrice: 100000,
        discount: 0,
        totalAmount: 100000,
        status: 'PENDING',
        variant: { sku: 'ESIM_TEST', name: '1GB', type: 'ESIM', product: { name: 'eSIM Hàn Quốc' } },
        esimProfile: { installSecretEnc: 'enc' },
        cardRecords: [],
      },
    ],
    orderEvents: [],
  };
}

describe('eSIM delivery access', () => {
  it('does not decrypt LPA when another customer asks for the order', async () => {
    const decrypt = jest.fn();
    const service = new OrderDeliveryService(
      { findByIdForUserWithDelivery: jest.fn().mockResolvedValue(null) } as never,
      { listByOrderId: jest.fn() } as never,
      { decrypt } as never,
      { maybeNotifyOrderNeedSupport: jest.fn() } as never,
    );
    await expect(service.getCustomerDelivery('order-1', 'other-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('does not decrypt LPA when guest email does not match', async () => {
    const decrypt = jest.fn();
    const service = new OrderDeliveryService(
      { findByCodeForGuestWithDelivery: jest.fn().mockResolvedValue(null) } as never,
      { listByOrderId: jest.fn() } as never,
      { decrypt } as never,
      { maybeNotifyOrderNeedSupport: jest.fn() } as never,
    );
    await expect(
      service.lookupGuestDelivery('ORD-TEST-1', 'stranger@test.invalid'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('returns the fixture install string only to the owning guest email', async () => {
    const service = new OrderDeliveryService(
      { findByCodeForGuestWithDelivery: jest.fn().mockResolvedValue(paidEsimOrder()) } as never,
      { listByOrderId: jest.fn() } as never,
      { decrypt: () => FIXTURE_LPA } as never,
      { maybeNotifyOrderNeedSupport: jest.fn() } as never,
      { resolveAiraloAccountMode: () => 'sandbox' } as never,
    );
    const view = await service.lookupGuestDelivery('ORD-TEST-1', 'owner@test.invalid');
    expect(view.delivery.esim.kind).toBe('ready');
    expect(view.delivery.esim.installSecret).toBeNull();
    expect(view.delivery.esim.qrSvg).toBeNull();
    expect(view.delivery.esim.appleSetupUrl).toBeNull();
    expect(view.delivery.esim.canRevealInstallSecret).toBe(true);
    expect(view.delivery.esim.notice).toContain('Đây là mã thử nghiệm, không phải eSIM thật');
    expect(view.delivery.esim.notice).not.toMatch(/Airalo/i);
  });

  it('reveals LPA to the owning guest and does not write a view event', async () => {
    const record = jest.fn();
    const service = new OrderDeliveryService(
      { findByIdForGuestWithDelivery: jest.fn().mockResolvedValue(paidEsimOrder()) } as never,
      { record, listByOrderId: jest.fn() } as never,
      { decrypt: () => FIXTURE_LPA } as never,
      { maybeNotifyOrderNeedSupport: jest.fn() } as never,
      { resolveAiraloAccountMode: () => 'sandbox' } as never,
    );
    const revealed = await service.revealEsimInstall('order-1', undefined, 'owner@test.invalid');
    expect(revealed.installSecret).toBe(FIXTURE_LPA);
    expect(revealed.qrSvg).toContain('<svg');
    expect(record).not.toHaveBeenCalled();
  });

  it('does not decrypt LPA when another customer asks to reveal', async () => {
    const decrypt = jest.fn();
    const record = jest.fn();
    const service = new OrderDeliveryService(
      { findByIdForUserWithDelivery: jest.fn().mockResolvedValue(null) } as never,
      { record } as never,
      { decrypt } as never,
      { maybeNotifyOrderNeedSupport: jest.fn() } as never,
    );
    await expect(
      service.revealEsimInstall('order-1', { id: 'other-user', role: UserRole.CUSTOMER } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(decrypt).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('hides another customer profile in the account API', async () => {
    const decrypt = jest.fn();
    const service = new EsimAccountService(
      {
        order: {
          findFirst: async ({ where }: { where: { userId: string } }) =>
            where.userId === 'owner' ? paidEsimOrder() : null,
        },
      } as never,
      { decrypt } as never,
    );
    await expect(service.getForUser('other', 'order-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('admin SUPPORT cannot reveal PIN/LPA; ADMIN can', () => {
    expect(canAdminViewPin(UserRole.SUPPORT)).toBe(false);
    expect(canAdminViewPin(UserRole.ADMIN)).toBe(true);
    expect(canAdminViewPin(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canAdminViewPin(UserRole.CUSTOMER)).toBe(false);
  });

  it('admin ops returns a masked secret unless reveal is granted', async () => {
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
            esimProfile: { installSecretEnc: 'enc' },
            esimAttempts: [],
          }),
        },
      } as never,
      {} as never,
      undefined,
      { decrypt: () => FIXTURE_LPA } as never,
    );
    const hidden = await service.getOrderOps('order-1', { canReveal: false });
    expect(hidden.installSecret).toBeNull();
    expect(hidden.canRevealInstallSecret).toBe(false);
    expect(hidden.installSecretMasked).toBe(maskEsimInstallSecret(FIXTURE_LPA));
    expect(hidden.installSecretMasked).not.toBe(FIXTURE_LPA);

    const flagged = await service.getOrderOps('order-1', { canReveal: true });
    expect(flagged.installSecret).toBeNull();
    expect(flagged.canRevealInstallSecret).toBe(true);
  });
});
