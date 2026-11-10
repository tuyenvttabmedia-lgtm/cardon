import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EsimAttemptOutcome, FulfillmentStatus, OrderEventType, Prisma } from '@prisma/client';
import { CardEncryptionService } from '../provider/services/card-encryption.service';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { NotificationService } from '../notification/services/notification.service';
import { EsimMockAdapter, EsimOutcomeUnconfirmedError } from './esim-mock.adapter';
import { EsimGetLease, type EsimLeaseMeta } from './esim-get-lease';
import { EsimFulfillmentRepository, EsimQuoteRow } from './esim-fulfillment.repository';
import { AiraloRequestError } from './esim-airalo.adapter';
import { airaloNumericId, airaloOrderCode } from './esim-airalo-code';
import { ESIM_PROVIDER_PORT, EsimProviderPort } from './esim-provider.port';
import { ESIM_LIVE_HTTP_DISABLED, ESIM_TEST_MARKER } from './esim.constants';
import { isEsimTestSecret } from './esim-delivery.view';

export interface EsimFulfillmentResult {
  orderId: string;
  fulfillmentStatus: FulfillmentStatus;
  created: boolean;
  queried?: boolean;
  hasOpenCreate?: boolean;
  hasReference?: boolean;
}

const FIRST_CREATE_BLOCKED = new Set<FulfillmentStatus>([
  FulfillmentStatus.NEED_MANUAL_REVIEW,
  FulfillmentStatus.COMPLETED,
  FulfillmentStatus.FAILED,
  // WAITING_ADMIN_RETRY is claimable after definite no-CREATE (openGuard released).
]);

/**
 * One CREATE per order item. A second call never opens another CREATE.
 * Email failure does not remove a stored profile or leave COMPLETED.
 */
@Injectable()
export class EsimFulfillmentService {
  private readonly logger = new Logger(EsimFulfillmentService.name);

  constructor(
    private readonly repository: EsimFulfillmentRepository,
    private readonly mockAdapter: EsimMockAdapter,
    @Inject(ESIM_PROVIDER_PORT) private readonly provider: EsimProviderPort,
    private readonly encryption: CardEncryptionService,
    @Optional() private readonly settings?: SettingsStoreService,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly getLease?: EsimGetLease,
  ) {}

  async fulfill(
    orderId: string,
    options?: { simulateTimeout?: boolean },
  ): Promise<EsimFulfillmentResult> {
    const skipped = await this.skippedAdminTest(orderId);
    if (skipped) return skipped;
    await this.settings?.reload();
    const quote = await this.repository.findQuoteByOrderId(orderId);
    if (!quote) {
      throw new NotFoundException('eSIM quote not found');
    }

    const existing = await this.resumeExistingCreate(orderId, quote);
    if (existing) {
      return existing;
    }

    const blocked = await this.refuseFirstCreateIfBlocked(orderId);
    if (blocked) {
      return blocked;
    }

    if (quote.providerMode === 'LIVE') {
      return this.fulfillLive(orderId, quote);
    }

    const claimed = await this.claimFirstCreateOrRefuse(orderId);
    if (claimed) {
      return claimed;
    }

    const inserted = await this.repository.insertOpenCreate(quote);
    if (inserted === 'conflict') {
      return this.acknowledgeOpenCreate(orderId, quote.orderItemId);
    }

    try {
      const latest = await this.repository.getOrderFulfillmentStatus(orderId);
      if (latest !== FulfillmentStatus.PROCESSING) {
        return {
          orderId,
          fulfillmentStatus: latest ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
          created: false,
        };
      }
      await this.repository.recordOrderEvent?.(
        orderId,
        OrderEventType.PROVIDER_REQUEST,
        'eSIM mock CREATE started',
      );
      const created = await this.mockAdapter.create({
        requestId: inserted.requestId,
        simulateTimeout: options?.simulateTimeout,
      });
      const installSecretEnc = this.encryption.encrypt(created.installSecret);
      await this.repository.saveProfile({
        orderItemId: quote.orderItemId,
        attemptId: inserted.attemptId,
        installSecretEnc,
        testData: true,
        source: 'mock',
      });
      await this.repository.recordOrderEvent?.(
        orderId,
        OrderEventType.PROVIDER_SUCCESS,
        'eSIM mock profile stored',
      );
      try {
        await this.notifyReady(orderId, created.installSecret);
      } catch {
        // Profile and COMPLETED stay. Mail can be retried without a new CREATE.
      }
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        created: true,
      };
    } catch (error) {
      if (!(error instanceof EsimOutcomeUnconfirmedError)) {
        // Any non-success is unconfirmed in Phase A. Do not classify it as FAILED.
      }
      await this.repository.markUnconfirmed(inserted.attemptId, quote.orderItemId);
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        created: false,
      };
    }
  }

  /**
   * Admin recovery: GET a stored CREATE or mark review. Never POST /v2/orders.
   */
  async recoverExistingInstall(orderId: string): Promise<EsimFulfillmentResult> {
    const skipped = await this.skippedAdminTest(orderId);
    if (skipped) return skipped;
    await this.settings?.reload();
    const quote = await this.repository.findQuoteByOrderId(orderId);
    if (!quote) {
      throw new NotFoundException('eSIM quote not found');
    }
    const existing = await this.resumeExistingCreate(orderId, quote);
    if (existing) {
      return existing;
    }
    const pay = await this.repository.getOrderPaymentFulfillment?.(orderId);
    const status = pay?.fulfillmentStatus ?? (await this.repository.getOrderFulfillmentStatus(orderId));
    // Retryable without open CREATE: definite no-CREATE, or PAID never claimed.
    if (
      status === FulfillmentStatus.WAITING_ADMIN_RETRY ||
      (status === FulfillmentStatus.PENDING &&
        String(pay?.paymentStatus ?? '') === 'PAID')
    ) {
      return {
        orderId,
        fulfillmentStatus: status,
        created: false,
        queried: false,
        hasOpenCreate: false,
        hasReference: false,
      };
    }
    const fulfillmentStatus = await this.repository.ensureManualReview(quote.orderItemId);
    return {
      orderId,
      fulfillmentStatus,
      created: false,
      queried: false,
      hasOpenCreate: false,
      hasReference: false,
    };
  }

  /**
   * Automatic QUERY-only recovery (LPA-16K17 C).
   * Requires PROCESSING + matching open CREATE guard + stored providerReference.
   * Never POST /v2/orders. Transient GET failure keeps the CREATE guard.
   */
  async queryOpenCreateRecovery(orderId: string): Promise<EsimFulfillmentResult> {
    const skipped = await this.skippedAdminTest(orderId);
    if (skipped) return skipped;
    await this.settings?.reload();
    const quote = await this.repository.findQuoteByOrderId(orderId);
    if (!quote) {
      throw new NotFoundException('eSIM quote not found');
    }
    if (await this.repository.hasProfile(quote.orderItemId)) {
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        created: false,
        queried: false,
        hasOpenCreate: false,
        hasReference: false,
      };
    }
    const status = await this.repository.getOrderFulfillmentStatus(orderId);
    const refuse: EsimFulfillmentResult = {
      orderId,
      fulfillmentStatus: status ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: false,
    };
    if (
      status !== FulfillmentStatus.PROCESSING &&
      status !== FulfillmentStatus.NEED_MANUAL_REVIEW
    ) {
      return refuse;
    }
    const openCreate = await this.repository.findOpenCreate(quote.orderItemId);
    if (!openCreate || openCreate.openGuard !== quote.orderItemId) {
      return refuse;
    }
    const ids = this.resolveAiraloIds(openCreate.providerReference, openCreate.safeResponseMeta);
    const reference = ids.numericId ?? ids.orderCode ?? this.cleanReference(openCreate.providerReference);
    if (!reference) {
      return { ...refuse, hasOpenCreate: true, hasReference: false };
    }
    const claimed = await this.repository.insertQuery({
      quote,
      providerReference: reference,
      createAttemptId: openCreate.attemptId,
    });
    if (claimed === 'conflict') {
      this.logger.log(`queryOpenCreate order=${orderId} skipped=query_claim_conflict`);
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.PROCESSING,
        created: false,
        queried: false,
        hasOpenCreate: true,
        hasReference: true,
      };
    }
    const leased = await this.runInstallGet(
      openCreate.attemptId,
      {
        orderId,
        orderItemId: quote.orderItemId,
        queryAttemptId: claimed.attemptId,
      },
      async () => {
        const install = await this.readInstallFromProvider({
          ...ids,
          fallback: reference,
        });
        if (!install.installSecret) {
          return {
            queried: true,
            stored: false,
            fulfillmentStatus: FulfillmentStatus.PROCESSING as FulfillmentStatus,
          };
        }
        try {
          const stored = await this.storeInstallSecret(
            orderId,
            quote.orderItemId,
            openCreate.attemptId,
            install.installSecret,
            false,
            install.iccid,
          );
          return {
            queried: true,
            stored: true,
            fulfillmentStatus: stored.fulfillmentStatus,
            result: stored,
          };
        } catch {
          const fulfillmentStatus = await this.repository.ensureManualReview(quote.orderItemId);
          return { queried: true, stored: false, persistFailed: true, fulfillmentStatus };
        }
      },
    );
    if (leased.kind !== 'ran') {
      await this.repository.closeQueryAttempt({
        attemptId: claimed.attemptId,
        failed: true,
      }).catch(() => undefined);
      this.logger.log(`queryOpenCreate order=${orderId} skipped=get_lease_${leased.kind}`);
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.PROCESSING,
        created: false,
        queried: false,
        hasOpenCreate: true,
        hasReference: true,
      };
    }
    const outcome = leased.value;
    await this.repository.closeQueryAttempt({
      attemptId: claimed.attemptId,
      failed: outcome.stored !== true,
    }).catch(() => undefined);
    if (outcome.result) {
      this.logger.log(`queryOpenCreate order=${orderId} queried=true stored=true`);
      return { ...outcome.result, queried: true, hasOpenCreate: false, hasReference: true };
    }
    this.logger.log(
      outcome.persistFailed
        ? `queryOpenCreate order=${orderId} queried=true persist=failed`
        : `queryOpenCreate order=${orderId} queried=true ready=false`,
    );
    return {
      orderId,
      fulfillmentStatus: outcome.fulfillmentStatus,
      created: false,
      queried: true,
      hasOpenCreate: true,
      hasReference: true,
    };
  }

  private async resumeExistingCreate(
    orderId: string,
    quote: EsimQuoteRow,
  ): Promise<EsimFulfillmentResult | null> {
    if (await this.repository.hasProfile(quote.orderItemId)) {
      return {
        orderId,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        created: false,
        queried: false,
        hasOpenCreate: false,
        hasReference: false,
      };
    }
    const openCreate = await this.repository.findOpenCreate(quote.orderItemId);
    if (!openCreate) {
      return null;
    }
    const ids = this.resolveAiraloIds(openCreate.providerReference, openCreate.safeResponseMeta);
    const hasReference = Boolean(
      ids.numericId || ids.orderCode || this.cleanReference(openCreate.providerReference),
    );
    if (quote.providerMode === 'LIVE' && hasReference && this.provider.getInstallDetails) {
      const reference =
        ids.numericId ?? ids.orderCode ?? this.cleanReference(openCreate.providerReference);
      if (!reference) {
        return this.acknowledgeOpenCreate(orderId, quote.orderItemId, openCreate);
      }
      const claimed = await this.repository.insertQuery({
        quote,
        providerReference: reference,
        createAttemptId: openCreate.attemptId,
      });
      if (claimed === 'conflict') {
        const status = await this.repository.getOrderFulfillmentStatus(orderId);
        this.logger.log(`resumeExistingCreate order=${orderId} skipped=query_claim_conflict`);
        return {
          orderId,
          fulfillmentStatus: status ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
          created: false,
          queried: false,
          hasOpenCreate: true,
          hasReference: true,
        };
      }
      const leased = await this.runInstallGet(
        openCreate.attemptId,
        {
          orderId,
          orderItemId: quote.orderItemId,
          queryAttemptId: claimed.attemptId,
        },
        async () =>
          this.recoverLiveInstall(orderId, quote, openCreate.attemptId, {
            ...ids,
            fallback: this.cleanReference(openCreate.providerReference),
          }),
      );
      if (leased.kind !== 'ran') {
        await this.repository.closeQueryAttempt({
          attemptId: claimed.attemptId,
          failed: true,
        }).catch(() => undefined);
        const status = await this.repository.getOrderFulfillmentStatus(orderId);
        this.logger.log(`resumeExistingCreate order=${orderId} skipped=get_lease_${leased.kind}`);
        return {
          orderId,
          fulfillmentStatus: status ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
          created: false,
          queried: false,
          hasOpenCreate: true,
          hasReference: true,
        };
      }
      const recovered = leased.value;
      await this.repository.closeQueryAttempt({
        attemptId: claimed.attemptId,
        failed: recovered.fulfillmentStatus !== FulfillmentStatus.COMPLETED,
      }).catch(() => undefined);
      return {
        ...recovered,
        queried: true,
        hasOpenCreate: recovered.fulfillmentStatus !== FulfillmentStatus.COMPLETED,
        hasReference: true,
      };
    }
    const acknowledged = await this.acknowledgeOpenCreate(orderId, quote.orderItemId, openCreate);
    return {
      ...acknowledged,
      queried: false,
      hasOpenCreate: true,
      hasReference,
    };
  }

  private async refuseFirstCreateIfBlocked(orderId: string): Promise<EsimFulfillmentResult | null> {
    const status = await this.repository.getOrderFulfillmentStatus(orderId);
    if (!status || FIRST_CREATE_BLOCKED.has(status) || status === FulfillmentStatus.PROCESSING) {
      return {
        orderId,
        fulfillmentStatus: status ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
        created: false,
      };
    }
    if (
      status !== FulfillmentStatus.PENDING &&
      status !== FulfillmentStatus.WAITING_ADMIN_RETRY
    ) {
      return { orderId, fulfillmentStatus: status, created: false };
    }
    return null;
  }

  private async claimFirstCreateOrRefuse(orderId: string): Promise<EsimFulfillmentResult | null> {
    const claimed = await this.repository.claimFirstCreate(orderId);
    if (claimed) {
      return null;
    }
    const status = await this.repository.getOrderFulfillmentStatus(orderId);
    return {
      orderId,
      fulfillmentStatus: status ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
    };
  }

  /**
   * Read a stored provider reference. This does not create an order.
   * A provider status string is recorded raw and is not delivery success.
   */
  async query(orderId: string): Promise<EsimFulfillmentResult> {
    const skipped = await this.skippedAdminTest(orderId);
    if (skipped) return skipped;
    await this.settings?.reload();
    const quote = await this.repository.findQuoteByOrderId(orderId);
    if (!quote) {
      throw new NotFoundException('eSIM quote not found');
    }
    const review = {
      orderId,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
    };
    if (quote.providerMode !== 'LIVE') {
      return review;
    }
    const open = await this.repository.findOpenCreateReference(quote.orderItemId);
    const ids = open
      ? this.resolveAiraloIds(open.providerReference, open.safeResponseMeta)
      : { numericId: undefined, orderCode: undefined };
    const reference = ids.numericId ?? ids.orderCode ?? this.cleanReference(open?.providerReference);
    if (!open || !reference) {
      return review;
    }
    const inserted = await this.repository.insertQuery({
      quote,
      providerReference: reference,
      createAttemptId: open.attemptId,
    });
    if (inserted === 'conflict') {
      return review;
    }
    const leased = await this.runInstallGet(
      open.attemptId,
      {
        orderId,
        orderItemId: quote.orderItemId,
        queryAttemptId: inserted.attemptId,
      },
      async () => {
        let providerStatus: string | undefined;
        let failed = false;
        try {
          const result = await this.provider.getOrder(reference);
          providerStatus = this.cleanStatus(result.status);
        } catch {
          failed = true;
        }
        return { providerStatus, failed };
      },
    );
    if (leased.kind !== 'ran') {
      await this.repository.closeQueryAttempt({
        attemptId: inserted.attemptId,
        failed: true,
      }).catch(() => undefined);
      return review;
    }
    try {
      await this.repository.closeQueryAttempt({
        attemptId: inserted.attemptId,
        providerStatus: leased.value.providerStatus,
        failed: leased.value.failed,
      });
    } catch {
      throw new Error('QUERY claim could not be closed');
    }
    return review;
  }

  /** Persisted clientTrace.adminTest only. A replayed job still stops here. */
  private async skippedAdminTest(orderId: string): Promise<EsimFulfillmentResult | null> {
    const skip = this.repository.skipAdminTestFulfillment;
    if (typeof skip !== 'function') return null;
    const skipped = await skip.call(this.repository, orderId);
    if (!skipped) return null;
    this.logger.log(`admin test order ${orderId} fulfillment skipped`);
    return {
      orderId,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: false,
      hasOpenCreate: false,
      hasReference: false,
    };
  }

  private async fulfillLive(orderId: string, quote: EsimQuoteRow): Promise<EsimFulfillmentResult> {
    const review = {
      orderId,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
    };
    const claimed = await this.claimFirstCreateOrRefuse(orderId);
    if (claimed) {
      return claimed;
    }
    const inserted = await this.repository.insertOpenCreate(quote);
    if (inserted === 'conflict') {
      return this.acknowledgeOpenCreate(orderId, quote.orderItemId);
    }
    try {
      await this.repository.recordOrderEvent?.(
        orderId,
        OrderEventType.PROVIDER_REQUEST,
        'Airalo CREATE started',
      );
      const latest = await this.repository.getOrderFulfillmentStatus(orderId);
      if (latest !== FulfillmentStatus.PROCESSING) {
        return {
          orderId,
          fulfillmentStatus: latest ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
          created: false,
        };
      }
      const result = await this.provider.createOrder({
        items: [{ bundleName: quote.providerProductCode, quantity: 1 }],
        assign: true,
      });
      const reference = this.cleanReference(result.orderReference);
      const ids = this.resolveAiraloIds(reference, {
        providerOrderId: result.providerOrderId,
        providerOrderCode: result.providerOrderCode,
      });
      let installSecret = this.cleanInstallSecret(result.installSecret);
      let iccid = this.cleanIccid(result.iccid);
      this.logger.log(
        `Airalo CREATE order=${orderId} ref=${reference ?? 'none'} hasLpa=${Boolean(installSecret)} hasIccid=${Boolean(iccid)}`,
      );
      if (!reference && !ids.numericId && !ids.orderCode) {
        await this.repository.markUnconfirmed(inserted.attemptId, quote.orderItemId);
        return review;
      }
      const storedReference = reference ?? ids.orderCode ?? ids.numericId;
      if (!storedReference) {
        await this.repository.markUnconfirmed(inserted.attemptId, quote.orderItemId);
        return review;
      }
      await this.repository.saveCreateReference({
        attemptId: inserted.attemptId,
        orderItemId: quote.orderItemId,
        providerReference: storedReference,
        providerStatus: this.cleanStatus(result.status),
        hasInstallSecret: Boolean(installSecret),
        providerOrderId: ids.numericId,
        providerOrderCode: ids.orderCode,
      });
      if (!installSecret && this.provider.getInstallDetails) {
        const queryClaim = await this.repository.insertQuery({
          quote,
          providerReference: storedReference,
          createAttemptId: inserted.attemptId,
        });
        if (queryClaim === 'conflict') {
          this.logger.log(`fulfillLive order=${orderId} skipped=query_claim_conflict`);
        } else {
          const leased = await this.runInstallGet(
            inserted.attemptId,
            {
              orderId,
              orderItemId: quote.orderItemId,
              queryAttemptId: queryClaim.attemptId,
            },
            async () => this.readInstallFromProvider({ ...ids, fallback: storedReference }),
          );
          if (leased.kind !== 'ran') {
            await this.repository.closeQueryAttempt({
              attemptId: queryClaim.attemptId,
              failed: true,
            }).catch(() => undefined);
            this.logger.log(`fulfillLive order=${orderId} skipped=get_lease_${leased.kind}`);
          } else {
            installSecret = leased.value.installSecret;
            iccid = iccid ?? leased.value.iccid;
            await this.repository.closeQueryAttempt({
              attemptId: queryClaim.attemptId,
              failed: !installSecret,
            }).catch(() => undefined);
          }
        }
      }
      if (!installSecret) {
        return review;
      }
      // Await so saveProfile rejection stays in this catch (no second CREATE).
      return await this.storeInstallSecret(
        orderId,
        quote.orderItemId,
        inserted.attemptId,
        installSecret,
        true,
        iccid,
      );
    } catch (error) {
      const message = this.safeErrorMessage(error);
      if (this.isDefiniteNoCreateError(error)) {
        await this.repository.markDefiniteNoCreate(
          inserted.attemptId,
          quote.orderItemId,
          message,
        );
        return {
          orderId,
          fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
          created: false,
        };
      }
      await this.repository.markUnconfirmed(inserted.attemptId, quote.orderItemId, message);
      return review;
    }
  }

  /**
   * Fetch install details for an Airalo order that already has a CREATE reference.
   * This is a GET, not a second CREATE.
   */
  private async recoverLiveInstall(
    orderId: string,
    quote: EsimQuoteRow,
    attemptId: string,
    ids: { numericId?: string; orderCode?: string; fallback?: string },
  ): Promise<EsimFulfillmentResult> {
    const review = {
      orderId,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
    };
    try {
      const install = await this.readInstallFromProvider(ids);
      if (!install.installSecret) {
        await this.repository.markUnconfirmed(
          attemptId,
          quote.orderItemId,
          'Airalo GET returned no install secret. Sandbox mock orders are not installable. No second CREATE.',
        );
        return review;
      }
      // Await so saveProfile rejection stays in this catch (no second CREATE).
      return await this.storeInstallSecret(
        orderId,
        quote.orderItemId,
        attemptId,
        install.installSecret,
        false,
        install.iccid,
      );
    } catch (error) {
      await this.repository.markUnconfirmed(
        attemptId,
        quote.orderItemId,
        this.safeErrorMessage(error),
      );
      return review;
    }
  }

  /**
   * Hold the Redis GET lease for the entire HTTP GET and any persist inside `run`.
   * Does not Promise.race; the lease is released only after `run` settles.
   */
  private async runInstallGet<T>(
    createAttemptId: string,
    meta: EsimLeaseMeta,
    run: () => Promise<T>,
  ): Promise<{ kind: 'ran'; value: T } | { kind: 'conflict' } | { kind: 'unverified' }> {
    if (!this.getLease) {
      this.logger.warn(`esim get lease missing createAttempt=${createAttemptId}`);
      return { kind: 'unverified' };
    }
    const acquired = await this.getLease.acquire(createAttemptId, meta);
    if (!acquired.ok) {
      return { kind: acquired.reason };
    }
    try {
      const value = await run();
      return { kind: 'ran', value };
    } finally {
      const released = await this.getLease.release(createAttemptId, acquired.payload);
      if (released !== 'released') {
        this.logger.warn(
          `esim get lease still held createAttempt=${createAttemptId} outcome=${released}`,
        );
      }
    }
  }

  private async readInstallFromProvider(ids: {
    numericId?: string;
    orderCode?: string;
    fallback?: string;
  }): Promise<{ installSecret?: string; iccid?: string }> {
    if (!this.provider.getInstallDetails) return {};
    const lookups = [ids.numericId, ids.orderCode, ids.fallback].filter(
      (value, index, all): value is string => Boolean(value) && all.indexOf(value) === index,
    );
    for (const lookup of lookups) {
      try {
        const details = await this.provider.getInstallDetails(lookup);
        const secret = this.cleanInstallSecret(details.installSecret);
        const iccid = this.cleanIccid(details.iccid);
        if (secret) return { installSecret: secret, iccid };
      } catch {
        // GET 422 is not proof the order was never created. Try the next identifier.
      }
    }
    return {};
  }

  private resolveAiraloIds(
    reference: string | null | undefined,
    meta?: Record<string, unknown> | null,
  ): { numericId?: string; orderCode?: string } {
    const fromMetaId =
      typeof meta?.providerOrderId === 'string' ? this.cleanReference(meta.providerOrderId) : undefined;
    const fromMetaCode =
      typeof meta?.providerOrderCode === 'string' ? this.cleanReference(meta.providerOrderCode) : undefined;
    const cleaned = this.cleanReference(reference);
    return {
      numericId: fromMetaId ?? (cleaned ? airaloNumericId(cleaned) : undefined),
      orderCode: fromMetaCode ?? (cleaned ? airaloOrderCode(cleaned) : undefined),
    };
  }

  private cleanIccid(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length >= 10 && trimmed.length <= 32 ? trimmed : undefined;
  }

  private async storeInstallSecret(
    orderId: string,
    orderItemId: string,
    attemptId: string,
    installSecret: string,
    created: boolean,
    iccid?: string,
  ): Promise<EsimFulfillmentResult> {
    const testData = isEsimTestSecret(installSecret) || installSecret.includes(ESIM_TEST_MARKER);
    try {
      await this.repository.saveProfile({
        orderItemId,
        attemptId,
        installSecretEnc: this.encryption.encrypt(installSecret),
        iccid: this.cleanIccid(iccid),
        testData,
        source: 'airalo',
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (await this.repository.hasProfile(orderItemId))
      ) {
        return {
          orderId,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
          created: false,
        };
      }
      throw error;
    }
    await this.repository.recordOrderEvent?.(
      orderId,
      OrderEventType.PROVIDER_SUCCESS,
      'Airalo install secret stored',
    );
    try {
      await this.notifyReady(orderId, installSecret);
    } catch {
      // Profile and COMPLETED stay. Mail can be retried without a new CREATE.
    }
    return {
      orderId,
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
      created,
    };
  }

  private async notifyReady(orderId: string, installSecret: string): Promise<void> {
    await this.repository.notifyDelivered(orderId);
    await this.notifications?.notifyEsimReady(orderId, {
      testData: isEsimTestSecret(installSecret),
      sandboxAccount: this.settings?.resolveAiraloAccountMode() !== 'production',
    });
  }

  /** True when CREATE never left this host or Airalo rejected before accepting an order. */
  private isDefiniteNoCreateError(error: unknown): boolean {
    if (error instanceof ForbiddenException) {
      const response = error.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : response && typeof response === 'object' && 'message' in response
            ? String((response as { message?: unknown }).message ?? '')
            : error.message;
      if (message.includes(ESIM_LIVE_HTTP_DISABLED) || /live http disabled/i.test(message)) {
        return true;
      }
    }
    if (error instanceof AiraloRequestError) {
      if (
        error.airaloCode === 11 ||
        error.airaloCode === 33 ||
        error.airaloCode === 34 ||
        error.airaloCode === 43 ||
        error.airaloCode === 88 ||
        error.airaloCode === 89
      ) {
        return true;
      }
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        return true;
      }
    }
    if (error instanceof Error && /AbortError|TimeoutError|The operation was aborted/i.test(error.name + error.message)) {
      return false;
    }
    return false;
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof AiraloRequestError) {
      if (error.airaloCode === 11) {
        return 'Airalo insufficient balance (code 11). Admin may retry after top-up. No second CREATE until then.';
      }
      if (error.airaloCode === 13) {
        return 'Airalo operator maintenance (code 13). Retry later via GET only. No second CREATE.';
      }
      if (error.airaloCode === 33) {
        return 'Airalo inventory unavailable (code 33). No second CREATE.';
      }
      if (error.airaloCode === 34) {
        return 'Airalo package invalid or out of stock (code 34). No second CREATE.';
      }
      if (error.airaloCode === 43) {
        return `Airalo validation error (code 43)${error.field ? ` field=${error.field}` : ''}. No second CREATE.`;
      }
      if (error.airaloCode === 53) {
        return 'Airalo unexpected processing error (code 53). No second CREATE.';
      }
      if (error.airaloCode === 83) {
        return 'Airalo duplicate request window (code 83). Recover only. No second CREATE.';
      }
      if (error.airaloCode === 88) {
        return 'Airalo ordering disabled (code 88). No second CREATE.';
      }
      if (error.airaloCode === 89) {
        return 'Airalo IP not allowlisted (code 89). No second CREATE.';
      }
      if (error.status === 401) {
        return 'Airalo authentication failed (401). No second CREATE.';
      }
      if (error.status === 403) {
        return 'Airalo request forbidden (403). No second CREATE.';
      }
      if (error.status === 404) {
        return 'Airalo resource not found (404). No second CREATE.';
      }
      if (error.status === 429) {
        return 'Airalo rate limited (429). No second CREATE.';
      }
      if (typeof error.status === 'number' && error.status >= 500) {
        return `Airalo server error (${error.status}). No second CREATE.`;
      }
    }
    if (error instanceof Error && error.message.trim()) {
      const message = error.message.trim().slice(0, 240);
      if (/LPA:1\$|Bearer\s+|client_secret|access_token|qrcode=|matching_id=/i.test(message)) {
        return 'Outcome unclear. No second CREATE.';
      }
      return message;
    }
    return 'Outcome unclear. No second CREATE.';
  }

  private async acknowledgeOpenCreate(
    orderId: string,
    orderItemId: string,
    known?: {
      outcome: EsimAttemptOutcome;
      providerReference: string | null;
    },
  ): Promise<EsimFulfillmentResult> {
    const openCreate = known ?? (await this.repository.findOpenCreate(orderItemId));
    const review = {
      orderId,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
    };
    if (!openCreate) {
      return review;
    }
    const reference = this.cleanReference(openCreate.providerReference);
    if (openCreate.outcome !== EsimAttemptOutcome.SENT || reference) {
      return review;
    }
    let fulfillmentStatus: FulfillmentStatus;
    try {
      fulfillmentStatus = await this.repository.markNeedsReview(orderItemId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Order status could not be marked for review'
      ) {
        throw error;
      }
      throw new Error('Order status could not be marked for review');
    }
    return { orderId, fulfillmentStatus, created: false };
  }

  private cleanReference(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const reference = value.trim();
    if (!reference || reference.length > 128) return undefined;
    if (!/^[A-Za-z0-9._:-]+$/.test(reference)) return undefined;
    return reference;
  }

  private cleanInstallSecret(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const secret = value.trim();
    if (!secret.startsWith('LPA:1$') || secret.length > 400) return undefined;
    const parts = secret.split('$');
    if (parts.length !== 3 || parts.some((part) => part.trim() === '')) return undefined;
    return secret;
  }

  private cleanStatus(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const status = value.trim();
    if (!status || status.length > 64) return undefined;
    if (!/^[A-Za-z0-9 _.-]+$/.test(status)) return undefined;
    return status;
  }
}

export type { EsimQuoteRow };
