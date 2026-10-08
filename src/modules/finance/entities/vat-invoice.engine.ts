/**
 * VAT invoice math for CardOn retail finance (B2C).
 * Unit prices on output invoices are always before VAT.
 */

export type VatProductLine = 'TOPUP' | 'PHONE_CARD' | 'GAME_CARD' | 'DATA' | 'OTHER';

export const VAT_RATE_BY_LINE: Record<VatProductLine, number> = {
  TOPUP: 0.1,
  PHONE_CARD: 0.1,
  GAME_CARD: 0.08,
  DATA: 0.1,
  OTHER: 0.1,
};

export const VAT_PRODUCT_LINE_LABELS: Record<VatProductLine, string> = {
  TOPUP: 'Nạp cước',
  PHONE_CARD: 'Thẻ điện thoại',
  GAME_CARD: 'Thẻ game',
  DATA: 'Data',
  OTHER: 'Khác',
};

export function roundVnd(n: number): number {
  return Math.round(n);
}

export function mapHomeServiceToVatLine(homeService: string | null | undefined): VatProductLine {
  switch (homeService) {
    case 'TOPUP':
      return 'TOPUP';
    case 'PHONE_CARD':
      return 'PHONE_CARD';
    case 'GAME_CARD':
      return 'GAME_CARD';
    case 'DATA':
      return 'DATA';
    default:
      return 'OTHER';
  }
}

export function vatRateForLine(line: VatProductLine): number {
  return VAT_RATE_BY_LINE[line];
}

/** Split VAT-inclusive amount → excl + tax (tax = inclusive − excl). */
export function splitInclusiveVat(amountInclVat: number, vatRate: number) {
  const excl = roundVnd(amountInclVat / (1 + vatRate));
  const vat = amountInclVat - excl;
  return { excl, vat, incl: amountInclVat };
}

/**
 * Supplier (NCC) input line from face value + payable cost (SKU providerCost).
 * Matches eSale-style invoice: pre-VAT base, % CK on pre-VAT, VAT residual to payable.
 */
export function calcSupplierInputLine(input: {
  faceValue: number;
  quantity: number;
  providerCostPayable: number;
  vatRate: number;
  /** Optional override; default derived from (face − payable) / face */
  supplierDiscountRate?: number;
}) {
  const qty = Math.max(1, input.quantity);
  const faceUnit = input.faceValue;
  const payableTotal = input.providerCostPayable;
  const payableUnit = payableTotal / qty;

  const preVatUnit = roundVnd(faceUnit / (1 + input.vatRate));
  const rate =
    input.supplierDiscountRate ??
    (faceUnit > 0 ? Math.max(0, (faceUnit - payableUnit) / faceUnit) : 0);
  const discountUnit = roundVnd(preVatUnit * rate);
  const afterDiscountUnit = preVatUnit - discountUnit;
  const preVatTotal = preVatUnit * qty;
  const discountTotal = discountUnit * qty;
  const afterDiscountTotal = afterDiscountUnit * qty;
  const vatTotal = payableTotal - afterDiscountTotal;
  const unitPriceFactor = faceUnit > 0 ? preVatUnit / faceUnit : 0;

  return {
    quantity: qty,
    faceValueUnit: faceUnit,
    unitPriceFactor,
    preVatTotal,
    supplierDiscountRate: rate,
    discountTotal,
    afterDiscountTotal,
    vatRate: input.vatRate,
    vatTotal,
    payableTotal,
  };
}

/**
 * Retail output line: sell price on website after discount (VAT-inclusive).
 * unitPriceExcl = sellIncl / (1+vat). Example: 99_000 / 1.1 = 90_000 at 10%.
 */
export function calcRetailOutputLine(input: {
  sellInclVatUnit: number;
  quantity: number;
  vatRate: number;
}) {
  const qty = Math.max(1, input.quantity);
  const split = splitInclusiveVat(input.sellInclVatUnit, input.vatRate);
  return {
    quantity: qty,
    unitPriceExclVat: split.excl,
    amountExclVat: split.excl * qty,
    vatRate: input.vatRate,
    vatAmount: split.vat * qty,
    amountInclVat: input.sellInclVatUnit * qty,
  };
}

function formatFaceAmount(faceValue: number): string {
  return Math.round(faceValue)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Goods name on the retail VAT invoice, matching confirmed eSale input invoices.
 * Brands without a real supplier invoice sample keep the catalog variant name.
 */
export function esaleInvoiceGoodsName(input: {
  productSlug: string;
  faceValue: number;
  fallbackName: string;
}): string {
  const face = formatFaceAmount(input.faceValue);
  switch (input.productSlug.trim().toLowerCase()) {
    case 'viettel-card':
      return `Mã thẻ Viettel ${face}VND`;
    case 'zing-card':
      return `Mã thẻ Zing ${face}VND`;
    case 'gosu-card':
      return `Thẻ Gosu ${face}`;
    case 'garena-card':
      return `Mã thẻ Garena ${face}VND`;
    default:
      return input.fallbackName;
  }
}

const VND_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const;

function readThreeDigits(value: number, fullWidth: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  const parts: string[] = [];
  if (hundreds > 0 || fullWidth) {
    parts.push(`${VND_DIGITS[hundreds]} trăm`);
    if (tens === 0 && ones > 0) parts.push('linh');
  }
  if (tens > 1) {
    parts.push(`${VND_DIGITS[tens]} mươi`);
    if (ones === 1) parts.push('mốt');
    else if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(VND_DIGITS[ones]);
  } else if (tens === 1) {
    parts.push('mười');
    if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(VND_DIGITS[ones]);
  } else if (ones > 0) {
    parts.push(VND_DIGITS[ones]);
  }
  return parts.join(' ');
}

/** Invoice amount in words, e.g. 34_475_000 → "Ba mươi bốn triệu bốn trăm bảy mươi lăm nghìn đồng". */
export function vndInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Không đồng';
  const scales = [
    { value: Math.floor(n / 1_000_000_000), label: 'tỷ' },
    { value: Math.floor((n % 1_000_000_000) / 1_000_000), label: 'triệu' },
    { value: Math.floor((n % 1_000_000) / 1_000), label: 'nghìn' },
    { value: n % 1000, label: '' },
  ];
  let started = false;
  const parts: string[] = [];
  for (const scale of scales) {
    if (scale.value === 0) continue;
    parts.push(readThreeDigits(scale.value, started));
    if (scale.label) parts.push(scale.label);
    started = true;
  }
  const sentence = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} đồng`;
}

/**
 * One goods line on the retail e-invoice.
 * Thành tiền is rounded on the line total; đơn giá keeps the pre-tax unit.
 */
export function calcRetailInvoiceLine(input: {
  sellInclVatUnit: number;
  quantity: number;
  vatRate: number;
}) {
  const quantity = Math.max(1, input.quantity);
  const amountInclVat = roundVnd(input.sellInclVatUnit * quantity);
  const amountExclVat = roundVnd(amountInclVat / (1 + input.vatRate));
  return {
    quantity,
    unitPriceExclVat: input.sellInclVatUnit / (1 + input.vatRate),
    amountExclVat,
    vatAmount: amountInclVat - amountExclVat,
    amountInclVat,
    vatRate: input.vatRate,
  };
}

/** Gateway fee invoice: customer fee is VAT-inclusive → show excl on HĐ cổng. */
export function calcGatewayFeeInvoice(feeInclVat: number, vatRate = 0.1) {
  const split = splitInclusiveVat(feeInclVat, vatRate);
  return {
    amountExclVat: split.excl,
    vatAmount: split.vat,
    amountInclVat: feeInclVat,
    vatRate,
  };
}
