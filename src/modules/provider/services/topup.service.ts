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
  Prisma,
  TopupTransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { parseTopupProductCode, parseDataProductCode } from '../adapters/esale/esale.mapper';
import { formatEsaleTransactionDate } from '../adapters/esale/esale.mapper';
import { generateProviderRequestId } from '../entities/provider-request-id.generator';
import { resolveFulfillmentStatusForFailure } from '../entities/provider-failure.rules';
import {
  buildTopupProviderMetadata,
  parseProviderTransactionMetadata,
} from '../entities/provider-transaction.metadata';
import { formatTelcoLabel, resolveTopupPhone } from '../entities/topup-phone.util';
import {
  ProviderCheckContext,
  ProviderInterface,
  ProviderResult,
} from '../interfaces/provider.interface';
import {
  ProviderOrderRepository,
  ProviderRepository,
  ProviderTransactionRecord,
  ProviderTransactionRepository,
  TopupTransactionRepository,
} from '../repositories/provider.repository';
import { NotificationService } from '../../notification/services/notification.service';
import { ProviderAuditService } from './provider-audit.service';
import { ProviderRegistryService } from './provider-registry.service';
import { FulfillmentResult } from './provider.service';
import {
  validateDataProviderExecution,
  validateTopupProviderExecution,
} from '../entities/provider-fulfillment-validation';

@Injectable()
export class TopupService {
  private readonly logger = new Logger(TopupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
    private readonly providerRepository: ProviderRepository,
    private readonly orderRepository: ProviderOrderRepository,
    private readonly transactionRepository: ProviderTransactionRepository,
    private readonly topupTransactionRepository: TopupTransactionRepository,
    private readonly providerAudit: ProviderAuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async fulfillOrder(orderId: string): Promise<FulfillmentResult> {
    return this.runFulfillment(orderId, { isRetry: false });
  }

  async retryFulfillment(orderId: string): Promise<FulfillmentResult> {
    return this.runFulfillment(orderId, { isRetry: true });
  }

  private async runFulfillment(
    orderId: string,
    options: { isRetry: boolean },
  ): Promise<FulfillmentResult> {
    const order = await this.orderRepository.findOrderForFulfillment(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== OrderPaymentStatus.PAID) {
      throw new BadRequestException('Order is not paid');
    }

    const topupItems = order.orderItems.filter((item) =>
      this.isTopupVariant(item.variant.type),
    );
    if (topupItems.length === 0) {
      throw new BadRequestException('No TOPUP items to fulfill');
    }

    if (topupItems.length > 1) {
      this.logger.warn(
        `Order ${orderId} has multiple TOPUP items — processing first item`,
      );
    }

    const orderItem = topupItems[0];
    const existingTopup = await this.topupTransactionRepository.findByOrderItemId(
      orderItem.id,
    );
    if (existingTopup?.status === TopupTransactionStatus.SUCCESS) {
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        providerTransactionId: existingTopup.providerReference ?? undefined,
      };
    }

    if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      return { orderId, fulfillmentStatus: FulfillmentStatus.COMPLETED };
    }

    const selection = await this.registry.selectForVariant(orderItem.variantId);
    const phoneNumber = resolveTopupPhone(order);
    const providerCode = selection.mapping.providerProductCode.trim();
    const isData = orderItem.variant.type === ProductVariantType.DATA;

    let amount: number;
    let telcoLabel: string;
    let packageCode: string | undefined;

    if (isData) {
      const parsed = parseDataProductCode(providerCode);
      packageCode = parsed.packageCode || orderItem.variant.sku;
      amount = Number(orderItem.variant.faceValue);
      telcoLabel = formatTelcoLabel(parsed.telco ?? 'unknown');
      validateDataProviderExecution({
        phoneNumber,
        packageCode,
        providerProductCode: providerCode,
      });
    } else {
      amount = Number(orderItem.variant.faceValue);
      const { telco } = parseTopupProductCode(providerCode, amount);
      telcoLabel = formatTelcoLabel(telco ?? 'unknown');
      validateTopupProviderExecution({
        phoneNumber,
        amount,
        telco: telco ?? '',
        providerProductCode: providerCode,
      });
    }

    if (order.fulfillmentStatus === FulfillmentStatus.PROCESSING) {
      return this.recoverProcessingOrder({
        orderId,
        orderItem,
        phoneNumber,
        amount,
        telco: telcoLabel,
        selection,
      });
    }

    const allowedStatuses: FulfillmentStatus[] = options.isRetry
      ? [FulfillmentStatus.WAITING_ADMIN_RETRY]
      : [FulfillmentStatus.PENDING, FulfillmentStatus.WAITING_ADMIN_RETRY];

    if (!allowedStatuses.includes(order.fulfillmentStatus)) {
      throw new ConflictException(
        `Order fulfillment status ${order.fulfillmentStatus} cannot be processed`,
      );
    }

    const recoverable = await this.transactionRepository.findLatestRecoverable(
      orderId,
      selection.provider.id,
      ProviderTransactionAction.TOPUP,
    );
    if (recoverable) {
      const recovered = await this.tryRecoverPersistedTransaction({
        orderId,
        orderItemId: orderItem.id,
        phoneNumber,
        amount,
        telco: telcoLabel,
        providerId: selection.provider.id,
        adapter: selection.adapter,
        txn: recoverable,
        isRetry: options.isRetry,
      });
      if (recovered) {
        return recovered;
      }
    }

    const claim = await this.orderRepository.claimFulfillmentProcessing(
      orderId,
      this.prisma,
    );
    if (claim.count === 0) {
      return this.handleUnclaimedFulfillment(orderId, orderItem.id);
    }

    return this.executeTopupAttempt({
      orderId,
      orderItem,
      phoneNumber,
      amount,
      telco: telcoLabel,
      packageCode,
      selection,
      isRetry: options.isRetry,
    });
  }

  private isTopupVariant(type: ProductVariantType): boolean {
    return type === ProductVariantType.TOPUP || type === ProductVariantType.DATA;
  }

  private async recoverProcessingOrder(params: {
    orderId: string;
    orderItem: {
      id: string;
      variantId: string;
      variant: { sku: string; faceValue: Prisma.Decimal };
    };
    phoneNumber: string;
    amount: number;
    telco: string;
    selection: {
      provider: { id: string };
      mapping: { providerProductCode: string };
      adapter: ProviderInterface;
    };
  }): Promise<FulfillmentResult> {
    const recoverable = await this.transactionRepository.findLatestRecoverable(
      params.orderId,
      params.selection.provider.id,
      ProviderTransactionAction.TOPUP,
    );
    if (recoverable) {
      const recovered = await this.tryRecoverPersistedTransaction({
        orderId: params.orderId,
        orderItemId: params.orderItem.id,
        phoneNumber: params.phoneNumber,
        amount: params.amount,
        telco: params.telco,
        providerId: params.selection.provider.id,
        adapter: params.selection.adapter,
        txn: recoverable,
        isRetry: false,
      });
      if (recovered) {
        return recovered;
      }
      throw new ConflictException(
        'Could not recover in-flight topup from persisted metadata',
      );
    }

    this.logger.warn(
      `Order ${params.orderId} is PROCESSING without recoverable topup transaction — retrying topup`,
    );

    return this.executeTopupAttempt({
      orderId: params.orderId,
      orderItem: params.orderItem,
      phoneNumber: params.phoneNumber,
      amount: params.amount,
      telco: params.telco,
      selection: params.selection,
      isRetry: false,
    });
  }

  private async executeTopupAttempt(params: {
    orderId: string;
    orderItem: {
      id: string;
      variantId: string;
      variant: { sku: string; faceValue: Prisma.Decimal; type?: ProductVariantType };
    };
    phoneNumber: string;
    amount: number;
    telco: string;
    packageCode?: string;
    selection: {
      provider: { id: string };
      mapping: { providerProductCode: string };
      adapter: ProviderInterface;
    };
    isRetry: boolean;
  }): Promise<FulfillmentResult> {
    const { orderId, orderItem, phoneNumber, amount, telco, packageCode, selection, isRetry } =
      params;
    const providerCode = selection.mapping.providerProductCode.trim();

    if (orderItem.variant.type === ProductVariantType.DATA) {
      validateDataProviderExecution({
        phoneNumber,
        packageCode: packageCode ?? orderItem.variant.sku,
        providerProductCode: providerCode,
      });
    } else {
      validateTopupProviderExecution({
        phoneNumber,
        amount,
        telco,
        providerProductCode: providerCode,
      });
    }
    const attempt = await this.nextAttempt(orderId, selection.provider.id);
    const requestId = generateProviderRequestId();
    const now = new Date();
    const providerTransactionDate = formatEsaleTransactionDate(now);
    const providerRequestTime = Math.floor(now.getTime() / 1000).toString();

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
      metadata: {
        variantSku: orderItem.variant.sku,
        phoneNumber,
        amount,
        telco,
        ...(packageCode ? { packageCode } : {}),
      },
    });

    await this.providerRepository.createProviderLog({
      providerId: selection.provider.id,
      orderId,
      requestId,
      action: ProviderTransactionAction.TOPUP,
      status: ProviderTransactionStatus.PROCESSING,
      requestPayload: {
        providerProductCode: selection.mapping.providerProductCode,
        phoneNumber,
        amount,
        attempt,
        ...(packageCode ? { packageCode } : {}),
      },
    });

    const txn = await this.transactionRepository.create({
      orderId,
      providerId: selection.provider.id,
      requestId,
      attempt,
      action: ProviderTransactionAction.TOPUP,
      status: ProviderTransactionStatus.PROCESSING,
      providerTransactionDate,
      providerMetadata: buildTopupProviderMetadata(
        providerRequestTime,
        phoneNumber,
        telco,
      ),
      requestPayload: {
        providerProductCode: selection.mapping.providerProductCode,
        phoneNumber,
        amount,
        variantId: orderItem.variantId,
      },
    });

    let result = await selection.adapter.topup({
      requestId,
      providerProductCode: selection.mapping.providerProductCode,
      phoneNumber,
      amount,
      orderId,
      packageCode,
      providerTransactionDate,
      providerRequestTime,
    });

    if (
      result.status === ProviderTransactionStatus.TIMEOUT ||
      result.status === ProviderTransactionStatus.PENDING
    ) {
      result = await this.recoverFromTimeout(selection.adapter, txn, result);
    }

    return this.applyTopupResult({
      orderId,
      orderItemId: orderItem.id,
      phoneNumber,
      amount,
      telco,
      providerId: selection.provider.id,
      txnId: txn.id,
      requestId,
      result,
    });
  }

  private async tryRecoverPersistedTransaction(params: {
    orderId: string;
    orderItemId: string;
    phoneNumber: string;
    amount: number;
    telco: string;
    providerId: string;
    adapter: ProviderInterface;
    txn: ProviderTransactionRecord;
    isRetry: boolean;
  }): Promise<FulfillmentResult | null> {
    const checkContext = this.buildCheckContext(params.txn);
    if (!checkContext) {
      return null;
    }

    this.logger.warn(
      `Recovering topup transaction requestId=${params.txn.requestId} status=${params.txn.status}${params.isRetry ? ' on admin retry' : ''} — checkTransaction only`,
    );

    let recovered = await params.adapter.checkTransaction(
      params.txn.requestId,
      checkContext,
    );

    if (
      recovered.status === ProviderTransactionStatus.TIMEOUT ||
      recovered.status === ProviderTransactionStatus.PENDING
    ) {
      recovered = await this.recoverFromTimeout(
        params.adapter,
        params.txn,
        recovered,
      );
    }

    if (recovered.success && recovered.status === ProviderTransactionStatus.SUCCESS) {
      return this.applyTopupResult({
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        phoneNumber: params.phoneNumber,
        amount: params.amount,
        telco: params.telco,
        providerId: params.providerId,
        txnId: params.txn.id,
        requestId: params.txn.requestId,
        result: recovered,
      });
    }

    return null;
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
      kind: 'TOPUP',
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
      return { orderId, fulfillmentStatus: FulfillmentStatus.COMPLETED };
    }

    const existingTopup =
      await this.topupTransactionRepository.findByOrderItemId(orderItemId);
    if (existingTopup?.status === TopupTransactionStatus.SUCCESS) {
      return { orderId, fulfillmentStatus: FulfillmentStatus.COMPLETED };
    }

    if (refreshed.fulfillmentStatus === FulfillmentStatus.PROCESSING) {
      throw new ConflictException('Topup fulfillment already in progress');
    }

    throw new ConflictException(`Order ${orderId} cannot be claimed for topup fulfillment`);
  }

  private async recoverFromTimeout(
    adapter: ProviderInterface,
    txn: ProviderTransactionRecord,
    timeoutResult: ProviderResult,
  ): Promise<ProviderResult> {
    const checkContext = this.buildCheckContext(txn);
    this.logger.warn(
      `Topup timeout for request_id=${txn.requestId} — calling checkTransaction`,
    );

    const recovered = await adapter.checkTransaction(txn.requestId, checkContext);
    if (recovered.success && recovered.status === ProviderTransactionStatus.SUCCESS) {
      return recovered;
    }

    return {
      ...timeoutResult,
      status: ProviderTransactionStatus.TIMEOUT,
      failureCode: timeoutResult.failureCode ?? 'TIMEOUT',
    };
  }

  private async applyTopupResult(params: {
    orderId: string;
    orderItemId: string;
    phoneNumber: string;
    amount: number;
    telco: string;
    providerId: string;
    txnId: string;
    requestId: string;
    result: ProviderResult;
  }): Promise<FulfillmentResult> {
    const {
      orderId,
      orderItemId,
      phoneNumber,
      amount,
      telco,
      providerId,
      txnId,
      requestId,
      result,
    } = params;

    await this.transactionRepository.updateResult(txnId, {
      status: result.status,
      providerTransactionId: result.providerTransactionId,
      providerReference: result.providerReference ?? requestId,
      responsePayload: (result.rawResponse ?? {}) as Prisma.InputJsonValue,
    });

    await this.providerRepository.createProviderLog({
      providerId,
      orderId,
      requestId,
      action: ProviderTransactionAction.TOPUP,
      status: result.status,
      responsePayload: (result.rawResponse ?? {}) as Prisma.InputJsonValue,
      errorMessage: result.message,
    });

    if (result.success && result.status === ProviderTransactionStatus.SUCCESS) {
      await this.prisma.$transaction(async (tx) => {
        await this.topupTransactionRepository.upsertSuccess(
          {
            orderId,
            orderItemId,
            phoneNumber,
            telco,
            amount,
            providerReference:
              result.providerTransactionId ?? result.providerReference ?? requestId,
            resultMessage: result.message ?? null,
          },
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
          phoneNumber,
          telco,
          amount,
          providerTransactionId: result.providerTransactionId,
        },
      });

      await this.notificationService.notifyTopupDelivery(orderId);

      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        providerTransactionId: result.providerTransactionId,
      };
    }

    const failureStatus = resolveFulfillmentStatusForFailure(result.failureCode);

    await this.topupTransactionRepository.upsertFailed(
      {
        orderId,
        orderItemId,
        phoneNumber,
        telco,
        amount,
        providerReference: result.providerTransactionId ?? requestId,
        resultMessage: result.message ?? result.failureCode ?? 'FAILED',
      },
      failureStatus === FulfillmentStatus.WAITING_ADMIN_RETRY
        ? TopupTransactionStatus.PENDING
        : TopupTransactionStatus.FAILED,
    );

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
    };
  }

  private async nextAttempt(orderId: string, providerId: string): Promise<number> {
    const agg = await this.transactionRepository.findMaxAttempt(orderId, providerId);
    return (agg._max.attempt ?? 0) + 1;
  }
}
