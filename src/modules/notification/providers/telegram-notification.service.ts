import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);

  async sendMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Telegram send failed: ${response.status} ${body}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Telegram send error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
