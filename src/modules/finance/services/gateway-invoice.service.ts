import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { UpsertGatewayInvoiceDto } from '../dto/finance.dto';
import { FinanceRepository } from '../repositories/finance.repository';

function amountsMatch(a: Decimal, b: Decimal): boolean {
  return a.toFixed(2) === b.toFixed(2);
}

@Injectable()
export class GatewayInvoiceService {
  constructor(private readonly repository: FinanceRepository) {}

  list(skip = 0, take = 50) {
    return this.repository.listGatewayInvoices(skip, take).then((rows) =>
      rows.map((row) => this.mapRow(row)),
    );
  }

  get(id: string) {
    return this.repository.findGatewayInvoiceById(id).then((row) => {
      if (!row) throw new NotFoundException('Gateway invoice not found');
      return this.mapRow(row);
    });
  }

  async upsert(dto: UpsertGatewayInvoiceDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    const system = await this.repository.calculateGatewaySystemTotals({
      gatewayCode: dto.gatewayCode,
      periodStart,
      periodEnd,
    });

    const invoiceVolume = new Decimal(dto.totalVolume);
    const invoiceFee = new Decimal(dto.totalFee);
    const vatAmount = new Decimal(dto.vatAmount ?? '0');

    const matched =
      dto.totalTransactions === system.transactionCount &&
      amountsMatch(invoiceVolume, system.totalVolume) &&
      amountsMatch(invoiceFee, system.totalFee);

    const saved = await this.repository.upsertGatewayInvoice({
      gatewayCode: dto.gatewayCode,
      period: dto.period,
      periodStart,
      periodEnd,
      totalTransactions: dto.totalTransactions,
      totalVolume: invoiceVolume,
      totalFee: invoiceFee,
      vatAmount,
      invoiceNumber: dto.invoiceNumber ?? null,
      notes: dto.notes ?? null,
      systemTransactions: system.transactionCount,
      systemVolume: system.totalVolume,
      systemFee: system.totalFee,
      status: matched ? 'MATCHED' : 'DIFFERENCE',
    });

    return {
      ...this.mapRow(saved),
      comparison: {
        transactionDelta: dto.totalTransactions - system.transactionCount,
        volumeDelta: invoiceVolume.sub(system.totalVolume).toFixed(2),
        feeDelta: invoiceFee.sub(system.totalFee).toFixed(2),
      },
    };
  }

  private mapRow(row: {
    id: string;
    gatewayCode: string;
    period: string;
    periodStart: Date;
    periodEnd: Date;
    totalTransactions: number;
    totalVolume: Decimal;
    totalFee: Decimal;
    vatAmount: Decimal;
    invoiceNumber: string | null;
    status: string;
    systemTransactions: number | null;
    systemVolume: Decimal | null;
    systemFee: Decimal | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      gatewayCode: row.gatewayCode,
      period: row.period,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      totalTransactions: row.totalTransactions,
      totalVolume: row.totalVolume.toFixed(2),
      totalFee: row.totalFee.toFixed(2),
      vatAmount: row.vatAmount.toFixed(2),
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      systemTransactions: row.systemTransactions,
      systemVolume: row.systemVolume?.toFixed(2) ?? null,
      systemFee: row.systemFee?.toFixed(2) ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
