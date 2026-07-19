import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  InvoiceStatus,
  InvoiceType,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  PaymentSettlementType,
  Prisma,
  ProviderTransactionStatus,
  ReconcileDomain,
  ReconcileMatchStatus,
  ReconcileReportStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_ORDER_WHERE } from '../../order/entities/order.constants';
import { ACTIVE_PAYMENT_WHERE } from '../../payment/entities/payment.constants';
import {
  extractGatewayTransactionId,
  InternalPaymentLine,
  InternalProviderLine,
} from '../entities/reconcile.engine';
import {
  FINANCE_MAX_INTERNAL_QUERY_ROWS,
  FINANCE_MAX_LEDGER_ROWS,
  FINANCE_PAGINATION_DEFAULT,
  FINANCE_PAGINATION_MAX,
} from '../entities/finance.constants';

function resolvePagination(skip?: number, take?: number) {
  const resolvedSkip = skip ?? 0;
  const resolvedTake = Math.min(take ?? FINANCE_PAGINATION_DEFAULT, FINANCE_PAGINATION_MAX);
  return {
    skip: resolvedSkip < 0 ? 0 : resolvedSkip,
    take: resolvedTake < 1 ? FINANCE_PAGINATION_DEFAULT : resolvedTake,
  };
}

function dayBounds(reportDate: string): { start: Date; end: Date } {
  const start = new Date(reportDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

@Injectable()
export class FinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPaymentsForReconcile(gateway: PaymentGatewayCode, reportDate: string) {
    const { start, end } = dayBounds(reportDate);
    return this.prisma.payment.findMany({
      where: {
        ...ACTIVE_PAYMENT_WHERE,
        gateway,
        OR: [
          { paidAt: { gte: start, lt: end } },
          {
            paidAt: null,
            updatedAt: { gte: start, lt: end },
            status: { in: [PaymentRecordStatus.SUCCESS, PaymentRecordStatus.FAILED] },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: FINANCE_MAX_INTERNAL_QUERY_ROWS,
    });
  }

  mapPaymentsToInternalLines(
    payments: Awaited<ReturnType<FinanceRepository['findPaymentsForReconcile']>>,
  ): InternalPaymentLine[] {
    return payments.map((payment) => ({
      id: payment.id,
      paymentReference: payment.paymentReference,
      gatewayTransactionId: extractGatewayTransactionId(payment.gatewayResponse),
      amount: payment.amount.toFixed(2),
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? null,
    }));
  }

  async findProviderTransactionsForReconcile(providerId: string, reportDate: string) {
    const { start, end } = dayBounds(reportDate);
    const txns = await this.prisma.providerTransaction.findMany({
      where: {
        providerId,
        deletedAt: null,
        createdAt: { gte: start, lt: end },
        status: {
          in: [
            ProviderTransactionStatus.SUCCESS,
            ProviderTransactionStatus.FAILED,
            ProviderTransactionStatus.TIMEOUT,
          ],
        },
      },
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                variant: {
                  include: {
                    providerMappings: {
                      where: { providerId, status: 'ACTIVE' },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: FINANCE_MAX_INTERNAL_QUERY_ROWS,
    });

    return txns.map((txn) => this.mapProviderTransactionToInternalLine(txn, providerId));
  }

  private mapProviderTransactionToInternalLine(
    txn: Prisma.ProviderTransactionGetPayload<{
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                variant: {
                  include: {
                    providerMappings: true;
                  };
                };
              };
            };
          };
        };
      };
    }>,
    providerId: string,
  ): InternalProviderLine {
    const requestPayload =
      txn.requestPayload && typeof txn.requestPayload === 'object'
        ? (txn.requestPayload as Record<string, unknown>)
        : {};
    const quantity =
      typeof requestPayload.quantity === 'number' ? requestPayload.quantity : 1;

    const orderItem = txn.order.orderItems[0];
    const mapping = orderItem?.variant.providerMappings.find(
      (row) => row.providerId === providerId,
    );
    const unitCost = mapping?.providerCost ?? new Decimal(0);
    const cost = unitCost.mul(quantity).toFixed(2);

    return {
      id: txn.id,
      requestId: txn.requestId,
      providerTransactionId: txn.providerTransactionId,
      quantity,
      cost,
      status: txn.status,
      occurredAt: txn.createdAt.toISOString(),
    };
  }

  findProviderByCode(code: string) {
    return this.prisma.provider.findFirst({
      where: { code: code.toUpperCase(), deletedAt: null },
    });
  }

  createReconcileReport(data: {
    domain: ReconcileDomain;
    gatewayOrProvider: string;
    reportDate: Date;
    totalMatched: number;
    totalMismatch: number;
    summary: Prisma.InputJsonValue;
    items: Array<{
      matchStatus: ReconcileMatchStatus;
      reference: string;
      localAmount?: string | null;
      externalAmount?: string | null;
    }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.reconcileReport.create({
        data: {
          domain: data.domain,
          gatewayOrProvider: data.gatewayOrProvider,
          reportDate: data.reportDate,
          totalMatched: data.totalMatched,
          totalMismatch: data.totalMismatch,
          status: ReconcileReportStatus.COMPLETED,
          summary: data.summary,
        },
      });

      if (data.items.length > 0) {
        await tx.reconcileItem.createMany({
          data: data.items.map((item) => ({
            reportId: report.id,
            matchStatus: item.matchStatus,
            reference: item.reference,
            localAmount:
              item.localAmount != null ? new Decimal(item.localAmount) : null,
            externalAmount:
              item.externalAmount != null ? new Decimal(item.externalAmount) : null,
          })),
        });
      }

      return report;
    });
  }

  listReconcileReports(skip?: number, take?: number) {
    const pagination = resolvePagination(skip, take);
    return this.prisma.reconcileReport.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  findReconcileReportById(id: string) {
    return this.prisma.reconcileReport.findUnique({
      where: { id },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async calculateProfit(filters: {
    dateFrom: Date;
    dateTo: Date;
    productId?: string;
    providerId?: string;
  }) {
    const orderWhere: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
      createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
    };

    if (filters.productId) {
      orderWhere.orderItems = {
        some: { variant: { productId: filters.productId } },
      };
    }

    if (filters.providerId) {
      orderWhere.providerTransactions = {
        some: {
          providerId: filters.providerId,
          status: ProviderTransactionStatus.SUCCESS,
          deletedAt: null,
        },
      };
    }

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      include: {
        orderItems: {
          include: {
            variant: {
              include: {
                providerMappings: filters.providerId
                  ? { where: { providerId: filters.providerId, status: 'ACTIVE' } }
                  : { where: { status: 'ACTIVE' }, orderBy: { priority: 'desc' }, take: 1 },
              },
            },
          },
        },
        providerTransactions: {
          where: {
            status: ProviderTransactionStatus.SUCCESS,
            deletedAt: null,
            ...(filters.providerId ? { providerId: filters.providerId } : {}),
          },
          take: 1,
        },
      },
    });

    let revenue = new Decimal(0);
    let providerCost = new Decimal(0);
    let orderCount = 0;

    for (const order of orders) {
      orderCount += 1;
      revenue = revenue.add(order.totalAmount);

      for (const item of order.orderItems) {
        const mapping = item.variant.providerMappings[0];
        if (!mapping) {
          continue;
        }
        if (filters.providerId && mapping.providerId !== filters.providerId) {
          continue;
        }
        providerCost = providerCost.add(mapping.providerCost.mul(item.quantity));
      }
    }

    const grossProfit = revenue.sub(providerCost);

    return {
      dateFrom: filters.dateFrom.toISOString(),
      dateTo: filters.dateTo.toISOString(),
      orderCount,
      revenue: revenue.toFixed(2),
      providerCost: providerCost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      currency: 'VND' as const,
      filters: {
        productId: filters.productId ?? null,
        providerId: filters.providerId ?? null,
      },
    };
  }

  async sumGatewayFees(dateFrom: Date, dateTo: Date) {
    const agg = await this.prisma.order.aggregate({
      where: {
        ...ACTIVE_ORDER_WHERE,
        paymentStatus: OrderPaymentStatus.PAID,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      _sum: { paymentFeeAmount: true },
    });
    return (agg._sum.paymentFeeAmount ?? new Decimal(0)).toFixed(2);
  }

  listProviderIds() {
    return this.prisma.provider.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
  }

  findProviderSummary(providerId: string) {
    return this.prisma.provider.findFirst({
      where: { id: providerId, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
  }

  async calculateGatewayFees(filters: {
    dateFrom: Date;
    dateTo: Date;
    gateway?: string;
  }) {
    const orderWhere: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      paymentStatus: OrderPaymentStatus.PAID,
      createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
      paymentMethodCode: { not: null },
    };

    if (filters.gateway) {
      orderWhere.paymentGateway = filters.gateway;
    }

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        paymentGateway: true,
        paymentMethodCode: true,
        methodDisplayName: true,
        paymentFeePercent: true,
        paymentFeeFixed: true,
        customerPaid: true,
        paymentFeeAmount: true,
        sellAmount: true,
      },
    });

    const grouped = new Map<
      string,
      {
        gateway: string;
        methodCode: string;
        methodDisplayName: string;
        transactionCount: number;
        totalCollected: Decimal;
        totalFee: Decimal;
        percentFee: Decimal;
        fixedFee: Decimal;
      }
    >();

    for (const order of orders) {
      const gateway = order.paymentGateway ?? 'UNKNOWN';
      const methodCode = order.paymentMethodCode ?? 'UNKNOWN';
      const methodDisplayName = order.methodDisplayName ?? methodCode;
      const key = `${gateway}::${methodCode}`;
      const row =
        grouped.get(key) ??
        {
          gateway,
          methodCode,
          methodDisplayName,
          transactionCount: 0,
          totalCollected: new Decimal(0),
          totalFee: new Decimal(0),
          percentFee: order.paymentFeePercent,
          fixedFee: order.paymentFeeFixed,
        };

      row.transactionCount += 1;
      row.totalCollected = row.totalCollected.add(order.customerPaid);
      row.totalFee = row.totalFee.add(order.paymentFeeAmount);
      grouped.set(key, row);
    }

    const rows = Array.from(grouped.values()).map((row) => ({
      gateway: row.gateway,
      methodCode: row.methodCode,
      methodDisplayName: row.methodDisplayName,
      method: row.methodDisplayName,
      transactionCount: row.transactionCount,
      totalCollected: row.totalCollected.toFixed(2),
      percentFee: row.percentFee.toFixed(4),
      fixedFee: row.fixedFee.toFixed(2),
      totalFee: row.totalFee.toFixed(2),
      netAmount: row.totalCollected.sub(row.totalFee).toFixed(2),
    }));

    const groupsMap = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = groupsMap.get(row.gateway) ?? [];
      list.push(row);
      groupsMap.set(row.gateway, list);
    }

    const groups = Array.from(groupsMap.entries()).map(([gateway, methods]) => ({
      gateway,
      methods,
    }));

    return {
      dateFrom: filters.dateFrom.toISOString(),
      dateTo: filters.dateTo.toISOString(),
      gateway: filters.gateway ?? null,
      rows,
      groups,
    };
  }

  async calculatePaymentSettlement(filters: {
    dateFrom: Date;
    dateTo: Date;
    gateway?: string;
    settlementType?: string;
  }) {
    const orderWhere: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      paymentStatus: OrderPaymentStatus.PAID,
      createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
      settlementType: { not: null },
    };

    if (filters.gateway) {
      orderWhere.paymentGateway = filters.gateway;
    }
    if (filters.settlementType) {
      orderWhere.settlementType = filters.settlementType as PaymentSettlementType;
    }

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        paymentGateway: true,
        paymentMethodCode: true,
        methodDisplayName: true,
        settlementType: true,
        sellAmount: true,
        customerPaid: true,
        paymentFeeAmount: true,
      },
    });

    type Bucket = {
      settlementType: string;
      gateway: string;
      transactionCount: number;
      totalVolume: Decimal;
      sellAmount: Decimal;
      gatewayFee: Decimal;
    };

    const buckets = new Map<string, Bucket>();

    for (const order of orders) {
      const settlementType = order.settlementType ?? 'UNKNOWN';
      const gateway = order.paymentGateway ?? 'UNKNOWN';
      const key = `${settlementType}::${gateway}`;
      const bucket =
        buckets.get(key) ??
        {
          settlementType,
          gateway,
          transactionCount: 0,
          totalVolume: new Decimal(0),
          sellAmount: new Decimal(0),
          gatewayFee: new Decimal(0),
        };

      bucket.transactionCount += 1;
      bucket.totalVolume = bucket.totalVolume.add(order.customerPaid);
      bucket.sellAmount = bucket.sellAmount.add(order.sellAmount);
      bucket.gatewayFee = bucket.gatewayFee.add(order.paymentFeeAmount);
      buckets.set(key, bucket);
    }

    const matchedInvoices = await this.prisma.paymentGatewayInvoice.findMany({
      where: {
        status: 'MATCHED',
        periodStart: { lte: filters.dateTo },
        periodEnd: { gte: filters.dateFrom },
        ...(filters.gateway ? { gatewayCode: filters.gateway } : {}),
      },
    });

    const actualByGateway = new Map<string, Decimal>();
    for (const invoice of matchedInvoices) {
      const settlement = new Decimal(invoice.totalVolume).sub(invoice.totalFee);
      actualByGateway.set(
        invoice.gatewayCode,
        (actualByGateway.get(invoice.gatewayCode) ?? new Decimal(0)).add(settlement),
      );
    }

    const sections = Array.from(buckets.values()).map((bucket) => {
      const base = {
        settlementType: bucket.settlementType,
        gateway: bucket.gateway,
        transactionCount: bucket.transactionCount,
        totalVolume: bucket.totalVolume.toFixed(2),
        gatewayFee: bucket.gatewayFee.toFixed(2),
      };

      if (bucket.settlementType === 'DIRECT_TO_MERCHANT') {
        return {
          ...base,
          bankReceivedAmount: bucket.sellAmount.toFixed(2),
          gatewayFeeInvoice: bucket.gatewayFee.toFixed(2),
        };
      }

      const expectedSettlement = bucket.totalVolume.sub(bucket.gatewayFee);
      const actual = actualByGateway.get(bucket.gateway);
      const actualSettlement = actual?.toFixed(2) ?? null;
      const settlementGap =
        actual && !expectedSettlement.equals(actual)
          ? expectedSettlement.sub(actual).toFixed(2)
          : null;

      return {
        ...base,
        gatewayCollected: bucket.totalVolume.toFixed(2),
        expectedSettlement: expectedSettlement.toFixed(2),
        actualSettlement,
        settlementGap,
      };
    });

    return {
      dateFrom: filters.dateFrom.toISOString(),
      dateTo: filters.dateTo.toISOString(),
      gateway: filters.gateway ?? null,
      settlementType: filters.settlementType ?? null,
      sections,
    };
  }

  async calculateGatewaySystemTotals(filters: {
    gatewayCode: string;
    periodStart: Date;
    periodEnd: Date;
  }) {
    const periodEndInclusive = new Date(filters.periodEnd);
    periodEndInclusive.setUTCHours(23, 59, 59, 999);

    const orders = await this.prisma.order.findMany({
      where: {
        ...ACTIVE_ORDER_WHERE,
        paymentStatus: OrderPaymentStatus.PAID,
        paymentGateway: filters.gatewayCode,
        createdAt: {
          gte: filters.periodStart,
          lte: periodEndInclusive,
        },
      },
      select: {
        customerPaid: true,
        paymentFeeAmount: true,
      },
    });

    let totalVolume = new Decimal(0);
    let totalFee = new Decimal(0);
    for (const order of orders) {
      totalVolume = totalVolume.add(order.customerPaid);
      totalFee = totalFee.add(order.paymentFeeAmount);
    }

    return {
      transactionCount: orders.length,
      totalVolume,
      totalFee,
    };
  }

  findPaymentsForAccountingExport(filters: {
    dateFrom: Date;
    dateTo: Date;
    gateway?: string;
  }) {
    const where: Prisma.PaymentWhereInput = {
      ...ACTIVE_PAYMENT_WHERE,
      status: PaymentRecordStatus.SUCCESS,
      createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
    };
    if (filters.gateway) {
      where.gateway = filters.gateway as PaymentGatewayCode;
    }

    return this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: FINANCE_MAX_INTERNAL_QUERY_ROWS,
      select: {
        gateway: true,
        methodCode: true,
        amount: true,
        bankReference: true,
        bankTransactionId: true,
        settlementDate: true,
        reconciliationStatus: true,
        gatewayTransactionId: true,
        gatewayResponse: true,
        order: {
          select: {
            paymentFeeAmount: true,
            paymentMethodCode: true,
            methodDisplayName: true,
          },
        },
      },
    });
  }

  listGatewayInvoices(skip = 0, take = FINANCE_PAGINATION_DEFAULT) {
    return this.prisma.paymentGatewayInvoice.findMany({
      orderBy: { periodStart: 'desc' },
      skip,
      take: Math.min(take, FINANCE_PAGINATION_MAX),
    });
  }

  findGatewayInvoiceById(id: string) {
    return this.prisma.paymentGatewayInvoice.findUnique({ where: { id } });
  }

  upsertGatewayInvoice(input: {
    gatewayCode: string;
    period: string;
    periodStart: Date;
    periodEnd: Date;
    totalTransactions: number;
    totalVolume: Decimal;
    totalFee: Decimal;
    vatAmount: Decimal;
    invoiceNumber?: string | null;
    notes?: string | null;
    systemTransactions: number;
    systemVolume: Decimal;
    systemFee: Decimal;
    status: 'PENDING' | 'MATCHED' | 'DIFFERENCE';
  }) {
    return this.prisma.paymentGatewayInvoice.upsert({
      where: {
        gatewayCode_periodStart_periodEnd: {
          gatewayCode: input.gatewayCode,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
      },
      create: {
        gatewayCode: input.gatewayCode,
        period: input.period,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalTransactions: input.totalTransactions,
        totalVolume: input.totalVolume,
        totalFee: input.totalFee,
        vatAmount: input.vatAmount,
        invoiceNumber: input.invoiceNumber ?? null,
        notes: input.notes ?? null,
        systemTransactions: input.systemTransactions,
        systemVolume: input.systemVolume,
        systemFee: input.systemFee,
        status: input.status,
      },
      update: {
        period: input.period,
        totalTransactions: input.totalTransactions,
        totalVolume: input.totalVolume,
        totalFee: input.totalFee,
        vatAmount: input.vatAmount,
        invoiceNumber: input.invoiceNumber ?? null,
        notes: input.notes ?? null,
        systemTransactions: input.systemTransactions,
        systemVolume: input.systemVolume,
        systemFee: input.systemFee,
        status: input.status,
      },
    });
  }

  findLedgerEntriesForStatement(agentId: string, dateFrom: Date, dateTo: Date) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        agentId,
        deletedAt: null,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      orderBy: { createdAt: 'asc' },
      take: FINANCE_MAX_LEDGER_ROWS,
    });
  }

  findLastLedgerEntryBefore(agentId: string, dateFrom: Date) {
    return this.prisma.ledgerEntry.findFirst({
      where: {
        agentId,
        deletedAt: null,
        createdAt: { lt: dateFrom },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAgentById(agentId: string) {
    return this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });
  }

  findOrderForInvoice(orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, ...ACTIVE_ORDER_WHERE },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  findLedgerEntryForInvoice(agentId: string, ledgerEntryId: string) {
    return this.prisma.ledgerEntry.findFirst({
      where: {
        id: ledgerEntryId,
        agentId,
        deletedAt: null,
        type: 'CREDIT',
      },
    });
  }

  async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const prefix = `INV-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const count = await this.prisma.invoice.count({
      where: {
        invoiceNumber: { startsWith: prefix },
        deletedAt: null,
      },
    });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  findNonVoidInvoiceByOrderId(orderId: string) {
    return this.prisma.invoice.findFirst({
      where: {
        orderId,
        deletedAt: null,
        status: { not: InvoiceStatus.VOID },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findNonVoidAgentInvoiceByLedgerEntryId(ledgerEntryId: string) {
    return this.prisma.invoice.findFirst({
      where: {
        deletedAt: null,
        status: { not: InvoiceStatus.VOID },
        type: InvoiceType.AGENT_TOPUP_RECEIPT,
        metadata: {
          path: ['ledgerEntryId'],
          equals: ledgerEntryId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createInvoice(data: {
    invoiceNumber: string;
    type: InvoiceType;
    orderId?: string;
    agentId?: string;
    userId?: string;
    subtotal: Decimal;
    taxAmount: Decimal;
    totalAmount: Decimal;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.invoice.create({
      data: {
        invoiceNumber: data.invoiceNumber,
        type: data.type,
        orderId: data.orderId,
        agentId: data.agentId,
        userId: data.userId,
        subtotal: data.subtotal,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
        status: InvoiceStatus.DRAFT,
        metadata: data.metadata ?? {},
      },
    });
  }

  findInvoiceById(id: string) {
    return this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
    });
  }

  listInvoices(skip?: number, take?: number) {
    const pagination = resolvePagination(skip, take);
    return this.prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  updateInvoiceStatus(id: string, status: InvoiceStatus, extra?: { issuedAt?: Date }) {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status,
        issuedAt: extra?.issuedAt,
      },
    });
  }

  /** Invoice financial fields are immutable after ISSUED — only status → VOID is allowed. */
  assertInvoiceMutableForFinancialEdit(status: InvoiceStatus): void {
    if (status === InvoiceStatus.ISSUED) {
      throw new Error('Issued invoices cannot be edited');
    }
  }
}
