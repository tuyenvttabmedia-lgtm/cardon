import {

  BadRequestException,

  Injectable,

  NotFoundException,

  Optional,

} from '@nestjs/common';

import {

  AuditTargetType,

  FulfillmentStatus,

  OrderPaymentStatus,

  ProviderTransactionStatus,

} from '@prisma/client';

import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';

import { NotificationService } from '../../notification/services/notification.service';

import { CardEncryptionService } from '../../provider/services/card-encryption.service';

import { mapAdminOrderListItem } from '../entities/admin-order-list.mapper';

import { mapOrder } from '../../order/entities/order.mapper';

import { AdminOrderQueryDto, OrderManualRecoveryDto } from '../dto/admin.dto';

import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';

import { AdminRepository } from '../repositories/admin.repository';

import { AdminAuditService } from './admin-audit.service';
import { EsimAdminService } from '../../esim/esim-admin.service';
import { RefundRequestService } from './refund-request.service';



const MANUAL_RECOVERY_STATUSES: FulfillmentStatus[] = [

  FulfillmentStatus.NEED_MANUAL_REVIEW,

  FulfillmentStatus.WAITING_ADMIN_RETRY,

  FulfillmentStatus.FAILED,

];



@Injectable()

export class AdminOrderService {

  constructor(

    private readonly repository: AdminRepository,

    private readonly fulfillmentDispatchService: FulfillmentDispatchService,

    private readonly adminAudit: AdminAuditService,

    private readonly notificationService: NotificationService,

    private readonly cardEncryption: CardEncryptionService,

    @Optional() private readonly esimAdmin?: EsimAdminService,
    @Optional() private readonly refundRequests?: RefundRequestService,

  ) {}



  listOrders(query: AdminOrderQueryDto) {
    return this.repository
      .findOrdersAdmin(query)
      .then((orders) => orders.map(mapAdminOrderListItem));
  }

  getOrdersSummary(query: AdminOrderQueryDto) {
    return this.repository.aggregateOrdersAdmin(query);
  }



  async getOrder(orderId: string) {

    const order = await this.repository.findOrderById(orderId);

    if (!order) {

      throw new NotFoundException('Order not found');

    }

    return mapOrder(order, { includeInternalEconomics: true });

  }



  async retryFulfillment(adminId: string, orderId: string) {

    const order = await this.repository.findOrderById(orderId);

    if (!order) {

      throw new NotFoundException('Order not found');

    }



    if (order.paymentStatus !== OrderPaymentStatus.PAID) {

      throw new BadRequestException('Only PAID orders can be retried');

    }



    const allowed: FulfillmentStatus[] = [

      FulfillmentStatus.WAITING_ADMIN_RETRY,

      FulfillmentStatus.NEED_MANUAL_REVIEW,

      // PAID + PENDING: recovery when fulfill never claimed (e.g. all NCC maintenance)

      FulfillmentStatus.PENDING,

    ];



    if (!allowed.includes(order.fulfillmentStatus)) {

      throw new BadRequestException(

        'Only orders with WAITING_ADMIN_RETRY, NEED_MANUAL_REVIEW, or PAID+PENDING can be retried',

      );

    }



    if (this.esimAdmin && (await this.esimAdmin.isEsimOrder(orderId))) {

      const recovery = await this.esimAdmin.recoverInstall(orderId);
      const fulfillmentStatus = recovery.fulfillmentStatus;

      await this.adminAudit.record(

        adminId,

        ADMIN_AUDIT_ACTIONS.ADMIN_PROVIDER_RETRY,

        AuditTargetType.ORDER,

        orderId,

        {
          fulfillmentStatus,
          esimRecovered: true,
          // Contract of this admin path. Not proof a provider GET ran.
          recovery: 'query_only',
          created: recovery.created === true,
          createOpened: recovery.created === true,
          queried: recovery.queried === true,
          hasOpenCreate: recovery.hasOpenCreate === true,
          hasReference: recovery.hasReference === true,
        },

      );

      return { fulfillmentStatus, providerTransactionId: null, cardsDelivered: 0 };

    }



    const result = await this.fulfillmentDispatchService.retryOrderFulfillment(orderId);



    await this.adminAudit.record(

      adminId,

      ADMIN_AUDIT_ACTIONS.ADMIN_PROVIDER_RETRY,

      AuditTargetType.ORDER,

      orderId,

      {

        fulfillmentStatus: result.fulfillmentStatus,

        providerTransactionId: result.providerTransactionId,

        cardsDelivered: result.cardsDelivered,

      },

    );



    return result;

  }



  async manualRecovery(

    adminId: string,

    orderId: string,

    dto: OrderManualRecoveryDto,

  ) {

    const order = await this.repository.findOrderById(orderId);

    if (!order) {

      throw new NotFoundException('Order not found');

    }



    if (dto.action === 'refund') {

      if (!this.refundRequests) {

        throw new BadRequestException('Refund request service is not available');

      }

      return this.refundRequests.createForOrder(adminId, orderId, {

        paymentId: dto.paymentId,

        amount: dto.amount,

        currency: dto.currency,

        reason: dto.note,

        intendedMethod: dto.intendedMethod,

      });

    }



    if (!MANUAL_RECOVERY_STATUSES.includes(order.fulfillmentStatus)) {

      throw new BadRequestException(

        `Order fulfillment status ${order.fulfillmentStatus} is not eligible for manual recovery`,

      );

    }



    switch (dto.action) {

      case 'retry': {

        const result =

          await this.fulfillmentDispatchService.retryOrderFulfillment(orderId);

        await this.adminAudit.record(

          adminId,

          ADMIN_AUDIT_ACTIONS.ADMIN_PROVIDER_RETRY,

          AuditTargetType.ORDER,

          orderId,

          {

            note: dto.note,

            fulfillmentStatus: result.fulfillmentStatus,

            providerTransactionId: result.providerTransactionId,

            cardsDelivered: result.cardsDelivered,

          },

        );

        return result;

      }



      case 'switch_provider': {

        const failedProviderIds = [

          ...new Set(

            order.providerTransactions

              .filter(

                (tx) =>

                  tx.status === ProviderTransactionStatus.FAILED ||

                  tx.status === ProviderTransactionStatus.TIMEOUT,

              )

              .map((tx) => tx.providerId),

          ),

        ];



        const result = await this.fulfillmentDispatchService.retryOrderFulfillment(

          orderId,

          {

            skipProviderIds: dto.providerId ? undefined : failedProviderIds,

            forceProviderId: dto.providerId,

          },

        );



        await this.adminAudit.record(

          adminId,

          ADMIN_AUDIT_ACTIONS.ADMIN_PROVIDER_SWITCH,

          AuditTargetType.ORDER,

          orderId,

          {

            note: dto.note,

            providerId: dto.providerId,

            skippedProviderIds: failedProviderIds,

            fulfillmentStatus: result.fulfillmentStatus,

            providerTransactionId: result.providerTransactionId,

            cardsDelivered: result.cardsDelivered,

          },

        );



        return result;

      }



      case 'mark_fulfilled': {

        const cardCount = await this.repository.countOrderCards(orderId);

        if (cardCount === 0) {

          throw new BadRequestException(

            'Cannot mark fulfilled — no card records on this order',

          );

        }



        await this.repository.updateOrderFulfillmentStatus(

          orderId,

          FulfillmentStatus.COMPLETED,

        );



        await this.adminAudit.record(

          adminId,

          ADMIN_AUDIT_ACTIONS.ADMIN_MARK_FULFILLED,

          AuditTargetType.ORDER,

          orderId,

          { note: dto.note, cardsDelivered: cardCount },

        );



        return {

          orderId,

          fulfillmentStatus: FulfillmentStatus.COMPLETED,

          cardsDelivered: cardCount,

        };

      }



      default:

        throw new BadRequestException(`Unknown recovery action: ${dto.action}`);

    }

  }



  async resendDeliveryEmail(adminId: string, orderId: string) {
    const order = await this.repository.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const cardCount = await this.repository.countOrderCards(orderId);
    if (cardCount < 1 && order.fulfillmentStatus !== FulfillmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Chưa có thẻ trên đơn — chỉ gửi lại email khi đã giao thẻ thành công',
      );
    }

    await this.notificationService.resendCardDeliveryEmail(orderId);

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_ORDER_RESEND_EMAIL,
      AuditTargetType.ORDER,
      orderId,
      { orderCode: order.orderCode, cardCount },
    );

    return { ok: true, orderId };
  }



  async retryDelivery(adminId: string, orderId: string) {

    const order = await this.repository.findOrderById(orderId);

    if (!order) {

      throw new NotFoundException('Order not found');

    }



    const result = await this.fulfillmentDispatchService.retryOrderFulfillment(orderId);



    await this.adminAudit.record(

      adminId,

      ADMIN_AUDIT_ACTIONS.ADMIN_ORDER_RETRY_DELIVERY,

      AuditTargetType.ORDER,

      orderId,

      {

        fulfillmentStatus: result.fulfillmentStatus,

        providerTransactionId: result.providerTransactionId,

        cardsDelivered: result.cardsDelivered,

      },

    );



    return result;

  }



  async copyCardSerial(adminId: string, orderId: string, cardRecordId: string) {

    const card = await this.repository.findCardRecordById(cardRecordId);

    if (!card || card.orderItem.orderId !== orderId) {

      throw new NotFoundException('Card record not found for this order');

    }



    const serial = this.cardEncryption.decrypt(card.encryptedSerial);



    await this.adminAudit.record(

      adminId,

      ADMIN_AUDIT_ACTIONS.ADMIN_ORDER_COPY_SERIAL,

      AuditTargetType.ORDER,

      orderId,

      { cardRecordId },

    );



    return { cardRecordId, serial };

  }

  async closeEsimQueryClaim(
    adminId: string,
    input: {
      orderId: string;
      queryAttemptId: string;
      createAttemptId: string;
      reason: string;
    },
  ) {
    if (adminId.trim() === '') {
      throw new BadRequestException('Admin is required');
    }
    if (input.reason.trim() === '') {
      throw new BadRequestException('A reason is required');
    }
    if (!this.esimAdmin) {
      throw new BadRequestException('eSIM admin is unavailable');
    }
    return this.esimAdmin.closeSentQueryClaim({
      adminId: adminId.trim(),
      orderId: input.orderId,
      queryAttemptId: input.queryAttemptId,
      createAttemptId: input.createAttemptId,
      reason: input.reason.trim(),
    });
  }

}


