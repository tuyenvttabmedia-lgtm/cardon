import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import {
  FinancialTransactionStatus,
  FulfillmentStatus,
  LedgerReferenceType,
  Prisma,
  ProductVariantStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { AppHttpException } from '../../../common/exceptions/app-http.exception';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import {
  generateOrderCode,
  generateTransactionId,
} from '../../order/entities/order-code.generator';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { LedgerService } from '../../agent/services/ledger.service';
import { PricingService } from '../../product/services/pricing.service';
import { VariantRepository } from '../../product/repositories/variant.repository';
import { ProviderService } from '../../provider/services/provider.service';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { BuyCardDto } from '../dto/agent-api.dto';
import {
  AGENT_PARTNER_FAILURE_CODES,
} from '../entities/agent-api.constants';
import {
  AgentApiContext,
  AgentOrderWithDetails,
  mapPartnerBalance,
  mapPartnerOrderResponse,
  PartnerBalanceResponse,
  PartnerBuyCardResponse,
  PartnerTransactionResponse,
} from '../entities/agent-api.mapper';
import { DuplicateAgentRequestError } from '../entities/agent-api.errors';
import { AgentApiRepository } from '../repositories/agent-api.repository';
import { WebhookDeliveryService } from '../../webhook-delivery/services/webhook-delivery.service';

@Injectable()
export class AgentApiBuyService {
  private readonly logger = new Logger(AgentApiBuyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AgentApiRepository,
    private readonly agentRepository: AgentRepository,
    private readonly variantRepository: VariantRepository,
    private readonly pricingService: PricingService,
    private readonly ledgerService: LedgerService,
    private readonly providerService: ProviderService,
    private readonly cardEncryption: CardEncryptionService,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  getBalance(agentId: string): Promise<PartnerBalanceResponse> {
    return this.ledgerService.getBalance(agentId).then(mapPartnerBalance);
  }

  async getTransaction(
    agentId: string,
    requestId: string,
  ): Promise<PartnerTransactionResponse> {
    const order = await this.repository.findOrderByAgentRequestId(
      agentId,
      requestId,
    );
    if (!order) {
      throw new NotFoundException('Transaction not found');
    }

    await this.ensureOrderSettled(order);
    const refreshed = await this.repository.findOrderByAgentRequestId(
      agentId,
      requestId,
    );
    const target = refreshed ?? order;

    const failureCode = await this.repository.findLatestProviderFailureCode(
      target.id,
    );

    return mapPartnerOrderResponse(target, this.cardEncryption, failureCode);
  }

  async buyCard(
    ctx: AgentApiContext,
    dto: BuyCardDto,
  ): Promise<PartnerBuyCardResponse> {
    if (dto.request_id !== ctx.requestId) {
      throw new BadRequestException('request_id must match X-REQUEST-ID header');
    }

    const existing = await this.repository.findOrderByAgentRequestId(
      ctx.agent.id,
      dto.request_id,
    );
    if (existing) {
      await this.ensureOrderSettled(existing);
      const settled = await this.repository.findOrderByAgentRequestId(
        ctx.agent.id,
        dto.request_id,
      );
      const failureCode = settled
        ? await this.repository.findLatestProviderFailureCode(settled.id)
        : undefined;
      return mapPartnerOrderResponse(
        settled ?? existing,
        this.cardEncryption,
        failureCode,
      );
    }

    const variant = await this.variantRepository.findBySku(dto.product_code);
    if (
      !variant ||
      variant.deletedAt ||
      variant.status !== ProductVariantStatus.ACTIVE ||
      !this.repository.isCardVariant(variant.type)
    ) {
      throw new AppHttpException(
        ErrorCode.INVALID_SKU,
        'Product not found or inactive',
        HttpStatus.BAD_REQUEST,
      );
    }

    const unitPriceStr = await this.pricingService.getAgentPrice(
      ctx.agent.id,
      variant.id,
    );
    const unitPrice = new Decimal(unitPriceStr);
    const totalAmount = unitPrice.mul(dto.quantity);

    let orderId: string;
    let financialTransactionId: string;

    try {
      const created = await this.createOrderWithHold({
        agentId: ctx.agent.id,
        agentRequestId: dto.request_id,
        variantId: variant.id,
        productCode: dto.product_code,
        quantity: dto.quantity,
        unitPrice,
        totalAmount,
      });
      orderId = created.orderId;
      financialTransactionId = created.financialTransactionId;
    } catch (error) {
      if (error instanceof DuplicateAgentRequestError) {
        const duplicate = await this.repository.findOrderByAgentRequestId(
          ctx.agent.id,
          dto.request_id,
        );
        if (duplicate) {
          const failureCode =
            await this.repository.findLatestProviderFailureCode(duplicate.id);
          return mapPartnerOrderResponse(
            duplicate,
            this.cardEncryption,
            failureCode,
          );
        }
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.repository.findOrderByAgentRequestId(
          ctx.agent.id,
          dto.request_id,
        );
        if (duplicate) {
          const failureCode =
            await this.repository.findLatestProviderFailureCode(duplicate.id);
          return mapPartnerOrderResponse(
            duplicate,
            this.cardEncryption,
            failureCode,
          );
        }
      }

      if (
        error instanceof BadRequestException &&
        error.message === 'INSUFFICIENT_BALANCE'
      ) {
        throw new AppHttpException(
          ErrorCode.INSUFFICIENT_BALANCE,
          'Insufficient available balance',
          HttpStatus.BAD_REQUEST,
        );
      }

      throw error;
    }

    let fulfillmentStatus: FulfillmentStatus;
    try {
      const result = await this.providerService.fulfillOrder(orderId);
      fulfillmentStatus = result.fulfillmentStatus;
    } catch (error) {
      this.logger.warn(
        `Provider fulfillment error for agent order ${orderId}: ${error instanceof Error ? error.message : error}`,
      );
      await this.repository.updateFinancialTransactionStatus(
        financialTransactionId,
        FinancialTransactionStatus.HOLD,
      );
      const processingOrder = await this.repository.findOrderByAgentRequestId(
        ctx.agent.id,
        dto.request_id,
      );
      if (!processingOrder) {
        throw error;
      }
      return mapPartnerOrderResponse(processingOrder, this.cardEncryption);
    }

    try {
      await this.settleFulfillment({
        agentId: ctx.agent.id,
        orderId,
        amount: totalAmount,
        financialTransactionId,
        fulfillmentStatus,
      });
      this.webhookDelivery.scheduleForOrder(orderId);
    } catch (error) {
      this.logger.error(
        `Settlement failed for agent order ${orderId} — idempotent replay will retry debit/release`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new AppHttpException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Transaction settlement pending — retry with same request_id',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const finalOrder = await this.repository.findOrderByAgentRequestId(
      ctx.agent.id,
      dto.request_id,
    );
    if (!finalOrder) {
      throw new NotFoundException('Transaction not found after fulfillment');
    }

    const failureCode = await this.repository.findLatestProviderFailureCode(
      finalOrder.id,
    );
    return mapPartnerOrderResponse(finalOrder, this.cardEncryption, failureCode);
  }

  private async createOrderWithHold(input: {
    agentId: string;
    agentRequestId: string;
    variantId: string;
    productCode: string;
    quantity: number;
    unitPrice: Decimal;
    totalAmount: Decimal;
  }): Promise<{ orderId: string; financialTransactionId: string }> {
    const orderCode = generateOrderCode();
    const transactionCode = generateTransactionId();

    return this.prisma.$transaction(async (tx) => {
      await this.agentRepository.lockForUpdate(input.agentId, tx);

      const duplicate = await tx.order.findFirst({
        where: {
          agentId: input.agentId,
          agentRequestId: input.agentRequestId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new DuplicateAgentRequestError();
      }

      const financialTxn = await this.repository.createFinancialTransaction(tx, {
        transactionCode,
        agentId: input.agentId,
        amount: input.totalAmount,
      });

      await this.ledgerService.holdInTransaction(
        tx,
        input.agentId,
        input.totalAmount,
        LedgerReferenceType.TRANSACTION,
        financialTxn.id,
        `Hold for agent buy ${input.productCode}`,
      );

      const order = await this.repository.createAgentOrderWithHold(tx, {
        agentId: input.agentId,
        agentRequestId: input.agentRequestId,
        variantId: input.variantId,
        productCode: input.productCode,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalAmount: input.totalAmount,
        orderCode,
        transactionCode,
        financialTransactionId: financialTxn.id,
      });

      await this.repository.updateFinancialTransactionStatus(
        financialTxn.id,
        FinancialTransactionStatus.HOLD,
        tx,
      );

      return {
        orderId: order.id,
        financialTransactionId: financialTxn.id,
      };
    });
  }

  private async settleFulfillment(params: {
    agentId: string;
    orderId: string;
    amount: Decimal;
    financialTransactionId: string;
    fulfillmentStatus: FulfillmentStatus;
  }): Promise<void> {
    const failureCode = await this.repository.findLatestProviderFailureCode(
      params.orderId,
    );

    if (params.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      await this.prisma.$transaction(async (tx) => {
        await this.ledgerService.debitFromHoldInTransaction(
          tx,
          params.agentId,
          params.amount,
          LedgerReferenceType.ORDER,
          params.orderId,
          'Agent buy card debit',
        );
        await this.repository.updateFinancialTransactionStatus(
          params.financialTransactionId,
          FinancialTransactionStatus.COMPLETED,
          tx,
        );
      });
      return;
    }

    if (this.shouldReleaseHold(failureCode, params.fulfillmentStatus)) {
      await this.prisma.$transaction(async (tx) => {
        await this.ledgerService.releaseInTransaction(
          tx,
          params.agentId,
          params.amount,
          LedgerReferenceType.ORDER,
          params.orderId,
          'Agent buy card release',
        );
        await this.repository.updateFinancialTransactionStatus(
          params.financialTransactionId,
          FinancialTransactionStatus.RELEASED,
          tx,
        );
        await this.repository.markOrderFailed(params.orderId, tx);
      });
      return;
    }

    await this.repository.updateFinancialTransactionStatus(
      params.financialTransactionId,
      FinancialTransactionStatus.HOLD,
    );
  }

  private shouldReleaseHold(
    failureCode: string | undefined,
    fulfillmentStatus: FulfillmentStatus,
  ): boolean {
    if (
      failureCode &&
      AGENT_PARTNER_FAILURE_CODES.includes(
        failureCode as (typeof AGENT_PARTNER_FAILURE_CODES)[number],
      )
    ) {
      return true;
    }

    return fulfillmentStatus === FulfillmentStatus.FAILED;
  }

  /**
   * Recovery: if provider already finalized but ledger settlement failed,
   * retry debit/release on idempotent replay (CHECK 3).
   */
  private async ensureOrderSettled(order: AgentOrderWithDetails): Promise<void> {
    if (!order.agentId || !order.financialTransaction) {
      return;
    }

    if (order.financialTransaction.status !== FinancialTransactionStatus.HOLD) {
      return;
    }

    const failureCode = await this.repository.findLatestProviderFailureCode(
      order.id,
    );

    if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      await this.settleFulfillment({
        agentId: order.agentId,
        orderId: order.id,
        amount: order.totalAmount,
        financialTransactionId: order.financialTransaction.id,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
      });
      this.webhookDelivery.scheduleForOrder(order.id);
      return;
    }

    if (this.shouldReleaseHold(failureCode, order.fulfillmentStatus)) {
      await this.settleFulfillment({
        agentId: order.agentId,
        orderId: order.id,
        amount: order.totalAmount,
        financialTransactionId: order.financialTransaction.id,
        fulfillmentStatus: order.fulfillmentStatus,
      });
      this.webhookDelivery.scheduleForOrder(order.id);
    }
  }
}
