import { Injectable } from '@nestjs/common';
import {
  ProviderOperationalStatus,
  ProviderReconciliationStatus,
  ProviderTransactionStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';

const RECONCILE_TOLERANCE = new Decimal(1000);

@Injectable()
export class ProviderOperationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReconciliationReport(providerId: string, reportDate: Date) {
    return this.prisma.providerReconciliationReport.findUnique({
      where: {
        providerId_reportDate: { providerId, reportDate },
      },
    });
  }

  upsertReconciliationReport(data: {
    providerId: string;
    reportDate: Date;
    openingBalance: Decimal;
    closingBalance: Decimal | null;
    totalTransactions: number;
    successTransactions: number;
    failedTransactions: number;
    totalProviderCost: Decimal;
    expectedBalance: Decimal;
    actualBalance: Decimal | null;
    differenceAmount: Decimal;
    status: ProviderReconciliationStatus;
  }) {
    return this.prisma.providerReconciliationReport.upsert({
      where: {
        providerId_reportDate: {
          providerId: data.providerId,
          reportDate: data.reportDate,
        },
      },
      create: data,
      update: {
        openingBalance: data.openingBalance,
        closingBalance: data.closingBalance,
        totalTransactions: data.totalTransactions,
        successTransactions: data.successTransactions,
        failedTransactions: data.failedTransactions,
        totalProviderCost: data.totalProviderCost,
        expectedBalance: data.expectedBalance,
        actualBalance: data.actualBalance,
        differenceAmount: data.differenceAmount,
        status: data.status,
      },
    });
  }

  listReconciliationReports(params: {
    providerId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.ProviderReconciliationReportWhereInput = {};
    if (params.providerId) where.providerId = params.providerId;
    if (params.dateFrom || params.dateTo) {
      where.reportDate = {};
      if (params.dateFrom) where.reportDate.gte = params.dateFrom;
      if (params.dateTo) where.reportDate.lte = params.dateTo;
    }

    return this.prisma.providerReconciliationReport.findMany({
      where,
      include: { provider: { select: { id: true, code: true, name: true } } },
      orderBy: [{ reportDate: 'desc' }, { provider: { code: 'asc' } }],
      skip: params.skip,
      take: params.take,
    });
  }

  findPreviousClosingBalance(providerId: string, beforeDate: Date) {
    return this.prisma.providerReconciliationReport.findFirst({
      where: {
        providerId,
        reportDate: { lt: beforeDate },
        closingBalance: { not: null },
      },
      orderBy: { reportDate: 'desc' },
      select: { closingBalance: true },
    });
  }

  aggregateDayTransactions(providerId: string, dayStart: Date, dayEnd: Date) {
    return this.prisma.providerTransaction.groupBy({
      by: ['status'],
      where: {
        providerId,
        deletedAt: null,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { _all: true },
      _sum: { providerCost: true },
    });
  }

  searchTransactions(params: {
    providerId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: ProviderTransactionStatus;
    orderId?: string;
    providerTransactionId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.ProviderTransactionWhereInput = { deletedAt: null };
    if (params.providerId) where.providerId = params.providerId;
    if (params.status) where.status = params.status;
    if (params.orderId) where.orderId = params.orderId;
    if (params.providerTransactionId) {
      where.providerTransactionId = params.providerTransactionId;
    }
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = params.dateFrom;
      if (params.dateTo) where.createdAt.lte = params.dateTo;
    }

    return this.prisma.providerTransaction.findMany({
      where,
      include: {
        provider: { select: { code: true, name: true } },
        order: {
          select: {
            id: true,
            orderCode: true,
            totalAmount: true,
            paymentFeeAmount: true,
            providerCost: true,
            profit: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  countTransactions(params: {
    providerId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: ProviderTransactionStatus;
    orderId?: string;
    providerTransactionId?: string;
  }) {
    const where: Prisma.ProviderTransactionWhereInput = { deletedAt: null };
    if (params.providerId) where.providerId = params.providerId;
    if (params.status) where.status = params.status;
    if (params.orderId) where.orderId = params.orderId;
    if (params.providerTransactionId) {
      where.providerTransactionId = params.providerTransactionId;
    }
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = params.dateFrom;
      if (params.dateTo) where.createdAt.lte = params.dateTo;
    }
    return this.prisma.providerTransaction.count({ where });
  }

  providerFinanceSummary(providerId: string, dayStart: Date, dayEnd: Date) {
    return this.prisma.providerTransaction.groupBy({
      by: ['status'],
      where: {
        providerId,
        deletedAt: null,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { _all: true },
      _sum: { providerCost: true },
    });
  }

  async sumProviderProfit(providerId: string, dayStart: Date, dayEnd: Date) {
    const rows = await this.prisma.providerTransaction.findMany({
      where: {
        providerId,
        deletedAt: null,
        status: ProviderTransactionStatus.SUCCESS,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      select: {
        order: { select: { profit: true } },
      },
    });

    return rows.reduce(
      (sum, row) => sum.add(row.order.profit ?? 0),
      new Decimal(0),
    );
  }

  static resolveReconciliationStatus(
    difference: Decimal,
    hasActual: boolean,
  ): ProviderReconciliationStatus {
    if (!hasActual) return ProviderReconciliationStatus.NEED_CHECK;
    if (difference.abs().lte(RECONCILE_TOLERANCE)) {
      return ProviderReconciliationStatus.MATCHED;
    }
    return ProviderReconciliationStatus.DIFFERENCE;
  }
}
