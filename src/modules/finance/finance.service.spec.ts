/**
 * Phase 4B — Finance & Reconciliation Core Tests
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  InvoiceType,
  LedgerEntryType,
  LedgerReferenceType,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  ReconcileDomain,
  ReconcileMatchStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  comparePaymentReconciliation,
  compareProviderReconciliation,
} from './entities/reconcile.engine';
import { FINANCE_AUDIT_ACTIONS } from './entities/finance.constants';
import { PaymentReconcileService } from './services/payment-reconcile.service';
import { ProviderReconcileService } from './services/provider-reconcile.service';
import { ProfitService } from './services/profit.service';
import { AgentStatementService } from './services/agent-statement.service';
import { InvoiceService } from './services/invoice.service';

describe('Payment reconciliation engine', () => {
  it('matches gateway and internal payment when amount and status align', () => {
    const items = comparePaymentReconciliation(
      [
        {
          transactionId: 'GW-001',
          paymentReference: 'PAY-001',
          amount: '100000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
      [
        {
          id: 'pay-1',
          paymentReference: 'PAY-001',
          gatewayTransactionId: 'GW-001',
          amount: '100000.00',
          status: PaymentRecordStatus.SUCCESS,
          paidAt: '2026-06-19T10:05:00.000Z',
        },
      ],
    );

    expect(items).toHaveLength(1);
    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.MATCHED);
    expect(items[0].statusLabel).toBe('MATCHED');
  });

  it('flags payment amount mismatch', () => {
    const items = comparePaymentReconciliation(
      [
        {
          transactionId: 'GW-002',
          amount: '90000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
      [
        {
          id: 'pay-2',
          paymentReference: 'PAY-002',
          gatewayTransactionId: 'GW-002',
          amount: '100000.00',
          status: PaymentRecordStatus.SUCCESS,
          paidAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    );

    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.AMOUNT_MISMATCH);
    expect(items[0].statusLabel).toBe('MISMATCH');
  });

  it('flags missing internal payment for gateway row', () => {
    const items = comparePaymentReconciliation(
      [
        {
          transactionId: 'GW-999',
          amount: '50000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T12:00:00.000Z',
        },
      ],
      [],
    );

    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.MISSING_LOCAL);
    expect(items[0].statusLabel).toBe('MISSING_INTERNAL');
  });
});

describe('Provider reconciliation engine', () => {
  it('flags provider quantity mismatch', () => {
    const items = compareProviderReconciliation(
      [
        {
          transactionId: 'REQ-1',
          quantity: 5,
          cost: '45000.00',
          status: 'SUCCESS',
        },
      ],
      [
        {
          id: 'txn-1',
          requestId: 'REQ-1',
          providerTransactionId: 'ES-1',
          quantity: 10,
          cost: '90000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T08:00:00.000Z',
        },
      ],
    );

    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.AMOUNT_MISMATCH);
    expect(items[0].statusLabel).toBe('MISMATCH');
  });
});

describe('PaymentReconcileService', () => {
  it('creates reconcile report and audit on payment reconcile', async () => {
    const repository = {
      findPaymentsForReconcile: jest.fn().mockResolvedValue([
        {
          id: 'pay-1',
          paymentReference: 'PAY-001',
          gatewayResponse: { gatewayTransactionId: 'GW-001' },
          amount: new Decimal('100000.00'),
          status: PaymentRecordStatus.SUCCESS,
          paidAt: new Date('2026-06-19T10:00:00.000Z'),
        },
      ]),
      mapPaymentsToInternalLines: jest.fn().mockReturnValue([
        {
          id: 'pay-1',
          paymentReference: 'PAY-001',
          gatewayTransactionId: 'GW-001',
          amount: '100000.00',
          status: PaymentRecordStatus.SUCCESS,
          paidAt: '2026-06-19T10:00:00.000Z',
        },
      ]),
      createReconcileReport: jest.fn().mockResolvedValue({
        id: 'report-1',
        domain: ReconcileDomain.PAYMENT,
      }),
    };
    const financeAudit = { recordReconcileCreated: jest.fn() };
    const service = new PaymentReconcileService(
      repository as never,
      financeAudit as never,
    );

    const result = await service.reconcile('admin-1', {
      gateway: PaymentGatewayCode.MEGAPAY,
      reportDate: '2026-06-19',
      transactions: [
        {
          transactionId: 'GW-001',
          amount: '100000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    });

    expect(result.summary.matched).toBe(1);
    expect(repository.createReconcileReport).toHaveBeenCalled();
    expect(financeAudit.recordReconcileCreated).toHaveBeenCalledWith(
      'admin-1',
      'report-1',
      expect.objectContaining({ domain: ReconcileDomain.PAYMENT }),
    );
  });
});

describe('ProviderReconcileService', () => {
  it('rejects unknown provider code', async () => {
    const service = new ProviderReconcileService(
      { findProviderByCode: jest.fn().mockResolvedValue(null) } as never,
      { recordReconcileCreated: jest.fn() } as never,
    );

    await expect(
      service.reconcile('admin-1', {
        providerCode: 'UNKNOWN',
        reportDate: '2026-06-19',
        transactions: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProfitService', () => {
  it('returns gross profit from repository calculation', async () => {
    const repository = {
      calculateProfit: jest.fn().mockResolvedValue({
        revenue: '200000.00',
        providerCost: '150000.00',
        grossProfit: '50000.00',
        orderCount: 2,
        currency: 'VND',
      }),
    };
    const service = new ProfitService(repository as never);

    const result = await service.calculate({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    expect(result.grossProfit).toBe('50000.00');
    expect(result.revenue).toBe('200000.00');
    expect(result.providerCost).toBe('150000.00');
  });
});

describe('AgentStatementService', () => {
  it('derives closing balance from ledger entries only', async () => {
    const repository = {
      findAgentById: jest.fn().mockResolvedValue({
        id: 'agent-1',
        companyName: 'Partner Co',
        balance: new Decimal('1000000.00'),
        heldBalance: new Decimal('0.00'),
      }),
      findLastLedgerEntryBefore: jest.fn().mockResolvedValue(null),
      findLedgerEntriesForStatement: jest.fn().mockResolvedValue([
        {
          id: 'le-1',
          type: LedgerEntryType.CREDIT,
          amount: new Decimal('500000.00'),
          beforeBalance: new Decimal('500000.00'),
          afterBalance: new Decimal('1000000.00'),
          beforeHeld: new Decimal('0.00'),
          afterHeld: new Decimal('0.00'),
          referenceType: LedgerReferenceType.TOPUP,
          referenceId: 'ref-1',
          description: 'Top up',
          createdAt: new Date('2026-06-10T00:00:00.000Z'),
        },
        {
          id: 'le-2',
          type: LedgerEntryType.DEBIT,
          amount: new Decimal('200000.00'),
          beforeBalance: new Decimal('1000000.00'),
          afterBalance: new Decimal('800000.00'),
          beforeHeld: new Decimal('0.00'),
          afterHeld: new Decimal('0.00'),
          referenceType: LedgerReferenceType.ORDER,
          referenceId: 'order-1',
          description: 'Card purchase',
          createdAt: new Date('2026-06-15T00:00:00.000Z'),
        },
      ]),
    };
    const service = new AgentStatementService(repository as never);

    const statement = await service.generate('agent-1', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    expect(statement.openingBalance.balance).toBe('500000.00');
    expect(statement.closingBalance.balance).toBe('800000.00');
    expect(statement.summary.credits).toBe('500000.00');
    expect(statement.summary.debits).toBe('200000.00');
    expect(statement.source).toBe('ledger_entries');
  });
});

describe('InvoiceService', () => {
  it('creates customer invoice from paid order', async () => {
    const repository = {
      findNonVoidInvoiceByOrderId: jest.fn().mockResolvedValue(null),
      findOrderForInvoice: jest.fn().mockResolvedValue({
        id: 'order-1',
        orderCode: 'ORD-001',
        userId: 'user-1',
        guestEmail: null,
        invoiceRequired: false,
        paymentStatus: OrderPaymentStatus.PAID,
        totalAmount: new Decimal('150000.00'),
      }),
      generateInvoiceNumber: jest.fn().mockResolvedValue('INV-20260619-0001'),
      createInvoice: jest.fn().mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-20260619-0001',
        status: InvoiceStatus.DRAFT,
        type: InvoiceType.B2C_RECEIPT,
      }),
    };
    const financeAudit = { recordInvoiceCreated: jest.fn() };
    const service = new InvoiceService(repository as never, financeAudit as never);

    const invoice = await service.createCustomerInvoice('admin-1', {
      orderId: 'order-1',
    });

    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(financeAudit.recordInvoiceCreated).toHaveBeenCalledWith(
      'admin-1',
      'inv-1',
      expect.objectContaining({ type: InvoiceType.B2C_RECEIPT }),
    );
  });

  it('rejects invoice for unpaid order', async () => {
    const service = new InvoiceService(
      {
        findNonVoidInvoiceByOrderId: jest.fn().mockResolvedValue(null),
        findOrderForInvoice: jest.fn().mockResolvedValue({
          id: 'order-1',
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          totalAmount: new Decimal('100000.00'),
        }),
      } as never,
      { recordInvoiceCreated: jest.fn() } as never,
    );

    await expect(
      service.createCustomerInvoice('admin-1', { orderId: 'order-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Finance permission enforcement', () => {
  it('denies finance.manage when role lacks permission', async () => {
    const rbac = { roleHasAnyPermission: jest.fn().mockResolvedValue(false) };
    const guard = new PermissionsGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(['finance.manage']) } as never,
      rbac as never,
    );

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u1', role: 'SUPPORT' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Finance audit actions', () => {
  it('defines reconcile and invoice audit codes', () => {
    expect(FINANCE_AUDIT_ACTIONS.RECONCILE_CREATED).toBe('RECONCILE_CREATED');
    expect(FINANCE_AUDIT_ACTIONS.INVOICE_CREATED).toBe('INVOICE_CREATED');
    expect(FINANCE_AUDIT_ACTIONS.INVOICE_VOIDED).toBe('INVOICE_VOIDED');
  });
});
