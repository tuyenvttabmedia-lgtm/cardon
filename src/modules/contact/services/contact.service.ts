import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactMessageStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../../notification/services/notification.service';
import { SubmitContactMessageDto } from '../dto/contact.dto';
import { ContactRepository } from '../repositories/contact.repository';

@Injectable()
export class ContactService {
  constructor(
    private readonly repository: ContactRepository,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  async submit(dto: SubmitContactMessageDto) {
    const message = await this.repository.create({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || null,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      status: ContactMessageStatus.NEW,
    });

    const adminEmail =
      this.configService.get<string>('notification.adminAlertEmail') ??
      this.configService.get<string>('smtp.from');

    if (adminEmail) {
      await this.notificationService.notifyContactForm(adminEmail, {
        id: message.id,
        name: message.name,
        email: message.email,
        phone: message.phone ?? '',
        subject: message.subject,
        message: message.message,
      });
    }

    await this.notificationService.notifyAdminNewContact({
      id: message.id,
      name: message.name,
      subject: message.subject,
    });

    return { id: message.id, message: 'Contact message submitted' };
  }

  list(status?: ContactMessageStatus) {
    return this.repository.findMany({ status });
  }

  async getById(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Contact message not found');
    return row;
  }

  markProcessed(id: string) {
    return this.repository.updateStatus(id, ContactMessageStatus.PROCESSED);
  }

  async delete(id: string) {
    await this.getById(id);
    await this.repository.delete(id);
    return { deleted: true };
  }
}
