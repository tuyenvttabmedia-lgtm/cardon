import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  OrderEventType,
  ProductVariantType,
} from '@prisma/client';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { mapOrder } from '../entities/order.mapper';
import { buildOrderTimeline } from '../entities/order-timeline.builder';
import { OrderEventService } from './order-event.service';
import { OrderRepository } from '../repositories/order.repository';

export interface CardSummaryView {
  id: string;
  productName: string;
  serial: string;
  serialMasked: boolean;
  pinMasked: string;
  pinRevealed: boolean;
  pinViewCount: number;
  pinFirstViewedAt: string | null;
}

function maskPin(): string {
  return '************';
}

@Injectable()
export class OrderDeliveryService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderEvents: OrderEventService,
    private readonly cardEncryption: CardEncryptionService,
    private readonly notificationService: NotificationService,
  ) {}

  async getCustomerDelivery(orderId: string, userId: string) {
    const order = await this.orderRepository.findByIdForUserWithDelivery(orderId, userId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.buildDeliveryResponse(order);
  }

  async lookupGuestDelivery(orderCode: string, email: string) {
    const order = await this.orderRepository.findByCodeForGuestWithDelivery(
      orderCode,
      email.trim(),
    );
    if (!order) {
      throw new NotFoundException(
        'Không tìm thấy đơn hàng. Kiểm tra lại mã đơn và email đã dùng khi mua.',
      );
    }
    return this.buildDeliveryResponse(order);
  }

  async revealGuestDeliveryById(orderId: string, email: string) {
    const order = await this.orderRepository.findByIdForGuestWithDelivery(orderId, email);
    if (!order) {
      throw new NotFoundException(
        'Không tìm thấy đơn hàng. Kiểm tra lại mã đơn và email đã dùng khi mua.',
      );
    }
    return this.buildDeliveryResponse(order);
  }

  async revealPin(
    orderId: string,
    cardId: string,
    user?: AuthenticatedUser,
    guestEmail?: string,
  ) {
    if (!user && !guestEmail?.trim()) {
      throw new BadRequestException('email is required for guest PIN reveal');
    }

    const order = user
      ? await this.orderRepository.findByIdForUserWithDelivery(orderId, user.id)
      : await this.orderRepository.findByIdForGuestWithDelivery(orderId, guestEmail?.trim() ?? '');

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.paymentStatus !== OrderPaymentStatus.PAID ||
      order.fulfillmentStatus !== FulfillmentStatus.COMPLETED
    ) {
      throw new ForbiddenException('Cards are not available for this order yet');
    }

    let targetCard: {
      id: string;
      encryptedPin: string;
      pinViewCount: number;
      pinFirstViewedAt: Date | null;
    } | null = null;

    for (const item of order.orderItems) {
      for (const card of item.cardRecords) {
        if (card.id === cardId) {
          targetCard = card;
          break;
        }
      }
    }

    if (!targetCard) {
      throw new NotFoundException('Card not found');
    }

    const now = new Date();
    const isFirstView = targetCard.pinViewCount === 0;

    await this.orderRepository.incrementCardPinView(cardId, isFirstView, now);

    await this.orderEvents.record(
      order.id,
      OrderEventType.PIN_VIEWED,
      'Khách hàng đã xem mã PIN',
      { cardId, firstView: isFirstView },
    );

    return {
      cardId,
      pin: this.cardEncryption.decrypt(targetCard.encryptedPin),
      pinViewCount: targetCard.pinViewCount + 1,
      pinFirstViewedAt: (targetCard.pinFirstViewedAt ?? now).toISOString(),
    };
  }

  private async buildDeliveryResponse(order: {
    id: string;
    orderCode: string;
    paymentStatus: OrderPaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    guestEmail: string | null;
    userId: string | null;
    orderItems: Array<{
      variant: { name: string; type: ProductVariantType } | null;
      cardRecords: Array<{
        id: string;
        encryptedSerial: string;
        encryptedPin: string;
        pinViewCount: number;
        pinFirstViewedAt: Date | null;
      }>;
    }>;
    orderEvents?: Array<{ eventType: OrderEventType; createdAt: Date }>;
  }) {
    const events =
      order.orderEvents ??
      (await this.orderEvents.listByOrderId(order.id));

    const variantTypes = order.orderItems
      .map((item) => item.variant?.type)
      .filter((type): type is ProductVariantType => !!type);

    const timeline = buildOrderTimeline({
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      variantTypes,
      events,
    });

    const orderView = mapOrder(order as unknown as Parameters<typeof mapOrder>[0]);
    const cards = this.buildCardSummaries(order);

    if (order.userId) {
      await this.notificationService.maybeNotifyOrderNeedSupport(
        order.userId,
        order.id,
        orderView.customerStatus,
      );
    }

    return {
      order: orderView,
      timeline,
      delivery: {
        cards,
        hasCards: cards.length > 0,
      },
    };
  }

  private buildCardSummaries(order: {
    paymentStatus: OrderPaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    orderItems: Array<{
      variant: { name: string } | null;
      cardRecords: Array<{
        id: string;
        encryptedSerial: string;
        encryptedPin: string;
        pinViewCount: number;
        pinFirstViewedAt: Date | null;
      }>;
    }>;
  }): CardSummaryView[] {
    if (
      order.paymentStatus !== OrderPaymentStatus.PAID ||
      order.fulfillmentStatus !== FulfillmentStatus.COMPLETED
    ) {
      return [];
    }

    const cards: CardSummaryView[] = [];
    for (const item of order.orderItems) {
      for (const card of item.cardRecords) {
        const serial = this.cardEncryption.decrypt(card.encryptedSerial);
        cards.push({
          id: card.id,
          productName: item.variant?.name ?? 'Thẻ',
          serial,
          serialMasked: false,
          pinMasked: maskPin(),
          pinRevealed: false,
          pinViewCount: card.pinViewCount,
          pinFirstViewedAt: card.pinFirstViewedAt?.toISOString() ?? null,
        });
      }
    }
    return cards;
  }
}
