import { Injectable } from '@nestjs/common';
import { UpsertEmailTemplateDto } from '../dto/email-template.dto';
import { EmailTemplateRepository } from '../repositories/email-template.repository';

function interpolate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] ?? '');
}

@Injectable()
export class EmailTemplateService {
  constructor(private readonly repository: EmailTemplateRepository) {}

  list() {
    return this.repository.list().then((rows) =>
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        subject: row.subject,
        htmlBody: row.htmlBody,
        textBody: row.textBody,
        variables: Array.isArray(row.variables)
          ? (row.variables as string[])
          : [],
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  }

  upsert(dto: UpsertEmailTemplateDto) {
    return this.repository.upsert(dto);
  }

  async render(code: string, data: Record<string, unknown>) {
    const template = await this.repository.findActiveByCode(code);
    if (!template) {
      return null;
    }

    const stringData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value ?? '')]),
    );

    return {
      subject: interpolate(template.subject, stringData),
      html: interpolate(template.htmlBody, stringData),
      text: interpolate(template.textBody ?? template.htmlBody, stringData),
    };
  }
}
