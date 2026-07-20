export const DEPOSITCODE_PCODE = {
  REGISTER: '9000',
  UPDATE: '9001',
  CANCEL: '9002',
  CHECK_BY_REQUEST: '9099',
  CHECK_BY_MAP: '9098',
} as const;

export interface DepositCodeRegisterData {
  map_id: string;
  amount: number;
  start_date: string;
  end_date: string;
  /** 01 any | 02 >= | 03 exact | 04 <= */
  condition: string;
  customer_name: string;
  request_id: string;
  bank_code: string;
  extend?: {
    phone?: string;
    email?: string;
    address?: string;
    id?: string;
  };
}

export interface DepositCodeApiEnvelope {
  pcode: string;
  merchant_code: string;
  data: string;
}

export interface DepositCodeRegisterResponse {
  response_code: string;
  message?: string;
  account_no?: string;
  account_name?: string;
  bank_code?: string;
  bank_name?: string;
  map_id?: string;
  qr_code?: string;
  qr_dataRaw?: string;
  qr_url?: string;
  amount?: number;
}

/** IPN / notify payload from EPAY → merchant (PascalCase per docs). */
export interface DepositCodeNotifyPayload {
  MerchantCode?: string;
  RequestId?: string;
  RequestTime?: string;
  BankTranTime?: string;
  ReferenceId?: string;
  MapId?: string;
  Amount?: number | string;
  Signature?: string;
  Fee?: number | string;
  VaName?: string;
  VaAcc?: string;
  BankCode?: string;
  BankName?: string;
  Remark?: string;
  // tolerate camelCase variants
  merchantCode?: string;
  requestId?: string;
  requestTime?: string;
  referenceId?: string;
  mapId?: string;
  amount?: number | string;
  signature?: string;
  fee?: number | string;
  vaName?: string;
  vaAcc?: string;
  bankCode?: string;
  bankName?: string;
  remark?: string;
}

export interface DepositCodeNotifyResponse {
  ResponseCode: string;
  ResponseMessage: string;
}

export function normalizeDepositCodeNotify(
  payload: DepositCodeNotifyPayload,
): {
  merchantCode: string;
  requestId: string;
  requestTime: string;
  referenceId: string;
  mapId: string;
  amount: string;
  fee: string;
  vaAcc: string;
  vaName: string;
  bankCode: string;
  bankName: string;
  remark: string;
  signature: string;
  bankTranTime: string;
} {
  return {
    merchantCode: String(payload.MerchantCode ?? payload.merchantCode ?? ''),
    requestId: String(payload.RequestId ?? payload.requestId ?? ''),
    requestTime: String(payload.RequestTime ?? payload.requestTime ?? ''),
    referenceId: String(payload.ReferenceId ?? payload.referenceId ?? ''),
    mapId: String(payload.MapId ?? payload.mapId ?? ''),
    amount: String(payload.Amount ?? payload.amount ?? ''),
    fee: String(payload.Fee ?? payload.fee ?? '0'),
    vaAcc: String(payload.VaAcc ?? payload.vaAcc ?? ''),
    vaName: String(payload.VaName ?? payload.vaName ?? ''),
    bankCode: String(payload.BankCode ?? payload.bankCode ?? ''),
    bankName: String(payload.BankName ?? payload.bankName ?? ''),
    remark: String(payload.Remark ?? payload.remark ?? ''),
    signature: String(payload.Signature ?? payload.signature ?? ''),
    bankTranTime: String(payload.BankTranTime ?? ''),
  };
}

export function depositCodeNotifySuccess(): DepositCodeNotifyResponse {
  return { ResponseCode: '200', ResponseMessage: 'Success' };
}

export function depositCodeNotifyDuplicate(): DepositCodeNotifyResponse {
  return {
    ResponseCode: '102',
    ResponseMessage: 'Duplicate ReferenceId',
  };
}

export function depositCodeNotifyBadSignature(): DepositCodeNotifyResponse {
  return { ResponseCode: '103', ResponseMessage: 'Invalid signature' };
}

export function depositCodeNotifyBadAmount(): DepositCodeNotifyResponse {
  return { ResponseCode: '125', ResponseMessage: 'Invalid amount' };
}

export function depositCodeNotifyFailed(message: string): DepositCodeNotifyResponse {
  return { ResponseCode: '11', ResponseMessage: message };
}
