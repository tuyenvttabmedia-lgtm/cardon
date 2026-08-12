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
