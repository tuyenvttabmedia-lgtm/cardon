import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationRecipientRole,
  NotificationRecipientType,
  Prisma,
} from '@prisma/client';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { TelegramNotificationService } from '../providers/telegram-notification.service';
import {
  EMAIL_TEMPLATE,
  NOTIFICATION_CHANNEL,
} from '../entities/notification.constants';
import {
  containsSensitiveContent,
  safeEmailLogMeta,
  sanitizeNotificationLogContext,
} from '../entities/notification-log-safety';
import { NotificationQueueJobData } from '../entities/notification.types';
import { EmailProviderInterface } from '../providers/email-provider.interface';
import { MockEmailProvider } from '../providers/mock-email.provider';
import { SmtpEmailProvider } from '../providers/smtp-email.provider';
import { NotificationRepository } from '../repositories/notification.repository';
import { renderEmailTemplate } from '../templates/template.registry';
import { formatCardDeliveryEmailBlocks } from '../templates/card-delivery-email.format';
import { EmailTemplateService } from '../../email-template/services/email-template.service';

const DB_TEMPLATE_ALIASES: Record<string, string> = {
  CARD_DELIVERY: 'CARD_DELIVERED',
};

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly repository: NotificationRepository,
    private readonly cardEncryption: CardEncryptionService,
    private readonly smtpProvider: SmtpEmailProvider,
    private readonly mockProvider: MockEmailProvider,
    private readonly configService: ConfigService,
    private readonly settingsStore: SettingsStoreService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly telegramService: TelegramNotificationService,
  ) {}

  async dispatch(job: NotificationQueueJobData): Promise<void> {
    if (job.channel === NOTIFICATION_CHANNEL.SYSTEM) {
      await this.dispatchSystem(job);
      return;
    }

    if (job.channel === NOTIFICATION_CHANNEL.TELEGRAM) {
      await this.dispatchTelegram(job);
      return;
    }

    if (job.channel === NOTIFICATION_CHANNEL.WEBHOOK) {
      this.logger.log('WEBHOOK channel not implemented — skipped');
      return;
    }

    await this.dispatchEmail(job);
  }

  private async dispatchSystem(job: NotificationQueueJobData): Promise<void> {
    await this.repository.createSystemNotification({
      recipientType: job.recipientType ?? NotificationRecipientType.ADMIN_ROLE,
      recipientId: job.recipientId,
      recipientRole: job.recipientRole ?? NotificationRecipientRole.ADMIN,
      type: job.systemType ?? 'SYSTEM',
      title: job.title ?? 'Notification',
      body: job.body ?? '',
      metadata: job.payload as Prisma.InputJsonValue,
    });
  }

  private async dispatchTelegram(job: NotificationQueueJobData): Promise<void> {
    const config = this.settingsStore.resolveTelegramConfig();
    if (!config?.botTokenEnc || !config.chatId) {
      this.logger.log('Telegram not configured — skipped');
      return;
    }
    const text = String(job.body ?? job.title ?? 'CardOn alert');
    await this.telegramService.sendMessage(config.botTokenEnc, config.chatId, text);
  }

  private async dispatchEmail(job: NotificationQueueJobData): Promise<void> {
    if (!job.template || !job.recipientEmail) {
      throw new Error('Email job requires template and recipientEmail');
    }

    // Worker/API are separate processes — reload DB settings so SMTP updates apply without restart.
    await this.settingsStore.reload();
    this.smtpProvider.clearTransporterCache();

    const payload = await this.buildEmailPayload(job.template, job.payload);
    const rendered =
      (await this.renderFromDatabase(job.template, payload)) ??
      renderEmailTemplate(job.template as never, payload);

    if (containsSensitiveContent(rendered.text)) {
      this.logger.log(
        sanitizeNotificationLogContext(
          safeEmailLogMeta({
            to: job.recipientEmail,
            template: job.template,
            subject: rendered.subject,
          }),
        ),
      );
    } else {
      this.logger.log(
        safeEmailLogMeta({
          to: job.recipientEmail,
          template: job.template,
          subject: rendered.subject,
        }),
      );
    }

    const provider = this.resolveEmailProvider();
    const result = await provider.sendEmail({
      to: job.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      template: job.template,
    });

    if (!result.ok) {
      throw new Error(result.error ?? 'Email send failed');
    }
  }

  private resolveEmailProvider(): EmailProviderInterface {
    if (this.settingsStore.resolveSmtpConfig()) {
      return this.smtpProvider;
    }
    const host = this.configService.get<string>('smtp.host');
    if (host) {
      return this.smtpProvider;
    }
    return this.mockProvider;
  }

  private async renderFromDatabase(
    template: string,
    payload: Record<string, unknown>,
  ) {
    const dbCode = DB_TEMPLATE_ALIASES[template] ?? template;
    return this.emailTemplateService.render(dbCode, payload);
  }

  private async buildEmailPayload(
    template: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const orderId = String(payload.orderId ?? '');
    const orderTemplates = new Set([
      EMAIL_TEMPLATE.CARD_DELIVERY,
      EMAIL_TEMPLATE.CARD_DELIVERED,
      EMAIL_TEMPLATE.PAYMENT_SUCCESS,
      EMAIL_TEMPLATE.ORDER_SUCCESS,
      EMAIL_TEMPLATE.TOPUP_SUCCESS,
      EMAIL_TEMPLATE.DATA_SUCCESS,
    ]);

    if (!orderId || !orderTemplates.has(template as never)) {
      return payload;
    }

    const order = await this.repository.findOrderForEmail(orderId);
    if (!order) {
      throw new Error(`Order not found for email template ${template}: ${orderId}`);
    }

    const items = order.orderItems
      .map((item) => `${item.variant?.name ?? 'Sản phẩm'} × ${item.quantity}`)
      .join(', ');
    const customerName =
      order.user?.email?.split('@')[0] ?? order.guestEmail?.split('@')[0] ?? 'Quý khách';

    const enriched: Record<string, unknown> = {
      ...payload,
      orderCode: order.orderCode,
      customerName,
      items,
      total: order.totalAmount.toFixed(0),
      amount: order.totalAmount.toFixed(0),
      totalAmount: order.totalAmount.toFixed(2),
    };

    if (
      template === EMAIL_TEMPLATE.CARD_DELIVERY ||
      template === EMAIL_TEMPLATE.CARD_DELIVERED
    ) {
      const cards: Array<{ serial: string; pin: string }> = [];
      for (const item of order.orderItems) {
        for (const card of item.cardRecords) {
          cards.push({
            serial: this.cardEncryption.decrypt(card.encryptedSerial),
            pin: this.cardEncryption.decrypt(card.encryptedPin),
          });
        }
      }
      enriched.cards = cards;
      Object.assign(enriched, formatCardDeliveryEmailBlocks(cards));
    }

    return enriched;
  }
}
