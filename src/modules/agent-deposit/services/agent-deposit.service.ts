import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentDepositStatus,
  AgentStatus,
  LedgerReferenceType,
  PaymentGatewayCode,
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { LedgerService } from '../../agent/services/ledger.service';
import { NotificationService } from '../../notification/services/notification.service';
import { PaymentProviderRegistry } from '../../payment/providers/payment-provider.registry';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import {
  buildDepositTimeline,
  DEPOSIT_STATUS_LABELS,
  depositStatusTone,
} from '../entities/deposit-status.mapper';
import { generateDepositReference } from '../entities/deposit-reference.generator';
import {
  MAX_DEPOSIT_AMOUNT,
  MIN_DEPOSIT_AMOUNT,
} from '../entities/deposit.constants';
import { AgentDepositRepository } from '../repositories/agent-deposit.repository';

const DEPOSIT_EXPIRY_MS = 15 * 60_000;

export interface AgentDepositPortalView {
  id: string;
  paymentReference: string;
  gateway: PaymentGatewayCode;
  amount: string;
  feeAmount: string;
  netAmount: string;
  status: AgentDepositStatus;
  statusLabel: string;
  statusTone: string;
  paymentUrl?: string;
  qrInfo?: Record<string, unknown>;
  transferContent?: string;
  expiresAt: string | null;
  paidAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  timeline: ReturnType<typeof buildDepositTimeline>;
}

@Injectable()
export class AgentDepositService {
  private readonly logger = new Logger(AgentDepositService.name);

  constructor(
    private readonly depositRepository: AgentDepositRepository,
    private readonly agentRepository: AgentRepository,
    private readonly ledgerService: LedgerService,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly settingsStore: SettingsStoreService,
    private readonly notificationService: NotificationService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  listAvailableGateways() {
    return this.settingsStore
      .resolveOrderedPaymentGateways()
      .filter((g) => g.enabled)
      .map((g) => ({
        code: g.code,
        label: g.displayName ?? g.label,
        priority: g.priority,
      }));
  }

  async createDeposit(
    userId: string,
    amount: number,
    idempotencyKey: string,
    requestedGateway?: PaymentGatewayCode,
    userEmail?: string,
  ): Promise<AgentDepositPortalView> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const agent = await this.requireActiveAgent(userId);
    const existing = await this.depositRepository.findByIdempotency(
      agent.id,
      idempotencyKey.trim(),
    );
    if (existing) {
      return this.toPortalView(existing);
    }

    if (amount < MIN_DEPOSIT_AMOUNT) {
      throw new BadRequestException(
        `Minimum deposit amount is ${MIN_DEPOSIT_AMOUNT.toLocaleString('vi-VN')} VND per transaction`,
      );
    }
    if (amount > MAX_DEPOSIT_AMOUNT) {
      throw new BadRequestException(
        `Maximum deposit amount is ${MAX_DEPOSIT_AMOUNT.toLocaleString('vi-VN')} VND per transaction`,
      );
    }

    const gateway = this.resolveGateway(requestedGateway);
    const paymentReference = generateDepositReference();
    const amountDecimal = new Decimal(amount);
    const feeAmount = new Decimal(0);
    const netAmount = amountDecimal.sub(feeAmount);
    const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_MS);

    const provider = this.providerRegistry.get(gateway);
    const providerResult = await provider.createPayment({
      paymentReference,
      amount: amountDecimal.toFixed(2),
      orderId: paymentReference,
      gateway,
      expiresAt,
      preferLegacyQr: true,
    });

    const deposit = await this.depositRepository.create({
      agent: { connect: { id: agent.id } },
      paymentReference,
      idempotencyKey: idempotencyKey.trim(),
      gateway,
      amount: amountDecimal,
      feeAmount,
      netAmount,
      status: AgentDepositStatus.AWAITING_PAYMENT,
      expiresAt,
      gatewayResponse: {
        paymentUrl: providerResult.paymentUrl,
        providerReference: providerResult.providerReference,
        ...providerResult.rawResponse,
      },
    });

    this.logActivity(userId, userEmail, 'create_deposit', {
      depositId: deposit.id,
      paymentReference,
      amount: amountDecimal.toFixed(2),
      gateway,
    });

    return this.toPortalView(deposit);
  }

  async getDeposit(userId: string, depositId: string): Promise<AgentDepositPortalView> {
    const agent = await this.requireActiveAgent(userId);
    const deposit = await this.depositRepository.findById(depositId, agent.id);
    if (!deposit) {
      throw new NotFoundException('Deposit not found');
    }
    return this.toPortalView(deposit);
  }

  async refreshDeposit(userId: string, depositId: string): Promise<AgentDepositPortalView> {
    const agent = await this.requireActiveAgent(userId);
    let deposit = await this.depositRepository.findById(depositId, agent.id);
    if (!deposit) {
      throw new NotFoundException('Deposit not found');
    }

    deposit = await this.syncDepositState(deposit);

    this.logActivity(userId, agent.userId, 'refresh_deposit', {
      depositId: deposit.id,
      status: deposit.status,
    });

    return this.toPortalView(deposit);
  }

  async listDeposits(
    agentId: string,
    skip: number,
    take: number,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const [rows, total] = await this.depositRepository.listByAgent(
      agentId,
      skip,
      take,
      dateFrom,
      dateTo,
    );

    return {
      items: rows.map((row) => this.toListRow(row)),
      total,
      skip,
      take,
      gateways: this.listAvailableGateways(),
    };
  }

  async getPendingDepositTotal(agentId: string): Promise<string> {
    const agg = await this.depositRepository.sumPendingAmount(agentId);
    return agg._sum.amount?.toFixed(2) ?? '0.00';
  }

  async getDepositSummary(agentId: string) {
    const startOfDay = this.startOfToday();
    const startOfMonth = this.startOfMonth();
    const [today, month, pending] = await Promise.all([
      this.depositRepository.sumCreditedToday(agentId, startOfDay),
      this.depositRepository.sumCreditedMonth(agentId, startOfMonth),
      this.depositRepository.sumPendingAmount(agentId),
    ]);
    return {
      depositedToday: today._sum.netAmount?.toFixed(2) ?? '0.00',
      depositedMonth: month._sum.netAmount?.toFixed(2) ?? '0.00',
      pendingDeposit: pending._sum.amount?.toFixed(2) ?? '0.00',
    };
  }

  async processWebhookSuccess(
    depositId: string,
    verification: {
      paymentReference: string;
      amount?: string;
      providerTransactionId?: string;
      rawPayload?: unknown;
    },
  ) {
    const deposit = await this.depositRepository.findByReference(
      verification.paymentReference,
    );
    if (!deposit || deposit.id !== depositId) {
      throw new NotFoundException('Deposit not found');
    }

    if (deposit.status === AgentDepositStatus.CREDITED) {
      return { duplicate: true, deposit };
    }

    if (verification.amount) {
      const paid = new Decimal(verification.amount);
      if (!paid.eq(deposit.amount)) {
        this.logger.warn(
          `Deposit amount mismatch ref=${verification.paymentReference} expected=${deposit.amount} got=${verification.amount}`,
        );
      }
    }

    const now = new Date();
    const paidClaim = await this.depositRepository.claimStatus(
      deposit.id,
      [AgentDepositStatus.AWAITING_PAYMENT, AgentDepositStatus.INIT],
      AgentDepositStatus.PAID,
    );
    if (paidClaim.count === 0) {
      const fresh = await this.depositRepository.findByIdOnly(deposit.id);
      const progressed: AgentDepositStatus[] = [
        AgentDepositStatus.PAID,
        AgentDepositStatus.RECORDED,
        AgentDepositStatus.CREDITED,
      ];
      if (fresh && progressed.includes(fresh.status)) {
        return { duplicate: fresh.status === AgentDepositStatus.CREDITED, deposit: fresh };
      }
    }

    await this.depositRepository.update(deposit.id, {
      paidAt: now,
      gatewayTransactionId: verification.providerTransactionId ?? undefined,
    });

    await this.depositRepository.claimStatus(deposit.id, [AgentDepositStatus.PAID], AgentDepositStatus.RECORDED);

    const ledgerEntry = await this.ledgerService.credit(
      deposit.agentId,
      deposit.netAmount,
      LedgerReferenceType.TOPUP,
      deposit.id,
      undefined,
      `Gateway deposit via ${deposit.gateway} (${deposit.paymentReference})`,
    );

    const credited = await this.depositRepository.update(deposit.id, {
      status: AgentDepositStatus.CREDITED,
      creditedAt: now,
      ledgerEntry: { connect: { id: ledgerEntry.id } },
    });

    const agent = await this.agentRepository.findById(deposit.agentId);
    if (agent?.userId) {
      await this.notificationService.notifyAgentDepositCredited(
        agent.userId,
        deposit.id,
        deposit.netAmount.toFixed(2),
        deposit.paymentReference,
      );
    }

    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.WEBHOOK_SUCCESS,
      eventCategory: SystemActivityEventCategory.FINANCE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_deposit',
      resourceId: deposit.id,
      title: 'Agent deposit credited',
      description: `Deposit ${deposit.paymentReference} credited to wallet`,
      metadata: {
        agentId: deposit.agentId,
        amount: deposit.netAmount.toFixed(2),
        gateway: deposit.gateway,
      },
    });

    return { duplicate: false, deposit: credited };
  }

  async markDepositFailed(depositId: string, reason: string) {
    const deposit = await this.depositRepository.update(depositId, {
      status: AgentDepositStatus.FAILED,
    });
    const agent = await this.agentRepository.findById(deposit.agentId);
    if (agent?.userId) {
      await this.notificationService.notifyAgentDepositFailed(
        agent.userId,
        deposit.id,
        deposit.paymentReference,
        reason,
      );
    }
    return deposit;
  }

  async markDepositExpired(depositId: string) {
    const deposit = await this.depositRepository.findByIdOnly(depositId);
    if (!deposit) return null;

    const updated = await this.depositRepository.claimStatus(
      deposit.id,
      [AgentDepositStatus.INIT, AgentDepositStatus.AWAITING_PAYMENT],
      AgentDepositStatus.EXPIRED,
    );
    if (updated.count === 0) {
      return deposit;
    }

    const agent = await this.agentRepository.findById(deposit.agentId);
    if (agent?.userId) {
      await this.notificationService.notifyAgentDepositExpired(
        agent.userId,
        deposit.id,
        deposit.paymentReference,
      );
    }
    return this.depositRepository.findByIdOnly(deposit.id);
  }

  private async syncDepositState(deposit: NonNullable<Awaited<ReturnType<AgentDepositRepository['findById']>>>) {
    const terminal: AgentDepositStatus[] = [
      AgentDepositStatus.CREDITED,
      AgentDepositStatus.EXPIRED,
      AgentDepositStatus.FAILED,
      AgentDepositStatus.CANCELLED,
    ];
    if (terminal.includes(deposit.status)) {
      return deposit;
    }

    if (deposit.expiresAt && deposit.expiresAt.getTime() < Date.now()) {
      await this.depositRepository.claimStatus(
        deposit.id,
        [AgentDepositStatus.INIT, AgentDepositStatus.AWAITING_PAYMENT],
        AgentDepositStatus.EXPIRED,
      );
      const agent = await this.agentRepository.findById(deposit.agentId);
      if (agent?.userId) {
        await this.notificationService.notifyAgentDepositExpired(
          agent.userId,
          deposit.id,
          deposit.paymentReference,
        );
      }
      return (await this.depositRepository.findById(deposit.id, deposit.agentId))!;
    }

    if (
      deposit.status === AgentDepositStatus.AWAITING_PAYMENT ||
      deposit.status === AgentDepositStatus.PAID
    ) {
      try {
        const provider = this.providerRegistry.get(deposit.gateway);
        const query = await provider.queryTransaction(deposit.paymentReference);
        if (query.status === 'SUCCESS') {
          const result = await this.processWebhookSuccess(deposit.id, {
            paymentReference: deposit.paymentReference,
            amount: query.amount,
          });
          return result.deposit;
        }
      } catch (err) {
        this.logger.debug(`Deposit refresh query skipped: ${String(err)}`);
      }
    }

    return deposit;
  }

  private resolveGateway(requested?: PaymentGatewayCode): PaymentGatewayCode {
    const enabled = this.settingsStore.resolvePaymentGatewaySelectionOrder();
    if (!enabled.length) {
      throw new BadRequestException('No payment gateway is currently available');
    }
    if (requested && enabled.includes(requested)) {
      return requested;
    }
    if (requested && !enabled.includes(requested)) {
      return enabled[0];
    }
    return enabled[0];
  }

  private async requireActiveAgent(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) {
      throw new NotFoundException('Agent profile not found');
    }
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new ForbiddenException('Agent account is not active');
    }
    return agent;
  }

  private toListRow(deposit: Prisma.AgentDepositGetPayload<object>) {
    return {
      id: deposit.id,
      time: deposit.createdAt.toISOString(),
      reference: deposit.paymentReference,
      amount: deposit.amount.toFixed(2),
      feeAmount: deposit.feeAmount.toFixed(2),
      netAmount: deposit.netAmount.toFixed(2),
      gateway: deposit.gateway,
      status: deposit.status,
      statusLabel: DEPOSIT_STATUS_LABELS[deposit.status],
      statusTone: depositStatusTone(deposit.status),
      completedAt: deposit.creditedAt?.toISOString() ?? deposit.paidAt?.toISOString() ?? null,
      approvedBy: null,
      description: `Nạp tiền qua ${deposit.gateway}`,
    };
  }

  toPortalView(deposit: Prisma.AgentDepositGetPayload<object>): AgentDepositPortalView {
    const gatewayResponse = deposit.gatewayResponse as Record<string, unknown>;
    return {
      id: deposit.id,
      paymentReference: deposit.paymentReference,
      gateway: deposit.gateway,
      amount: deposit.amount.toFixed(2),
      feeAmount: deposit.feeAmount.toFixed(2),
      netAmount: deposit.netAmount.toFixed(2),
      status: deposit.status,
      statusLabel: DEPOSIT_STATUS_LABELS[deposit.status],
      statusTone: depositStatusTone(deposit.status),
      paymentUrl:
        typeof gatewayResponse.paymentUrl === 'string'
          ? gatewayResponse.paymentUrl
          : typeof gatewayResponse.qr_url === 'string'
            ? gatewayResponse.qr_url
            : undefined,
      qrInfo: {
        qrUrl: gatewayResponse.qr_url ?? gatewayResponse.paymentUrl,
        bankInfo: gatewayResponse.bank_info,
        amount: gatewayResponse.amount ?? deposit.amount.toFixed(2),
      },
      transferContent:
        typeof gatewayResponse.transferContent === 'string'
          ? gatewayResponse.transferContent
          : typeof gatewayResponse.transfer_content === 'string'
            ? gatewayResponse.transfer_content
            : /^DH[0-9A-Z]{4,30}$/i.test(deposit.paymentReference)
              ? deposit.paymentReference
              : `CARDON ${deposit.paymentReference}`,
      expiresAt: deposit.expiresAt?.toISOString() ?? null,
      paidAt: deposit.paidAt?.toISOString() ?? null,
      creditedAt: deposit.creditedAt?.toISOString() ?? null,
      createdAt: deposit.createdAt.toISOString(),
      timeline: buildDepositTimeline(deposit),
    };
  }

  logActivity(
    userId: string,
    email: string | undefined,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    this.activityDispatcher.dispatch({
      eventType:
        action === 'create_deposit'
          ? SystemActivityEventType.WEBHOOK_RECEIVED
          : SystemActivityEventType.WEBHOOK_SUCCESS,
      eventCategory: SystemActivityEventCategory.FINANCE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_deposit',
      resourceId: userId,
      title: `Agent deposit ${action}`,
      description: `Agent deposit ${action}`,
      performedBy: userId,
      performedEmail: email ?? null,
      metadata: { action, ...metadata },
    });
  }

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
