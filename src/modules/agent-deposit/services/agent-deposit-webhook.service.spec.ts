import { PaymentGatewayCode } from '@prisma/client';
import { AgentDepositWebhookService } from './agent-deposit-webhook.service';

describe('AgentDepositWebhookService.tryHandle routing', () => {
  function buildService(opts: {
    paymentReference: string | null;
    deposit: { id: string; gateway: PaymentGatewayCode } | null;
  }) {
    const provider = {
      verifyWebhook: jest.fn().mockResolvedValue({
        valid: true,
        paymentReference: opts.paymentReference,
        status: 'SUCCESS',
        amount: '100000.00',
        providerTransactionId: '92704',
        rawPayload: { gateway: 'SEPAY' },
      }),
    };
    const depositRepository = {
      findByReference: jest.fn().mockResolvedValue(opts.deposit),
    };
    const depositService = {
      processWebhookSuccess: jest.fn().mockResolvedValue({ duplicate: false }),
      markDepositFailed: jest.fn(),
    };
    const webhookLogRepository = { create: jest.fn() };
    const activityDispatcher = { dispatch: jest.fn() };

    const service = new AgentDepositWebhookService(
      depositRepository as never,
      depositService as never,
      { get: () => provider } as never,
      webhookLogRepository as never,
      activityDispatcher as never,
    );

    return { service, depositRepository, depositService, webhookLogRepository };
  }

  it('returns handled:false when DH code is not an agent deposit (B2C order)', async () => {
    const { service, depositRepository, depositService } = buildService({
      paymentReference: 'DH12345678',
      deposit: null,
    });

    const result = await service.tryHandle('sepay', {}, {});

    expect(result).toEqual({ handled: false });
    expect(depositRepository.findByReference).toHaveBeenCalledWith('DH12345678');
    expect(depositService.processWebhookSuccess).not.toHaveBeenCalled();
  });

  it('credits when DH code matches an agent deposit row', async () => {
    const { service, depositService, webhookLogRepository } = buildService({
      paymentReference: 'DH87654321',
      deposit: { id: 'dep-1', gateway: PaymentGatewayCode.SEPAY },
    });

    const result = await service.tryHandle('sepay', {}, {});

    expect(result.handled).toBe(true);
    expect(result.paymentReference).toBe('DH87654321');
    expect(webhookLogRepository.create).toHaveBeenCalled();
    expect(depositService.processWebhookSuccess).toHaveBeenCalledWith(
      'dep-1',
      expect.objectContaining({ paymentReference: 'DH87654321' }),
    );
  });

  it('still credits legacy DEP references via DB lookup', async () => {
    const { service, depositService } = buildService({
      paymentReference: 'DEP-OLDREF123',
      deposit: { id: 'dep-legacy', gateway: PaymentGatewayCode.SEPAY },
    });

    const result = await service.tryHandle('sepay', {}, {});

    expect(result.handled).toBe(true);
    expect(depositService.processWebhookSuccess).toHaveBeenCalledWith(
      'dep-legacy',
      expect.objectContaining({ paymentReference: 'DEP-OLDREF123' }),
    );
  });
});
