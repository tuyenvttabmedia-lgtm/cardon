import { Injectable, NotFoundException } from '@nestjs/common';
import { LedgerEntryType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AgentStatementQueryDto } from '../dto/finance.dto';
import { FinanceRepository } from '../repositories/finance.repository';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';

const ZERO_BALANCE = {
  balance: '0.00',
  held: '0.00',
  available: '0.00',
};

@Injectable()
export class AgentStatementService {
  constructor(private readonly repository: FinanceRepository) {}

  async generate(agentId: string, query: AgentStatementQueryDto) {
    const agent = await this.repository.findAgentById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const range = assertFinanceDateRange(query.dateFrom, query.dateTo);

    const [priorEntry, entries] = await Promise.all([
      this.repository.findLastLedgerEntryBefore(agentId, range.from),
      this.repository.findLedgerEntriesForStatement(agentId, range.from, range.to),
    ]);

    const openingBalance = priorEntry
      ? {
          balance: priorEntry.afterBalance.toFixed(2),
          held: priorEntry.afterHeld.toFixed(2),
          available: priorEntry.afterBalance
            .sub(priorEntry.afterHeld)
            .toFixed(2),
        }
      : entries.length > 0
        ? {
            balance: entries[0].beforeBalance.toFixed(2),
            held: entries[0].beforeHeld.toFixed(2),
            available: entries[0].beforeBalance
              .sub(entries[0].beforeHeld)
              .toFixed(2),
          }
        : ZERO_BALANCE;
    let credits = new Decimal(0);
    let debits = new Decimal(0);
    let holds = new Decimal(0);
    let releases = new Decimal(0);

    for (const entry of entries) {
      switch (entry.type) {
        case LedgerEntryType.CREDIT:
          credits = credits.add(entry.amount);
          break;
        case LedgerEntryType.DEBIT:
          debits = debits.add(entry.amount);
          break;
        case LedgerEntryType.HOLD:
          holds = holds.add(entry.amount);
          break;
        case LedgerEntryType.RELEASE:
          releases = releases.add(entry.amount);
          break;
        default:
          break;
      }
    }

    const lastEntry = entries.at(-1);
    const closingBalance = lastEntry
      ? {
          balance: lastEntry.afterBalance.toFixed(2),
          held: lastEntry.afterHeld.toFixed(2),
          available: lastEntry.afterBalance.sub(lastEntry.afterHeld).toFixed(2),
        }
      : openingBalance;

    return {
      agentId,
      companyName: agent.companyName,
      period: {
        from: query.dateFrom,
        to: query.dateTo,
      },
      openingBalance,
      closingBalance,
      summary: {
        credits: credits.toFixed(2),
        debits: debits.toFixed(2),
        holds: holds.toFixed(2),
        releases: releases.toFixed(2),
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: entry.amount.toFixed(2),
        beforeBalance: entry.beforeBalance.toFixed(2),
        afterBalance: entry.afterBalance.toFixed(2),
        beforeHeld: entry.beforeHeld.toFixed(2),
        afterHeld: entry.afterHeld.toFixed(2),
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
      })),
      currency: 'VND' as const,
      source: 'ledger_entries' as const,
    };
  }
}
