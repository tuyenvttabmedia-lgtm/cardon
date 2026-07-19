import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SupportMessageAuthorType,
  SupportTicketStatus,
} from '@prisma/client';
import { NotificationService } from '../../notification/services/notification.service';
import { CreateSupportTicketDto, ListSupportTicketsQueryDto, ReplySupportTicketDto } from '../dto/support.dto';
import { generateTicketCode } from '../entities/ticket-code.generator';
import { SupportRepository } from '../repositories/support.repository';

@Injectable()
export class SupportService {
  constructor(
    private readonly repository: SupportRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async createTicket(customerId: string, dto: CreateSupportTicketDto) {
    if (dto.orderId) {
      const order = await this.repository.findCustomerOrder(dto.orderId, customerId);
      if (!order) {
        throw new BadRequestException('Order not found or does not belong to you');
      }
    }

    const ticket = await this.repository.createTicket({
      ticketCode: generateTicketCode(),
      customerId,
      orderId: dto.orderId,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      priority: dto.priority,
    });

    await this.notificationService.notifyAdminNewTicket({
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      subject: ticket.subject,
      customerId,
    });

    return this.repository.findCustomerTicket(ticket.id, customerId);
  }

  listCustomerTickets(customerId: string) {
    return this.repository.listCustomerTickets(customerId);
  }

  async getCustomerTicket(id: string, customerId: string) {
    const ticket = await this.repository.findCustomerTicket(id, customerId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async addCustomerMessage(
    ticketId: string,
    customerId: string,
    body: string,
    attachmentUrl?: string,
  ) {
    const ticket = await this.repository.findCustomerTicket(ticketId, customerId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    if (ticket.status === SupportTicketStatus.RESOLVED) {
      throw new BadRequestException('Ticket is closed');
    }

    await this.repository.addMessage({
      ticketId,
      authorType: SupportMessageAuthorType.CUSTOMER,
      authorId: customerId,
      body: body.trim(),
      attachmentUrl,
    });

    if (ticket.status === SupportTicketStatus.OPEN) {
      await this.repository.updateStatus(ticketId, SupportTicketStatus.PROCESSING);
    }

    return this.repository.findCustomerTicket(ticketId, customerId);
  }

  listAdminTickets(query: ListSupportTicketsQueryDto) {
    return this.repository.listAdminTickets({
      status: query.status,
      priority: query.priority,
      ticketCode: query.ticketCode?.trim(),
    });
  }

  async getAdminTicket(id: string) {
    const ticket = await this.repository.findAdminTicket(id);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async replyAsStaff(ticketId: string, staffId: string, dto: ReplySupportTicketDto) {
    const ticket = await this.repository.findAdminTicket(ticketId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    if (ticket.status === SupportTicketStatus.RESOLVED) {
      throw new BadRequestException('Ticket is already closed');
    }

    await this.repository.addMessage({
      ticketId,
      authorType: SupportMessageAuthorType.STAFF,
      authorId: staffId,
      body: dto.body.trim(),
    });

    if (ticket.status === SupportTicketStatus.OPEN) {
      await this.repository.updateStatus(ticketId, SupportTicketStatus.PROCESSING);
    }

    await this.notificationService.notifyCustomerSupportReply({
      userId: ticket.customerId,
      ticketId,
      ticketCode: ticket.ticketCode,
      subject: ticket.subject,
    });

    return this.repository.findAdminTicket(ticketId);
  }

  async closeTicket(ticketId: string) {
    const ticket = await this.repository.findAdminTicket(ticketId);
    if (!ticket) throw new NotFoundException('Support ticket not found');
    if (ticket.status === SupportTicketStatus.RESOLVED) {
      return ticket;
    }
    await this.repository.updateStatus(ticketId, SupportTicketStatus.RESOLVED);
    return this.repository.findAdminTicket(ticketId);
  }
}
