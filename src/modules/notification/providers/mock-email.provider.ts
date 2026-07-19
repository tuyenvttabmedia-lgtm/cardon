import { Injectable } from '@nestjs/common';
import { EmailSendResult, SendEmailParams } from '../entities/notification.types';
import { EmailProviderInterface } from './email-provider.interface';

@Injectable()
export class MockEmailProvider implements EmailProviderInterface {
  readonly sent: SendEmailParams[] = [];

  async sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
    this.sent.push({ ...params });
    return { ok: true, messageId: `mock-${this.sent.length}` };
  }

  reset(): void {
    this.sent.length = 0;
  }
}
