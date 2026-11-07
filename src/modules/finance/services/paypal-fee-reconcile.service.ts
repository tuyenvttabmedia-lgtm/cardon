import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentGatewayCode,
  PaymentRecordStatus,
  PaypalFeeMatchStatus,
  PaypalFeeMatchType,
  PaypalReportImportStatus,
  PaypalReportLineKind,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_PAYMENT_WHERE } from '../../payment/entities/payment.constants';
import {
  parsePaypalActivityCsv,
  sha256Hex,
} from '../entities/paypal-activity-csv';
import {
  buildPaypalFeeMatchDrafts,
  validateFeeNetConsistency,
  type ExistingActiveMatch,
} from '../entities/paypal-fee-match.engine';
import { FINANCE_AUDIT_ACTIONS } from '../entities/finance.constants';
import { FinanceAuditService } from './finance-audit.service';

const MAX_CSV_BYTES = 5 * 1024 * 1024;

@Injectable()
export class PaypalFeeReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAudit: FinanceAuditService,
  ) {}

  async importCsv(input: {
    adminId: string;
    filename: string;
    buffer: Buffer;
    periodFrom?: string;
    periodTo?: string;
  }) {
    if (!input.buffer?.length) {
      throw new BadRequestException('CSV file is required');
    }
    if (input.buffer.length > MAX_CSV_BYTES) {
      throw new BadRequestException('CSV file exceeds 5MB limit');
    }

    const fileHash = sha256Hex(input.buffer);
    const existing = await this.prisma.paypalReportImport.findUnique({
      where: { fileHash },
      include: {
        _count: { select: { lines: true, matches: true } },
      },
    });
    if (existing) {
      return {
        idempotent: true as const,
        import: this.mapImport(existing),
      };
    }

    const parsed = parsePaypalActivityCsv(input.buffer.toString('utf8'));
    if (!parsed.ok) {
      throw new BadRequestException(parsed.error);
    }

    for (const row of parsed.rows) {
      if (
        row.kind === PaypalReportLineKind.SALE_CAPTURE &&
        !validateFeeNetConsistency(row.gross, row.fee, row.net)
      ) {
        // Soft warning stored on line raw — do not reject whole file
        row.raw.__feeNetWarning = 'gross_fee_net_inconsistent';
      }
    }

    const saleCount = parsed.rows.filter((r) => r.kind === PaypalReportLineKind.SALE_CAPTURE).length;
    const nonSaleCount = parsed.rows.length - saleCount;

    const created = await this.prisma.$transaction(async (tx) => {
      const imp = await tx.paypalReportImport.create({
        data: {
          originalFilename: input.filename.slice(0, 255),
          fileHash,
          fileContent: input.buffer,
          headerJson: parsed.headers,
          headerProvisional: parsed.headerProvisional,
          rowCount: parsed.rows.length,
          saleCount,
          nonSaleCount,
          status: PaypalReportImportStatus.PARSED,
          importedBy: input.adminId,
          periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
          periodTo: input.periodTo ? new Date(input.periodTo) : null,
        },
      });

      if (parsed.rows.length > 0) {
        await tx.paypalReportLine.createMany({
          data: parsed.rows.map((row) => ({
            importId: imp.id,
            kind: row.kind,
            paypalTxnId: row.paypalTxnId,
            paypalReferenceId: row.paypalReferenceId,
            customId: row.customId,
            invoiceId: row.invoiceId,
            gross: new Decimal(row.gross),
            fee: new Decimal(row.fee),
            net: new Decimal(row.net),
            currency: row.currency,
            txnEventCode: row.txnEventCode,
            statusRaw: row.statusRaw,
            typeRaw: row.typeRaw,
            balanceImpact: row.balanceImpact,
            bookedAt: row.bookedAt,
            rawJson: row.raw as Prisma.InputJsonValue,
          })),
        });
      }

      return imp;
    });

    await this.financeAudit.recordPaypalEvent(
      input.adminId,
      FINANCE_AUDIT_ACTIONS.ESIM_PAYPAL_IMPORT_CREATED,
      created.id,
      {
        fileHash,
        filename: input.filename,
        rowCount: parsed.rows.length,
        saleCount,
        headerProvisional: true,
        idempotent: false,
      },
    );

    const matched = await this.runMatch(input.adminId, created.id);
    return { idempotent: false as const, import: matched };
  }

  async listImports(take = 50) {
    const rows = await this.prisma.paypalReportImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
      include: { _count: { select: { lines: true, matches: true } } },
    });
    return rows.map((r) => this.mapImport(r));
  }

  async getImport(id: string) {
    const row = await this.prisma.paypalReportImport.findUnique({
      where: { id },
      include: {
        _count: { select: { lines: true, matches: true } },
        matches: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
      },
    });
    if (!row) throw new NotFoundException('PayPal import not found');
    return {
      ...this.mapImport(row),
      matches: row.matches.map((m) => this.mapMatch(m)),
      summary: this.summarizeStatuses(row.matches.map((m) => m.matchStatus)),
    };
  }

  async runMatch(adminId: string, importId: string) {
    const imp = await this.prisma.paypalReportImport.findUnique({
      where: { id: importId },
      include: { lines: true },
    });
    if (!imp) throw new NotFoundException('PayPal import not found');

    const periodFrom = imp.periodFrom;
    const periodTo = imp.periodTo;

    const payments = await this.prisma.payment.findMany({
      where: {
        ...ACTIVE_PAYMENT_WHERE,
        gateway: PaymentGatewayCode.PAYPAL,
        productLane: 'ESIM',
        status: PaymentRecordStatus.SUCCESS,
        ...(periodFrom || periodTo
          ? {
              paidAt: {
                ...(periodFrom ? { gte: periodFrom } : {}),
                ...(periodTo ? { lte: periodTo } : {}),
              },
            }
          : {}),
      },
      include: {
        order: { select: { paymentFeeAmount: true, clientTrace: true } },
      },
      take: 10000,
    });

    const activeMatches = await this.prisma.paypalFeeMatch.findMany({
      where: { isActive: true, paymentId: { not: null } },
      include: { reportLine: { select: { paypalTxnId: true } } },
    });

    const existingActiveByPaymentId = new Map<string, ExistingActiveMatch>();
    const existingActiveByCaptureId = new Map<string, ExistingActiveMatch>();
    for (const m of activeMatches) {
      if (!m.paymentId) continue;
      const entry: ExistingActiveMatch = {
        paymentId: m.paymentId,
        reportLinePaypalTxnId: m.reportLine?.paypalTxnId ?? null,
        grossPaypal: m.grossPaypal?.toFixed(2) ?? null,
        feeActual: m.feeActual?.toFixed(2) ?? null,
        matchStatus: m.matchStatus,
      };
      existingActiveByPaymentId.set(m.paymentId, entry);
      if (m.reportLine?.paypalTxnId) {
        existingActiveByCaptureId.set(m.reportLine.paypalTxnId, entry);
      }
    }

    const duplicateTxnIds = new Set<string>();
    const txnCounts = new Map<string, number>();
    for (const line of imp.lines) {
      if (line.kind !== PaypalReportLineKind.SALE_CAPTURE) continue;
      const n = (txnCounts.get(line.paypalTxnId) ?? 0) + 1;
      txnCounts.set(line.paypalTxnId, n);
      if (n > 1) duplicateTxnIds.add(line.paypalTxnId);
    }

    const drafts = buildPaypalFeeMatchDrafts({
      lines: imp.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        paypalTxnId: l.paypalTxnId,
        customId: l.customId,
        gross: l.gross.toFixed(2),
        fee: l.fee.toFixed(2),
        net: l.net.toFixed(2),
        currency: l.currency,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        paymentReference: p.paymentReference,
        gatewayTransactionId: p.gatewayTransactionId,
        amount: p.amount.toFixed(2),
        currency: p.currency,
        feeEstimated: p.order.paymentFeeAmount?.toFixed(2) ?? '0.00',
        paidAt: p.paidAt,
      })),
      duplicateTxnIds,
      existingActiveByPaymentId,
      existingActiveByCaptureId,
    });

    await this.prisma.$transaction(async (tx) => {
      // Deactivate prior auto matches for this import only (re-run), keep other imports' active
      await tx.paypalFeeMatch.updateMany({
        where: { importId, matchType: PaypalFeeMatchType.AUTO },
        data: { isActive: false },
      });

      for (const d of drafts) {
        const activate =
          d.paymentId != null &&
          (d.matchStatus === PaypalFeeMatchStatus.MATCHED ||
            d.matchStatus === PaypalFeeMatchStatus.AMOUNT_MISMATCH ||
            d.matchStatus === PaypalFeeMatchStatus.CURRENCY_MISMATCH ||
            d.matchStatus === PaypalFeeMatchStatus.MANUAL_MATCHED) &&
          !existingActiveByPaymentId.has(d.paymentId);

        // NEEDS_REVIEW never becomes the sole active replacement
        const isActive =
          activate && d.matchStatus !== PaypalFeeMatchStatus.NEEDS_REVIEW
            ? true
            : d.paymentId == null &&
                (d.matchStatus === PaypalFeeMatchStatus.MISSING_LOCAL ||
                  d.matchStatus === PaypalFeeMatchStatus.DUPLICATE_CSV ||
                  d.matchStatus === PaypalFeeMatchStatus.NON_SALE)
              ? true
              : d.matchStatus === PaypalFeeMatchStatus.MISSING_GATEWAY
                ? true
                : activate;

        await tx.paypalFeeMatch.create({
          data: {
            importId,
            paymentId: d.paymentId,
            reportLineId: d.reportLineId,
            matchStatus: d.matchStatus,
            matchType: PaypalFeeMatchType.AUTO,
            isActive:
              d.matchStatus === PaypalFeeMatchStatus.NEEDS_REVIEW
                ? false
                : Boolean(isActive),
            grossCardon: d.grossCardon != null ? new Decimal(d.grossCardon) : null,
            grossPaypal: d.grossPaypal != null ? new Decimal(d.grossPaypal) : null,
            feeEstimated: d.feeEstimated != null ? new Decimal(d.feeEstimated) : null,
            feeActual: d.feeActual != null ? new Decimal(d.feeActual) : null,
            netPaypal: d.netPaypal != null ? new Decimal(d.netPaypal) : null,
            grossDelta: d.grossDelta != null ? new Decimal(d.grossDelta) : null,
            feeDelta: d.feeDelta != null ? new Decimal(d.feeDelta) : null,
            currency: d.currency,
            note: d.note ?? null,
            actorId: adminId,
          },
        });

        if (isActive && d.paymentId && d.matchStatus === PaypalFeeMatchStatus.MATCHED) {
          existingActiveByPaymentId.set(d.paymentId, {
            paymentId: d.paymentId,
            reportLinePaypalTxnId: null,
            grossPaypal: d.grossPaypal,
            feeActual: d.feeActual,
            matchStatus: d.matchStatus,
          });
        }
      }

      await tx.paypalReportImport.update({
        where: { id: importId },
        data: { status: PaypalReportImportStatus.MATCHED },
      });
    });

    await this.financeAudit.recordPaypalEvent(
      adminId,
      FINANCE_AUDIT_ACTIONS.ESIM_PAYPAL_MATCH_RUN,
      importId,
      { draftCount: drafts.length },
    );

    return this.getImport(importId);
  }

  async listMatches(query: {
    status?: PaypalFeeMatchStatus;
    importId?: string;
    take?: number;
  }) {
    const rows = await this.prisma.paypalFeeMatch.findMany({
      where: {
        isActive: true,
        ...(query.status ? { matchStatus: query.status } : {}),
        ...(query.importId ? { importId: query.importId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 100, 500),
      include: {
        payment: { select: { paymentReference: true, amount: true, currency: true } },
        reportLine: {
          select: {
            paypalTxnId: true,
            customId: true,
            kind: true,
            typeRaw: true,
          },
        },
      },
    });
    return rows.map((m) => ({
      ...this.mapMatch(m),
      paymentReference: m.payment?.paymentReference ?? null,
      paypalTxnId: m.reportLine?.paypalTxnId ?? null,
      customId: m.reportLine?.customId ?? null,
      lineKind: m.reportLine?.kind ?? null,
      typeRaw: m.reportLine?.typeRaw ?? null,
    }));
  }

  async resolveManual(input: {
    adminId: string;
    matchId: string;
    paymentId: string;
    note?: string;
  }) {
    const match = await this.prisma.paypalFeeMatch.findUnique({
      where: { id: input.matchId },
      include: { reportLine: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (!match.reportLineId || !match.reportLine) {
      throw new BadRequestException('Manual match requires a report line');
    }
    if (match.reportLine.kind !== PaypalReportLineKind.SALE_CAPTURE) {
      throw new BadRequestException('Only SALE_CAPTURE lines can be manually matched to revenue');
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        id: input.paymentId,
        ...ACTIVE_PAYMENT_WHERE,
        gateway: PaymentGatewayCode.PAYPAL,
        productLane: 'ESIM',
        status: PaymentRecordStatus.SUCCESS,
      },
      include: { order: { select: { paymentFeeAmount: true } } },
    });
    if (!payment) throw new NotFoundException('PayPal eSIM SUCCESS payment not found');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.paypalFeeMatch.updateMany({
        where: { paymentId: payment.id, isActive: true },
        data: { isActive: false },
      });
      await tx.paypalFeeMatch.update({
        where: { id: match.id },
        data: { isActive: false },
      });

      return tx.paypalFeeMatch.create({
        data: {
          importId: match.importId,
          paymentId: payment.id,
          reportLineId: match.reportLineId,
          matchStatus: PaypalFeeMatchStatus.MANUAL_MATCHED,
          matchType: PaypalFeeMatchType.MANUAL,
          isActive: true,
          grossCardon: payment.amount,
          grossPaypal: match.reportLine!.gross,
          feeEstimated: payment.order.paymentFeeAmount,
          feeActual: match.reportLine!.fee,
          netPaypal: match.reportLine!.net,
          grossDelta: new Decimal(match.reportLine!.gross.toFixed(2)).minus(payment.amount),
          feeDelta: new Decimal(match.reportLine!.fee.toFixed(2)).minus(
            payment.order.paymentFeeAmount,
          ),
          currency: match.reportLine!.currency,
          actorId: input.adminId,
          note: input.note?.slice(0, 512) ?? 'manual match',
        },
      });
    });

    await this.financeAudit.recordPaypalEvent(
      input.adminId,
      FINANCE_AUDIT_ACTIONS.ESIM_PAYPAL_MATCH_RESOLVED,
      result.id,
      {
        paymentId: payment.id,
        reportLineId: match.reportLineId,
        previousMatchId: match.id,
      },
    );

    return this.mapMatch(result);
  }

  async exportMatchesCsv(importId?: string): Promise<string> {
    const rows = await this.listMatches({ importId, take: 5000 });
    const header = [
      'matchStatus',
      'matchType',
      'paymentReference',
      'paypalTxnId',
      'customId',
      'grossCardon',
      'grossPaypal',
      'feeEstimated',
      'feeActual',
      'netPaypal',
      'grossDelta',
      'feeDelta',
      'currency',
      'lineKind',
      'note',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.matchStatus,
          r.matchType,
          r.paymentReference ?? '',
          r.paypalTxnId ?? '',
          r.customId ?? '',
          r.grossCardon ?? '',
          r.grossPaypal ?? '',
          r.feeEstimated ?? '',
          r.feeActual ?? '',
          r.netPaypal ?? '',
          r.grossDelta ?? '',
          r.feeDelta ?? '',
          r.currency,
          r.lineKind ?? '',
          csvEscape(r.note ?? ''),
        ].join(','),
      );
    }
    return lines.join('\n');
  }

  private summarizeStatuses(statuses: PaypalFeeMatchStatus[]) {
    const summary: Record<string, number> = {};
    for (const s of statuses) {
      summary[s] = (summary[s] ?? 0) + 1;
    }
    return summary;
  }

  private mapImport(
    row: {
      id: string;
      originalFilename: string;
      fileHash: string;
      rowCount: number;
      saleCount: number;
      nonSaleCount: number;
      status: PaypalReportImportStatus;
      headerProvisional: boolean;
      headerJson: Prisma.JsonValue;
      periodFrom: Date | null;
      periodTo: Date | null;
      errorSummary: string | null;
      importedBy: string;
      createdAt: Date;
      _count?: { lines: number; matches: number };
    },
  ) {
    return {
      id: row.id,
      originalFilename: row.originalFilename,
      fileHash: row.fileHash,
      rowCount: row.rowCount,
      saleCount: row.saleCount,
      nonSaleCount: row.nonSaleCount,
      status: row.status,
      headerProvisional: row.headerProvisional,
      headers: row.headerJson,
      periodFrom: row.periodFrom?.toISOString() ?? null,
      periodTo: row.periodTo?.toISOString() ?? null,
      errorSummary: row.errorSummary,
      importedBy: row.importedBy,
      createdAt: row.createdAt.toISOString(),
      lineCount: row._count?.lines ?? row.rowCount,
      matchCount: row._count?.matches ?? 0,
      note: row.headerProvisional
        ? 'Header map is provisional (PayPal docs). Validate against KEYON Activity Download sample.'
        : null,
    };
  }

  private mapMatch(m: {
    id: string;
    paymentId: string | null;
    reportLineId: string | null;
    importId: string;
    matchStatus: PaypalFeeMatchStatus;
    matchType: PaypalFeeMatchType;
    isActive: boolean;
    grossCardon: Decimal | null;
    grossPaypal: Decimal | null;
    feeEstimated: Decimal | null;
    feeActual: Decimal | null;
    netPaypal: Decimal | null;
    grossDelta: Decimal | null;
    feeDelta: Decimal | null;
    currency: string;
    note: string | null;
    actorId: string | null;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      paymentId: m.paymentId,
      reportLineId: m.reportLineId,
      importId: m.importId,
      matchStatus: m.matchStatus,
      matchType: m.matchType,
      isActive: m.isActive,
      grossCardon: m.grossCardon?.toFixed(2) ?? null,
      grossPaypal: m.grossPaypal?.toFixed(2) ?? null,
      feeEstimated: m.feeEstimated?.toFixed(2) ?? null,
      feeActual: m.feeActual?.toFixed(2) ?? null,
      netPaypal: m.netPaypal?.toFixed(2) ?? null,
      grossDelta: m.grossDelta?.toFixed(2) ?? null,
      feeDelta: m.feeDelta?.toFixed(2) ?? null,
      currency: m.currency,
      note: m.note,
      actorId: m.actorId,
      createdAt: m.createdAt.toISOString(),
    };
  }
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
