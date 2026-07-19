import { Module, forwardRef } from '@nestjs/common';
import { shouldRegisterWorkers } from '../../config/process-role';
import { EmailTemplateModule } from '../email-template/email-template.module';
import { MockEmailProvider } from './providers/mock-email.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { TelegramNotificationService } from './providers/telegram-notification.service';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationDispatchService } from './services/notification-dispatch.service';
import { NotificationQueueProducer } from './services/notification-queue.producer';
import { NotificationService } from './services/notification.service';
import { ProviderModule } from '../provider/provider.module';
import { OrderEventModule } from '../order/order-event.module';
import { NotificationWorker } from './workers/notification.worker';

const workerProviders = shouldRegisterWorkers() ? [NotificationWorker] : [];

@Module({
  imports: [forwardRef(() => ProviderModule), OrderEventModule, EmailTemplateModule],
  providers: [
    NotificationRepository,
    MockEmailProvider,
    SmtpEmailProvider,
    TelegramNotificationService,
    NotificationQueueProducer,
    NotificationDispatchService,
    NotificationService,
    ...workerProviders,
  ],
  exports: [
    NotificationService,
    NotificationQueueProducer,
    MockEmailProvider,
    SmtpEmailProvider,
    NotificationRepository,
    TelegramNotificationService,
  ],
})
export class NotificationModule {}
