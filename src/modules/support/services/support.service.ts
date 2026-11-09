import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SupportMessageAuthorType,
  SupportTicketStatus,
} from '@prisma/client';
import { NotificationService } from '../../notification/services/notification.service';
import {
  CreateSupportTicketDto,
  ListSupportTicketsQueryDto,
  ReplySupportTicketDto,
} from '../dto/support.dto';
import {
  SUPPORT_ATTACHMENT_URL_PREFIX,
  SUPPORT_FILES_API_PREFIX,
  SUPPORT_ADMIN_FILES_API_PREFIX,
  SUPPORT_OPEN_CAP_DEFAULT,
} from '../entities/support.constants';
import { generateTicketCode } from '../entities/ticket-code.generator';
import { SupportRepository } from '../repositories/support.repository';
import { SupportUploadService } from './support-upload.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly repository: SupportRepository,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    private readonly uploadService: SupportUploadService,
  ) {}

  private openCapEnabled(): boolean {
    return this.configService.get<boolean>('abuseRateLimit.supportOpenCapEnabled') !== false;
  }

  private openCap(): number {
    return (
      this.configService.get<number>('abuseRateLimit.supportOpenCap') ??
      SUPPORT_OPEN_CAP_DEFAULT
    );
  }

  assertAttachmentUrlAllowed(attachmentUrl?: string): string | undefined {
    if (attachmentUrl == null || !attachmentUrl.trim()) return undefined;
    const url = attachmentUrl.trim();
    const allowed =
      url.startsWith(SUPPORT_ATTACHMENT_URL_PREFIX) ||
      url.startsWith(SUPPORT_FILES_API_PREFIX) ||
      url.startsWith(SUPPORT_ADMIN_FILES_API_PREFIX);
    if (!allowed) {
      throw new BadRequestException('Invalid attachment URL');
    }
    const filename = this.uploadService.extractFilenameFromAttachmentUrl(url);
    if (!filename) {
      throw new BadRequestException('Invalid attachment URL');
    }
    return url;
  }

  async createTicket(customerId: string, dto: CreateSupportTicketDto) {
    if (dto.orderId) {
      const order = await this.repository.findCustomerOrder(dto.orderId, customerId);
      if (!order) {
        throw new BadRequestException('Order not found or does not belong to you');
      }
    }

    const openCap = this.openCapEnabled() ? this.openCap() : Number.MAX_SAFE_INTEGER;
    const result = await this.repository.createTicketWithOpenCap({
      ticketCode: generateTicketCode(),
      customerId,
      orderId: dto.orderId,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      priority: dto.priority,
      openCap,
    });

    if (!result.ok) {
      throw new BadRequestException(
        `Too many open support tickets (max ${this.openCap()}). Close an existing ticket or wait for support.`,
      );
    }

    const ticket = result.ticket;
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

    const safeAttachment = this.assertAttachmentUrlAllowed(attachmentUrl);

    await this.repository.addMessage({
      ticketId,
      authorType: SupportMessageAuthorType.CUSTOMER,
      authorId: customerId,
      body: body.trim(),
      attachmentUrl: safeAttachment,
    });

    if (ticket.status === SupportTicketStatus.OPEN) {
      await this.repository.updateStatus(ticketId, SupportTicketStatus.PROCESSING);
    }

    return this.repository.findCustomerTicket(ticketId, customerId);
  }

  async assertCustomerCanDownload(customerId: string, filename: string): Promise<void> {
    const safe = this.uploadService.assertSafeFilename(filename);
    if (this.repository.filenameOwnedByUser(safe, customerId)) {
      return;
    }
    const owns = await this.repository.customerOwnsAttachment(customerId, safe);
    if (!owns) {
      throw new NotFoundException('Attachment not found');
    }
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
