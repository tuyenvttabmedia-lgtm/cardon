import { Injectable, Logger } from '@nestjs/common';
import { ProductVariantType } from '@prisma/client';
import { ProviderOrderRepository } from '../repositories/provider.repository';
import { ProviderQueueProducer } from './provider-queue.producer';
import { ProviderService } from './provider.service';
import { TopupQueueProducer } from './topup-queue.producer';
import { TopupService } from './topup.service';

export interface FulfillmentRetryOptions {
  skipProviderIds?: string[];
  forceProviderId?: string;
}

@Injectable()
export class FulfillmentDispatchService {
  private readonly logger = new Logger(FulfillmentDispatchService.name);

  constructor(
    private readonly orderRepository: ProviderOrderRepository,
    private readonly providerQueueProducer: ProviderQueueProducer,
    private readonly topupQueueProducer: TopupQueueProducer,
    private readonly providerService: ProviderService,
    private readonly topupService: TopupService,
  ) {}

  async dispatchOrderFulfillment(
    orderId: string,
    triggeredBy: 'webhook' | 'manual' | 'agent' = 'webhook',
  ): Promise<string[]> {
    const order = await this.orderRepository.findOrderForFulfillment(orderId);
    if (!order) {
      this.logger.warn(`dispatchOrderFulfillment: order ${orderId} not found`);
      return [];
    }

    const hasCard = order.orderItems.some(
      (item) => item.variant.type === ProductVariantType.CARD,
    );
    const hasTopup = order.orderItems.some((item) =>
      this.isTopupVariant(item.variant.type),
    );

    const jobIds: string[] = [];

    if (hasTopup) {
      jobIds.push(await this.topupQueueProducer.enqueueFulfillment(orderId, triggeredBy));
    }
    if (hasCard) {
      jobIds.push(
        await this.providerQueueProducer.enqueueFulfillment(orderId, triggeredBy),
      );
    }

    if (!hasTopup && !hasCard) {
      this.logger.warn(`Order ${orderId} has no fulfillable CARD/TOPUP items`);
    }

    return jobIds;
  }

  async retryOrderFulfillment(orderId: string, options?: FulfillmentRetryOptions) {
    const order = await this.orderRepository.findOrderForFulfillment(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const hasTopup = order.orderItems.some((item) =>
      this.isTopupVariant(item.variant.type),
    );

    if (hasTopup) {
      return this.topupService.retryFulfillment(orderId);
    }

    if (options?.skipProviderIds?.length || options?.forceProviderId) {
      return this.providerService.retryFulfillmentWithOptions(orderId, options);
    }

    return this.providerService.retryFulfillment(orderId);
  }

  private isTopupVariant(type: ProductVariantType): boolean {
    return type === ProductVariantType.TOPUP || type === ProductVariantType.DATA;
  }
}
