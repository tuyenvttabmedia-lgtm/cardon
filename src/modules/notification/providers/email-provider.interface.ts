import { EmailSendResult, SendEmailParams } from '../entities/notification.types';

export interface EmailProviderInterface {
  sendEmail(params: SendEmailParams): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
