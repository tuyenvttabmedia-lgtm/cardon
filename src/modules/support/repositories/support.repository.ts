import { Injectable } from '@nestjs/common';
import {
  SupportMessageAuthorType,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { attachmentUrlMatchesFilename } from '../entities/support-attachment-url.util';

@Injectable()
export class SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  countOpenTickets(customerId: string): Promise<number> {
    return this.prisma.supportTicket.count({
      where: { customerId, status: SupportTicketStatus.OPEN },
    });
  }

  /**
   * Create ticket under a user-row lock to serialize OPEN-cap checks (no schema change).
   */
  createTicketWithOpenCap(params: {
    ticketCode: string;
    customerId: string;
    orderId?: string | null;
    subject: string;
    message: string;
    priority?: SupportTicketPriority;
    openCap: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM users WHERE id = ${params.customerId}::uuid FOR UPDATE
      `;

      const openCount = await tx.supportTicket.count({
        where: {
          customerId: params.customerId,
          status: SupportTicketStatus.OPEN,
        },
      });
      if (openCount >= params.openCap) {
        return { ok: false as const, openCount };
      }

      const ticket = await tx.supportTicket.create({
        data: {
          ticketCode: params.ticketCode,
          customerId: params.customerId,
          orderId: params.orderId ?? null,
          subject: params.subject,
          status: SupportTicketStatus.OPEN,
          priority: params.priority ?? SupportTicketPriority.NORMAL,
        },
      });
      await tx.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: SupportMessageAuthorType.CUSTOMER,
          authorId: params.customerId,
          body: params.message,
        },
      });
      return { ok: true as const, ticket };
    });
  }

  /** True if any message on the customer's tickets references this attachment exactly. */
  async customerOwnsAttachment(customerId: string, filename: string): Promise<boolean> {
    const onTickets = await this.prisma.supportTicketMessage.findMany({
      where: {
        attachmentUrl: { not: null },
        ticket: { customerId },
      },
      select: { attachmentUrl: true },
      take: 1000,
    });
    return onTickets.some((m) =>
      attachmentUrlMatchesFilename(m.attachmentUrl ?? '', filename),
    );
  }

  /** New uploads may be owned by userId prefix before attached to a ticket. */
  filenameOwnedByUser(filename: string, userId: string): boolean {
    return filename.startsWith(`${userId}_`);
  }

  findCustomerTicket(id: string, customerId: string) {
    return this.prisma.supportTicket.findFirst({
      where: { id, customerId },
      include: {
        order: { select: { id: true, orderCode: true, paymentStatus: true, fulfillmentStatus: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  listCustomerTickets(customerId: string) {
    return this.prisma.supportTicket.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { orderCode: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  listAdminTickets(filters: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    ticketCode?: string;
  }) {
    return this.prisma.supportTicket.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.ticketCode
          ? { ticketCode: { contains: filters.ticketCode, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        order: { select: { orderCode: true, paymentStatus: true, fulfillmentStatus: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  findAdminTicket(id: string) {
    return this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, email: true, fullName: true, phone: true } },
        order: {
          select: {
            id: true,
            orderCode: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            totalAmount: true,
          },
        },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  addMessage(params: {
    ticketId: string;
    authorType: SupportMessageAuthorType;
    authorId?: string;
    body: string;
    attachmentUrl?: string;
  }) {
    return this.prisma.supportTicketMessage.create({
      data: {
        ticketId: params.ticketId,
        authorType: params.authorType,
        authorId: params.authorId ?? null,
        body: params.body,
        attachmentUrl: params.attachmentUrl ?? null,
      },
    });
  }

  updateStatus(ticketId: string, status: SupportTicketStatus) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
    });
  }

  findCustomerOrder(orderId: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId: customerId, deletedAt: null },
      select: {
        id: true,
        orderCode: true,
        paymentStatus: true,
        fulfillmentStatus: true,
      },
    });
  }
}
