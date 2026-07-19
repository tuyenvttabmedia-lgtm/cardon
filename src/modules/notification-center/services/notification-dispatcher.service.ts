import { Injectable } from '@nestjs/common';
import { SystemNotificationSeverity } from '@prisma/client';
import { AppLoggerService } from '../../../logger/app-logger.service';
import { TelegramNotificationService } from '../../notification/providers/telegram-notification.service';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { NotificationDispatchPayload } from '../entities/system-notification.entity';
import { SystemNotificationService } from './system-notification.service';

@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly systemNotificationService: SystemNotificationService,
    private readonly telegramService: TelegramNotificationService,
    private readonly settingsStore: SettingsStoreService,
    private readonly logger: AppLoggerService,
  ) {}

  dispatch(payload: NotificationDispatchPayload): void {
    this.systemNotificationService.dispatch(payload);

    if (
      payload.severity === SystemNotificationSeverity.ERROR ||
      payload.severity === SystemNotificationSeverity.CRITICAL
    ) {
      void this.sendTelegram(payload).catch((err: unknown) => {
        this.logger.error(
          `Telegram notification failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
          NotificationDispatcher.name,
        );
      });
    }
  }

  private async sendTelegram(payload: NotificationDispatchPayload): Promise<void> {
    const telegram = this.settingsStore.getTelegramAdminView() as {
      enabled?: boolean;
      botToken?: string;
      chatId?: string;
    };

    if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
      return;
    }

    const text = `<b>[${payload.severity}] ${payload.title}</b>\n${payload.message}`;
    await this.telegramService.sendMessage(telegram.botToken, telegram.chatId, text);
  }
}
