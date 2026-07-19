import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  LedgerEntry,
  LedgerEntryType,
  LedgerReferenceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface CreateLedgerEntryInput {
  agentId: string;
  type: LedgerEntryType;
  beforeBalance: Prisma.Decimal;
  beforeHeld: Prisma.Decimal;
  amount: Prisma.Decimal;
  afterBalance: Prisma.Decimal;
  afterHeld: Prisma.Decimal;
  referenceType: LedgerReferenceType;
  referenceId: string;
  description?: string;
  createdById?: string;
}

@Injectable()
export class LedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  createEntry(
    data: CreateLedgerEntryInput,
    tx: Prisma.TransactionClient,
  ): Promise<LedgerEntry> {
    return tx.ledgerEntry.create({
      data: {
        agentId: data.agentId,
        type: data.type,
        beforeBalance: data.beforeBalance,
        beforeHeld: data.beforeHeld,
        amount: data.amount,
        afterBalance: data.afterBalance,
        afterHeld: data.afterHeld,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        description: data.description,
        createdById: data.createdById,
        deletedAt: null,
      },
    });
  }

  listByAgentId(agentId: string, take = 50): Promise<LedgerEntry[]> {
    return this.prisma.ledgerEntry.findMany({
      where: { agentId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /** Ledger is append-only — mutations forbidden at repository layer. */
  updateEntry(): never {
    throw new ForbiddenException('Ledger entries are immutable');
  }

  /** Ledger is append-only — deletions forbidden at repository layer. */
  deleteEntry(): never {
    throw new ForbiddenException('Ledger entries are immutable');
  }
}
