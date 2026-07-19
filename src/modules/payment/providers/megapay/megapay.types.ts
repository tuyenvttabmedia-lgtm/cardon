export type MegapayGatewayStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'UNKNOWN';

export interface MegapayCreateRequest {
  merchant_id: string;
  order_id: string;
  amount: number;
  description: string;
  return_url: string;
  callback_url: string;
  signature: string;
}

export interface MegapayCreateResponse {
  request_id: string;
  order_id: string;
  payment_url: string;
  status: MegapayGatewayStatus;
}

export interface MegapayWebhookPayload {
  merchant_id?: string;
  order_id: string;
  amount?: string | number;
  status: MegapayGatewayStatus;
  request_id?: string;
  signature: string;
}

export interface MegapayQueryResponse {
  order_id: string;
  amount: string;
  status: MegapayGatewayStatus | 'EXPIRED';
  request_id?: string;
}

export function mapMegapayWebhookStatus(
  status: string,
): 'SUCCESS' | 'FAILED' | 'PENDING' {
  const upper = status.toUpperCase();
  if (upper === 'SUCCESS') {
    return 'SUCCESS';
  }
  if (upper === 'FAILED') {
    return 'FAILED';
  }
  return 'PENDING';
}

export function mapMegapayQueryStatus(
  status: string,
): 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' {
  const upper = status.toUpperCase();
  if (upper === 'SUCCESS') {
    return 'SUCCESS';
  }
  if (upper === 'FAILED') {
    return 'FAILED';
  }
  if (upper === 'EXPIRED') {
    return 'EXPIRED';
  }
  return 'PENDING';
}
