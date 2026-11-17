import { BadRequestException } from '@nestjs/common';
import { AgentDepositStatus, PaymentGatewayCode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AgentDepositService } from './agent-deposit.service';

describe('AgentDepositService amount lock', () => {
  function harness(
    depositAmount = '100000.00',
    status: AgentDepositStatus = AgentDepositStatus.AWAITING_PAYMENT,
  ) {
    const deposit = {
      id: 'dep-1',
      agentId: 'agent-1',
      paymentReference: 'DH1',
      amount: new Decimal(depositAmount),
      netAmount: new Decimal('99000.00'),
      status,
      gateway: PaymentGatewayCode.MEGAPAY,
    };
    const depositRepository = {
      findByReference: jest.fn().mockResolvedValue(deposit),
      claimStatus: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
      findByIdOnly: jest.fn().mockResolvedValue(deposit),
      findByIdOnlyInTransaction: jest.fn().mockResolvedValue(deposit),
      updateInTransaction: jest.fn().mockImplementation((_id, data) =>
        Promise.resolve({ ...deposit, ...data, status: data.status ?? deposit.status }),
      ),
    };
    const ledgerService = {
      credit: jest.fn(),
      creditInTransaction: jest.fn(),
      findEntryByReference: jest.fn().mockResolvedValue(null),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ $executeRaw: jest.fn() }),
      ),
    };
    const notify = {
      notifyAgentDepositCredited: jest.fn(),
      notifyAgentDepositFailed: jest.fn(),
    };
    const service = new AgentDepositService(
      depositRepository as never,
      {} as never,
      ledgerService as never,
      { get: jest.fn() } as never,
      {} as never,
      notify as never,
      { dispatch: jest.fn() } as never,
      prisma as never,
    );
    return { service, depositRepository, ledgerService, prisma, notify };
  }

  it('rejects underpay and does not credit the wallet', async () => {
    const box = harness();
    await expect(
      box.service.processWebhookSuccess('dep-1', {
        paymentReference: 'DH1',
        amount: '1000.00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(box.depositRepository.claimStatus).not.toHaveBeenCalled();
    expect(box.ledgerService.creditInTransaction).not.toHaveBeenCalled();
  });

  it('rejects missing paid amount', async () => {
    const box = harness();
    await expect(
      box.service.processWebhookSuccess('dep-1', {
        paymentReference: 'DH1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(box.ledgerService.creditInTransaction).not.toHaveBeenCalled();
  });

  it('ignores late SUCCESS webhook on FAILED deposit without crediting', async () => {
    const box = harness('100000.00', AgentDepositStatus.FAILED);
    const result = await box.service.processWebhookSuccess('dep-1', {
      paymentReference: 'DH1',
      amount: '100000.00',
    });
    expect(result.duplicate).toBe(true);
    expect(box.ledgerService.creditInTransaction).not.toHaveBeenCalled();
  });

  it('does not overwrite CREDITED when a late FAILED IPN arrives', async () => {
    const box = harness('100000.00', AgentDepositStatus.CREDITED);
    box.depositRepository.claimStatus.mockResolvedValue({ count: 0 });
    const result = await box.service.markDepositFailed('dep-1', 'Webhook status: FAILED');
    expect(result?.status).toBe(AgentDepositStatus.CREDITED);
    expect(box.depositRepository.claimStatus).toHaveBeenCalledWith(
      'dep-1',
      [AgentDepositStatus.INIT, AgentDepositStatus.AWAITING_PAYMENT],
      AgentDepositStatus.FAILED,
    );
    expect(box.depositRepository.update).not.toHaveBeenCalled();
    expect(box.notify.notifyAgentDepositFailed).not.toHaveBeenCalled();
  });
});
