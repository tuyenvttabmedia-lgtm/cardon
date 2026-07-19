import { WebhookDeliveryStatus, WebhookEventType } from './webhook-delivery.constants';

export interface WebhookDeliveryTimelineEntry {
  at: string;
  status: WebhookDeliveryStatus | string;
  detail?: string;
  httpStatus?: number | null;
  attempt?: number;
}

export interface WebhookDeliveryMonitorMetadata {
  direction: 'outbound';
  deliveryStatus: WebhookDeliveryStatus;
  agentId: string;
  orderId: string;
  requestId: string | null;
  partnerOrderId: string | null;
  destinationUrl: string;
  event: WebhookEventType;
  version: string;
  httpStatus: number | null;
  latencyMs: number | null;
  lastError: string | null;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
  signatureMasked?: string | null;
  timeline: WebhookDeliveryTimelineEntry[];
  gateway?: string | null;
  provider?: string | null;
}

export interface WebhookDeliveryJobData {
  deliveryId: string;
  manualRetry?: boolean;
}

export interface PartnerWebhookPayloadV1 {
  version: typeof import('./webhook-delivery.constants').WEBHOOK_EVENT_VERSION;
  event: WebhookEventType;
  request_id: string;
  order_id: string;
  partner_order_id: string;
  status: 'SUCCESS' | 'FAILED' | 'PROCESSING';
  product?: string;
  face_value?: number;
  serial?: string;
  pin?: string;
  provider?: string;
  gateway?: string;
  amount?: string;
  created_at: string;
  completed_at?: string;
  error?: { code: string; message: string };
}
