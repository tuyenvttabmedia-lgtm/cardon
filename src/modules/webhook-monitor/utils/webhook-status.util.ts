import { PaymentRecordStatus, WebhookLog, WebhookSource } from '@prisma/client';
import { WEBHOOK_DELIVERY_STATUS } from '../../webhook-delivery/entities/webhook-delivery.constants';
import { WebhookDeliveryMonitorMetadata } from '../../webhook-delivery/entities/webhook-delivery.types';
import {
  WebhookHealth,
  WebhookMonitorStatus,
  FAILURE_RATE_WARNING_PCT,
  TIMEOUT_RATE_WARNING_PCT,
  NO_WEBHOOK_WARNING_MINUTES,
} from '../entities/webhook-monitor.constants';

export interface PaymentContext {
  id: string;
  orderId: string;
  status: PaymentRecordStatus;
  gateway: string;
}

function isPartnerOutbound(log: WebhookLog): boolean {
  const meta = (log.monitorMetadata ?? {}) as unknown as Partial<WebhookDeliveryMonitorMetadata>;
  return log.source === WebhookSource.PARTNER && meta.direction === 'outbound';
}

function derivePartnerDeliveryStatus(log: WebhookLog): WebhookMonitorStatus {
  const meta = (log.monitorMetadata ?? {}) as unknown as WebhookDeliveryMonitorMetadata;
  if (log.cancelledAt || meta.deliveryStatus === WEBHOOK_DELIVERY_STATUS.CANCELLED) {
    return 'IGNORED';
  }
  switch (meta.deliveryStatus) {
    case WEBHOOK_DELIVERY_STATUS.DELIVERED:
      return 'SUCCESS';
    case WEBHOOK_DELIVERY_STATUS.DEAD_LETTER:
    case WEBHOOK_DELIVERY_STATUS.FAILED:
      return 'FAILED';
    case WEBHOOK_DELIVERY_STATUS.RETRYING:
      return 'RETRY';
    case WEBHOOK_DELIVERY_STATUS.PENDING:
    case WEBHOOK_DELIVERY_STATUS.SENDING:
      return log.retryCount > 0 ? 'RETRY' : 'PENDING';
    default:
      return 'PENDING';
  }
}

export function deriveWebhookStatus(
  log: WebhookLog,
  payment: PaymentContext | null,
  isDuplicate: boolean,
): WebhookMonitorStatus {
  if (isPartnerOutbound(log)) {
    return derivePartnerDeliveryStatus(log);
  }
  if (log.cancelledAt) return 'IGNORED';
  if (!log.signatureValid) return 'INVALID_SIGNATURE';
  if (isDuplicate) return 'DUPLICATE';
  if (log.retryCount > 0 && !log.processed) return 'RETRY';
  if (payment?.status === PaymentRecordStatus.FAILED) return 'FAILED';
  if (payment?.status === PaymentRecordStatus.SUCCESS) return 'SUCCESS';
  if (!log.processed) return 'PENDING';
  return 'SUCCESS';
}

export function deriveHttpCode(status: WebhookMonitorStatus): number {
  switch (status) {
    case 'INVALID_SIGNATURE':
      return 401;
    case 'FAILED':
    case 'TIMEOUT':
      return 422;
    case 'DUPLICATE':
    case 'IGNORED':
      return 200;
    case 'PENDING':
    case 'RETRY':
      return 202;
    default:
      return 200;
  }
}

export function extractPayloadField(payload: unknown, ...keys: string[]): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  for (const key of keys) {
    const val = data[key];
    if (val != null && val !== '') return String(val);
  }
  return null;
}

export function webhookSourceToGateway(source: WebhookSource): string {
  if (source === WebhookSource.MEGAPAY) return 'megapay';
  if (source === WebhookSource.SEPAY) return 'sepay';
  return source.toLowerCase();
}

export function computeSourceHealth(input: {
  total: number;
  failed: number;
  invalidSignature: number;
  timeout: number;
  lastReceivedAt: Date | null;
}): WebhookHealth {
  if (input.invalidSignature > 0) return 'CRITICAL';
  if (input.total === 0) return 'WARNING';
  const failurePct = (input.failed / input.total) * 100;
  const timeoutPct = (input.timeout / input.total) * 100;
  if (failurePct > FAILURE_RATE_WARNING_PCT || timeoutPct > TIMEOUT_RATE_WARNING_PCT) {
    return 'WARNING';
  }
  if (input.lastReceivedAt) {
    const ageMin = (Date.now() - input.lastReceivedAt.getTime()) / 60_000;
    if (ageMin > NO_WEBHOOK_WARNING_MINUTES) return 'WARNING';
  }
  return 'HEALTHY';
}

export function buildWebhookTimeline(
  status: WebhookMonitorStatus,
  createdAt: Date,
  retryCount: number,
): Array<{ step: string; label: string; at: string | null }> {
  const at = createdAt.toISOString();
  const steps: Array<{ step: string; label: string; at: string | null }> = [
    { step: 'received', label: 'Webhook Received', at },
  ];
  if (status === 'INVALID_SIGNATURE') {
    steps.push({ step: 'invalid', label: 'Invalid Signature', at });
    return steps;
  }
  steps.push({ step: 'validated', label: 'Validated', at });
  steps.push({ step: 'queued', label: 'Queued', at });
  for (let i = 1; i <= retryCount; i += 1) {
    steps.push({ step: `retry-${i}`, label: `Retry #${i}`, at });
  }
  if (status === 'PENDING' || status === 'RETRY') {
    steps.push({ step: 'processing', label: 'Processing', at: null });
    return steps;
  }
  steps.push({ step: 'processing', label: 'Processing', at });
  if (status === 'FAILED' || status === 'TIMEOUT') {
    steps.push({ step: 'failed', label: 'Failed', at });
  } else if (status === 'DUPLICATE') {
    steps.push({ step: 'duplicate', label: 'Duplicate', at });
  } else {
    steps.push({ step: 'completed', label: 'Completed', at });
  }
  return steps;
}
