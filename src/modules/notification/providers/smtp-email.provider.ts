import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { EmailSendResult, SendEmailParams } from '../entities/notification.types';
import { safeEmailLogMeta } from '../entities/notification-log-safety';
import { EmailProviderInterface } from './email-provider.interface';

/**
 * SMTP adapter — Admin Settings DB with ENV fallback.
 * Supports Brevo, Zoho, Gmail, and custom SMTP via nodemailer.
 */
@Injectable()
export class SmtpEmailProvider implements EmailProviderInterface {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private transporterCache: { key: string; transporter: Transporter } | null = null;

  constructor(private readonly settingsStore: SettingsStoreService) {}

  async sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
    const smtp = this.settingsStore.resolveSmtpConfig();
    if (!smtp?.host) {
      return { ok: false, error: 'SMTP not configured' };
    }

    try {
      const messageId = await this.deliver(params);
      this.logger.log(
        safeEmailLogMeta({
          to: params.to,
          template: params.template,
          subject: params.subject,
        }),
      );
      return { ok: true, messageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SMTP send failed';
      this.logger.warn(
        `Email send failed template=${params.template} to=${params.to}: ${message}`,
      );
      return { ok: false, error: message };
    }
  }

  /** Sends via nodemailer — throws on transport failure (no fake success). */
  protected async deliver(params: SendEmailParams): Promise<string> {
    const smtp = this.settingsStore.resolveSmtpConfig();
    if (!smtp?.host) {
      throw new Error('SMTP not configured');
    }

    const transporter = this.getTransporter(smtp);
    const fromAddress = this.formatFrom(smtp.from, smtp.fromName);

    const info = await transporter.sendMail({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        encoding: a.encoding,
      })),
      encoding: 'utf-8',
    });

    const messageId =
      typeof info.messageId === 'string' && info.messageId.length > 0
        ? info.messageId
        : `smtp-${Date.now()}`;

    return messageId;
  }

  private formatFrom(email: string, fromName?: string): string {
    if (fromName?.trim()) {
      return `"${fromName.replace(/"/g, '\\"')}" <${email}>`;
    }
    return email;
  }

  private getTransporter(smtp: NonNullable<ReturnType<SettingsStoreService['resolveSmtpConfig']>>): Transporter {
    const cacheKey = `${smtp.host}:${smtp.port}:${smtp.user ?? ''}:${smtp.secure}:${smtp.pass ?? ''}`;
    if (this.transporterCache?.key === cacheKey) {
      return this.transporterCache.transporter;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth:
        smtp.user && smtp.pass
          ? { user: smtp.user, pass: smtp.pass }
          : undefined,
      tls: { minVersion: 'TLSv1.2' },
    });

    this.transporterCache = { key: cacheKey, transporter };
    return transporter;
  }

  /** Test helper — reset cached transporter after settings reload. */
  clearTransporterCache(): void {
    this.transporterCache = null;
  }
}
