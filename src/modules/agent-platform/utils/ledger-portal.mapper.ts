import {
  LedgerEntry,
  LedgerEntryType,
  LedgerReferenceType,
} from '@prisma/client';

export const PORTAL_LEDGER_TYPES = [
  'PURCHASE',
  'REFUND',
  'COMMISSION',
  'ADJUSTMENT',
  'SETTLEMENT',
  'DEPOSIT',
  'WITHDRAW',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT',
  'TRANSFER',
  'HOLD',
  'RELEASE',
] as const;

export type PortalLedgerType = (typeof PORTAL_LEDGER_TYPES)[number];

export function mapLedgerToPortalType(
  entry: Pick<LedgerEntry, 'type' | 'referenceType' | 'description' | 'createdById'>,
): PortalLedgerType {
  const desc = (entry.description ?? '').toLowerCase();

  if (entry.type === LedgerEntryType.HOLD) return 'HOLD';
  if (entry.type === LedgerEntryType.RELEASE) return 'RELEASE';

  if (entry.referenceType === LedgerReferenceType.TOPUP) {
    return entry.createdById ? 'MANUAL_CREDIT' : 'DEPOSIT';
  }

  if (entry.referenceType === LedgerReferenceType.REFUND) return 'REFUND';
  if (entry.referenceType === LedgerReferenceType.ADJUSTMENT) {
    if (entry.type === LedgerEntryType.CREDIT) return 'MANUAL_CREDIT';
    if (entry.type === LedgerEntryType.DEBIT) return 'MANUAL_DEBIT';
    return 'ADJUSTMENT';
  }

  if (entry.referenceType === LedgerReferenceType.ORDER) {
    if (entry.type === LedgerEntryType.DEBIT) return 'PURCHASE';
    if (entry.type === LedgerEntryType.CREDIT) return 'REFUND';
    return 'PURCHASE';
  }

  if (entry.referenceType === LedgerReferenceType.TRANSACTION) {
    if (desc.includes('commission')) return 'COMMISSION';
    if (desc.includes('settlement')) return 'SETTLEMENT';
    if (desc.includes('withdraw')) return 'WITHDRAW';
    if (desc.includes('transfer')) return 'TRANSFER';
    return entry.type === LedgerEntryType.CREDIT ? 'DEPOSIT' : 'PURCHASE';
  }

  if (entry.type === LedgerEntryType.CREDIT) return 'MANUAL_CREDIT';
  if (entry.type === LedgerEntryType.DEBIT) return 'MANUAL_DEBIT';
  return 'ADJUSTMENT';
}

export function ledgerEntryStatus(entry: Pick<LedgerEntry, 'type'>): 'COMPLETED' | 'PENDING' | 'FAILED' {
  if (entry.type === LedgerEntryType.HOLD) return 'PENDING';
  return 'COMPLETED';
}

export function signedAmount(
  entry: Pick<LedgerEntry, 'type' | 'amount'>,
): string {
  const amount = entry.amount.toFixed(2);
  if (entry.type === LedgerEntryType.CREDIT || entry.type === LedgerEntryType.RELEASE) {
    return amount;
  }
  if (entry.type === LedgerEntryType.DEBIT || entry.type === LedgerEntryType.HOLD) {
    return `-${amount}`;
  }
  return amount;
}
