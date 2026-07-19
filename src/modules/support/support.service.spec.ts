import { SupportService } from './services/support.service';
import { SupportRepository } from './repositories/support.repository';
import { NotificationService } from '../notification/services/notification.service';

describe('SupportService', () => {
  it('creates ticket and notifies admin', async () => {
    const ticket = {
      id: 't-1',
      ticketCode: 'TK-20250621-ABC',
      customerId: 'u-1',
      subject: 'Help',
      status: 'OPEN',
    };
    const repository = {
      createTicket: jest.fn().mockResolvedValue(ticket),
      findCustomerTicket: jest.fn().mockResolvedValue({ ...ticket, messages: [] }),
      findCustomerOrder: jest.fn(),
    };
    const notificationService = {
      notifyAdminNewTicket: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SupportService(
      repository as unknown as SupportRepository,
      notificationService as unknown as NotificationService,
    );

    await service.createTicket('u-1', {
      subject: 'Help',
      message: 'Need assistance',
    });

    expect(repository.createTicket).toHaveBeenCalled();
    expect(notificationService.notifyAdminNewTicket).toHaveBeenCalled();
  });
});
