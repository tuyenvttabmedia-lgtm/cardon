import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderEventType } from '@prisma/client';
import { AGENT_LOW_BALANCE_THRESHOLD, CUSTOMER_NOTIFICATION_TYPE, EMAIL_TEMPLATE, NOTIFICATION_CHANNEL, SYSTEM_NOTIFICATION_TYPE } from '../entities/notification.constants';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationQueueProducer } from './notification-queue.producer';
import { OrderEventService } from '../../order/services/order-event.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly producer: NotificationQueueProducer,
    private readonly repository: NotificationRepository,
    private readonly configService: ConfigService,
    private readonly orderEvents: OrderEventService,
  ) {}

  notifyUserRegister(email: string, verifyToken: string, fullName?: string) {
    const baseUrl = this.configService.get<string>('appPublicUrl') ?? 'https://cardon.vn';
    return this.producer.enqueueUserRegister(
      email,
      `${baseUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`,
      fullName,
    );
  }

  notifyAgentRegister(email: string, verifyUrl: string, fullName?: string) {
    return this.producer.enqueueUserRegister(email, verifyUrl, fullName);
  }

  notifyPasswordReset(email: string, resetToken: string) {
    const baseUrl = this.configService.get<string>('appPublicUrl') ?? 'https://cardon.vn';
    return this.producer.enqueuePasswordReset(
      email,
      `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`,
    );
  }

  async notifyPaymentSuccess(orderId: string) {
    const order = await this.repository.findOrderForEmail(orderId);
    if (!order) {
      return;
    }
    const email = this.resolveOrderEmail(order);
    if (!email) {
      return;
    }

    await this.producer.enqueuePaymentSuccess(orderId, email, {
      orderCode: order.orderCode,
      amount: order.totalAmount.toFixed(2),
    });
    await this.producer.enqueueOrderSuccess(orderId, email, {
      orderCode: order.orderCode,
      totalAmount: order.totalAmount.toFixed(2),
    });

    if (order.user?.id) {
      await this.notifyCustomerPaymentSuccess(order.user.id, orderId, order.orderCode);
    }

    await this.orderEvents.record(
      orderId,
      OrderEventType.PAYMENT_SUCCESS,
      'Thanh toán thành công',
      { orderCode: order.orderCode, amount: order.totalAmount.toFixed(2) },
    );
  }

  async notifyCardDelivery(orderId: string) {
    const order = await this.repository.findOrderForEmail(orderId);
    if (!order) {
      return;
    }
    const email = this.resolveOrderEmail(order);
    if (!email) {
      return;
    }
    await this.producer.enqueueCardDelivery(orderId, email);
    if (order.user?.id) {
      await this.notifyCustomerCardDelivered(order.user.id, orderId, order.orderCode);
      await this.notifyCustomerOrderDelivered(order.user.id, orderId, order.orderCode);
    }
    await this.orderEvents.record(
      orderId,
      OrderEventType.EMAIL_SENT,
      'Email giao thẻ đã được gửi',
      { email },
    );
    await this.orderEvents.record(
      orderId,
      OrderEventType.ORDER_DELIVERED,
      'Đơn hàng đã hoàn thành',
      { orderCode: order.orderCode },
    );
  }

  async resendCardDeliveryEmail(orderId: string) {
    await this.notifyCardDelivery(orderId);
  }

  async notifyTopupDelivery(orderId: string) {
    const order = await this.repository.findOrderForEmail(orderId);
    if (!order) {
      return;
    }
    const email = this.resolveOrderEmail(order);
    const isData = order.orderItems.some((item) => item.variant?.type === 'DATA');
    if (email) {
      await this.producer.enqueueTopupDelivery(orderId, email, isData);
    }
    if (order.user?.id) {
      await this.notifyCustomerInApp({
        userId: order.user.id,
        type: CUSTOMER_NOTIFICATION_TYPE.TOPUP_DELIVERED,
        title: isData ? 'Nạp data thành công' : 'Nạp cước thành công',
        body: `Đơn ${order.orderCode} đã hoàn tất.`,
        metadata: { orderId, orderCode: order.orderCode },
        jobId: `user-topup-delivered-${orderId}`,
      });
      await this.notifyCustomerOrderDelivered(order.user.id, orderId, order.orderCode);
    }
    await this.orderEvents.record(
      orderId,
      isData ? OrderEventType.DATA_SUCCESS : OrderEventType.TOPUP_SUCCESS,
      isData ? 'Nhà mạng xác nhận nạp data' : 'Nhà mạng xác nhận nạp cước',
      { orderCode: order.orderCode },
    );
    await this.orderEvents.record(
      orderId,
      OrderEventType.ORDER_DELIVERED,
      'Đơn hàng đã hoàn thành',
      { orderCode: order.orderCode },
    );
  }

  async notifyAgentApproved(agentId: string) {
    const agent = await this.repository.findAgentForEmail(agentId);
    if (!agent?.user?.email) {
      return;
    }
    const partnerUrl =
      this.configService.get<string>('partnerPublicUrl') ??
      process.env.PARTNER_PUBLIC_URL ??
      'http://partner.localhost';
    await this.producer.enqueueAgentApproved(agentId, agent.user.email, {
      companyName: agent.companyName,
      partnerLoginUrl: `${partnerUrl.replace(/\/$/, '')}/login`,
    });
  }

  async notifyAgentKycRejected(agentId: string, reason?: string) {
    const agent = await this.repository.findAgentForEmail(agentId);
    if (!agent?.user?.email) return;
    const partnerUrl =
      this.configService.get<string>('partnerPublicUrl') ??
      process.env.PARTNER_PUBLIC_URL ??
      'http://partner.localhost';
    await this.producer.enqueueAgentKycRejected(agentId, agent.user.email, {
      companyName: agent.companyName,
      reason: reason ?? '',
      kycUrl: `${partnerUrl.replace(/\/$/, '')}/account/kyc`,
    });
  }

  async notifyAgentKycNeedMoreInfo(agentId: string, reason: string, fields?: string[]) {
    const agent = await this.repository.findAgentForEmail(agentId);
    if (!agent?.user?.email) return;
    const partnerUrl =
      this.configService.get<string>('partnerPublicUrl') ??
      process.env.PARTNER_PUBLIC_URL ??
      'http://partner.localhost';
    await this.producer.enqueueAgentKycNeedMoreInfo(agentId, agent.user.email, {
      companyName: agent.companyName,
      reason,
      fields: (fields ?? []).join(', '),
      kycUrl: `${partnerUrl.replace(/\/$/, '')}/account/kyc`,
    });
  }

  async notifyAgentLowBalance(agentId: string, availableBalance: string) {
    const agent = await this.repository.findAgentForEmail(agentId);
    if (!agent?.user?.email) {
      return;
    }
    const threshold =
      this.configService.get<number>('agent.lowBalanceThreshold') ??
      AGENT_LOW_BALANCE_THRESHOLD;

    await this.producer.enqueueAgentLowBalance(agentId, agent.user.email, {
      companyName: agent.companyName,
      availableBalance,
      threshold: threshold.toFixed(2),
    });
  }

  async notifyAgentApiDisabled(agentId: string) {
    const agent = await this.repository.findAgentForEmail(agentId);
    await this.producer.enqueueSystemAdminAlert({
      systemType: 'AGENT_API_DISABLED',
      title: `Agent API disabled: ${agent?.companyName ?? agentId}`,
      body: `Agent ${agent?.companyName ?? agentId} API access has been disabled.`,
      metadata: { agentId },
      jobId: `system-agent-api-disabled-${agentId}`,
    });
    if (agent?.user?.email) {
      await this.producer.enqueueAgentApiDisabled(agentId, agent.user.email, {
        companyName: agent.companyName,
      });
    }
  }

  async notifyProviderLowBalance(
    providerId: string,
    providerCode: string,
    providerName: string,
    balance: number,
    threshold: number,
    channels: { admin?: boolean; telegram?: boolean; email?: boolean } = {
      admin: true,
      telegram: false,
      email: true,
    },
  ) {
    const time = new Date().toISOString();
    const metadata = { providerId, providerCode, providerName, balance, threshold, time };
    const title = `Low balance: ${providerCode}`;
    const body = `Provider: ${providerName}\nCurrent balance: ${balance}\nThreshold: ${threshold}\nTime: ${time}`;
    const jobBase = `operation-low-${providerId}-${Date.now()}`;

    if (channels.admin !== false) {
      await this.producer.enqueueSystemAdminAlert({
        systemType: SYSTEM_NOTIFICATION_TYPE.LOW_BALANCE,
        title,
        body,
        metadata,
        jobId: `${jobBase}-admin`,
      });
    }

    if (channels.telegram) {
      await this.producer.enqueue(
        {
          channel: NOTIFICATION_CHANNEL.TELEGRAM,
          title,
          body: `<b>LOW_BALANCE</b>\n${body.replace(/\n/g, '\n')}`,
          payload: metadata,
        },
        `${jobBase}-telegram`,
      );
    }

    if (channels.email !== false) {
      const adminEmail = this.configService.get<string>('notification.adminAlertEmail');
      if (adminEmail) {
        await this.producer.enqueue(
          {
            channel: NOTIFICATION_CHANNEL.EMAIL,
            template: EMAIL_TEMPLATE.PROVIDER_LOW_BALANCE,
            recipientEmail: adminEmail,
            payload: {
              providerId,
              providerCode,
              providerName,
              balance: balance.toFixed(2),
              threshold: threshold.toFixed(2),
            },
          },
          `${jobBase}-email`,
        );
      }
    }
  }

  async notifyProviderError(
    providerId: string,
    providerCode: string,
    providerName: string,
    errorMessage: string,
    channels: { admin?: boolean; telegram?: boolean; email?: boolean } = {
      admin: true,
      telegram: false,
      email: false,
    },
  ) {
    const time = new Date().toISOString();
    const metadata = { providerId, providerCode, providerName, errorMessage, time };
    const title = `Provider error: ${providerCode}`;
    const body = `Provider: ${providerName}\nError: ${errorMessage}\nTime: ${time}`;
    const jobBase = `operation-error-${providerId}-${Date.now()}`;

    if (channels.admin !== false) {
      await this.producer.enqueueSystemAdminAlert({
        systemType: SYSTEM_NOTIFICATION_TYPE.PROVIDER_ERROR,
        title,
        body,
        metadata,
        jobId: `${jobBase}-admin`,
      });
    }

    if (channels.telegram) {
      await this.producer.enqueue(
        {
          channel: NOTIFICATION_CHANNEL.TELEGRAM,
          title,
          body: `<b>PROVIDER_ERROR</b>\n${body.replace(/\n/g, '\n')}`,
          payload: metadata,
        },
        `${jobBase}-telegram`,
      );
    }
  }

  async notifyAdminRetryRequired(orderId: string) {
    const order = await this.repository.findOrderForEmail(orderId);
    const time = new Date().toISOString();
    const orderCode = order?.orderCode ?? orderId;
    const title = `Manual review order: ${orderCode}`;
    const body = `Order ${orderCode} requires admin fulfillment retry.\nTime: ${time}`;
    const metadata = { orderId, orderCode, time };
    const jobBase = `operation-manual-${orderId}-${Date.now()}`;

    await this.producer.enqueueSystemAdminAlert({
      systemType: SYSTEM_NOTIFICATION_TYPE.MANUAL_REVIEW_ORDER,
      title,
      body,
      metadata,
      jobId: `${jobBase}-admin`,
    });

    await this.producer.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.TELEGRAM,
        title,
        body: `<b>MANUAL_REVIEW_ORDER</b>\n${body.replace(/\n/g, '\n')}`,
        payload: metadata,
      },
      `${jobBase}-telegram`,
    );

    return this.producer.enqueueSystemAdminAlert({
      systemType: SYSTEM_NOTIFICATION_TYPE.ADMIN_RETRY_REQUIRED,
      title: `Fulfillment retry required: ${orderCode}`,
      body: `Order ${orderCode} requires admin fulfillment retry.`,
      metadata: { orderId, orderCode },
      jobId: `system-admin-retry-${orderId}`,
    });
  }

  notifyManualPaymentReview(paymentId: string, orderId: string, orderCode?: string) {
    return this.producer.enqueueSystemAdminAlert({
      systemType: 'MANUAL_PAYMENT_REVIEW',
      title: `Manual payment review: ${orderCode ?? orderId}`,
      body: `Payment ${paymentId} requires manual review for order ${orderCode ?? orderId}.`,
      metadata: { paymentId, orderId, orderCode },
      jobId: `system-manual-review-${paymentId}`,
    });
  }

  notifyContactForm(adminEmail: string, payload: Record<string, unknown>) {
    return this.producer.enqueueContactFormAdmin(adminEmail, payload);
  }

  notifyAdminNewContact(payload: { id: string; name: string; subject: string }) {
    return this.producer.enqueueSystemStaffAlert({
      systemType: SYSTEM_NOTIFICATION_TYPE.NEW_CONTACT,
      title: `Liên hệ mới: ${payload.subject}`,
      body: `${payload.name} đã gửi tin liên hệ.`,
      metadata: payload,
      jobId: `system-new-contact-${payload.id}`,
    });
  }

  notifyAdminNewTicket(payload: {
    ticketId: string;
    ticketCode: string;
    subject: string;
    customerId: string;
  }) {
    return this.producer.enqueueSystemStaffAlert({
      systemType: SYSTEM_NOTIFICATION_TYPE.NEW_SUPPORT_TICKET,
      title: `Ticket mới: ${payload.ticketCode}`,
      body: payload.subject,
      metadata: payload,
      jobId: `system-new-ticket-${payload.ticketId}`,
    });
  }

  notifyCustomerInApp(params: {
    userId: string;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    jobId: string;
  }) {
    return this.producer.enqueueUserInApp(params);
  }

  notifyCustomerPaymentSuccess(userId: string, orderId: string, orderCode: string) {
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.PAYMENT_SUCCESS,
      title: 'Thanh toán thành công',
      body: `Đơn hàng ${orderCode} đã được thanh toán.`,
      metadata: { orderId, orderCode },
      jobId: `user-payment-success-${orderId}`,
    });
  }

  notifyCustomerCardDelivered(userId: string, orderId: string, orderCode: string) {
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.CARD_DELIVERED,
      title: 'Thẻ đã được giao',
      body: `Mã thẻ cho đơn ${orderCode} đã sẵn sàng.`,
      metadata: { orderId, orderCode },
      jobId: `user-card-delivered-${orderId}`,
    });
  }

  notifyCustomerOrderDelivered(userId: string, orderId: string, orderCode: string) {
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.ORDER_DELIVERED,
      title: 'Đơn hàng hoàn thành',
      body: `Đơn ${orderCode} đã hoàn tất.`,
      metadata: { orderId, orderCode },
      jobId: `user-order-delivered-${orderId}`,
    });
  }

  maybeNotifyOrderNeedSupport(userId: string, orderId: string, customerStatus: string) {
    if (customerStatus !== 'NEED_SUPPORT') {
      return Promise.resolve();
    }
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.ORDER_NEED_SUPPORT,
      title: 'Đơn hàng cần hỗ trợ',
      body: 'Đơn hàng của bạn cần được hỗ trợ. Vui lòng liên hệ bộ phận CSKH.',
      metadata: { orderId },
      jobId: `user-order-need-support-${orderId}`,
    });
  }

  notifyCustomerSupportReply(params: {
    userId: string;
    ticketId: string;
    ticketCode: string;
    subject: string;
  }) {
    return this.notifyCustomerInApp({
      userId: params.userId,
      type: CUSTOMER_NOTIFICATION_TYPE.SUPPORT_REPLY,
      title: `Phản hồi hỗ trợ: ${params.ticketCode}`,
      body: `Chúng tôi đã trả lời ticket "${params.subject}".`,
      metadata: {
        ticketId: params.ticketId,
        ticketCode: params.ticketCode,
      },
      jobId: `user-support-reply-${params.ticketId}-${Date.now()}`,
    });
  }

  notifyAgentDepositCredited(
    userId: string,
    depositId: string,
    amount: string,
    paymentReference: string,
  ) {
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.AGENT_DEPOSIT_CREDITED,
      title: 'Có tiền vào ví',
      body: `Đã cộng ${amount} VND vào ví. Mã giao dịch: ${paymentReference}`,
      metadata: { depositId, paymentReference, amount },
      jobId: `agent-deposit-credited-${depositId}`,
    });
  }

  notifyAgentDepositFailed(
    userId: string,
    depositId: string,
    paymentReference: string,
    reason: string,
  ) {
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.AGENT_DEPOSIT_FAILED,
      title: 'Thanh toán thất bại',
      body: `Giao dịch ${paymentReference} thất bại: ${reason}`,
      metadata: { depositId, paymentReference, reason },
      jobId: `agent-deposit-failed-${depositId}`,
    });
  }

  notifyAgentDepositExpired(userId: string, depositId: string, paymentReference: string) {
    return this.notifyCustomerInApp({
      userId,
      type: CUSTOMER_NOTIFICATION_TYPE.AGENT_DEPOSIT_EXPIRED,
      title: 'Giao dịch hết hạn',
      body: `Giao dịch nạp tiền ${paymentReference} đã hết hạn.`,
      metadata: { depositId, paymentReference },
      jobId: `agent-deposit-expired-${depositId}`,
    });
  }

  listUserNotifications(userId: string, take = 100) {
    return this.repository.listForUser(userId, take);
  }

  countUnreadUserNotifications(userId: string) {
    return this.repository.countUnreadForUser(userId);
  }

  markUserNotificationRead(notificationId: string, userId: string) {
    return this.repository.markReadForUser(notificationId, userId);
  }

  markAllUserNotificationsRead(userId: string) {
    return this.repository.markAllReadForUser(userId);
  }

  deleteUserNotification(notificationId: string, userId: string) {
    return this.repository.deleteForUser(notificationId, userId).then((r) => ({
      deleted: r.count,
    }));
  }

  private resolveOrderEmail(order: {
    guestEmail: string | null;
    user?: { email: string } | null;
  }): string | null {
    return order.user?.email ?? order.guestEmail;
  }
}
