import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  NotificationRecipientRole,
  NotificationRecipientType,
} from '@prisma/client';
import { Queue } from 'bullmq';
import {
  EMAIL_TEMPLATE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_JOB,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_RETRY_DELAY_MS,
  SYSTEM_NOTIFICATION_TYPE,
} from '../entities/notification.constants';
import { NotificationQueueJobData } from '../entities/notification.types';

@Injectable()
export class NotificationQueueProducer {
  constructor(
    @InjectQueue('notification_queue') private readonly queue: Queue,
  ) {}

  async enqueue(job: NotificationQueueJobData, jobId?: string): Promise<void> {
    await this.queue.add(NOTIFICATION_JOB.SEND, job, {
      jobId: jobId ?? `notify-${job.channel}-${job.template ?? job.systemType}-${Date.now()}`,
      attempts: NOTIFICATION_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: NOTIFICATION_RETRY_DELAY_MS },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  enqueueUserRegister(email: string, verifyUrl: string, fullName?: string) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.USER_REGISTER,
        recipientEmail: email,
        payload: { verifyUrl, fullName: fullName ?? '' },
      },
      `email-user-register-${email}`,
    );
  }

  enqueuePasswordReset(email: string, resetUrl: string) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.PASSWORD_RESET,
        recipientEmail: email,
        payload: { resetUrl },
      },
      `email-password-reset-${email}-${Date.now()}`,
    );
  }

  enqueueOrderSuccess(orderId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.ORDER_SUCCESS,
        recipientEmail: email,
        payload: { orderId, ...payload },
      },
      `email-order-success-${orderId}`,
    );
  }

  enqueuePaymentSuccess(orderId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.PAYMENT_SUCCESS,
        recipientEmail: email,
        payload: { orderId, ...payload },
      },
      `email-payment-success-${orderId}`,
    );
  }

  enqueueCardDelivery(orderId: string, email: string) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.CARD_DELIVERED,
        recipientEmail: email,
        payload: { orderId },
      },
      `email-card-delivery-${orderId}`,
    );
  }

  enqueueTopupDelivery(orderId: string, email: string, isData: boolean) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: isData ? EMAIL_TEMPLATE.DATA_SUCCESS : EMAIL_TEMPLATE.TOPUP_SUCCESS,
        recipientEmail: email,
        payload: { orderId },
      },
      `email-topup-delivery-${orderId}`,
    );
  }

  enqueueAgentApproved(agentId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.AGENT_APPROVED,
        recipientEmail: email,
        payload: { agentId, ...payload },
      },
      `email-agent-approved-${agentId}`,
    );
  }

  enqueueAgentKycRejected(agentId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.AGENT_KYC_REJECTED,
        recipientEmail: email,
        payload: { agentId, ...payload },
      },
      `email-agent-kyc-rejected-${agentId}-${Date.now()}`,
    );
  }

  enqueueAgentKycNeedMoreInfo(agentId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.AGENT_KYC_NEED_MORE_INFO,
        recipientEmail: email,
        payload: { agentId, ...payload },
      },
      `email-agent-kyc-need-info-${agentId}-${Date.now()}`,
    );
  }

  enqueueAgentLowBalance(agentId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.AGENT_LOW_BALANCE,
        recipientEmail: email,
        payload: { agentId, ...payload },
      },
      `email-agent-low-balance-${agentId}`,
    );
  }

  enqueueAgentApiDisabled(agentId: string, email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.AGENT_API_DISABLED,
        recipientEmail: email,
        payload: { agentId, ...payload },
      },
      `email-agent-api-disabled-${agentId}`,
    );
  }

  enqueueProviderLowBalanceAdmin(payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.PROVIDER_LOW_BALANCE,
        payload,
      },
      `email-provider-low-${String(payload.providerId ?? Date.now())}`,
    );
  }

  enqueueContactFormAdmin(email: string, payload: Record<string, unknown>) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.CONTACT_FORM,
        recipientEmail: email,
        payload,
      },
      `email-contact-form-${String(payload.id ?? Date.now())}`,
    );
  }

  enqueueSystemAdminAlert(params: {
    systemType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    jobId: string;
  }) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.SYSTEM,
        systemType: params.systemType,
        recipientType: NotificationRecipientType.ADMIN_ROLE,
        recipientRole: NotificationRecipientRole.ADMIN,
        title: params.title,
        body: params.body,
        payload: params.metadata ?? {},
      },
      params.jobId,
    );
  }

  enqueueSystemStaffAlert(params: {
    systemType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    jobId: string;
  }) {
    const roles = [NotificationRecipientRole.ADMIN, NotificationRecipientRole.SUPPORT];
    return Promise.all(
      roles.map((role) =>
        this.enqueue(
          {
            channel: NOTIFICATION_CHANNEL.SYSTEM,
            systemType: params.systemType,
            recipientType: NotificationRecipientType.ADMIN_ROLE,
            recipientRole: role,
            title: params.title,
            body: params.body,
            payload: params.metadata ?? {},
          },
          `${params.jobId}-${role}`,
        ),
      ),
    );
  }

  enqueueUserInApp(params: {
    userId: string;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    jobId: string;
  }) {
    return this.enqueue(
      {
        channel: NOTIFICATION_CHANNEL.SYSTEM,
        systemType: params.type,
        recipientType: NotificationRecipientType.USER,
        recipientId: params.userId,
        title: params.title,
        body: params.body,
        payload: params.metadata ?? {},
      },
      params.jobId,
    );
  }
}
