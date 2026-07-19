import {
  NotificationRecipientRole,
  NotificationRecipientType,
} from '@prisma/client';
import { EmailTemplateType, NotificationChannel } from './notification.constants';

export interface NotificationQueueJobData {
  channel: NotificationChannel;
  template?: EmailTemplateType;
  recipientEmail?: string;
  recipientType?: NotificationRecipientType;
  recipientId?: string;
  recipientRole?: NotificationRecipientRole;
  systemType?: string;
  title?: string;
  body?: string;
  payload: Record<string, unknown>;
  attempt?: number;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: EmailTemplateType;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    encoding?: string;
  }>;
}

export interface EmailSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}
