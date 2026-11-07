import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { EsimQueueProducer } from '../../esim/esim-queue.producer';
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
    @Optional() private readonly esimQueue?: EsimQueueProducer,
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

    const { hasEsim, hasCard, hasTopup } = this.classifyOrderItems(order.orderItems);
    this.assertNotMixedEsim(hasEsim, hasCard, hasTopup);

    if (hasEsim && !hasCard && !hasTopup) {
      if (!this.esimQueue) {
        this.logger.warn(`Order ${orderId} is eSIM-only and esim queue is not registered`);
        return [];
      }
      return [await this.esimQueue.enqueueFulfillment(orderId)];
    }

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

    const { hasEsim, hasCard, hasTopup } = this.classifyOrderItems(order.orderItems);
    this.assertNotMixedEsim(hasEsim, hasCard, hasTopup);

    if (hasEsim && !hasCard && !hasTopup) {
      throw new Error('eSIM orders are not retried through the card provider');
    }

    if (hasTopup) {
      return this.topupService.retryFulfillment(orderId);
    }

    if (options?.skipProviderIds?.length || options?.forceProviderId) {
      return this.providerService.retryFulfillmentWithOptions(orderId, options);
    }

    return this.providerService.retryFulfillment(orderId);
  }

  private classifyOrderItems(
    orderItems: Array<{ variant: { type: ProductVariantType } }>,
  ) {
    return {
      hasEsim: orderItems.some((item) => item.variant.type === ProductVariantType.ESIM),
      hasCard: orderItems.some((item) => item.variant.type === ProductVariantType.CARD),
      hasTopup: orderItems.some((item) => this.isTopupVariant(item.variant.type)),
    };
  }

  private assertNotMixedEsim(hasEsim: boolean, hasCard: boolean, hasTopup: boolean) {
    if (hasEsim && (hasCard || hasTopup)) {
      throw new BadRequestException('eSIM orders cannot include other product types');
    }
  }

  private isTopupVariant(type: ProductVariantType): boolean {
    return type === ProductVariantType.TOPUP || type === ProductVariantType.DATA;
  }
}
