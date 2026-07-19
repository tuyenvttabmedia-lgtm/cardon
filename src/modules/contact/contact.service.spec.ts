import { ContactService } from './services/contact.service';
import { ContactRepository } from './repositories/contact.repository';
import { NotificationService } from '../notification/services/notification.service';

describe('ContactService', () => {
  it('submits contact message and notifies admin', async () => {
    const created = {
      id: 'msg-1',
      name: 'Test User',
      email: 'test@example.com',
      phone: '0901234567',
      subject: 'Hello',
      message: 'Need help',
      status: 'NEW',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      create: jest.fn().mockResolvedValue(created),
    };
    const notificationService = {
      notifyContactForm: jest.fn().mockResolvedValue(undefined),
      notifyAdminNewContact: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn().mockReturnValue('admin@cardon.vn'),
    };

    const service = new ContactService(
      repository as unknown as ContactRepository,
      notificationService as unknown as NotificationService,
      configService as never,
    );

    const result = await service.submit({
      name: 'Test User',
      email: 'test@example.com',
      phone: '0901234567',
      subject: 'Hello',
      message: 'Need help',
    });

    expect(result.id).toBe('msg-1');
    expect(notificationService.notifyContactForm).toHaveBeenCalled();
    expect(notificationService.notifyAdminNewContact).toHaveBeenCalled();
  });
});
