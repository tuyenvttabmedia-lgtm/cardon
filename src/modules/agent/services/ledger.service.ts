import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerEntryType,
  LedgerReferenceType,
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AgentRepository } from '../repositories/agent.repository';
import { LedgerRepository } from '../repositories/ledger.repository';

export interface AgentBalanceSnapshot {
  balance: string;
  heldBalance: string;
  availableBalance: string;
  currency: 'VND';
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  async getBalance(agentId: string): Promise<AgentBalanceSnapshot> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return this.toSnapshot(agent.balance, agent.heldBalance);
  }

  async credit(
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    createdById?: string,
    description?: string,
  ) {
    this.assertPositive(amount, 'Credit amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      await this.agentRepository.lockForUpdate(agentId, tx);
      const agent = await this.agentRepository.findByIdInTransaction(agentId, tx);
      if (!agent) {
        throw new NotFoundException('Agent not found');
      }

      const afterBalance = agent.balance.add(amount);
      const afterHeld = agent.heldBalance;

      await this.agentRepository.updateBalancesInTransaction(
        agentId,
        { balance: afterBalance, heldBalance: afterHeld },
        tx,
      );

      return this.ledgerRepository.createEntry(
        {
          agentId,
          type: LedgerEntryType.CREDIT,
          beforeBalance: agent.balance,
          beforeHeld: agent.heldBalance,
          amount,
          afterBalance,
          afterHeld,
          referenceType,
          referenceId,
          description,
          createdById,
        },
        tx,
      );
    });
  }

  async debitFromAvailable(
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    createdById?: string,
    description?: string,
  ) {
    this.assertPositive(amount, 'Debit amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      await this.agentRepository.lockForUpdate(agentId, tx);
      const agent = await this.agentRepository.findByIdInTransaction(agentId, tx);
      if (!agent) {
        throw new NotFoundException('Agent not found');
      }

      const available = agent.balance.sub(agent.heldBalance);
      if (available.lt(amount)) {
        throw new BadRequestException('INSUFFICIENT_BALANCE');
      }

      const afterBalance = agent.balance.sub(amount);
      const afterHeld = agent.heldBalance;

      await this.agentRepository.updateBalancesInTransaction(
        agentId,
        { balance: afterBalance, heldBalance: afterHeld },
        tx,
      );

      return this.ledgerRepository.createEntry(
        {
          agentId,
          type: LedgerEntryType.DEBIT,
          beforeBalance: agent.balance,
          beforeHeld: agent.heldBalance,
          amount,
          afterBalance,
          afterHeld,
          referenceType,
          referenceId,
          description,
          createdById,
        },
        tx,
      );
    });
  }

  async hold(
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    this.assertPositive(amount, 'Hold amount must be positive');

    return this.prisma.$transaction(async (tx) =>
      this.holdInTransaction(
        tx,
        agentId,
        amount,
        referenceType,
        referenceId,
        description,
      ),
    );
  }

  holdInTransaction(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    return this.applyHold(tx, agentId, amount, referenceType, referenceId, description);
  }

  async debitFromHold(
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    this.assertPositive(amount, 'Debit amount must be positive');

    const entry = await this.prisma.$transaction(async (tx) =>
      this.debitFromHoldInTransaction(
        tx,
        agentId,
        amount,
        referenceType,
        referenceId,
        description,
      ),
    );

    await this.maybeNotifyLowBalance(agentId);
    return entry;
  }

  debitFromHoldInTransaction(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    return this.applyDebitFromHold(
      tx,
      agentId,
      amount,
      referenceType,
      referenceId,
      description,
    );
  }

  async release(
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    this.assertPositive(amount, 'Release amount must be positive');

    return this.prisma.$transaction(async (tx) =>
      this.releaseInTransaction(
        tx,
        agentId,
        amount,
        referenceType,
        referenceId,
        description,
      ),
    );
  }

  releaseInTransaction(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    return this.applyRelease(
      tx,
      agentId,
      amount,
      referenceType,
      referenceId,
      description,
    );
  }

  async getHistory(agentId: string) {
    return this.ledgerRepository.listByAgentId(agentId);
  }

  private async maybeNotifyLowBalance(agentId: string): Promise<void> {
    const snapshot = await this.getBalance(agentId);
    const available = new Decimal(snapshot.availableBalance);
    const threshold = new Decimal(
      this.configService.get<number>('agent.lowBalanceThreshold') ?? 100_000,
    );
    if (available.lte(threshold)) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.LOW_AGENT_BALANCE,
        eventCategory: SystemActivityEventCategory.FINANCE,
        severity: SystemActivitySeverity.WARNING,
        source: SystemActivitySource.SYSTEM,
        resource: 'agent',
        resourceId: agentId,
        resourceDisplay: agentId.slice(0, 8),
        title: 'Low Agent Balance',
        description: `Available ${snapshot.availableBalance} at or below threshold ${threshold.toFixed(2)}`,
        metadata: {
          agentId,
          availableBalance: snapshot.availableBalance,
          threshold: threshold.toFixed(2),
        },
      });

      await this.notificationService.notifyAgentLowBalance(
        agentId,
        snapshot.availableBalance,
      );
    }
  }

  private toSnapshot(balance: Decimal, heldBalance: Decimal): AgentBalanceSnapshot {
    const available = balance.sub(heldBalance);
    return {
      balance: balance.toFixed(2),
      heldBalance: heldBalance.toFixed(2),
      availableBalance: available.toFixed(2),
      currency: 'VND',
    };
  }

  private assertPositive(amount: Decimal, message: string) {
    if (amount.lte(0)) {
      throw new BadRequestException(message);
    }
  }

  private async applyHold(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    await this.agentRepository.lockForUpdate(agentId, tx);
    const agent = await this.agentRepository.findByIdInTransaction(agentId, tx);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const available = agent.balance.sub(agent.heldBalance);
    if (available.lt(amount)) {
      throw new BadRequestException('INSUFFICIENT_BALANCE');
    }

    const afterBalance = agent.balance;
    const afterHeld = agent.heldBalance.add(amount);

    await this.agentRepository.updateBalancesInTransaction(
      agentId,
      { balance: afterBalance, heldBalance: afterHeld },
      tx,
    );

    return this.ledgerRepository.createEntry(
      {
        agentId,
        type: LedgerEntryType.HOLD,
        beforeBalance: agent.balance,
        beforeHeld: agent.heldBalance,
        amount,
        afterBalance,
        afterHeld,
        referenceType,
        referenceId,
        description,
      },
      tx,
    );
  }

  private async applyDebitFromHold(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    await this.agentRepository.lockForUpdate(agentId, tx);
    const agent = await this.agentRepository.findByIdInTransaction(agentId, tx);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.heldBalance.lt(amount)) {
      throw new BadRequestException('Insufficient held balance for debit');
    }

    const afterBalance = agent.balance.sub(amount);
    const afterHeld = agent.heldBalance.sub(amount);

    await this.agentRepository.updateBalancesInTransaction(
      agentId,
      { balance: afterBalance, heldBalance: afterHeld },
      tx,
    );

    return this.ledgerRepository.createEntry(
      {
        agentId,
        type: LedgerEntryType.DEBIT,
        beforeBalance: agent.balance,
        beforeHeld: agent.heldBalance,
        amount,
        afterBalance,
        afterHeld,
        referenceType,
        referenceId,
        description,
      },
      tx,
    );
  }

  private async applyRelease(
    tx: Prisma.TransactionClient,
    agentId: string,
    amount: Decimal,
    referenceType: LedgerReferenceType,
    referenceId: string,
    description?: string,
  ) {
    await this.agentRepository.lockForUpdate(agentId, tx);
    const agent = await this.agentRepository.findByIdInTransaction(agentId, tx);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.heldBalance.lt(amount)) {
      throw new BadRequestException('Insufficient held balance to release');
    }

    const afterBalance = agent.balance;
    const afterHeld = agent.heldBalance.sub(amount);

    await this.agentRepository.updateBalancesInTransaction(
      agentId,
      { balance: afterBalance, heldBalance: afterHeld },
      tx,
    );

    return this.ledgerRepository.createEntry(
      {
        agentId,
        type: LedgerEntryType.RELEASE,
        beforeBalance: agent.balance,
        beforeHeld: agent.heldBalance,
        amount,
        afterBalance,
        afterHeld,
        referenceType,
        referenceId,
        description,
      },
      tx,
    );
  }
}
