export const FINANCE_HISTORY_CATEGORIES = [
  { value: '', label: 'Tất cả' },
  { value: 'NAP_TIEN', label: 'Nạp tiền' },
  { value: 'RUT_TIEN', label: 'Rút tiền' },
  { value: 'MUA_HANG', label: 'Mua hàng' },
  { value: 'HOAN_TIEN', label: 'Hoàn tiền' },
  { value: 'DIEU_CHINH', label: 'Điều chỉnh' },
  { value: 'DOI_SOAT', label: 'Đối soát' },
  { value: 'CHIET_KHAU', label: 'Chiết khấu' },
] as const;

export const FINANCE_ADJUSTMENT_LABELS: Record<string, string> = {
  DEPOSIT: 'Nạp tiền',
  WITHDRAW: 'Rút tiền',
  REFUND: 'Hoàn tiền',
  COMMISSION: 'Chiết khấu',
  ADJUSTMENT: 'Điều chỉnh thủ công',
  MANUAL_CREDIT: 'Cộng tiền',
  MANUAL_DEBIT: 'Trừ tiền',
};

export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  LOCKED: 'Đã khóa',
  INVOICED: 'Đã xuất HĐ',
  PAID: 'Đã thanh toán',
};

export const SETTLEMENT_PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PARTIAL: 'Thanh toán một phần',
  PAID: 'Đã thanh toán',
  OVERDUE: 'Quá hạn',
};

export { exportLedgerCsv, exportLedgerExcel, exportLedgerPdf } from '@/lib/wallet/constants';
