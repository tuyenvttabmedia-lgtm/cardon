import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { lookup } from 'dns/promises';
import {
  AuditTargetType,
  EsimAttemptOutcome,
  EsimProviderMode,
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  PaymentRecordStatus,
  Prisma,
  ProductVariantType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CardEncryptionService } from '../provider/services/card-encryption.service';
import { isRetiredAiraloSandboxHost, SettingsStoreService } from '../settings/services/settings-store.service';
import { appleEsimSetupUrl, isEsimTestSecret, lpaForDisplay } from './esim-delivery.view';
import { toAiraloOrderCode } from './esim-airalo-code';
import { EsimFulfillmentRepository } from './esim-fulfillment.repository';
import { EsimFulfillmentService, type EsimFulfillmentResult } from './esim-fulfillment.service';
import {
  ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF,
  ESIM_QUERY_CLAIM_LEASE_PRESENT,
  ESIM_QUERY_CLAIM_LEASE_UNKNOWN,
  EsimGetLease,
} from './esim-get-lease';
import {
  ESIM_QUERY_CLAIM_UNVERIFIED,
  EsimQueryActivityProbe,
} from './esim-query-activity.probe';
import { renderLpaQrSvg } from './esim-lpa-qr';
import { ACTIVE_ORDER_WHERE } from '../order/entities/order.constants';
import {
  buildEsimOpsDashboard,
  esimOpsLane,
  esimOpsRange,
  sanitizeEsimOpsAuditMetadata,
  type EsimOpsDashboardOrder,
} from './esim-ops-dashboard';

/** Manual QUERY claim close. Not a provider retry. */
export const ADMIN_ESIM_QUERY_CLAIM_CLOSE = 'ADMIN_ESIM_QUERY_CLAIM_CLOSE';

export interface CloseSentQueryClaimInput {
  adminId: string;
  orderId: string;
  queryAttemptId: string;
  createAttemptId: string;
  reason: string;
}

export interface EsimAdminAttemptView {
  id: string;
  operation: string;
  outcome: string;
  providerReference: string | null;
  providerStatus: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EsimAdminOrderOps {
  present: boolean;
  providerName: string | null;
  providerCode: string | null;
  providerMode: string | null;
  providerProductCode: string | null;
  packageTitle: string | null;
  airaloOrderId: string | null;
  profilePresent: boolean;
  installSecretMasked: string | null;
  installSecret: string | null;
  canRevealInstallSecret: boolean;
  attempts: EsimAdminAttemptView[];
}

export interface EsimAdminRevealPayload {
  orderCode: string;
  profileId: string;
  installSecret: string;
  qrSvg: string | null;
  appleSetupUrl: string | null;
}

/**
 * Admin acknowledgement for an eSIM order. No provider call and no new CREATE.
 */
@Injectable()
export class EsimAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: EsimFulfillmentRepository,
    @Optional() private readonly fulfillmentService?: EsimFulfillmentService,
    @Optional() private readonly encryption?: CardEncryptionService,
    @Optional() private readonly settings?: SettingsStoreService,
    @Optional() private readonly queryActivity?: EsimQueryActivityProbe,
    @Optional() private readonly getLease?: EsimGetLease,
  ) {}

  async isEsimOrder(orderId: string): Promise<boolean> {
    const item = await this.prisma.orderItem.findFirst({
      where: { orderId, variant: { type: ProductVariantType.ESIM } },
      select: { id: true },
    });
    return item !== null;
  }

  async acknowledge(orderId: string): Promise<FulfillmentStatus> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
    });
    return FulfillmentStatus.NEED_MANUAL_REVIEW;
  }

  /**
   * QUERY/GET a stored Airalo CREATE, or mark manual review.
   * Never opens POST /v2/orders. First CREATE stays on esim_queue fulfill.
   */
  async recoverInstall(orderId: string): Promise<EsimFulfillmentResult> {
    const recover = this.fulfillmentService?.recoverExistingInstall?.bind(this.fulfillmentService);
    if (!recover) {
      return {
        orderId,
        fulfillmentStatus: await this.acknowledge(orderId),
        created: false,
        queried: false,
        hasOpenCreate: false,
        hasReference: false,
      };
    }
    return recover(orderId);
  }

  async getOrderOps(orderId: string, options?: { canReveal?: boolean }): Promise<EsimAdminOrderOps> {
    const empty: EsimAdminOrderOps = {
      present: false,
      providerName: null,
      providerCode: null,
      providerMode: null,
      providerProductCode: null,
      packageTitle: null,
      airaloOrderId: null,
      profilePresent: false,
      installSecretMasked: null,
      installSecret: null,
      canRevealInstallSecret: false,
      attempts: [],
    };
    const item = await this.prisma.orderItem.findFirst({
      where: { orderId, variant: { type: ProductVariantType.ESIM } },
      select: {
        variant: { select: { name: true } },
        esimQuote: {
          select: {
            providerProductCode: true,
            providerMode: true,
            provider: { select: { code: true, name: true } },
          },
        },
        esimProfile: { select: { id: true, installSecretEnc: true } },
        esimAttempts: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            operation: true,
            outcome: true,
            providerReference: true,
            errorMessage: true,
            createdAt: true,
            completedAt: true,
            safeResponseMeta: true,
          },
        },
      },
    });
    if (!item) return empty;

    const secret = this.decryptInstallSecret(item.esimProfile?.installSecretEnc);
    const attempts = item.esimAttempts.map((attempt) => {
      const meta =
        attempt.safeResponseMeta && typeof attempt.safeResponseMeta === 'object'
          ? (attempt.safeResponseMeta as Record<string, unknown>)
          : {};
      return {
        id: attempt.id,
        operation: attempt.operation,
        outcome: attempt.outcome,
        providerReference: attempt.providerReference,
        providerStatus: typeof meta.providerStatus === 'string' ? meta.providerStatus : null,
        errorMessage: attempt.errorMessage,
        createdAt: attempt.createdAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() ?? null,
      };
    });
    const referenced = attempts.find((row) => row.providerReference);
    const airaloOrderId = referenced?.providerReference
      ? toAiraloOrderCode(referenced.providerReference, new Date(referenced.createdAt))
      : null;

    return {
      present: true,
      providerName: item.esimQuote?.provider.name ?? 'Airalo',
      providerCode: item.esimQuote?.provider.code ?? 'AIRALO',
      providerMode: item.esimQuote?.providerMode ?? null,
      providerProductCode: item.esimQuote?.providerProductCode ?? null,
      packageTitle: item.variant?.name ?? null,
      airaloOrderId,
      profilePresent: Boolean(secret),
      installSecretMasked: secret ? maskEsimInstallSecret(secret) : null,
      installSecret: null,
      canRevealInstallSecret: options?.canReveal === true && Boolean(secret),
      attempts,
    };
  }

  async revealInstallSecret(orderId: string): Promise<EsimAdminRevealPayload> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderItems: { some: { variant: { type: ProductVariantType.ESIM } } } },
      select: {
        orderCode: true,
        orderItems: {
          where: { variant: { type: ProductVariantType.ESIM } },
          take: 1,
          select: { esimProfile: { select: { id: true, installSecretEnc: true } } },
        },
      },
    });
    const profile = order?.orderItems[0]?.esimProfile;
    const secret = this.decryptInstallSecret(profile?.installSecretEnc);
    if (!order || !profile || !secret) {
      throw new NotFoundException('eSIM profile not found');
    }
    const display = lpaForDisplay(secret);
    return {
      orderCode: order.orderCode,
      profileId: profile.id,
      installSecret: display,
      qrSvg: renderLpaQrSvg(secret),
      appleSetupUrl: isEsimTestSecret(secret) ? null : appleEsimSetupUrl(display),
    };
  }

  async getHealth(): Promise<{
    baseUrl: string;
    configured: boolean;
    hostResolves: boolean;
    hostname: string;
    retiredSandboxHost: boolean;
    note: string;
  }> {
    await this.settings?.reload();
    const credentials = this.settings?.resolveAiraloCredentials() ?? {
      clientId: '',
      clientSecret: '',
      baseUrl: 'https://partners-api.airalo.com',
    };
    let hostname = '';
    try {
      hostname = new URL(credentials.baseUrl).hostname;
    } catch {
      hostname = '';
    }
    let hostResolves = false;
    if (hostname) {
      try {
        await lookup(hostname);
        hostResolves = true;
      } catch {
        hostResolves = false;
      }
    }
    return {
      baseUrl: credentials.baseUrl,
      configured: Boolean(credentials.clientId && credentials.clientSecret),
      hostResolves,
      hostname,
      retiredSandboxHost: isRetiredAiraloSandboxHost(credentials.baseUrl),
      note:
        'Localhost gọi được Airalo qua HTTPS. Sandbox là mode trên tài khoản Partner, không phải host riêng. Host sandbox-partners-api.airalo.com đã NXDOMAIN.',
    };
  }

  async getOpsDashboard(query: { preset?: string; from?: string; to?: string }) {
    let range: ReturnType<typeof esimOpsRange>;
    try {
      range = esimOpsRange(query);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid date range');
    }
    const esimOrder = {
      ...ACTIVE_ORDER_WHERE,
      channel: OrderChannel.B2C,
      orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
    };
    const createdAt = { gte: range.from, lt: range.to };
    const paidAt = { gte: range.from, lt: range.to };
    const [createdRows, successPayments] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...esimOrder, createdAt },
        select: esimDashboardOrderSelect,
      }),
      this.prisma.payment.findMany({
        where: {
          status: PaymentRecordStatus.SUCCESS,
          deletedAt: null,
          OR: [{ paidAt }, { paidAt: null, createdAt: paidAt }],
          order: esimOrder,
        },
        select: {
          orderId: true,
          amount: true,
          gateway: true,
          paidAt: true,
          createdAt: true,
        },
      }),
    ]);
    const paymentOrderIds = [...new Set(successPayments.map((row) => row.orderId))];
    const missingIds = paymentOrderIds.filter(
      (id) => !createdRows.some((row) => row.id === id),
    );
    const paymentOrders =
      missingIds.length === 0
        ? []
        : await this.prisma.order.findMany({
            where: { id: { in: missingIds }, ...esimOrder },
            select: esimDashboardOrderSelect,
          });
    const packageCodes = [
      ...new Set(
        [...createdRows, ...paymentOrders]
          .map((row) => row.orderItems[0]?.esimQuote?.providerProductCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    const packages = packageCodes.length
      ? await this.prisma.esimAiraloPackage.findMany({
          where: { providerPackageId: { in: packageCodes } },
          select: { providerPackageId: true, countryIso: true, title: true },
        })
      : [];
    return buildEsimOpsDashboard({
      range,
      ordersCreated: createdRows.map(toDashboardOrder),
      paymentOrders: paymentOrders.map(toDashboardOrder),
      successPayments: successPayments.map((row) => ({
        orderId: row.orderId,
        amount: row.amount.toString(),
        gateway: String(row.gateway),
        paidAt: row.paidAt,
        createdAt: row.createdAt,
      })),
      packages: new Map(
        packages.map((row) => [
          row.providerPackageId,
          { countryIso: row.countryIso, title: row.title },
        ]),
      ),
    });
  }

  async listOps(query: {
    q?: string;
    paymentStatus?: OrderPaymentStatus;
    fulfillmentStatus?: FulfillmentStatus;
    preset?: string;
    from?: string;
    to?: string;
    lane?: 'commerce' | 'sandbox';
    paidUnfulfilled?: boolean;
    skip?: number;
    take?: number;
  }): Promise<{
    summary: {
      total: number;
      paidWaiting: number;
      needReview: number;
      completed: number;
      unpaid: number;
    };
    page: { skip: number; take: number; total: number };
    items: Array<{
      id: string;
      orderCode: string;
      customerEmail: string | null;
      customerName: string | null;
      packageTitle: string | null;
      providerProductCode: string | null;
      airaloOrderId: string | null;
      lastError: string | null;
      profilePresent: boolean;
      paymentStatus: string;
      fulfillmentStatus: string;
      paymentMethod: string | null;
      customerPaid: string;
      createdAt: string;
      lane: 'commerce' | 'sandbox';
      paidUnfulfilled: boolean;
      providerMode: string | null;
    }>;
  }> {
    const take = Math.min(100, Math.max(1, query.take ?? 20));
    const skip = Math.max(0, query.skip ?? 0);
    const and: Prisma.OrderWhereInput[] = [];
    const createdAt = esimOpsCreatedAtFilter(query);
    if (createdAt) and.push({ createdAt });
    const laneWhere = esimOpsLaneWhere(query.lane);
    if (laneWhere) and.push(laneWhere);
    if (query.paidUnfulfilled) {
      and.push({
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: query.fulfillmentStatus ?? { not: FulfillmentStatus.COMPLETED },
      });
    } else {
      if (query.paymentStatus) and.push({ paymentStatus: query.paymentStatus });
      if (query.fulfillmentStatus) and.push({ fulfillmentStatus: query.fulfillmentStatus });
    }
    const search = query.q?.trim();
    if (search) {
      and.push({
        OR: [
          { orderCode: { contains: search, mode: 'insensitive' } },
          { guestEmail: { contains: search, mode: 'insensitive' } },
          { guestPhone: { contains: search, mode: 'insensitive' } },
          { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
          { user: { is: { phone: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      channel: OrderChannel.B2C,
      orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      ...(and.length ? { AND: and } : {}),
    };
    const summaryWhere: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      channel: OrderChannel.B2C,
      orderItems: { some: { variant: { type: ProductVariantType.ESIM } } },
      ...(createdAt ? { createdAt } : {}),
      ...(laneWhere ? laneWhere : {}),
    };

    const [rows, grouped, filteredTotal] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderCode: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          createdAt: true,
          customerPaid: true,
          methodDisplayName: true,
          paymentMethodCode: true,
          guestEmail: true,
          clientTrace: true,
          user: { select: { email: true, fullName: true } },
          orderItems: {
            where: { variant: { type: ProductVariantType.ESIM } },
            select: {
              variant: { select: { name: true } },
              esimQuote: { select: { providerProductCode: true, providerMode: true } },
              esimProfile: { select: { id: true } },
              esimAttempts: {
                orderBy: { createdAt: 'desc' },
                take: 4,
                select: { providerReference: true, errorMessage: true, createdAt: true },
              },
            },
          },
        },
      }),
      this.prisma.order.groupBy({
        by: ['paymentStatus', 'fulfillmentStatus'],
        where: summaryWhere,
        _count: { _all: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    let total = 0;
    let paidWaiting = 0;
    let needReview = 0;
    let completed = 0;
    let unpaid = 0;
    for (const row of grouped) {
      const count = row._count._all;
      total += count;
      if (row.paymentStatus !== OrderPaymentStatus.PAID) unpaid += count;
      if (
        row.paymentStatus === OrderPaymentStatus.PAID &&
        row.fulfillmentStatus === FulfillmentStatus.COMPLETED
      ) {
        completed += count;
      } else if (
        row.paymentStatus === OrderPaymentStatus.PAID &&
        (row.fulfillmentStatus === FulfillmentStatus.NEED_MANUAL_REVIEW ||
          row.fulfillmentStatus === FulfillmentStatus.WAITING_ADMIN_RETRY)
      ) {
        needReview += count;
      } else if (
        row.paymentStatus === OrderPaymentStatus.PAID &&
        row.fulfillmentStatus !== FulfillmentStatus.COMPLETED
      ) {
        paidWaiting += count;
      }
    }

    return {
      summary: { total, paidWaiting, needReview, completed, unpaid },
      page: { skip, take, total: filteredTotal },
      items: rows.map((order) => {
        const item = order.orderItems[0];
        const referenced = item?.esimAttempts.find((attempt) => attempt.providerReference);
        const airaloOrderId = referenced?.providerReference
          ? toAiraloOrderCode(referenced.providerReference, referenced.createdAt)
          : null;
        const lastError = pickEsimLastError(item?.esimAttempts ?? []);
        const lane = esimOpsLane({
          providerMode: item?.esimQuote?.providerMode ?? null,
          clientTrace: order.clientTrace,
        });
        return {
          id: order.id,
          orderCode: order.orderCode,
          customerEmail: order.user?.email ?? order.guestEmail,
          customerName: order.user?.fullName ?? null,
          packageTitle: item?.variant?.name ?? null,
          providerProductCode: item?.esimQuote?.providerProductCode ?? null,
          airaloOrderId,
          lastError,
          profilePresent: Boolean(item?.esimProfile),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentMethod: order.methodDisplayName ?? order.paymentMethodCode,
          customerPaid: order.customerPaid.toString(),
          createdAt: order.createdAt.toISOString(),
          lane,
          paidUnfulfilled:
            order.paymentStatus === OrderPaymentStatus.PAID &&
            order.fulfillmentStatus !== FulfillmentStatus.COMPLETED,
          providerMode: item?.esimQuote?.providerMode ?? null,
        };
      }),
    };
  }

  async getOpsDetail(orderId: string, options?: { canReveal?: boolean }) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderItems: { some: { variant: { type: ProductVariantType.ESIM } } } },
      select: {
        id: true,
        orderCode: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        createdAt: true,
        customerPaid: true,
        sellAmount: true,
        providerCost: true,
        paymentFeeAmount: true,
        methodDisplayName: true,
        paymentMethodCode: true,
        paymentGateway: true,
        guestEmail: true,
        guestPhone: true,
        clientTrace: true,
        user: { select: { fullName: true, email: true, phone: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            paymentReference: true,
            gateway: true,
            amount: true,
            status: true,
            paidAt: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('eSIM order not found');
    }
    const [ops, adminActions] = await Promise.all([
      this.getOrderOps(orderId, options),
      this.prisma.auditLog.findMany({
        where: { targetType: AuditTargetType.ORDER, targetId: orderId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          action: true,
          createdAt: true,
          metadata: true,
          admin: { select: { fullName: true, email: true } },
        },
      }),
    ]);
    const lastError = pickEsimLastError(ops.attempts);
    const lane = esimOpsLane({
      providerMode: ops.providerMode,
      clientTrace: order.clientTrace,
    });
    return {
      id: order.id,
      orderCode: order.orderCode,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      lane,
      paidUnfulfilled:
        order.paymentStatus === OrderPaymentStatus.PAID &&
        order.fulfillmentStatus !== FulfillmentStatus.COMPLETED,
      createdAt: order.createdAt.toISOString(),
      customer: {
        name: order.user?.fullName ?? null,
        email: order.user?.email ?? order.guestEmail,
        phone: order.user?.phone ?? order.guestPhone,
      },
      pricing: {
        customerPaid: order.customerPaid.toString(),
        sellAmount: order.sellAmount.toString(),
        providerCost: order.providerCost.toString(),
        paymentFeeAmount: order.paymentFeeAmount.toString(),
        paymentMethod: order.methodDisplayName ?? order.paymentMethodCode,
        paymentGateway: order.paymentGateway,
      },
      payments: order.payments.map((payment) => ({
        paymentReference: payment.paymentReference,
        gateway: payment.gateway,
        amount: payment.amount.toString(),
        status: payment.status,
        paidAt: payment.paidAt?.toISOString() ?? null,
      })),
      lastError,
      adminActions: adminActions.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        actor: row.admin.fullName ?? row.admin.email,
        metadata: sanitizeEsimOpsAuditMetadata(row.metadata),
      })),
      ...ops,
    };
  }

  private decryptInstallSecret(encrypted?: string | null): string | null {
    if (!encrypted || !this.encryption) return null;
    try {
      const secret = this.encryption.decrypt(encrypted).trim();
      return secret.startsWith('LPA:1$') ? secret : null;
    } catch {
      return null;
    }
  }

  /**
   * Never auto-closes a QUERY claim. Queue idle and an absent lease are not
   * proof the HTTP GET has stopped. Heartbeat age is not evidence.
   */
  async closeSentQueryClaim(
    input: CloseSentQueryClaimInput,
  ): Promise<{ result: 'closed' | 'not_closed' }> {
    const adminId = input.adminId.trim();
    const reason = input.reason.trim();
    if (adminId === '') {
      throw new BadRequestException('Admin is required');
    }
    if (reason === '') {
      throw new BadRequestException('A reason is required');
    }
    if (!this.queryActivity) {
      throw new BadRequestException(ESIM_QUERY_CLAIM_UNVERIFIED);
    }
    await this.queryActivity.assertIdle(input.orderId);
    const query = await this.prisma.esimProviderAttempt.findUnique({
      where: { id: input.queryAttemptId },
      select: {
        id: true,
        orderItemId: true,
        operation: true,
        outcome: true,
        openGuard: true,
      },
    });
    const create = query
      ? await this.prisma.esimProviderAttempt.findFirst({
          where: {
            id: input.createAttemptId,
            operation: 'CREATE',
            orderItemId: query.orderItemId,
          },
          select: { id: true, openGuard: true },
        })
      : null;
    const orderItemId = query?.orderItemId;
    const item = orderItemId
      ? await this.prisma.orderItem.findFirst({
          where: { id: orderItemId, orderId: input.orderId },
          select: { id: true },
        })
      : null;
    const linked =
      query?.operation === 'QUERY' &&
      query.outcome === EsimAttemptOutcome.SENT &&
      query.openGuard === input.createAttemptId &&
      create?.id === input.createAttemptId &&
      item?.id === orderItemId;
    if (!linked) {
      return { result: 'not_closed' };
    }
    if (!this.getLease) {
      throw new BadRequestException(ESIM_QUERY_CLAIM_LEASE_UNKNOWN);
    }
    const lease = await this.getLease.inspect(input.createAttemptId);
    if (lease === 'PRESENT') {
      throw new BadRequestException(ESIM_QUERY_CLAIM_LEASE_PRESENT);
    }
    if (lease === 'UNKNOWN') {
      throw new BadRequestException(ESIM_QUERY_CLAIM_LEASE_UNKNOWN);
    }
    throw new BadRequestException(ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF);
  }
}

export function pickEsimLastError(
  attempts: Array<{ errorMessage?: string | null }>,
): string | null {
  const stale = /No second CREATE|Delivery was not inferred/i;
  const preferred = attempts.find(
    (attempt) => attempt.errorMessage && !stale.test(attempt.errorMessage),
  );
  return preferred?.errorMessage
    ?? attempts.find((attempt) => attempt.errorMessage)?.errorMessage
    ?? null;
}

export function maskEsimInstallSecret(secret: string): string {
  const parts = secret.split('$');
  if (parts.length !== 3) return 'LPA:1$••••$••••';
  const matching = parts[2];
  const visible = matching.slice(0, 2);
  return `${parts[0]}$${parts[1]}$${visible}${'•'.repeat(Math.max(4, matching.length - 2))}`;
}

const esimDashboardOrderSelect = {
  id: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  clientTrace: true,
  providerCost: true,
  paymentFeeAmount: true,
  orderItems: {
    where: { variant: { type: ProductVariantType.ESIM } },
    take: 1,
    select: {
      esimQuote: { select: { providerProductCode: true, providerMode: true } },
    },
  },
} satisfies Prisma.OrderSelect;

function toDashboardOrder(row: {
  id: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  clientTrace: unknown;
  providerCost: { toString(): string };
  paymentFeeAmount: { toString(): string };
  orderItems: Array<{
    esimQuote: { providerProductCode: string; providerMode: string } | null;
  }>;
}): EsimOpsDashboardOrder {
  const quote = row.orderItems[0]?.esimQuote;
  return {
    id: row.id,
    paymentStatus: row.paymentStatus,
    fulfillmentStatus: row.fulfillmentStatus,
    providerMode: quote?.providerMode ?? null,
    providerProductCode: quote?.providerProductCode ?? null,
    clientTrace: row.clientTrace,
    providerCost: row.providerCost.toString(),
    paymentFeeAmount: row.paymentFeeAmount.toString(),
  };
}

function esimOpsCreatedAtFilter(query: {
  preset?: string;
  from?: string;
  to?: string;
}): Prisma.DateTimeFilter | undefined {
  if (!query.preset && !query.from && !query.to) return undefined;
  try {
    const range = esimOpsRange(query);
    return { gte: range.from, lt: range.to };
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : 'Invalid date range');
  }
}

function esimOpsLaneWhere(lane?: 'commerce' | 'sandbox'): Prisma.OrderWhereInput | undefined {
  const sandbox: Prisma.OrderWhereInput = {
    OR: [
      {
        orderItems: {
          some: {
            variant: { type: ProductVariantType.ESIM },
            esimQuote: { is: { providerMode: EsimProviderMode.MOCK } },
          },
        },
      },
      { clientTrace: { path: ['adminTest'], equals: true } },
      { clientTrace: { path: ['sandbox'], equals: true } },
    ],
  };
  if (lane === 'sandbox') return sandbox;
  if (lane === 'commerce') return { NOT: sandbox };
  return undefined;
}
