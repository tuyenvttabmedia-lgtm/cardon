import { Injectable } from '@nestjs/common';
import {
  AgentDepositStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AgentDepositRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, agentId: string) {
    return this.prisma.agentDeposit.findFirst({
      where: { id, agentId, deletedAt: null },
    });
  }

  findByIdOnly(id: string) {
    return this.prisma.agentDeposit.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByReference(paymentReference: string) {
    return this.prisma.agentDeposit.findFirst({
      where: { paymentReference, deletedAt: null },
    });
  }

  findByIdempotency(agentId: string, idempotencyKey: string) {
    return this.prisma.agentDeposit.findFirst({
      where: { agentId, idempotencyKey, deletedAt: null },
    });
  }

  listByAgent(agentId: string, skip: number, take: number, dateFrom?: string, dateTo?: string) {
    const where: Prisma.AgentDepositWhereInput = {
      agentId,
      deletedAt: null,
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    return Promise.all([
      this.prisma.agentDeposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.agentDeposit.count({ where }),
    ]);
  }

  sumPendingAmount(agentId: string) {
    return this.prisma.agentDeposit.aggregate({
      where: {
        agentId,
        deletedAt: null,
        status: { in: [AgentDepositStatus.INIT, AgentDepositStatus.AWAITING_PAYMENT] },
      },
      _sum: { amount: true },
    });
  }

  sumCreditedToday(agentId: string, startOfDay: Date) {
    return this.prisma.agentDeposit.aggregate({
      where: {
        agentId,
        deletedAt: null,
        status: AgentDepositStatus.CREDITED,
        creditedAt: { gte: startOfDay },
      },
      _sum: { netAmount: true },
    });
  }

  sumCreditedMonth(agentId: string, startOfMonth: Date) {
    return this.prisma.agentDeposit.aggregate({
      where: {
        agentId,
        deletedAt: null,
        status: AgentDepositStatus.CREDITED,
        creditedAt: { gte: startOfMonth },
      },
      _sum: { netAmount: true },
    });
  }

  create(data: Prisma.AgentDepositCreateInput) {
    return this.prisma.agentDeposit.create({ data });
  }

  update(id: string, data: Prisma.AgentDepositUpdateInput) {
    return this.prisma.agentDeposit.update({ where: { id }, data });
  }

  claimStatus(id: string, from: AgentDepositStatus[], to: AgentDepositStatus) {
    return this.prisma.agentDeposit.updateMany({
      where: { id, status: { in: from }, deletedAt: null },
      data: { status: to },
    });
  }
}

export type AgentDepositRecord = Awaited<ReturnType<AgentDepositRepository['findById']>>;
