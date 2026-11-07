import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FxRateStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../database/prisma.service';
import {
  MANUAL_USD_VND_SOURCE,
  fxBand,
  parseManualFxRate,
  selectCheckoutFx,
} from './fx-rate.rules';

export interface FxRateView {
  id: string;
  sourceCode: string;
  rate: string;
  status: FxRateStatus;
  bandResult: string | null;
  observedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedById: string | null;
  publishedByName: string | null;
  maxStalenessSeconds: number | null;
  createdAt: string;
  usedByOrders: number;
}

@Injectable()
export class FxRateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<{ current: FxRateView | null; rates: FxRateView[] }> {
    const rates = await this.prisma.fxRate.findMany({
      where: { sourceCode: MANUAL_USD_VND_SOURCE },
      include: { source: true, _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const actors = await this.actorNames(rates.map((row) => row.publishedById));
    const views = rates.map((row) => toView(row, actors.get(row.publishedById ?? '') ?? null));
    const now = new Date();
    const selected = selectCheckoutFx(
      rates.map((row) => ({
        id: row.id,
        status: row.status,
        rate: row.rate,
        observedAt: row.observedAt,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        maxStalenessSeconds: row.source.maxStalenessSeconds,
        baseCurrency: row.source.baseCurrency,
        quoteCurrency: row.source.quoteCurrency,
      })),
      now,
    );
    return {
      current: selected.ok ? views.find((row) => row.id === selected.row.id) ?? null : null,
      rates: views,
    };
  }

  async createDraft(input: {
    rate: string;
    observedAt: string;
    maxStalenessSeconds: number;
  }): Promise<FxRateView> {
    const parsed = parseManualFxRate(input.rate);
    if (!parsed.ok) throw new BadRequestException('FX rate rejected: INVALID_RATE');
    const observedAt = new Date(input.observedAt);
    if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('FX rate rejected: INVALID_OBSERVED_AT');
    }
    if (!Number.isInteger(input.maxStalenessSeconds) || input.maxStalenessSeconds <= 0) {
      throw new BadRequestException('FX rate rejected: INVALID_STALENESS');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureSource(tx, input.maxStalenessSeconds);
      return tx.fxRate.create({
        data: {
          sourceCode: MANUAL_USD_VND_SOURCE,
          rate: parsed.rate,
          observedAt,
          effectiveFrom: observedAt,
          status: FxRateStatus.DRAFT,
          bandResult: `HOLD:${input.maxStalenessSeconds}`,
        },
        include: { source: true, _count: { select: { orders: true } } },
      });
    });
    return toView(created, null);
  }

  /**
   * Drafts inside the 2% band become EFFECTIVE.
   * Drafts outside the band become PENDING_REVIEW and are not published.
   * An already approved PENDING_REVIEW row is published by approve().
   */
  async publish(id: string, actorId: string): Promise<FxRateView> {
    return this.transition(id, actorId, false);
  }

  async approve(id: string, actorId: string): Promise<FxRateView> {
    return this.transition(id, actorId, true);
  }

  async rejectEdit(id: string): Promise<void> {
    const used = await this.prisma.order.count({
      where: { fxRateId: id, deletedAt: null },
    });
    if (used > 0) {
      throw new BadRequestException('FX rate already used by an order cannot be edited');
    }
    const row = await this.prisma.fxRate.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('FX rate not found');
    if (row.status !== FxRateStatus.DRAFT) {
      throw new BadRequestException('Published FX history cannot be edited; create a new rate');
    }
  }

  private async transition(id: string, actorId: string, approving: boolean): Promise<FxRateView> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fx-usd-vnd'}))`;
      const row = await tx.fxRate.findFirst({
        where: { id, sourceCode: MANUAL_USD_VND_SOURCE },
        include: { source: true },
      });
      if (!row) throw new NotFoundException('FX rate not found');
      if (row.status !== FxRateStatus.DRAFT && row.status !== FxRateStatus.PENDING_REVIEW) {
        throw new BadRequestException('Only a draft or a rate waiting for approval can be published');
      }
      const current = await tx.fxRate.findFirst({
        where: {
          sourceCode: MANUAL_USD_VND_SOURCE,
          status: FxRateStatus.EFFECTIVE,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      const band = fxBand(current?.rate ?? null, row.rate);
      if (band === 'OVER_BAND' && !(approving && row.status === FxRateStatus.PENDING_REVIEW)) {
        return tx.fxRate.update({
          where: { id: row.id },
          data: { status: FxRateStatus.PENDING_REVIEW },
          include: { source: true, _count: { select: { orders: true } } },
        });
      }
      const now = new Date();
      const requestedStaleness = readHold(row.bandResult);
      if (requestedStaleness) {
        await tx.fxRateSource.update({
          where: { code: MANUAL_USD_VND_SOURCE },
          data: { maxStalenessSeconds: requestedStaleness, status: 'APPROVED' },
        });
      }
      if (current) {
        await tx.fxRate.update({
          where: { id: current.id },
          data: { status: FxRateStatus.SUPERSEDED, effectiveTo: now },
        });
      }
      await tx.fxRate.update({
        where: { id: row.id },
        data: {
          status: FxRateStatus.EFFECTIVE,
          bandResult: band,
          effectiveFrom: now,
          effectiveTo: null,
          publishedById: actorId,
        },
      });
      return tx.fxRate.findFirstOrThrow({
        where: { id: row.id },
        include: { source: true, _count: { select: { orders: true } } },
      });
    });
    return toView(updated, await this.actorLabel(updated.publishedById));
  }

  /** Closes a draft or a rate waiting for review. Does not change the entered number. */
  async reject(id: string, actorId: string): Promise<FxRateView> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fx-usd-vnd'}))`;
      const row = await tx.fxRate.findFirst({
        where: { id, sourceCode: MANUAL_USD_VND_SOURCE },
      });
      if (!row) throw new NotFoundException('FX rate not found');
      if (row.status !== FxRateStatus.DRAFT && row.status !== FxRateStatus.PENDING_REVIEW) {
        throw new BadRequestException('Only a draft or a rate waiting for approval can be rejected');
      }
      const used = await tx.order.count({ where: { fxRateId: id, deletedAt: null } });
      if (used > 0) {
        throw new BadRequestException('FX rate already used by an order cannot be edited');
      }
      await tx.fxRate.update({
        where: { id },
        data: { status: FxRateStatus.REJECTED, publishedById: actorId },
      });
      return tx.fxRate.findFirstOrThrow({
        where: { id },
        include: { source: true, _count: { select: { orders: true } } },
      });
    });
    return toView(updated, await this.actorLabel(actorId));
  }

  private async actorLabel(id: string | null): Promise<string | null> {
    if (!id) return null;
    const names = await this.actorNames([id]);
    return names.get(id) ?? null;
  }

  private async actorNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true, email: true },
    });
    return new Map(users.map((user) => [user.id, user.fullName || user.email]));
  }

  private async ensureSource(tx: Prisma.TransactionClient, maxStalenessSeconds: number) {
    await tx.fxRateSource.upsert({
      where: { code: MANUAL_USD_VND_SOURCE },
      create: {
        code: MANUAL_USD_VND_SOURCE,
        status: 'APPROVED',
        baseCurrency: 'USD',
        quoteCurrency: 'VND',
        maxStalenessSeconds,
      },
      update: {},
    });
  }
}

function readHold(bandResult: string | null): number | null {
  const match = /^HOLD:(\d+)$/.exec(bandResult ?? '');
  if (!match) return null;
  const seconds = Number(match[1]);
  return seconds > 0 ? seconds : null;
}

function toView(row: {
  id: string;
  sourceCode: string;
  rate: Decimal;
  status: FxRateStatus;
  bandResult: string | null;
  observedAt: Date;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedById: string | null;
  createdAt: Date;
  source: { maxStalenessSeconds: number | null };
  _count: { orders: number };
}, actorName: string | null): FxRateView {
  return {
    id: row.id,
    sourceCode: row.sourceCode,
    rate: row.rate.toString(),
    status: row.status,
    bandResult: row.bandResult?.startsWith('HOLD:') ? null : row.bandResult,
    observedAt: row.observedAt.toISOString(),
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    publishedById: row.publishedById,
    publishedByName: actorName,
    maxStalenessSeconds: readHold(row.bandResult) ?? row.source.maxStalenessSeconds,
    createdAt: row.createdAt.toISOString(),
    usedByOrders: row._count.orders,
  };
}
