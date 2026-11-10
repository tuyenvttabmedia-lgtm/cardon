import { Injectable, Logger } from '@nestjs/common';
import {
  EsimAttemptOutcome,
  EsimProviderMode,
  FulfillmentStatus,
  OrderEventType,
  OrderPaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { persistAdminTestFulfillmentSkip } from './esim-admin-test.rules';
import { randomUUID } from 'crypto';

export interface EsimQuoteRow {
  quoteId: string;
  orderItemId: string;
  providerId: string;
  providerProductCode: string;
  providerMode: EsimProviderMode;
}

export interface OpenCreateInsert {
  attemptId: string;
  requestId: string;
}

@Injectable()
export class EsimFulfillmentRepository {
  private readonly logger = new Logger(EsimFulfillmentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  skipAdminTestFulfillment(orderId: string): Promise<boolean> {
    return persistAdminTestFulfillmentSkip(this.prisma as never, orderId);
  }

  findQuoteByOrderId(orderId: string): Promise<EsimQuoteRow | null> {
    return this.prisma.esimOrderQuote
      .findFirst({
        where: { orderItem: { orderId } },
        select: {
          id: true,
          orderItemId: true,
          providerId: true,
          providerProductCode: true,
          providerMode: true,
        },
      })
      .then((row) =>
        row
          ? {
              quoteId: row.id,
              orderItemId: row.orderItemId,
              providerId: row.providerId,
              providerProductCode: row.providerProductCode,
              providerMode: row.providerMode,
            }
          : null,
      );
  }

  async getOrderPaymentFulfillment(orderId: string): Promise<{
    paymentStatus: OrderPaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
  } | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentStatus: true, fulfillmentStatus: true },
    });
    return row ?? null;
  }

  async getOrderFulfillmentStatus(orderId: string): Promise<FulfillmentStatus | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { fulfillmentStatus: true },
    });
    return row?.fulfillmentStatus ?? null;
  }

  /**
   * Conditional PENDING|WAITING_ADMIN_RETRY → PROCESSING.
   * WAITING_ADMIN_RETRY is allowed only after a definite no-CREATE failure released openGuard.
   */
  async claimFirstCreate(orderId: string): Promise<boolean> {
    const updated = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        fulfillmentStatus: {
          in: [FulfillmentStatus.PENDING, FulfillmentStatus.WAITING_ADMIN_RETRY],
        },
      },
      data: { fulfillmentStatus: FulfillmentStatus.PROCESSING },
    });
    return updated.count === 1;
  }

  hasProfile(orderItemId: string): Promise<boolean> {
    return this.prisma.esimProfile
      .findUnique({ where: { orderItemId }, select: { id: true } })
      .then((row) => row !== null);
  }

  hasOpenAttempt(orderItemId: string): Promise<boolean> {
    return this.prisma.esimProviderAttempt
      .findFirst({
        where: { orderItemId, openGuard: orderItemId },
        select: { id: true },
      })
      .then((row) => row !== null);
  }

  findOpenCreate(orderItemId: string): Promise<{
    attemptId: string;
    outcome: EsimAttemptOutcome;
    providerReference: string | null;
    openGuard: string | null;
    createdAt: Date;
    safeResponseMeta?: Record<string, unknown> | null;
  } | null> {
    return this.prisma.esimProviderAttempt
      .findFirst({
        where: { orderItemId, operation: 'CREATE', openGuard: orderItemId },
        select: {
          id: true,
          outcome: true,
          providerReference: true,
          openGuard: true,
          createdAt: true,
          safeResponseMeta: true,
        },
      })
      .then((row) =>
        row
          ? {
              attemptId: row.id,
              outcome: row.outcome,
              providerReference: row.providerReference,
              openGuard: row.openGuard,
              createdAt: row.createdAt,
              safeResponseMeta:
                row.safeResponseMeta && typeof row.safeResponseMeta === 'object'
                  ? (row.safeResponseMeta as Record<string, unknown>)
                  : null,
            }
          : null,
      );
  }

  /**
   * PROCESSING + open CREATE guard matching the item + stored provider reference.
   * Open QUERY locks are excluded in SQL before LIMIT. Read-only.
   */
  async listQueryOpenRecoveryOrderIds(take = 20): Promise<string[]> {
    const limit =
      typeof take === 'number' && Number.isFinite(take)
        ? Math.min(20, Math.max(1, Math.trunc(take)))
        : 20;
    const rows = await this.prisma.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
      SELECT oi.order_id
      FROM esim_provider_attempts AS c
      INNER JOIN order_items AS oi ON oi.id = c.order_item_id
      INNER JOIN orders AS o ON o.id = oi.order_id
      INNER JOIN esim_order_quotes AS q ON q.order_item_id = oi.id
      LEFT JOIN esim_profiles AS p ON p.order_item_id = oi.id
      WHERE c.operation = CAST('CREATE' AS "EsimAttemptOperation")
        AND c.open_guard = oi.id
        AND c.provider_reference IS NOT NULL
        AND length(btrim(c.provider_reference)) > 0
        AND length(c.provider_reference) <= 128
        AND q.provider_mode = CAST('LIVE' AS "EsimProviderMode")
        AND o.fulfillment_status IN (
          CAST('PROCESSING' AS "FulfillmentStatus"),
          CAST('NEED_MANUAL_REVIEW' AS "FulfillmentStatus")
        )
        AND p.id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM esim_provider_attempts AS qry
          WHERE qry.operation = CAST('QUERY' AS "EsimAttemptOperation")
            AND qry.outcome = CAST('SENT' AS "EsimAttemptOutcome")
            AND qry.order_item_id = c.order_item_id
            AND qry.open_guard = c.id
        )
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => row.order_id);
  }

  /**
   * PAID + PENDING eSIM orders older than `olderThanMs` with no open CREATE guard.
   * Safe to re-enqueue: claimFirstCreate + openGuard still dedupe CREATE.
   */
  async listPaidPendingStuckOrderIds(olderThanMs = 5 * 60_000, take = 20): Promise<string[]> {
    const limit =
      typeof take === 'number' && Number.isFinite(take)
        ? Math.min(20, Math.max(1, Math.trunc(take)))
        : 20;
    const cutoff = new Date(Date.now() - Math.max(60_000, olderThanMs));
    const rows = await this.prisma.$queryRaw<Array<{ order_id: string }>>(Prisma.sql`
      SELECT o.id AS order_id
      FROM orders AS o
      INNER JOIN order_items AS oi ON oi.order_id = o.id
      INNER JOIN product_variants AS pv ON pv.id = oi.variant_id
      INNER JOIN esim_order_quotes AS q ON q.order_item_id = oi.id
      LEFT JOIN esim_profiles AS p ON p.order_item_id = oi.id
      WHERE o.deleted_at IS NULL
        AND o.payment_status = CAST('PAID' AS "OrderPaymentStatus")
        AND o.fulfillment_status = CAST('PENDING' AS "FulfillmentStatus")
        AND pv.type = CAST('ESIM' AS "ProductVariantType")
        AND p.id IS NULL
        AND o.updated_at <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM esim_provider_attempts AS c
          WHERE c.order_item_id = oi.id
            AND c.operation = CAST('CREATE' AS "EsimAttemptOperation")
            AND c.open_guard = oi.id
        )
      ORDER BY o.updated_at ASC, o.id ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => row.order_id);
  }

  /**
   * Definite no-CREATE (request never accepted / never left this host).
   * Releases openGuard so admin/cron can enqueue a fresh CREATE.
   */
  async markDefiniteNoCreate(
    attemptId: string,
    orderItemId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.esimProfile.findUnique({
        where: { orderItemId },
        select: { id: true },
      });
      if (profile) return;
      const item = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        select: { orderId: true },
      });
      if (!item) return;
      const order = await tx.order.findUnique({
        where: { id: item.orderId },
        select: { fulfillmentStatus: true },
      });
      if (!order || order.fulfillmentStatus === FulfillmentStatus.COMPLETED) return;
      const attempt = await tx.esimProviderAttempt.findUnique({
        where: { id: attemptId },
        select: { outcome: true, providerReference: true },
      });
      if (attempt?.outcome === EsimAttemptOutcome.PROFILE_SAVED) return;
      // Never release a CREATE that already stored a provider reference.
      if (attempt?.providerReference && attempt.providerReference.trim()) {
        await tx.esimProviderAttempt.update({
          where: { id: attemptId },
          data: {
            outcome: EsimAttemptOutcome.UNCONFIRMED,
            errorCode: 'UNCONFIRMED',
            errorMessage: errorMessage.trim().slice(0, 240) || 'Outcome unclear. No second CREATE.',
            safeResponseMeta: { outcome: 'unconfirmed' },
          },
        });
        await tx.order.updateMany({
          where: {
            id: item.orderId,
            fulfillmentStatus: {
              in: [
                FulfillmentStatus.PENDING,
                FulfillmentStatus.PROCESSING,
                FulfillmentStatus.WAITING_ADMIN_RETRY,
                FulfillmentStatus.NEED_MANUAL_REVIEW,
              ],
            },
          },
          data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
        });
        return;
      }
      await tx.esimProviderAttempt.update({
        where: { id: attemptId },
        data: {
          outcome: EsimAttemptOutcome.REJECTED_DEFINITIVE,
          openGuard: null,
          completedAt: new Date(),
          errorCode: 'DEFINITE_NO_CREATE',
          errorMessage: errorMessage.trim().slice(0, 240) || 'Definite no CREATE. Admin may retry.',
          safeResponseMeta: { outcome: 'definite_no_create', retryable: true },
        },
      });
      await tx.order.updateMany({
        where: {
          id: item.orderId,
          fulfillmentStatus: {
            in: [
              FulfillmentStatus.PENDING,
              FulfillmentStatus.PROCESSING,
              FulfillmentStatus.NEED_MANUAL_REVIEW,
            ],
          },
        },
        data: { fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY },
      });
    });
  }

  async insertOpenCreate(
    quote: EsimQuoteRow,
  ): Promise<OpenCreateInsert | 'conflict'> {
    const attemptId = randomUUID();
    const requestId = `esim-${quote.orderItemId}-${attemptId}`;
    try {
      await this.prisma.esimProviderAttempt.create({
        data: {
          id: attemptId,
          orderItemId: quote.orderItemId,
          quoteId: quote.quoteId,
          requestId,
          operation: 'CREATE',
          outcome: EsimAttemptOutcome.SENT,
          openGuard: quote.orderItemId,
          safeRequestMeta: {
            providerProductCode: quote.providerProductCode,
            providerMode: quote.providerMode,
            source: quote.providerMode === EsimProviderMode.LIVE ? 'airalo' : 'mock',
            testData: quote.providerMode !== EsimProviderMode.LIVE,
          },
          safeResponseMeta: {},
        },
      });
      return { attemptId, requestId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'conflict';
      }
      throw error;
    }
  }

  async saveProfile(input: {
    orderItemId: string;
    attemptId: string;
    installSecretEnc: string;
    iccid?: string | null;
    testData?: boolean;
    source?: 'airalo' | 'mock';
  }): Promise<void> {
    const iccid =
      typeof input.iccid === 'string' && input.iccid.trim().length >= 10
        ? input.iccid.trim().slice(0, 32)
        : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.esimProfile.create({
        data: {
          orderItemId: input.orderItemId,
          attemptId: input.attemptId,
          installSecretEnc: input.installSecretEnc,
          ...(iccid ? { iccid } : {}),
        },
      });
      const current = await tx.esimProviderAttempt.findUnique({
        where: { id: input.attemptId },
        select: { safeResponseMeta: true },
      });
      const previous =
        current?.safeResponseMeta && typeof current.safeResponseMeta === 'object'
          ? (current.safeResponseMeta as Record<string, unknown>)
          : {};
      await tx.esimProviderAttempt.update({
        where: { id: input.attemptId },
        data: {
          outcome: EsimAttemptOutcome.PROFILE_SAVED,
          openGuard: null,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
          safeResponseMeta: {
            ...previous,
            stored: true,
            testData: input.testData === true,
            source: input.source ?? (input.testData ? 'mock' : 'airalo'),
          },
        },
      });
      const item = await tx.orderItem.findUnique({
        where: { id: input.orderItemId },
        select: { orderId: true },
      });
      if (item) {
        await tx.order.update({
          where: { id: item.orderId },
          data: { fulfillmentStatus: FulfillmentStatus.COMPLETED },
        });
      }
    });
  }

  async saveCreateReference(input: {
    attemptId: string;
    orderItemId: string;
    providerReference: string;
    providerStatus?: string;
    hasInstallSecret?: boolean;
    providerOrderId?: string;
    providerOrderCode?: string;
  }): Promise<void> {
    const unclear = input.hasInstallSecret !== true;
    await this.prisma.$transaction(async (tx) => {
      await tx.esimProviderAttempt.update({
        where: { id: input.attemptId },
        data: {
          providerReference: input.providerReference,
          outcome: unclear ? EsimAttemptOutcome.UNCONFIRMED : EsimAttemptOutcome.SENT,
          errorCode: unclear ? 'UNCONFIRMED' : null,
          errorMessage: unclear ? 'Outcome unclear. No second CREATE.' : null,
          safeResponseMeta: {
            ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}),
            hasInstallSecret: input.hasInstallSecret === true,
            source: 'airalo',
            testData: false,
            ...(input.providerOrderId ? { providerOrderId: input.providerOrderId } : {}),
            ...(input.providerOrderCode ? { providerOrderCode: input.providerOrderCode } : {}),
          },
        },
      });
      if (!unclear) return;
      const item = await tx.orderItem.findUnique({
        where: { id: input.orderItemId },
        select: { orderId: true },
      });
      if (item) {
        await tx.order.update({
          where: { id: item.orderId },
          data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
        });
      }
    });
  }

  findOpenCreateReference(orderItemId: string): Promise<{
    attemptId: string;
    providerReference: string | null;
    createdAt: Date;
    safeResponseMeta?: Record<string, unknown> | null;
  } | null> {
    return this.prisma.esimProviderAttempt
      .findFirst({
        where: { orderItemId, operation: 'CREATE', openGuard: orderItemId },
        select: { id: true, providerReference: true, createdAt: true, safeResponseMeta: true },
      })
      .then((row) =>
        row
          ? {
              attemptId: row.id,
              providerReference: row.providerReference,
              createdAt: row.createdAt,
              safeResponseMeta:
                row.safeResponseMeta && typeof row.safeResponseMeta === 'object'
                  ? (row.safeResponseMeta as Record<string, unknown>)
                  : null,
            }
          : null,
      );
  }

  async insertQuery(input: {
    quote: EsimQuoteRow;
    providerReference: string;
    createAttemptId: string;
  }): Promise<{ attemptId: string; requestId: string } | 'conflict'> {
    if (input.createAttemptId === input.quote.orderItemId) {
      throw new Error('QUERY openGuard must be the CREATE attempt id');
    }
    const attemptId = randomUUID();
    const requestId = `esim-query-${input.quote.orderItemId}-${attemptId}`;
    try {
      await this.prisma.esimProviderAttempt.create({
        data: {
          id: attemptId,
          orderItemId: input.quote.orderItemId,
          quoteId: input.quote.quoteId,
          requestId,
          providerReference: input.providerReference,
          operation: 'QUERY',
          outcome: EsimAttemptOutcome.SENT,
          openGuard: input.createAttemptId,
          safeRequestMeta: { operation: 'QUERY' },
          safeResponseMeta: {},
        },
      });
      return { attemptId, requestId };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'conflict';
      }
      throw error;
    }
  }

  async closeQueryAttempt(input: {
    attemptId: string;
    providerStatus?: string;
    failed: boolean;
  }): Promise<void> {
    await this.prisma.esimProviderAttempt.update({
      where: { id: input.attemptId },
      data: {
        outcome: EsimAttemptOutcome.UNCONFIRMED,
        openGuard: null,
        errorCode: 'UNCONFIRMED',
        errorMessage: input.failed
          ? 'Outcome unclear. No second CREATE.'
          : 'Outcome unclear. Delivery was not inferred.',
        safeResponseMeta: input.providerStatus
          ? { providerStatus: input.providerStatus }
          : { outcome: 'unconfirmed' },
      },
    });
  }

  async markUnconfirmed(attemptId: string, orderItemId: string, errorMessage?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.esimProfile.findUnique({
        where: { orderItemId },
        select: { id: true },
      });
      if (profile) {
        return;
      }
      const item = await tx.orderItem.findUnique({
        where: { id: orderItemId },
        select: { orderId: true },
      });
      if (!item) {
        return;
      }
      const order = await tx.order.findUnique({
        where: { id: item.orderId },
        select: { fulfillmentStatus: true },
      });
      if (!order || order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
        return;
      }
      const attempt = await tx.esimProviderAttempt.findUnique({
        where: { id: attemptId },
        select: { outcome: true },
      });
      if (attempt?.outcome === EsimAttemptOutcome.PROFILE_SAVED) {
        return;
      }
      await tx.esimProviderAttempt.update({
        where: { id: attemptId },
        data: {
          outcome: EsimAttemptOutcome.UNCONFIRMED,
          errorCode: 'UNCONFIRMED',
          errorMessage: errorMessage?.trim().slice(0, 240) || 'Outcome unclear. No second CREATE.',
          safeResponseMeta: { outcome: 'unconfirmed' },
        },
      });
      await tx.order.updateMany({
        where: {
          id: item.orderId,
          fulfillmentStatus: {
            in: [
              FulfillmentStatus.PENDING,
              FulfillmentStatus.PROCESSING,
              FulfillmentStatus.WAITING_ADMIN_RETRY,
              FulfillmentStatus.NEED_MANUAL_REVIEW,
            ],
          },
        },
        data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
      });
    });
  }

  async ensureManualReview(orderItemId: string): Promise<FulfillmentStatus> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: { orderId: true },
    });
    if (!item) {
      throw new Error('Order status could not be marked for review');
    }
    const updated = await this.prisma.order.updateMany({
      where: {
        id: item.orderId,
        fulfillmentStatus: {
          in: [
            FulfillmentStatus.PENDING,
            FulfillmentStatus.PROCESSING,
            FulfillmentStatus.WAITING_ADMIN_RETRY,
          ],
        },
      },
      data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
    });
    if (updated.count === 1) {
      return FulfillmentStatus.NEED_MANUAL_REVIEW;
    }
    const current = await this.prisma.order.findUnique({
      where: { id: item.orderId },
      select: { fulfillmentStatus: true },
    });
    if (!current) {
      throw new Error('Order status could not be marked for review');
    }
    if (
      current.fulfillmentStatus === FulfillmentStatus.NEED_MANUAL_REVIEW ||
      current.fulfillmentStatus === FulfillmentStatus.COMPLETED
    ) {
      return current.fulfillmentStatus;
    }
    throw new Error('Order status could not be marked for review');
  }

  async markNeedsReview(orderItemId: string): Promise<FulfillmentStatus> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: { orderId: true },
    });
    if (!item) {
      throw new Error('Order status could not be marked for review');
    }
    const updated = await this.prisma.order.updateMany({
      where: {
        id: item.orderId,
        fulfillmentStatus: { in: [FulfillmentStatus.PENDING, FulfillmentStatus.PROCESSING] },
      },
      data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
    });
    if (updated.count === 1) {
      return FulfillmentStatus.NEED_MANUAL_REVIEW;
    }
    const current = await this.prisma.order.findUnique({
      where: { id: item.orderId },
      select: { fulfillmentStatus: true },
    });
    if (!current) {
      throw new Error('Order status could not be marked for review');
    }
    if (
      current.fulfillmentStatus === FulfillmentStatus.NEED_MANUAL_REVIEW ||
      current.fulfillmentStatus === FulfillmentStatus.COMPLETED
    ) {
      return current.fulfillmentStatus;
    }
    throw new Error('Order status could not be marked for review');
  }

  async closeSentQueryClaim(
    db: Prisma.TransactionClient,
    input: {
      queryAttemptId: string;
      createAttemptId: string;
      orderItemId: string;
    },
  ): Promise<number> {
    const updated = await db.esimProviderAttempt.updateMany({
      where: {
        id: input.queryAttemptId,
        operation: 'QUERY',
        outcome: EsimAttemptOutcome.SENT,
        openGuard: input.createAttemptId,
        orderItemId: input.orderItemId,
      },
      data: {
        outcome: EsimAttemptOutcome.UNCONFIRMED,
        openGuard: null,
        errorCode: 'UNCONFIRMED',
        errorMessage: 'QUERY claim closed manually. No second CREATE.',
        safeResponseMeta: { outcome: 'unconfirmed' },
      },
    });
    return updated.count;
  }

  async notifyDelivered(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderCode: true, guestEmail: true, user: { select: { email: true } } },
    });
    const email = order?.user?.email ?? order?.guestEmail;
    this.logger.log(
      `eSIM profile stored orderCode=${order?.orderCode ?? orderId} notify=${email ? 'queued' : 'skipped'}`,
    );
    await this.recordOrderEvent(orderId, OrderEventType.ORDER_DELIVERED, 'eSIM install profile stored');
  }

  async recordOrderEvent(orderId: string, eventType: OrderEventType, message: string): Promise<void> {
    await this.prisma.orderEvent.create({
      data: { orderId, eventType, message: message.slice(0, 512), metadata: {} },
    });
  }
}
