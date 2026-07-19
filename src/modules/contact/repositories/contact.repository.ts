import { Injectable } from '@nestjs/common';
import { ContactMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ContactMessageCreateInput) {
    return this.prisma.contactMessage.create({ data });
  }

  findMany(filters: { status?: ContactMessageStatus }) {
    return this.prisma.contactMessage.findMany({
      where: filters.status ? { status: filters.status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.contactMessage.findUnique({ where: { id } });
  }

  updateStatus(id: string, status: ContactMessageStatus) {
    return this.prisma.contactMessage.update({ where: { id }, data: { status } });
  }

  delete(id: string) {
    return this.prisma.contactMessage.delete({ where: { id } });
  }
}
