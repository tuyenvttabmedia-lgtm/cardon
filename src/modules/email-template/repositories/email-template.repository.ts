import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface UpsertEmailTemplateInput {
  code: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  variables?: Prisma.InputJsonValue;
  isActive?: boolean;
}

@Injectable()
export class EmailTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.emailTemplate.findMany({
      orderBy: { code: 'asc' },
    });
  }

  findByCode(code: string) {
    return this.prisma.emailTemplate.findUnique({
      where: { code },
    });
  }

  findActiveByCode(code: string) {
    return this.prisma.emailTemplate.findFirst({
      where: { code, isActive: true },
    });
  }

  upsert(input: UpsertEmailTemplateInput) {
    return this.prisma.emailTemplate.upsert({
      where: { code: input.code },
      create: {
        code: input.code,
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        textBody: input.textBody ?? null,
        variables: input.variables ?? [],
        isActive: input.isActive ?? true,
      },
      update: {
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        textBody: input.textBody ?? null,
        variables: input.variables ?? [],
        isActive: input.isActive ?? true,
      },
    });
  }
}
