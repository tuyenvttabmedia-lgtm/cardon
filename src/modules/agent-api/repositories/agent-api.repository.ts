import { Injectable } from '@nestjs/common';
import {
  FinancialTransactionStatus,
  FinancialTransactionType,
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  Prisma,
  ProductVariantType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AgentOrderWithDetails } from '../entities/agent-api.mapper';

const AGENT_ORDER_INCLUDE = {
  financialTransaction: true,
  orderItems: {
    include: {
      variant: { select: { sku: true, type: true } },
      cardRecords: true,
    },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class AgentApiRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrderByAgentRequestId(
    agentId: string,
    agentRequestId: string,
  ): Promise<AgentOrderWithDetails | null> {
    return this.prisma.order.findFirst({
      where: {
        agentId,
        agentRequestId,
        deletedAt: null,
      },
      include: AGENT_ORDER_INCLUDE,
    }) as Promise<AgentOrderWithDetails | null>;
  }

  findOrderById(orderId: string): Promise<AgentOrderWithDetails | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null, agentId: { not: null } },
      include: AGENT_ORDER_INCLUDE,
    }) as Promise<AgentOrderWithDetails | null>;
  }

  findLatestProviderFailureCode(orderId: string): Promise<string | undefined> {
    return this.prisma.providerTransaction
      .findFirst({
        where: { orderId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { status: true, responsePayload: true },
      })
      .then((txn) => {
        if (!txn) {
          return undefined;
        }
        const payload = txn.responsePayload as {
          failureCode?: string;
          behavior?: string;
        } | null;
        if (payload?.failureCode) {
          return payload.failureCode;
        }
        if (payload?.behavior) {
          return payload.behavior;
        }
        if (txn.status === 'TIMEOUT') {
          return 'TIMEOUT';
        }
        return undefined;
      });
  }

  createAgentOrderWithHold(
    tx: Prisma.TransactionClient,
    input: {
      agentId: string;
      agentRequestId: string;
      variantId: string;
      productCode: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      orderCode: string;
      transactionCode: string;
      financialTransactionId: string;
    },
  ) {
    return tx.order.create({
      data: {
        orderCode: input.orderCode,
        transactionId: input.financialTransactionId,
        agentId: input.agentId,
        agentRequestId: input.agentRequestId,
        channel: OrderChannel.AGENT,
        isGuestOrder: false,
        invoiceRequired: false,
        invoiceMetadata: {},
        totalAmount: input.totalAmount,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        orderItems: {
          create: {
            variantId: input.variantId,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            discount: 0,
            totalAmount: input.totalAmount,
          },
        },
      },
      include: AGENT_ORDER_INCLUDE,
    }) as Promise<AgentOrderWithDetails>;
  }

  createFinancialTransaction(
    tx: Prisma.TransactionClient,
    input: {
      transactionCode: string;
      agentId: string;
      amount: Prisma.Decimal;
    },
  ) {
    return tx.financialTransaction.create({
      data: {
        transactionId: input.transactionCode,
        agentId: input.agentId,
        type: FinancialTransactionType.AGENT_ORDER,
        amount: input.amount,
        status: FinancialTransactionStatus.PENDING,
      },
    });
  }

  updateFinancialTransactionStatus(
    id: string,
    status: FinancialTransactionStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.financialTransaction.update({
      where: { id },
      data: { status },
    });
  }

  markOrderFailed(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: FulfillmentStatus.FAILED },
    });
  }

  isCardVariant(type: ProductVariantType): boolean {
    return type === ProductVariantType.CARD;
  }
}
