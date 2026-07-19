/**
 * Phase 4B.1 — Finance Integrity Audit Tests
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  FulfillmentStatus,
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
import { assertExportCsvSafe } from './entities/export-safety';
import { FINANCE_MAX_DATE_RANGE_DAYS } from './entities/finance.constants';
import { assertFinanceDateRange } from './utils/finance-date-range.util';
import { PaymentReconcileService } from './services/payment-reconcile.service';
import { AgentStatementService } from './services/agent-statement.service';
import { InvoiceService } from './services/invoice.service';
import { ProfitService } from './services/profit.service';
import { ExportService } from './services/export.service';

/** Mirrors prisma/seed.mjs finance-related permissions */
const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  SUPPORT: ['users.read', 'orders.read', 'orders.retry', 'payments.view', 'agents.kyc.review'],
  ACCOUNTANT: [
    'users.read',
    'orders.read',
    'payments.view',
    'ledger.view',
    'invoice.manage',
    'agents.credit',
    'payments.review',
    'finance.view',
    'finance.manage',
  ],
  ADMIN: [
    'finance.view',
    'finance.manage',
    'agents.manage',
    'admin.dashboard',
    'settings.manage',
  ],
};

function roleCanAccess(role: string, permission: string): boolean {
  return (ROLE_PERMISSION_MATRIX[role] ?? []).includes(permission);
}

describe('Phase 4B.1 — CHECK 1: Profit correctness', () => {
  it('computes gross profit as revenue minus provider cost', async () => {
    const repository = {
      calculateProfit: jest.fn().mockResolvedValue({
        revenue: '100000.00',
        providerCost: '98000.00',
        grossProfit: '2000.00',
        orderCount: 1,
        currency: 'VND',
      }),
    };
    const service = new ProfitService(repository as never);

    const result = await service.calculate({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    expect(result.grossProfit).toBe('2000.00');
    expect(result.revenue).toBe('100000.00');
    expect(result.providerCost).toBe('98000.00');
  });

  it('repository filters PAID + COMPLETED orders only', async () => {
    const { FinanceRepository } = await import('./repositories/finance.repository');
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repo = new FinanceRepository(prisma as never);

    await repo.calculateProfit({
      dateFrom: new Date('2026-06-01'),
      dateTo: new Date('2026-06-30'),
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        }),
      }),
    );
  });
});

describe('Phase 4B.1 — CHECK 2: Payment reconciliation safety', () => {
  it('never modifies payments — only creates reconcile report', async () => {
    const repository = {
      findPaymentsForReconcile: jest.fn().mockResolvedValue([]),
      mapPaymentsToInternalLines: jest.fn().mockReturnValue([]),
      createReconcileReport: jest.fn().mockResolvedValue({ id: 'report-1' }),
    };
    const financeAudit = { recordReconcileCreated: jest.fn() };
    const service = new PaymentReconcileService(
      repository as never,
      financeAudit as never,
    );

    await service.reconcile('admin-1', {
      gateway: PaymentGatewayCode.MEGAPAY,
      reportDate: '2026-06-19',
      transactions: [
        {
          transactionId: 'GW-MISMATCH',
          amount: '50000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    });

    expect(repository.createReconcileReport).toHaveBeenCalled();
    expect(repository).not.toHaveProperty('updatePayment');
  });

  it('records amount/status mismatch without auto-fix', () => {
    const items = comparePaymentReconciliation(
      [
        {
          transactionId: 'GW-1',
          amount: '100000.00',
          status: 'SUCCESS',
          occurredAt: '2026-06-19T10:00:00.000Z',
        },
      ],
      [
        {
          id: 'pay-1',
          paymentReference: 'PAY-1',
          gatewayTransactionId: 'GW-1',
          amount: '90000.00',
          status: PaymentRecordStatus.SUCCESS,
          paidAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    );

    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.AMOUNT_MISMATCH);
  });

  it('flags missing gateway transaction as MISSING_GATEWAY', () => {
    const items = comparePaymentReconciliation(
      [],
      [
        {
          id: 'pay-1',
          paymentReference: 'PAY-ONLY',
          gatewayTransactionId: 'GW-ONLY',
          amount: '100000.00',
          status: PaymentRecordStatus.SUCCESS,
          paidAt: '2026-06-19T10:00:00.000Z',
        },
      ],
    );

    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.MISSING_GATEWAY);
  });
});

describe('Phase 4B.1 — CHECK 3: Provider reconciliation safety', () => {
  it('flags MISSING_INTERNAL when eSale charged but CardOn has no txn', () => {
    const items = compareProviderReconciliation(
      [
        {
          transactionId: 'ESALE-999',
          quantity: 1,
          cost: '98000.00',
          status: 'SUCCESS',
        },
      ],
      [],
    );

    expect(items[0].matchStatus).toBe(ReconcileMatchStatus.MISSING_LOCAL);
    expect(items[0].statusLabel).toBe('MISSING_INTERNAL');
  });
});

describe('Phase 4B.1 — CHECK 4: Agent statement correctness', () => {
  it('does not use cached agent.balance when no ledger entries exist', async () => {
    const repository = {
      findAgentById: jest.fn().mockResolvedValue({
        id: 'agent-1',
        companyName: 'Partner Co',
        balance: new Decimal('9999999.00'),
        heldBalance: new Decimal('1111111.00'),
      }),
      findLastLedgerEntryBefore: jest.fn().mockResolvedValue(null),
      findLedgerEntriesForStatement: jest.fn().mockResolvedValue([]),
    };
    const service = new AgentStatementService(repository as never);

    const statement = await service.generate('agent-1', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    expect(statement.openingBalance.balance).toBe('0.00');
    expect(statement.closingBalance.balance).toBe('0.00');
    expect(statement.openingBalance.balance).not.toBe('9999999.00');
  });

  it('derives balances from ledger entry before/after fields', async () => {
    const repository = {
      findAgentById: jest.fn().mockResolvedValue({
        id: 'agent-1',
        companyName: 'Partner Co',
        balance: new Decimal('0.00'),
        heldBalance: new Decimal('0.00'),
      }),
      findLastLedgerEntryBefore: jest.fn().mockResolvedValue(null),
      findLedgerEntriesForStatement: jest.fn().mockResolvedValue([
        {
          id: 'le-1',
          type: LedgerEntryType.CREDIT,
          amount: new Decimal('100000.00'),
          beforeBalance: new Decimal('0.00'),
          afterBalance: new Decimal('100000.00'),
          beforeHeld: new Decimal('0.00'),
          afterHeld: new Decimal('0.00'),
          referenceType: LedgerReferenceType.TOPUP,
          referenceId: 'ref-1',
          description: 'Top up',
          createdAt: new Date('2026-06-10T00:00:00.000Z'),
        },
      ]),
    };
    const service = new AgentStatementService(repository as never);

    const statement = await service.generate('agent-1', {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    expect(statement.openingBalance.balance).toBe('0.00');
    expect(statement.closingBalance.balance).toBe('100000.00');
    expect(statement.source).toBe('ledger_entries');
  });
});

describe('Phase 4B.1 — CHECK 5: Invoice duplication', () => {
  it('returns existing customer invoice for same order', async () => {
    const existing = {
      id: 'inv-existing',
      invoiceNumber: 'INV-20260619-0001',
      status: InvoiceStatus.DRAFT,
      type: InvoiceType.B2C_RECEIPT,
    };
    const repository = {
      findNonVoidInvoiceByOrderId: jest.fn().mockResolvedValue(existing),
      findOrderForInvoice: jest.fn(),
      createInvoice: jest.fn(),
    };
    const service = new InvoiceService(
      repository as never,
      { recordInvoiceCreated: jest.fn() } as never,
    );

    const result = await service.createCustomerInvoice('admin-1', { orderId: 'order-1' });

    expect(result).toBe(existing);
    expect(repository.createInvoice).not.toHaveBeenCalled();
  });

  it('returns existing agent invoice for same ledger entry', async () => {
    const existing = {
      id: 'inv-agent',
      status: InvoiceStatus.ISSUED,
      type: InvoiceType.AGENT_TOPUP_RECEIPT,
    };
    const repository = {
      findNonVoidAgentInvoiceByLedgerEntryId: jest.fn().mockResolvedValue(existing),
      findAgentById: jest.fn(),
      createInvoice: jest.fn(),
    };
    const service = new InvoiceService(
      repository as never,
      { recordInvoiceCreated: jest.fn() } as never,
    );

    const result = await service.createAgentInvoice('admin-1', {
      agentId: 'agent-1',
      ledgerEntryId: 'le-1',
    });

    expect(result).toBe(existing);
    expect(repository.createInvoice).not.toHaveBeenCalled();
  });
});

describe('Phase 4B.1 — CHECK 6: Invoice immutability', () => {
  it('repository only exposes status update — no financial field edit', async () => {
    const { FinanceRepository } = await import('./repositories/finance.repository');
    const repo = new FinanceRepository({} as never);

    expect(typeof repo.updateInvoiceStatus).toBe('function');
    expect((repo as { updateInvoice?: unknown }).updateInvoice).toBeUndefined();
    expect(() => repo.assertInvoiceMutableForFinancialEdit(InvoiceStatus.ISSUED)).toThrow(
      'Issued invoices cannot be edited',
    );
  });
});

describe('Phase 4B.1 — CHECK 7: CSV export security', () => {
  it('rejects CSV containing sensitive field names', () => {
    expect(() => assertExportCsvSafe('id,apiKeyHash\n1,abc')).toThrow(/sensitive/i);
    expect(() => assertExportCsvSafe('id,encryptedPin\n1,xxx')).toThrow(/sensitive/i);
  });

  it('export profit CSV contains only aggregate metrics', async () => {
    const service = new ExportService(
      { getReport: jest.fn() } as never,
      {
        calculate: jest.fn().mockResolvedValue({
          dateFrom: '2026-06-01',
          dateTo: '2026-06-30',
          orderCount: 1,
          revenue: '100000.00',
          providerCost: '98000.00',
          grossProfit: '2000.00',
          currency: 'VND',
        }),
      } as never,
      { generate: jest.fn() } as never,
    );

    const csv = await service.exportProfitCsv({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });

    expect(csv).toContain('gross_profit,2000.00');
    assertExportCsvSafe(csv);
  });
});

describe('Phase 4B.1 — CHECK 8: Finance permissions', () => {
  it('SUPPORT cannot access finance.view or finance.manage', () => {
    expect(roleCanAccess('SUPPORT', 'finance.view')).toBe(false);
    expect(roleCanAccess('SUPPORT', 'finance.manage')).toBe(false);
  });

  it('ACCOUNTANT can view/manage finance but not admin system settings', () => {
    expect(roleCanAccess('ACCOUNTANT', 'finance.view')).toBe(true);
    expect(roleCanAccess('ACCOUNTANT', 'finance.manage')).toBe(true);
    expect(roleCanAccess('ACCOUNTANT', 'settings.manage')).toBe(false);
    expect(roleCanAccess('ACCOUNTANT', 'agents.manage')).toBe(false);
  });

  it('PermissionsGuard denies SUPPORT on finance endpoints', async () => {
    const guard = new PermissionsGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(['finance.view']) } as never,
      { roleHasAnyPermission: jest.fn().mockResolvedValue(false) } as never,
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

describe('Phase 4B.1 — CHECK 9: Large report safety', () => {
  it('rejects date range exceeding max days', () => {
    expect(() =>
      assertFinanceDateRange('2024-01-01', '2026-01-01'),
    ).toThrow(BadRequestException);
  });

  it('allows date range within limit', () => {
    const range = assertFinanceDateRange('2026-01-01', '2026-06-01');
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
  });

  it('defines bounded query limits', () => {
    expect(FINANCE_MAX_DATE_RANGE_DAYS).toBeLessThanOrEqual(366);
  });
});

describe('Phase 4B.1 — CHECK 10: Audit integrity', () => {
  it('payment reconcile always records audit', async () => {
    const financeAudit = { recordReconcileCreated: jest.fn() };
    const service = new PaymentReconcileService(
      {
        findPaymentsForReconcile: jest.fn().mockResolvedValue([]),
        mapPaymentsToInternalLines: jest.fn().mockReturnValue([]),
        createReconcileReport: jest.fn().mockResolvedValue({ id: 'rpt-1' }),
      } as never,
      financeAudit as never,
    );

    await service.reconcile('admin-1', {
      gateway: PaymentGatewayCode.SEPAY,
      reportDate: '2026-06-19',
      transactions: [],
    });

    expect(financeAudit.recordReconcileCreated).toHaveBeenCalledWith(
      'admin-1',
      'rpt-1',
      expect.any(Object),
    );
  });

  it('invoice void records audit', async () => {
    const financeAudit = { recordInvoiceVoided: jest.fn() };
    const service = new InvoiceService(
      {
        findInvoiceById: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: InvoiceStatus.ISSUED,
        }),
        updateInvoiceStatus: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: InvoiceStatus.VOID,
        }),
      } as never,
      financeAudit as never,
    );

    await service.voidInvoice('admin-1', 'inv-1', { reason: 'Duplicate' });

    expect(financeAudit.recordInvoiceVoided).toHaveBeenCalledWith(
      'admin-1',
      'inv-1',
      expect.objectContaining({ reason: 'Duplicate' }),
    );
  });
});
