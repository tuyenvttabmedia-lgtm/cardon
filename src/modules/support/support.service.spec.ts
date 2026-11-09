import { BadRequestException } from '@nestjs/common';
import { SupportService } from './services/support.service';
import { SupportRepository } from './repositories/support.repository';
import { NotificationService } from '../notification/services/notification.service';
import { SupportUploadService } from './services/support-upload.service';

describe('SupportService', () => {
  function build(overrides?: {
    createResult?: { ok: true; ticket: object } | { ok: false; openCount: number };
  }) {
    const ticket = {
      id: 't-1',
      ticketCode: 'TK-20250621-ABC',
      customerId: 'u-1',
      subject: 'Help',
      status: 'OPEN',
    };
    const repository = {
      createTicketWithOpenCap: jest
        .fn()
        .mockResolvedValue(
          overrides?.createResult ?? { ok: true, ticket },
        ),
      findCustomerTicket: jest.fn().mockResolvedValue({ ...ticket, messages: [] }),
      findCustomerOrder: jest.fn(),
      customerOwnsAttachment: jest.fn(),
      filenameOwnedByUser: jest.fn().mockReturnValue(false),
      addMessage: jest.fn(),
      updateStatus: jest.fn(),
    };
    const notificationService = {
      notifyAdminNewTicket: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'abuseRateLimit.supportOpenCapEnabled') return true;
        if (key === 'abuseRateLimit.supportOpenCap') return 5;
        return undefined;
      }),
    };
    const uploadService = {
      extractFilenameFromAttachmentUrl: jest.fn((url: string) =>
        url.includes('evil') ? null : 'file.png',
      ),
      assertSafeFilename: jest.fn((f: string) => f),
    };

    const service = new SupportService(
      repository as unknown as SupportRepository,
      notificationService as unknown as NotificationService,
      configService as never,
      uploadService as unknown as SupportUploadService,
    );
    return { service, repository, notificationService, uploadService };
  }

  it('creates ticket and notifies admin', async () => {
    const { service, repository, notificationService } = build();
    await service.createTicket('u-1', {
      subject: 'Help',
      message: 'Need assistance',
    });
    expect(repository.createTicketWithOpenCap).toHaveBeenCalled();
    expect(notificationService.notifyAdminNewTicket).toHaveBeenCalled();
  });

  it('blocks when OPEN cap exceeded', async () => {
    const { service } = build({
      createResult: { ok: false, openCount: 5 },
    });
    await expect(
      service.createTicket('u-1', { subject: 'Help', message: 'Need assistance' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-support attachment URLs', () => {
    const { service } = build();
    expect(() =>
      service.assertAttachmentUrlAllowed('https://evil.example/x.png'),
    ).toThrow(BadRequestException);
  });

  it('allows legacy and API attachment prefixes', () => {
    const { service } = build();
    expect(service.assertAttachmentUrlAllowed('/uploads/support/a.png')).toBe(
      '/uploads/support/a.png',
    );
    expect(
      service.assertAttachmentUrlAllowed('/account/support/files/a.png'),
    ).toBe('/account/support/files/a.png');
  });
});
