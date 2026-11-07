/**
 * PayPal Activity Download CSV parser (F3-B).
 *
 * Header map is PROVISIONAL — based on PayPal Developer Activity Download docs,
 * not yet locked against a KEYON-exported production sample.
 * When KEYON provides a real file, update REQUIRED_HEADERS / aliases and set
 * headerProvisional=false on imports after validation.
 */

import { createHash } from 'crypto';
import { PaypalReportLineKind } from '@prisma/client';

export const PAYPAL_ACTIVITY_HEADER_PROVISIONAL = true;

/** Canonical internal field → accepted CSV header aliases (case-insensitive). */
export const PAYPAL_ACTIVITY_HEADER_ALIASES: Record<string, string[]> = {
  transactionId: ['Transaction ID', 'TransactionID', 'transaction_id'],
  gross: ['Gross', 'gross_transaction_amount'],
  fee: ['Fee', 'fee_amount'],
  net: ['Net'],
  currency: ['Currency', 'gross_transaction_currency'],
  date: ['Date'],
  time: ['Time'],
  timeZone: ['TimeZone', 'Time Zone'],
  customId: ['Custom Number', 'CustomNumber', 'custom_field'],
  referenceTxnId: ['Reference Txn ID', 'Reference TxnId', 'Reference Transaction ID'],
  invoiceId: ['Invoice Number', 'Invoice Number Text', 'invoice_id'],
  type: ['Type'],
  status: ['Status'],
  balanceImpact: ['Balance Impact', 'BalanceImpact'],
  txnEventCode: ['Transaction Event Code', 'TransactionEventCode', 'transaction_event_code'],
};

export const PAYPAL_ACTIVITY_REQUIRED_FIELDS = [
  'transactionId',
  'gross',
  'fee',
  'net',
  'currency',
] as const;

export type PaypalActivityParsedRow = {
  paypalTxnId: string;
  paypalReferenceId: string | null;
  customId: string | null;
  invoiceId: string | null;
  gross: string;
  fee: string;
  net: string;
  currency: string;
  txnEventCode: string | null;
  statusRaw: string | null;
  typeRaw: string | null;
  balanceImpact: string | null;
  bookedAt: Date | null;
  kind: PaypalReportLineKind;
  raw: Record<string, string>;
};

export type PaypalActivityParseResult =
  | {
      ok: true;
      headers: string[];
      headerProvisional: true;
      rows: PaypalActivityParsedRow[];
      duplicateTxnIds: string[];
    }
  | { ok: false; error: string; headers?: string[] };

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function buildHeaderIndex(headers: string[]): Map<string, number> | { error: string } {
  const normalized = headers.map(normalizeHeader);
  const index = new Map<string, number>();
  for (const [field, aliases] of Object.entries(PAYPAL_ACTIVITY_HEADER_ALIASES)) {
    const aliasSet = new Set(aliases.map((a) => a.toLowerCase()));
    const found = normalized.findIndex((h) => aliasSet.has(h.toLowerCase()));
    if (found >= 0) index.set(field, found);
  }
  const missing = PAYPAL_ACTIVITY_REQUIRED_FIELDS.filter((f) => !index.has(f));
  if (missing.length > 0) {
    return {
      error: `Missing required Activity Download columns (provisional map): ${missing.join(', ')}. Headers seen: ${normalized.join(' | ')}`,
    };
  }
  return index;
}

/** Parse money to absolute decimal string with 2 fraction digits. */
export function parsePaypalMoney(raw: string): string | null {
  let s = raw.replace(/"/g, '').trim();
  if (!s || s === '--' || s === '-') return '0.00';
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  // European: 1.234,56 → 1234.56; US: 1,234.56 → 1234.56
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  return (negative ? abs : abs).toFixed(2);
}

export function classifyPaypalActivityRow(input: {
  typeRaw: string | null;
  statusRaw: string | null;
  balanceImpact: string | null;
  txnEventCode: string | null;
}): PaypalReportLineKind {
  const type = (input.typeRaw ?? '').toLowerCase();
  const status = (input.statusRaw ?? '').toLowerCase();
  const impact = (input.balanceImpact ?? '').toLowerCase();
  const code = (input.txnEventCode ?? '').toUpperCase();

  if (status.includes('pending') || status.includes('processing') || status === 'r') {
    return PaypalReportLineKind.NON_SETTLED;
  }
  if (
    code.startsWith('T04') ||
    type.includes('withdraw') ||
    type.includes('transfer to bank') ||
    type.includes('user initiated withdrawal') ||
    type.includes('general withdrawal')
  ) {
    return PaypalReportLineKind.PAYOUT_OR_BALANCE;
  }
  if (code === 'T1106' || type.includes('chargeback') || type.includes('dispute')) {
    return PaypalReportLineKind.CHARGEBACK;
  }
  if (code === 'T1107' || type.includes('refund')) {
    return PaypalReportLineKind.REFUND;
  }
  if (code === 'T1110' || type.includes('reversal') || status.includes('reversed')) {
    return PaypalReportLineKind.REVERSAL;
  }
  if (code.startsWith('T02') || type.includes('currency conversion')) {
    return PaypalReportLineKind.FX;
  }
  if (impact === 'memo') {
    return PaypalReportLineKind.OTHER;
  }
  if (
    status.includes('completed') ||
    status === 's' ||
    impact === 'credit' ||
    type.includes('express checkout') ||
    type.includes('website payment') ||
    type.includes('mobile payment') ||
    type.includes('paypal checkout') ||
    type.includes('payment')
  ) {
    return PaypalReportLineKind.SALE_CAPTURE;
  }
  return PaypalReportLineKind.OTHER;
}

function cell(cols: string[], index: Map<string, number>, field: string): string {
  const i = index.get(field);
  if (i == null || i >= cols.length) return '';
  return cols[i] ?? '';
}

function parseBookedAt(date: string, time: string, timeZone: string): Date | null {
  const d = date.trim();
  const t = time.trim() || '00:00:00';
  if (!d) return null;
  // US MM/DD/YYYY or ISO YYYY-MM-DD or YYYY/MM/DD
  let isoDate = d;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d);
  if (us) {
    isoDate = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  } else {
    isoDate = d.replace(/\//g, '-');
  }
  const tz = timeZone.trim();
  const candidate = tz ? `${isoDate}T${t}` : `${isoDate}T${t}Z`;
  const parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(`${isoDate}T${t}Z`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function parsePaypalActivityCsv(csvText: string): PaypalActivityParseResult {
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'CSV must include a header row and at least one data row' };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const indexOrErr = buildHeaderIndex(headers);
  if ('error' in indexOrErr) {
    return { ok: false, error: indexOrErr.error, headers };
  }
  const index = indexOrErr;

  const rows: PaypalActivityParsedRow[] = [];
  const seen = new Map<string, number>();
  const duplicateTxnIds: string[] = [];

  for (let r = 1; r < lines.length; r += 1) {
    const cols = splitCsvLine(lines[r]);
    if (cols.every((c) => !c)) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = cols[i] ?? '';
    });

    const txnId = cell(cols, index, 'transactionId').trim();
    if (!txnId) {
      return { ok: false, error: `Row ${r + 1}: Transaction ID is empty`, headers };
    }

    const gross = parsePaypalMoney(cell(cols, index, 'gross'));
    const fee = parsePaypalMoney(cell(cols, index, 'fee'));
    const netRaw = parsePaypalMoney(cell(cols, index, 'net'));
    if (gross == null || fee == null || netRaw == null) {
      return { ok: false, error: `Row ${r + 1}: invalid Gross/Fee/Net`, headers };
    }

    const currency = cell(cols, index, 'currency').trim().toUpperCase();
    if (currency.length !== 3) {
      return { ok: false, error: `Row ${r + 1}: invalid Currency`, headers };
    }

    const typeRaw = cell(cols, index, 'type') || null;
    const statusRaw = cell(cols, index, 'status') || null;
    const balanceImpact = cell(cols, index, 'balanceImpact') || null;
    const txnEventCode = cell(cols, index, 'txnEventCode') || null;
    const kind = classifyPaypalActivityRow({ typeRaw, statusRaw, balanceImpact, txnEventCode });

    const count = (seen.get(txnId) ?? 0) + 1;
    seen.set(txnId, count);
    if (count === 2) duplicateTxnIds.push(txnId);

    rows.push({
      paypalTxnId: txnId,
      paypalReferenceId: cell(cols, index, 'referenceTxnId').trim() || null,
      customId: cell(cols, index, 'customId').trim() || null,
      invoiceId: cell(cols, index, 'invoiceId').trim() || null,
      gross,
      fee,
      net: netRaw,
      currency,
      txnEventCode,
      statusRaw,
      typeRaw,
      balanceImpact,
      bookedAt: parseBookedAt(
        cell(cols, index, 'date'),
        cell(cols, index, 'time'),
        cell(cols, index, 'timeZone'),
      ),
      kind,
      raw,
    });
  }

  return {
    ok: true,
    headers,
    headerProvisional: true,
    rows,
    duplicateTxnIds,
  };
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
