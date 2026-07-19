/**
 * Phase 4C — Notification & Communication Tests
 */
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { CardEncryptionService } from '../provider/services/card-encryption.service';
import {
  EMAIL_TEMPLATE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_JOB,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_RETRY_DELAY_MS,
} from './entities/notification.constants';
import {
  containsSensitiveContent,
  safeEmailLogMeta,
  sanitizeNotificationLogContext,
} from './entities/notification-log-safety';
import { MockEmailProvider } from './providers/mock-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationDispatchService } from './services/notification-dispatch.service';
import { NotificationQueueProducer } from './services/notification-queue.producer';
import { NotificationService } from './services/notification.service';
import { renderEmailTemplate } from './templates/template.registry';

const TEST_ENCRYPTION_KEY = '01234567890123456789012345678901';

describe('Phase 4C Notification', () => {
  describe('email queued', () => {
    it('enqueues USER_REGISTER without sending email inline', async () => {
      const enqueue = jest.fn().mockResolvedValue(undefined);
      const producer = { enqueueUserRegister: enqueue } as unknown as NotificationQueueProducer;
      const service = new NotificationService(
        producer,
        {} as NotificationRepository,
        { get: () => 'https://cardon.vn' } as unknown as ConfigService,
      );

      await service.notifyUserRegister('user@cardon.vn', 'verify-token-abc');

      expect(enqueue).toHaveBeenCalledWith(
        'user@cardon.vn',
        'https://cardon.vn/verify-email?token=verify-token-abc',
        undefined,
      );
    });

    it('NotificationQueueProducer configures retry on enqueue', async () => {
      const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
      const producer = new NotificationQueueProducer(queue as never);

      await producer.enqueue(
        {
          channel: NOTIFICATION_CHANNEL.EMAIL,
          template: EMAIL_TEMPLATE.ORDER_SUCCESS,
          recipientEmail: 'buyer@cardon.vn',
          payload: { orderCode: 'ORD-001' },
        },
        'email-order-success-order-1',
      );

      expect(queue.add).toHaveBeenCalledWith(
        NOTIFICATION_JOB.SEND,
        expect.objectContaining({
          channel: NOTIFICATION_CHANNEL.EMAIL,
          template: EMAIL_TEMPLATE.ORDER_SUCCESS,
        }),
        expect.objectContaining({
          jobId: 'email-order-success-order-1',
          attempts: NOTIFICATION_MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: NOTIFICATION_RETRY_DELAY_MS },
        }),
      );
    });
  });

  describe('template render', () => {
    it('renders ORDER_SUCCESS with order details', () => {
      const rendered = renderEmailTemplate(EMAIL_TEMPLATE.ORDER_SUCCESS, {
        orderCode: 'ORD-100',
        totalAmount: '250000.00',
      });

      expect(rendered.subject).toContain('ORD-100');
      expect(rendered.html).toContain('250000.00');
      expect(rendered.text).toContain('ORD-100');
    });

    it('renders PASSWORD_RESET without embedding raw token in subject', () => {
      const rendered = renderEmailTemplate(EMAIL_TEMPLATE.PASSWORD_RESET, {
        resetUrl: 'https://cardon.vn/reset-password?token=secret-token',
      });

      expect(rendered.subject).toBe('Đặt lại mật khẩu CardOn.vn');
      expect(rendered.html).toContain('reset-password');
    });
  });

  describe('card delivery decrypt', () => {
    it('decrypts serial and PIN when dispatching CARD_DELIVERED', async () => {
      const cardEncryption = new CardEncryptionService({
        get: (key: string) =>
          key === 'encryption.key' ? TEST_ENCRYPTION_KEY : undefined,
      } as ConfigService);

      const encryptedSerial = cardEncryption.encrypt('SERIAL-001');
      const encryptedPin = cardEncryption.encrypt('1234');

      const repository = {
        findOrderForEmail: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderCode: 'ORD-CARD-1',
          guestEmail: 'buyer@cardon.vn',
          user: null,
          orderItems: [
            {
              cardRecords: [
                {
                  id: 'card-1',
                  encryptedSerial,
                  encryptedPin,
                },
              ],
            },
          ],
        }),
        createSystemNotification: jest.fn(),
      } as unknown as NotificationRepository;

      const mockProvider = new MockEmailProvider();
      const smtpProvider = { clearTransporterCache: jest.fn() };
      const dispatch = new NotificationDispatchService(
        repository,
        cardEncryption,
        smtpProvider as unknown as SmtpEmailProvider,
        mockProvider,
        { get: () => undefined } as unknown as ConfigService,
        { resolveSmtpConfig: () => null, reload: jest.fn().mockResolvedValue(undefined) } as never,
        { render: jest.fn().mockResolvedValue(null) } as never,
        {} as never,
      );

      await dispatch.dispatch({
        channel: NOTIFICATION_CHANNEL.EMAIL,
        template: EMAIL_TEMPLATE.CARD_DELIVERED,
        recipientEmail: 'buyer@cardon.vn',
        payload: { orderId: 'order-1' },
      });

      expect(mockProvider.sent).toHaveLength(1);
      expect(mockProvider.sent[0].text).toContain('SERIAL-001');
      expect(mockProvider.sent[0].text).toContain('1234');
      expect(repository.findOrderForEmail).toHaveBeenCalledWith('order-1');
    });
  });

  describe('SMTP fail retry', () => {
    it('throws when SMTP provider fails so BullMQ can retry', async () => {
      const smtpProvider = {
        sendEmail: jest.fn().mockResolvedValue({ ok: false, error: 'Connection refused' }),
        clearTransporterCache: jest.fn(),
      };
      const repository = {
        createSystemNotification: jest.fn(),
      } as unknown as NotificationRepository;

      const dispatch = new NotificationDispatchService(
        repository,
        {} as CardEncryptionService,
        smtpProvider as unknown as SmtpEmailProvider,
        new MockEmailProvider(),
        {
          get: (key: string) => (key === 'smtp.host' ? 'smtp.test.local' : undefined),
        } as unknown as ConfigService,
        {
          resolveSmtpConfig: () => ({ host: 'smtp.test.local' }),
          reload: jest.fn().mockResolvedValue(undefined),
        } as never,
        { render: jest.fn().mockResolvedValue(null) } as never,
        {} as never,
      );

      await expect(
        dispatch.dispatch({
          channel: NOTIFICATION_CHANNEL.EMAIL,
          template: EMAIL_TEMPLATE.PAYMENT_SUCCESS,
          recipientEmail: 'buyer@cardon.vn',
          payload: {
            orderCode: 'ORD-1',
            amount: new Decimal(100000).toFixed(2),
          },
        }),
      ).rejects.toThrow('Connection refused');

      expect(smtpProvider.sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('no secret logging', () => {
    it('redacts PIN and reset token fields in log context', () => {
      const sanitized = sanitizeNotificationLogContext({
        to: 'user@cardon.vn',
        pin: '1234',
        resetToken: 'abc-secret',
        subject: 'Card delivery pin=9999',
      });

      expect(sanitized.pin).toBe('[REDACTED]');
      expect(sanitized.resetToken).toBe('[REDACTED]');
      expect(sanitized.subject).toBe('[REDACTED]');
      expect(sanitized.to).toBe('user@cardon.vn');
    });

    it('detects sensitive email content and uses safe metadata only', () => {
      const body = 'Card 1: serial=ABC pin=5678';
      expect(containsSensitiveContent(body)).toBe(true);

      const meta = safeEmailLogMeta({
        to: 'buyer@cardon.vn',
        template: EMAIL_TEMPLATE.CARD_DELIVERY,
        subject: 'Your cards for order ORD-1',
      });

      expect(meta).not.toHaveProperty('html');
      expect(meta).not.toHaveProperty('text');
      expect(JSON.stringify(meta)).not.toContain('5678');
    });
  });
});
