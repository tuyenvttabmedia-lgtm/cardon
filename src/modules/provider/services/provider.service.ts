import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderItemStatus,
  OrderPaymentStatus,
  ProductVariantType,
  ProviderTransactionAction,
  ProviderTransactionStatus,
  ProviderTransactionType,
  Prisma,
  OrderEventType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { formatEsaleTransactionDate } from '../adapters/esale/esale.mapper';
import { generateProviderRequestId } from '../entities/provider-request-id.generator';
import { resolveFulfillmentStatusForFailure } from '../entities/provider-failure.rules';
import { validateCardProviderExecution } from '../entities/provider-fulfillment-validation';
import {
  buildCardProviderMetadata,
  parseProviderTransactionMetadata,
} from '../entities/provider-transaction.metadata';
import {
  ProviderCheckContext,
  ProviderFailureCode,
  ProviderInterface,
  ProviderResult,
} from '../interfaces/provider.interface';
import {
  CardRecordRepository,
  ProviderOrderRepository,
  ProviderRepository,
  ProviderTransactionRecord,
  ProviderTransactionRepository,
} from '../repositories/provider.repository';
import { NotificationService } from '../../notification/services/notification.service';
import { OrderEventService } from '../../order/services/order-event.service';
import { CardEncryptionService } from './card-encryption.service';
import { ProviderAuditService } from './provider-audit.service';
import { ProviderRegistryService } from './provider-registry.service';
import { ProviderQueueProducer } from './provider-queue.producer';
import {
  ProviderAutoProtectionService,
  ProviderHealthMonitorService,
} from './provider-health-monitor.service';
import {
  isProviderFailoverEligible,
  isProviderPendingRetry,
} from '../entities/provider-failover.rules';
import { PROVIDER_RETRY_DELAYS_MS } from '../entities/provider-retry.backoff';

export interface FulfillmentResult {
  orderId: string;
  fulfillmentStatus: FulfillmentStatus;
  providerTransactionId?: string;
  cardsDelivered?: number;
  failureCode?: ProviderFailureCode;
  scheduledRetry?: boolean;
}

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
    private readonly providerRepository: ProviderRepository,
    private readonly orderRepository: ProviderOrderRepository,
    private readonly transactionRepository: ProviderTransactionRepository,
    private readonly cardRecordRepository: CardRecordRepository,
    private readonly cardEncryption: CardEncryptionService,
    private readonly providerAudit: ProviderAuditService,
    private readonly notificationService: NotificationService,
    private readonly queueProducer: ProviderQueueProducer,
    private readonly healthMonitor: ProviderHealthMonitorService,
    private readonly autoProtection: ProviderAutoProtectionService,
    private readonly orderEvents: OrderEventService,
  ) {}

  async fulfillOrder(orderId: string): Promise<FulfillmentResult> {
    return this.runFulfillment(orderId, { isRetry: false });
  }

  async retryFulfillment(orderId: string): Promise<FulfillmentResult> {
    return this.runFulfillment(orderId, { isRetry: true });
  }

  async retryFulfillmentWithOptions(
    orderId: string,
    options: { skipProviderIds?: string[]; forceProviderId?: string },
  ): Promise<FulfillmentResult> {
    return this.runFulfillment(orderId, { isRetry: true, ...options });
  }

  private async runFulfillment(
    orderId: string,
    options: {
      isRetry: boolean;
      skipProviderIds?: string[];
      forceProviderId?: string;
    },
  ): Promise<FulfillmentResult> {
    const order = await this.orderRepository.findOrderForFulfillment(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== OrderPaymentStatus.PAID) {
      throw new BadRequestException('Order is not paid');
    }

    const cardItems = order.orderItems.filter(
      (item) => item.variant.type === ProductVariantType.CARD,
    );
    if (cardItems.length === 0) {
      throw new BadRequestException('No CARD items to fulfill');
    }

    if (cardItems.length > 1) {
      this.logger.warn(
        `Order ${orderId} has multiple CARD items — processing first item in Provider Core`,
      );
    }

    const orderItem = cardItems[0];
    const existingCards = await this.cardRecordRepository.countByOrderItemId(
      orderItem.id,
    );
    if (existingCards > 0) {
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        cardsDelivered: existingCards,
      };
    }

    if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      return { orderId, fulfillmentStatus: FulfillmentStatus.COMPLETED };
    }

    let selections;
    try {
      selections = await this.resolveSelections(
        orderItem.variantId,
        options.skipProviderIds,
        options.forceProviderId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        // All providers in maintenance / no ACTIVE mapping — park for admin retry
        // instead of throwing (which left PAID orders stuck in PENDING with no UI retry).
        return this.parkForAdminRetryNoProvider(orderId, error.message);
      }
      throw error;
    }
    const primarySelection = selections[0];

    if (order.fulfillmentStatus === FulfillmentStatus.PROCESSING) {
      return this.recoverProcessingOrder({
        orderId,
        orderItem,
        selection: primarySelection,
      });
    }

    const allowedStatuses: FulfillmentStatus[] = options.isRetry
      ? [
          FulfillmentStatus.WAITING_ADMIN_RETRY,
          FulfillmentStatus.PROCESSING,
          FulfillmentStatus.NEED_MANUAL_REVIEW,
          // Recovery for PAID orders that never left PENDING (e.g. pre-fix maintenance throws)
          FulfillmentStatus.PENDING,
        ]
      : [FulfillmentStatus.PENDING, FulfillmentStatus.WAITING_ADMIN_RETRY];

    if (!allowedStatuses.includes(order.fulfillmentStatus)) {
      throw new ConflictException(
        `Order fulfillment status ${order.fulfillmentStatus} cannot be processed`,
      );
    }

    const recoverable = await this.transactionRepository.findLatestRecoverable(
      orderId,
      primarySelection.provider.id,
      ProviderTransactionAction.BUY_CARD,
    );
    if (recoverable) {
      // Never open a new buyCard() while a recoverable attempt exists (TIMEOUT/PENDING).
      return this.tryRecoverPersistedTransaction({
        orderId,
        orderItemId: orderItem.id,
        quantity: orderItem.quantity,
        providerId: primarySelection.provider.id,
        adapter: primarySelection.adapter,
        txn: recoverable,
        isRetry: options.isRetry,
      });
    }

    const claim = await this.orderRepository.claimFulfillmentProcessing(
      orderId,
      this.prisma,
    );
    if (claim.count === 0) {
      return this.handleUnclaimedFulfillment(orderId, orderItem.id);
    }

    for (let index = 0; index < selections.length; index += 1) {
      const selection = selections[index];
      const result = await this.executeBuyCardAttempt({
        orderId,
        orderItem,
        selection,
        isRetry: options.isRetry,
      });

      if (
        result.fulfillmentStatus === FulfillmentStatus.COMPLETED ||
        result.scheduledRetry
      ) {
        return result;
      }

      const canFailover =
        isProviderFailoverEligible(result.failureCode) &&
        index < selections.length - 1;

      if (canFailover) {
        this.logger.warn(
          `Failover order=${orderId} provider=${selection.provider.code} code=${result.failureCode ?? 'UNKNOWN'} — trying next mapping`,
        );
        continue;
      }

      return result;
    }

    return {
      orderId,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
    };
  }

  private async parkForAdminRetryNoProvider(
    orderId: string,
    reason: string,
  ): Promise<FulfillmentResult> {
    this.logger.warn(
      `No eligible provider for order=${orderId} — WAITING_ADMIN_RETRY (${reason})`,
    );
    await this.orderRepository.updateFulfillmentStatus(
      orderId,
      FulfillmentStatus.WAITING_ADMIN_RETRY,
    );
    await this.notificationService.notifyAdminRetryRequired(orderId);
    return {
      orderId,
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
      failureCode: 'MAINTENANCE',
    };
  }

  private async resolveSelections(
    variantId: string,
    skipProviderIds?: string[],
    forceProviderId?: string,
  ) {
    let selections = await this.registry.listForVariant(variantId);

    if (skipProviderIds?.length) {
      const skip = new Set(skipProviderIds);
      selections = selections.filter((s) => !skip.has(s.provider.id));
    }

    if (forceProviderId) {
      const forced = selections.find((s) => s.provider.id === forceProviderId);
      if (!forced) {
        throw new BadRequestException(
          `Provider ${forceProviderId} is not mapped for this variant`,
        );
      }
      selections = [
        forced,
        ...selections.filter((s) => s.provider.id !== forceProviderId),
      ];
    }

    if (selections.length === 0) {
      throw new NotFoundException(
        `No eligible provider mapping for variant ${variantId}`,
      );
    }

    return selections;
  }

  private async recoverProcessingOrder(params: {
    orderId: string;
    orderItem: {
      id: string;
      variantId: string;
      quantity: number;
      variant: { sku: string; faceValue: Prisma.Decimal };
    };
    selection: {
      provider: { id: string };
      mapping: { providerProductCode: string; providerCost: Prisma.Decimal };
      adapter: ProviderInterface;
    };
  }): Promise<FulfillmentResult> {
    const recoverable = await this.transactionRepository.findLatestRecoverable(
      params.orderId,
      params.selection.provider.id,
      ProviderTransactionAction.BUY_CARD,
    );
    if (recoverable) {
      return this.tryRecoverPersistedTransaction({
        orderId: params.orderId,
        orderItemId: params.orderItem.id,
        quantity: params.orderItem.quantity,
        providerId: params.selection.provider.id,
        adapter: params.selection.adapter,
        txn: recoverable,
        isRetry: false,
      });
    }

    this.logger.warn(
      `Order ${params.orderId} is PROCESSING without recoverable provider transaction — retrying buyCard`,
    );

    return this.executeBuyCardAttempt({
      orderId: params.orderId,
      orderItem: params.orderItem,
      selection: params.selection,
      isRetry: false,
    });
  }

  private async executeBuyCardAttempt(params: {
    orderId: string;
    orderItem: {
      id: string;
      variantId: string;
      quantity: number;
      variant: { sku: string; faceValue: Prisma.Decimal };
    };
    selection: {
      provider: { id: string };
      mapping: { providerProductCode: string; providerCost: Prisma.Decimal };
      adapter: ProviderInterface;
    };
    isRetry: boolean;
  }): Promise<FulfillmentResult> {
    const { orderId, orderItem, selection, isRetry } = params;
    const attempt = await this.nextAttempt(orderId, selection.provider.id);
    const requestId = generateProviderRequestId();
    const now = new Date();
    const providerTransactionDate = formatEsaleTransactionDate(now);
    const providerRequestTime = Math.floor(now.getTime() / 1000).toString();

    validateCardProviderExecution({
      providerProductCode: selection.mapping.providerProductCode,
    });

    if (isRetry) {
      await this.providerAudit.recordRetry({
        orderId,
        providerId: selection.provider.id,
        requestId,
        attempt,
      });
    }

    await this.providerAudit.recordAttempt({
      orderId,
      providerId: selection.provider.id,
      requestId,
      attempt,
      metadata: { variantSku: orderItem.variant.sku, quantity: orderItem.quantity },
    });

    await this.providerRepository.createProviderLog({
      providerId: selection.provider.id,
      orderId,
      requestId,
      action: ProviderTransactionAction.BUY_CARD,
      status: ProviderTransactionStatus.PROCESSING,
      requestPayload: {
        providerProductCode: selection.mapping.providerProductCode,
        quantity: orderItem.quantity,
        attempt,
      },
    });

    const txn = await this.transactionRepository.create({
      orderId,
      orderItemId: orderItem.id,
      providerId: selection.provider.id,
      requestId,
      attempt,
      action: ProviderTransactionAction.BUY_CARD,
      type: ProviderTransactionType.CARD,
      status: ProviderTransactionStatus.PROCESSING,
      providerTransactionDate,
      providerMetadata: buildCardProviderMetadata(providerRequestTime),
      faceValue: orderItem.variant.faceValue,
      providerCost: selection.mapping.providerCost,
      requestPayload: {
        providerProductCode: selection.mapping.providerProductCode,
        quantity: orderItem.quantity,
        variantId: orderItem.variantId,
      },
    });

    await this.orderEvents.record(
      orderId,
      OrderEventType.PROVIDER_REQUEST,
      `Gửi yêu cầu mua thẻ tới NCC (lần ${attempt})`,
      { requestId, providerId: selection.provider.id },
    );

    const startedAt = Date.now();
    let result = await selection.adapter.buyCard({
      requestId,
      providerProductCode: selection.mapping.providerProductCode,
      quantity: orderItem.quantity,
      orderId,
      providerTransactionDate,
      providerRequestTime,
    });

    const latencyMs = Date.now() - startedAt;
    await this.healthMonitor.recordApiCall({
      providerId: selection.provider.id,
      success: result.success,
      latencyMs,
      errorMessage: result.message,
    });
    if (!result.success) {
      await this.autoProtection.evaluateProvider(selection.provider.id);
    }

    if (
      result.status === ProviderTransactionStatus.TIMEOUT ||
      result.status === ProviderTransactionStatus.PENDING
    ) {
      result = await this.recoverFromTimeout(
        selection.adapter,
        txn,
        result,
      );
    }

    return this.applyProviderResult({
      orderId,
      orderItemId: orderItem.id,
      quantity: orderItem.quantity,
      providerId: selection.provider.id,
      txnId: txn.id,
      requestId,
      result,
    });
  }

  private async tryRecoverPersistedTransaction(params: {
    orderId: string;
    orderItemId: string;
    quantity: number;
    providerId: string;
    adapter: ProviderInterface;
    txn: ProviderTransactionRecord;
    isRetry: boolean;
  }): Promise<FulfillmentResult> {
    const { orderId, orderItemId, quantity, providerId, adapter, isRetry } =
      params;

    const listed = await this.transactionRepository.findRecoverableAttempts(
      orderId,
      providerId,
      ProviderTransactionAction.BUY_CARD,
    );
    const candidates = listed.length > 0 ? listed : [params.txn];

    let lastChecked: {
      txn: ProviderTransactionRecord;
      result: ProviderResult;
    } | null = null;

    for (const txn of candidates) {
      const checkContext = this.buildCheckContext(txn);
      if (!checkContext) {
        this.logger.error(
          `Missing checkTransaction metadata for card requestId=${txn.requestId} — cannot safely recover`,
        );
        continue;
      }

      this.logger.warn(
        `Recovering provider transaction requestId=${txn.requestId} status=${txn.status}${isRetry ? ' on admin retry' : ''} — checkTransaction only`,
      );

      let recovered = await adapter.checkTransaction(txn.requestId, checkContext);

      if (
        recovered.status === ProviderTransactionStatus.TIMEOUT ||
        recovered.status === ProviderTransactionStatus.PENDING
      ) {
        recovered = await this.recoverFromTimeout(adapter, txn, recovered);
      }

      if (
        recovered.success &&
        recovered.status === ProviderTransactionStatus.SUCCESS &&
        recovered.cards?.length
      ) {
        return this.applyProviderResult({
          orderId,
          orderItemId,
          quantity,
          providerId,
          txnId: txn.id,
          requestId: txn.requestId,
          result: recovered,
        });
      }

      lastChecked = {
        txn,
        result: {
          ...recovered,
          status: ProviderTransactionStatus.TIMEOUT,
          failureCode: recovered.failureCode ?? 'TIMEOUT',
          success: false,
        },
      };
    }

    if (lastChecked) {
      return this.applyProviderResult({
        orderId,
        orderItemId,
        quantity,
        providerId,
        txnId: lastChecked.txn.id,
        requestId: lastChecked.txn.requestId,
        result: lastChecked.result,
      });
    }

    await this.orderRepository.updateFulfillmentStatus(
      orderId,
      FulfillmentStatus.WAITING_ADMIN_RETRY,
    );
    await this.notificationService.notifyAdminRetryRequired(orderId);
    return {
      orderId,
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
      failureCode: 'TIMEOUT',
    };
  }

  private buildCheckContext(
    txn: ProviderTransactionRecord,
  ): ProviderCheckContext | undefined {
    if (!txn.providerTransactionDate) {
      return undefined;
    }
    const metadata = parseProviderTransactionMetadata(txn.providerMetadata);
    return {
      providerTransactionDate: txn.providerTransactionDate,
      providerRequestTime: metadata.requestTime,
      kind: metadata.kind ?? 'CARD',
    };
  }

  private async handleUnclaimedFulfillment(
    orderId: string,
    orderItemId: string,
  ): Promise<FulfillmentResult> {
    const refreshed = await this.orderRepository.findOrderForFulfillment(orderId);
    if (!refreshed) {
      throw new NotFoundException('Order not found');
    }

    if (refreshed.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      const cardsDelivered =
        await this.cardRecordRepository.countByOrderItemId(orderItemId);
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        cardsDelivered,
      };
    }

    if (refreshed.fulfillmentStatus === FulfillmentStatus.PROCESSING) {
      throw new ConflictException('Fulfillment already in progress');
    }

    throw new ConflictException(`Order ${orderId} cannot be claimed for fulfillment`);
  }

  private async recoverFromTimeout(
    adapter: ProviderInterface,
    txn: ProviderTransactionRecord,
    timeoutResult: ProviderResult,
  ): Promise<ProviderResult> {
    const checkContext = this.buildCheckContext(txn);
    this.logger.warn(
      `Provider timeout for request_id=${txn.requestId} — calling checkTransaction`,
    );

    const recovered = await adapter.checkTransaction(
      txn.requestId,
      checkContext,
    );
    if (recovered.success && recovered.status === ProviderTransactionStatus.SUCCESS) {
      return recovered;
    }

    return {
      ...timeoutResult,
      status: ProviderTransactionStatus.TIMEOUT,
      failureCode: timeoutResult.failureCode ?? 'TIMEOUT',
    };
  }

  private async applyProviderResult(params: {
    orderId: string;
    orderItemId: string;
    quantity: number;
    providerId: string;
    txnId: string;
    requestId: string;
    result: ProviderResult;
  }): Promise<FulfillmentResult> {
    const { orderId, orderItemId, quantity, providerId, txnId, requestId, result } =
      params;

    await this.transactionRepository.updateResult(txnId, {
      status: result.status,
      providerTransactionId: result.providerTransactionId,
      providerReference: result.providerReference ?? requestId,
      responsePayload: (result.rawResponse ?? {}) as Prisma.InputJsonValue,
      errorCode: result.failureCode,
      errorMessage: result.message,
      completedAt:
        result.status === ProviderTransactionStatus.SUCCESS ||
        result.status === ProviderTransactionStatus.FAILED
          ? new Date()
          : undefined,
    });

    await this.providerRepository.createProviderLog({
      providerId,
      orderId,
      requestId,
      action: ProviderTransactionAction.BUY_CARD,
      status: result.status,
      responsePayload: (result.rawResponse ?? {}) as Prisma.InputJsonValue,
      errorMessage: result.message,
    });

    if (
      result.success &&
      result.status === ProviderTransactionStatus.SUCCESS &&
      result.cards?.length
    ) {
      const cards = result.cards;
      if (cards.length !== quantity) {
        this.logger.warn(
          `Expected ${quantity} cards, received ${cards.length} for order ${orderId} — WAITING_ADMIN_RETRY`,
        );

        await this.transactionRepository.updateResult(txnId, {
          status: ProviderTransactionStatus.FAILED,
          providerTransactionId: result.providerTransactionId,
          providerReference: result.providerReference ?? requestId,
          responsePayload: {
            ...(result.rawResponse ?? {}),
            quantityMismatch: true,
            expected: quantity,
            received: cards.length,
          } as Prisma.InputJsonValue,
          errorCode: 'UNKNOWN',
          errorMessage: 'QUANTITY_MISMATCH',
          completedAt: new Date(),
        });

        await this.orderRepository.updateFulfillmentStatus(
          orderId,
          FulfillmentStatus.WAITING_ADMIN_RETRY,
        );

        await this.providerAudit.recordFailed({
          orderId,
          providerId,
          requestId,
          failureCode: 'UNKNOWN',
          metadata: {
            reason: 'QUANTITY_MISMATCH',
            expected: quantity,
            received: cards.length,
          },
        });

        return {
          orderId,
          fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
          providerTransactionId: result.providerTransactionId,
        };
      }

      await this.prisma.$transaction(async (tx) => {
        await this.cardRecordRepository.createMany(
          cards.map((card) => ({
            orderItemId,
            encryptedSerial: this.cardEncryption.encrypt(card.serial),
            encryptedPin: this.cardEncryption.encrypt(card.pin),
            providerResponse: {
              expiredAt: card.expiredAt?.toISOString() ?? null,
              gatewayTransactionId: result.providerTransactionId,
            } as Prisma.InputJsonValue,
          })),
          tx,
        );

        await this.orderRepository.updateOrderItemStatus(
          orderItemId,
          OrderItemStatus.COMPLETED,
          tx,
        );
        await this.orderRepository.updateFulfillmentStatus(
          orderId,
          FulfillmentStatus.COMPLETED,
          tx,
        );
      });

      await this.providerAudit.recordSuccess({
        orderId,
        providerId,
        requestId,
        metadata: {
          cardsDelivered: cards.length,
          providerTransactionId: result.providerTransactionId,
        },
      });

      await this.orderEvents.record(
        orderId,
        OrderEventType.PROVIDER_SUCCESS,
        'NCC xác nhận giao thẻ thành công',
        {
          providerTransactionId: result.providerTransactionId,
          cardsDelivered: cards.length,
        },
      );

      await this.orderEvents.record(
        orderId,
        OrderEventType.CARD_DELIVERED,
        `Đã lưu ${cards.length} mã thẻ`,
        { cardsDelivered: cards.length },
      );

      await this.notificationService.notifyCardDelivery(orderId);

      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        providerTransactionId: result.providerTransactionId,
        cardsDelivered: cards.length,
      };
    }

    const failureStatus = resolveFulfillmentStatusForFailure(result.failureCode);

    if (isProviderPendingRetry(result.failureCode)) {
      const pendingAttempt = await this.countPendingRetries(orderId);
      if (pendingAttempt < PROVIDER_RETRY_DELAYS_MS.length) {
        const delay = PROVIDER_RETRY_DELAYS_MS[pendingAttempt];
        await this.queueProducer.enqueueDelayedRetry(
          orderId,
          pendingAttempt + 1,
          delay,
        );
        await this.orderRepository.updateFulfillmentStatus(
          orderId,
          FulfillmentStatus.PROCESSING,
        );
        this.logger.warn(
          `Scheduled provider retry order=${orderId} attempt=${pendingAttempt + 1} delayMs=${delay}`,
        );
        return {
          orderId,
          fulfillmentStatus: FulfillmentStatus.PROCESSING,
          providerTransactionId: result.providerTransactionId,
          failureCode: result.failureCode,
          scheduledRetry: true,
        };
      }

      await this.orderRepository.updateFulfillmentStatus(
        orderId,
        FulfillmentStatus.NEED_MANUAL_REVIEW,
      );
      await this.notificationService.notifyAdminRetryRequired(orderId);
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        providerTransactionId: result.providerTransactionId,
        failureCode: result.failureCode,
      };
    }

    await this.orderRepository.updateFulfillmentStatus(orderId, failureStatus);

    await this.providerAudit.recordFailed({
      orderId,
      providerId,
      requestId,
      failureCode: result.failureCode,
      metadata: { status: result.status, message: result.message },
    });

    if (failureStatus === FulfillmentStatus.WAITING_ADMIN_RETRY) {
      await this.notificationService.notifyAdminRetryRequired(orderId);
    }

    return {
      orderId,
      fulfillmentStatus: failureStatus,
      providerTransactionId: result.providerTransactionId,
      failureCode: result.failureCode,
    };
  }

  private async countPendingRetries(orderId: string): Promise<number> {
    const rows = await this.transactionRepository.listByOrderId(orderId);
    return rows.filter(
      (row) =>
        row.status === ProviderTransactionStatus.TIMEOUT ||
        row.status === ProviderTransactionStatus.PENDING,
    ).length;
  }

  private async nextAttempt(
    orderId: string,
    providerId: string,
  ): Promise<number> {
    const agg = await this.transactionRepository.findMaxAttempt(
      orderId,
      providerId,
    );
    return (agg._max.attempt ?? 0) + 1;
  }
}
