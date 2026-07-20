/**
 * Phase 5C.1 — Admin API Completion Tests
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CatalogProductStatus,
  HomeServiceType,
  PaymentGatewayCode,
  PaymentRecordStatus,
  ProviderTransactionAction,
  ProviderTransactionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { mapAdminProduct } from '../product/entities/product.mapper';
import { ProductService } from '../product/services/product.service';
import { AdminPaymentService } from './services/admin-payment.service';
import { AdminProviderService } from './services/admin-provider.service';
import {
  mapAdminProviderTransaction,
  sanitizeProviderPayload,
} from './entities/admin-provider-transaction.mapper';

describe('Phase 5C.1 — Admin product list', () => {
  it('listAdminProducts includes inactive products, variants and mappings', async () => {
    const inactiveProduct = {
      id: 'prod-1',
      categoryId: 'cat-1',
      homeService: HomeServiceType.GAME_CARD,
      slug: 'inactive-card',
      name: 'Inactive Card',
      description: null,
      status: CatalogProductStatus.INACTIVE,
      category: {
        id: 'cat-1',
        slug: 'game-card',
        name: 'Cards',
        homeService: HomeServiceType.GAME_CARD,
      },
      variants: [
        {
          id: 'var-1',
          productId: 'prod-1',
          sku: 'SKU-INACTIVE',
          name: 'Inactive Variant',
          type: 'CARD',
          faceValue: new Decimal('100000'),
          sellPrice: new Decimal('99000'),
          status: 'INACTIVE',
          providerMappings: [
            {
              id: 'map-1',
              providerId: 'prov-1',
              productVariantId: 'var-1',
              providerProductCode: 'ESALE-100',
              providerCost: new Decimal('95000'),
              priority: 1,
              status: 'ACTIVE',
              provider: { id: 'prov-1', code: 'ESALE', name: 'eSale' },
            },
          ],
        },
      ],
    };

    const productRepository = {
      findManyAdmin: jest.fn().mockResolvedValue([inactiveProduct]),
    };
    const categoryRepository = {
      findById: jest.fn(),
    };
    const service = new ProductService(
      productRepository as never,
      categoryRepository as never,
      { productHasUsage: jest.fn() } as never,
    );

    const result = await service.listAdminProducts();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('INACTIVE');
    expect(result[0].homeService).toBe(HomeServiceType.GAME_CARD);
    expect(result[0].variants?.[0].providerMappings?.[0].providerCost).toBe('95000.00');
    expect(mapAdminProduct(inactiveProduct).variants?.[0].providerMappings).toHaveLength(1);
  });
});

describe('Phase 5C.1 — Admin payment list', () => {
  it('listPayments returns paginated items and total', async () => {
    const paymentRow = {
      id: 'pay-1',
      orderId: 'order-1',
      gateway: PaymentGatewayCode.MEGAPAY,
      methodCode: 'VNPAYQR',
      settlementType: null,
      paymentReference: 'REF-001',
      idempotencyKey: null,
      amount: new Decimal('100000'),
      status: PaymentRecordStatus.SUCCESS,
      gatewayTransactionId: 'GW-TX-1',
      bankTransactionId: null,
      bankReference: null,
      settlementDate: null,
      reconciliationStatus: 'PENDING' as const,
      gatewayResponse: { gatewayTransactionId: 'GW-TX-1' },
      expiresAt: null,
      paidAt: new Date('2026-06-18T10:00:00.000Z'),
      createdAt: new Date('2026-06-18T09:00:00.000Z'),
      updatedAt: new Date('2026-06-18T10:00:00.000Z'),
      deletedAt: null,
    };

    const repository = {
      findPaymentsAdmin: jest.fn().mockResolvedValue([paymentRow]),
      countPaymentsAdmin: jest.fn().mockResolvedValue(42),
    };
    const service = new AdminPaymentService(
      { listManualReviewQueue: jest.fn() } as never,
      { record: jest.fn() } as never,
      repository as never,
    );

    const result = await service.listPayments({ skip: 0, take: 10 });

    expect(result.total).toBe(42);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe('100000.00');
    expect(result.items[0].gatewayTransactionId).toBe('GW-TX-1');
  });
});

describe('Phase 5C.1 — Provider operations', () => {
  it('listTransactions maps rows and returns total', async () => {
    const txRow = {
      id: 'tx-1',
      orderId: 'order-1',
      providerId: 'prov-1',
      requestId: 'req-1',
      attempt: 1,
      action: ProviderTransactionAction.BUY_CARD,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: 'PT-1',
      providerReference: 'REF-1',
      requestPayload: { apiKey: 'secret-key' },
      responsePayload: { pin: '1234' },
      createdAt: new Date('2026-06-18T10:00:00.000Z'),
      updatedAt: new Date('2026-06-18T10:00:00.000Z'),
    };

    const providerRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'prov-1', code: 'ESALE', name: 'eSale' }),
    };
    const providerTransactionRepository = {
      findManyByProviderAdmin: jest.fn().mockResolvedValue([txRow]),
      countByProviderAdmin: jest.fn().mockResolvedValue(1),
    };
    const service = new AdminProviderService(
      {} as never,
      providerRepository as never,
      {} as never,
      {} as never,
      {} as never,
      providerTransactionRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listTransactions('prov-1', { skip: 0, take: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0].requestPayload).toEqual({ apiKey: '[REDACTED]' });
    expect(result.items[0].responsePayload).toEqual({ pin: '[REDACTED]' });
  });
});

describe('Phase 5C.1 — Security', () => {
  it('PermissionsGuard denies when role lacks permission', async () => {
    const rbac = { roleHasAnyPermission: jest.fn().mockResolvedValue(false) };
    const guard = new PermissionsGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(['products.manage']) } as never,
      rbac as never,
    );
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'SUPPORT' } }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sanitizeProviderPayload redacts sensitive keys', () => {
    const sanitized = sanitizeProviderPayload({
      orderId: 'order-1',
      apiKey: 'secret-key',
      nested: { pin: '1234', amount: 100 },
    });

    expect(sanitized).toEqual({
      orderId: 'order-1',
      apiKey: '[REDACTED]',
      nested: { pin: '[REDACTED]', amount: 100 },
    });
  });
});
