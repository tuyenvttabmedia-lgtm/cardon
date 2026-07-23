import { ProviderTransactionStatus } from '@prisma/client';
import {
  ProviderFailureCode,
  ProviderResult,
} from '../../interfaces/provider.interface';

const ESALE_FAIL_CODES = new Set([
  -1, -1000, -1001, -1002, -1003, -1004, -1005, -2000, -2001, -3000, -3001,
  -3002, -3004, -4000,
]);

const ESALE_TOPUP_FAIL_CODES = new Set([
  -1, -1000, -1001, -1002, -1003, -1004, -1005, -2000, -2001, -3000, -3002,
  -3003, -3005, -4000,
]);

export function mapEsaleRetCodeToFailure(
  retCode: number,
): ProviderFailureCode | undefined {
  if (retCode === -3004) {
    return 'OUT_OF_STOCK';
  }
  if (retCode === -3000) {
    return 'LOW_BALANCE';
  }
  if (retCode === -4000) {
    return 'MAINTENANCE';
  }
  if (retCode === -1002) {
    return 'INVALID_SKU';
  }
  if (retCode === -1 || ESALE_FAIL_CODES.has(retCode)) {
    return 'UNKNOWN';
  }
  return undefined;
}

export function isEsaleProcessingRetCode(retCode: number): boolean {
  return retCode !== 1 && !ESALE_FAIL_CODES.has(retCode);
}

export function isEsaleTopupProcessingRetCode(retCode: number): boolean {
  return retCode !== 1 && !ESALE_TOPUP_FAIL_CODES.has(retCode);
}

/** eSale topup `data.providerCode` — carrier-level detail (not Buy Card). */
export const ESALE_TOPUP_PROVIDER_CODE_LABEL: Record<number, string> = {
  0: 'Đang xử lý tại nhà mạng',
  1: 'Nạp thành công',
  2: 'Thuê bao chưa kích hoạt',
  3: 'Thuê bao không tồn tại',
  4: 'Thuê bao bị khóa',
  5: 'Số trả sau',
  6: 'Giao dịch thất bại',
};

export function isEsaleTopupCarrierFailure(providerCode?: number): boolean {
  return typeof providerCode === 'number' && providerCode >= 2 && providerCode <= 6;
}

export function describeEsaleTopupProviderCode(providerCode?: number): string | undefined {
  if (typeof providerCode !== 'number') {
    return undefined;
  }
  return ESALE_TOPUP_PROVIDER_CODE_LABEL[providerCode] ?? `providerCode=${providerCode}`;
}

export function buildFailedResult(params: {
  retCode: number;
  retMsg: string;
  rawResponse: Record<string, unknown>;
  providerTransactionId?: string;
}): ProviderResult {
  const failureCode = mapEsaleRetCodeToFailure(params.retCode);
  if (isEsaleProcessingRetCode(params.retCode)) {
    return {
      success: false,
      status: ProviderTransactionStatus.PENDING,
      failureCode: 'TIMEOUT',
      message: params.retMsg,
      providerTransactionId: params.providerTransactionId,
      rawResponse: params.rawResponse,
    };
  }

  return {
    success: false,
    status: ProviderTransactionStatus.FAILED,
    failureCode: failureCode ?? 'UNKNOWN',
    message: params.retMsg,
    providerTransactionId: params.providerTransactionId,
    rawResponse: params.rawResponse,
  };
}

export function parseEsaleExpiredDate(value: string): Date | undefined {
  const match = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) {
    return undefined;
  }
  const [, day, month, year, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

export function formatEsaleTransactionDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseProviderProductCode(code: string): {
  supplierCode: string;
  cardId: number;
} {
  const separatorIndex = code.indexOf(':');
  if (separatorIndex <= 0) {
    throw new Error(
      `Invalid eSale providerProductCode "${code}". Expected SUPPLIER:CARD_ID`,
    );
  }
  const supplierCode = code.slice(0, separatorIndex).trim();
  const cardId = Number.parseInt(code.slice(separatorIndex + 1), 10);
  if (!supplierCode || Number.isNaN(cardId)) {
    throw new Error(
      `Invalid eSale providerProductCode "${code}". Expected SUPPLIER:CARD_ID`,
    );
  }
  return { supplierCode, cardId };
}

const ESALE_TOPUP_CODE_ALIASES: Record<string, string> = {
  viettel_topup: 'viettel',
  mobi_topup: 'mobifone',
  mobifone_topup: 'mobifone',
  vina_topup: 'vinaphone',
  vinaphone_topup: 'vinaphone',
  vietnamobile_topup: 'vietnamobile',
};

const ESALE_DATA_TELCO_PREFIX: Record<string, string> = {
  VIETTEL: 'viettel',
  MOBI: 'mobifone',
  MOBIFONE: 'mobifone',
  VINA: 'vinaphone',
  VINAPHONE: 'vinaphone',
};

function normalizeTelcoToken(token: string): string {
  const lower = token.toLowerCase();
  if (lower === 'mobi') return 'mobifone';
  if (lower === 'vina') return 'vinaphone';
  return lower;
}

export function isCard3gDataProviderCode(code: string): boolean {
  const normalized = code.trim();
  const separatorIndex = normalized.indexOf(':');
  if (separatorIndex <= 0) {
    return false;
  }
  const supplierCode = normalized.slice(0, separatorIndex).trim().toUpperCase();
  const cardId = Number.parseInt(normalized.slice(separatorIndex + 1), 10);
  return supplierCode.endsWith('3G') && !Number.isNaN(cardId);
}

export function parseDataProductCode(code: string): {
  packageCode: string;
  telco?: string;
} {
  const normalized = code.trim();
  const dataMatch = normalized.match(
    /^(VIETTEL|MOBI|MOBIFONE|VINA|VINAPHONE)_DATA_(.+)$/i,
  );
  if (dataMatch) {
    const prefix = dataMatch[1].toUpperCase();
    return {
      packageCode: dataMatch[2],
      telco: ESALE_DATA_TELCO_PREFIX[prefix],
    };
  }
  return { packageCode: normalized };
}

export function parseTopupProductCode(
  code: string,
  fallbackAmount: number,
): {
  telco?: string;
  amount: number;
} {
  const normalized = code.trim();
  const alias = ESALE_TOPUP_CODE_ALIASES[normalized.toLowerCase()];
  if (alias) {
    return { telco: alias, amount: fallbackAmount };
  }

  const skuMatch = normalized.match(
    /^(VIETTEL|MOBI|MOBIFONE|VINA|VINAPHONE|VIETNAMOBILE)_TOPUP_(\d+)$/i,
  );
  if (skuMatch) {
    return {
      telco: normalizeTelcoToken(skuMatch[1]),
      amount: Number.parseInt(skuMatch[2], 10),
    };
  }

  if (!normalized.includes(':')) {
    if (/^\d+$/.test(normalized)) {
      return { amount: Number.parseInt(normalized, 10) };
    }
    return { telco: normalized.toLowerCase(), amount: fallbackAmount };
  }

  const separatorIndex = normalized.indexOf(':');
  const left = normalized.slice(0, separatorIndex).trim();
  const right = normalized.slice(separatorIndex + 1).trim();
  const amount = Number.parseInt(right, 10);
  if (Number.isNaN(amount)) {
    throw new Error(
      `Invalid eSale topup providerProductCode "${code}". Expected TELCO:AMOUNT`,
    );
  }
  return { telco: left.toLowerCase(), amount };
}
