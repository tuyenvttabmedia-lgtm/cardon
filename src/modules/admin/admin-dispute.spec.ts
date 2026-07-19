/**
 * Phase 6O26.2 / 6O26.3 — Admin card delivery tests
 */
import { UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { mapAdminOrderDetail } from './entities/admin-order-detail.mapper';
import { mapAdminOrderDelivery } from './entities/admin-order-delivery.mapper';
import { canAdminViewPin, maskPinPartial } from './entities/card-pin.util';
describe('Phase 6O26.2 — Admin delivery mapper', () => {
  const orderRow = {
    id: 'order-1',
    orderItems: [{
      id: 'item-1', orderId: 'order-1', variantId: 'v1', quantity: 1,
      unitPrice: new Decimal('99000'), discount: new Decimal('1000'), totalAmount: new Decimal('99000'),
      status: 'COMPLETED', createdAt: new Date(), variant: { sku: 'SKU', name: 'Garena Card', type: 'CARD' },
      cardRecords: [{
        id: 'card-1', orderItemId: 'item-1', encryptedSerial: 'enc-s', encryptedPin: 'enc-p',
        providerResponse: { expiredAt: '2027-12-31T00:00:00.000Z' },
        status: 'DELIVERED', pinViewCount: 0, pinFirstViewedAt: null,
        firstViewedAt: null, viewCount: 0, createdAt: new Date('2026-06-01'),
      }],
    }],
    topupTransactions: [],
    providerTransactions: [{
      id: 'ptx-1', orderId: 'order-1', providerId: 'prov-1', providerTransactionId: 'PTX-1',
      providerReference: 'REF-1', requestId: 'REQ-1', providerTransactionDate: null,
      providerMetadata: {}, attempt: 1, action: 'BUY_CARD', status: 'SUCCESS',
      requestPayload: {}, responsePayload: {}, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      provider: { code: 'ESALE', name: 'Esale' },
    }],
  };

  it('returns decrypted PIN for ADMIN when delivered', () => {
    const delivery = mapAdminOrderDelivery({
      order: orderRow as never,
      canViewPin: true,
      decryptSerial: () => 'SERIAL123456',
      decryptPin: () => '123456789999',
    });
    expect(delivery.type).toBe('CARD');
    expect(delivery.items[0].serial).toBe('SERIAL123456');
    expect(delivery.items[0].pin).toBe('1234 5678 9999');
    expect(delivery.items[0].pinMasked).toBe(maskPinPartial('123456789999'));
    expect(delivery.items[0].providerName).toBe('Esale');
  });

  it('hides PIN for ADMIN when card not delivered', () => {
    const pendingOrder = {
      ...orderRow,
      orderItems: [{
        ...orderRow.orderItems[0],
        cardRecords: [{
          ...orderRow.orderItems[0].cardRecords[0],
          status: 'PENDING',
        }],
      }],
    };
    const delivery = mapAdminOrderDelivery({
      order: pendingOrder as never,
      canViewPin: true,
      decryptSerial: () => 'SERIAL123456',
      decryptPin: () => '123456789999',
    });
    expect(delivery.items[0].pin).toBeNull();
    expect(delivery.items[0].pinMasked).toBe('************');
  });

  it('masks PIN for SUPPORT', () => {
    const delivery = mapAdminOrderDelivery({
      order: orderRow as never,
      canViewPin: false,
      decryptSerial: () => 'SERIAL123456',
      decryptPin: () => '123456789999',
    });
    expect(delivery.items[0].pin).toBeNull();
    expect(delivery.items[0].pinMasked).toBe('************');
  });
});

describe('Phase 6O26.2 — Admin order detail products & pricing', () => {
  const orderRow = {
    id: 'order-1',
    orderCode: 'ORD-001',
    channel: 'WEB',
    isGuestOrder: false,
    guestEmail: null,
    guestPhone: null,
    invoiceRequired: false,
    invoiceMetadata: {},
    customerNote: null,
    clientTrace: {},
    totalAmount: new Decimal('99000'),
    faceValue: new Decimal('100000'),
    sellAmount: new Decimal('99000'),
    discountAmount: new Decimal('1000'),
    paymentMethodCode: 'VIETQR',
    methodDisplayName: 'VietQR',
    paymentGateway: 'SEPAY',
    settlementType: null,
    paymentFeePercent: new Decimal(0),
    paymentFeeFixed: new Decimal(0),
    paymentFeeAmount: new Decimal('2000'),
    customerPaid: new Decimal('101000'),
    providerCost: new Decimal('95000'),
    profit: new Decimal('4000'),
    paymentStatus: 'PAID',
    fulfillmentStatus: 'COMPLETED',
    paymentExpiresAt: null,
    createdAt: new Date('2026-01-01'),
    userId: 'user-1',
    user: { id: 'user-1', email: 'c@test.com', phone: '0912345678', username: 'cust', fullName: 'Cust' },
    orderItems: [{
      id: 'item-1', orderId: 'order-1', variantId: 'v1', quantity: 1,
      unitPrice: new Decimal('99000'), discount: new Decimal('1000'), totalAmount: new Decimal('99000'),
      status: 'COMPLETED', createdAt: new Date(), variant: { sku: 'SKU', name: 'Garena Card', type: 'CARD' },
      cardRecords: [{
        id: 'card-1', orderItemId: 'item-1', encryptedSerial: 'enc-s', encryptedPin: 'enc-p',
        providerResponse: {}, status: 'DELIVERED', pinViewCount: 0, pinFirstViewedAt: null,
        firstViewedAt: null, viewCount: 0, createdAt: new Date(),
      }],
    }],
    payments: [],
    providerTransactions: [],
    providerLogs: [],
    topupTransactions: [],
    orderEvents: [],
  };

  it('includes product type columns and order pricing snapshot', () => {
    const detail = mapAdminOrderDetail({
      order: orderRow as never,
      auditLogs: [],
      canViewPin: canAdminViewPin(UserRole.SUPER_ADMIN),
      decryptSerial: () => 'SERIAL123',
      decryptPin: () => '12345678',
    });
    expect(detail.overview.products[0].type).toBe('CARD');
    expect(detail.overview.products[0].faceValue).toBe('100000.00');
    expect(detail.overview.products[0].sellPrice).toBe('99000.00');
    expect(detail.overview.pricing.faceValue).toBe('100000.00');
    expect(detail.overview.pricing.sellAmount).toBe('99000.00');
    expect(detail.delivery.type).toBe('CARD');
  });
});

describe('Phase 6O26.2 — PIN role gate', () => {
  it('allows ADMIN and SUPER_ADMIN only', () => {
    expect(canAdminViewPin(UserRole.ADMIN)).toBe(true);
    expect(canAdminViewPin(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canAdminViewPin(UserRole.SUPPORT)).toBe(false);
  });
});
