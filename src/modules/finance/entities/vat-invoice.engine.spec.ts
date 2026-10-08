import {
  calcGatewayFeeInvoice,
  calcRetailInvoiceLine,
  calcRetailOutputLine,
  calcSupplierInputLine,
  esaleInvoiceGoodsName,
  mapHomeServiceToVatLine,
  roundVnd,
  splitInclusiveVat,
  vatRateForLine,
  vndInWords,
} from './vat-invoice.engine';

describe('vat-invoice.engine', () => {
  it('maps homeService to product line + VAT rate', () => {
    expect(mapHomeServiceToVatLine('TOPUP')).toBe('TOPUP');
    expect(vatRateForLine('TOPUP')).toBe(0.1);
    expect(vatRateForLine('PHONE_CARD')).toBe(0.1);
    expect(vatRateForLine('GAME_CARD')).toBe(0.08);
  });

  it('supplier Viettel topup 20k @ 1.8% → payable 19640', () => {
    const line = calcSupplierInputLine({
      faceValue: 20_000,
      quantity: 1,
      providerCostPayable: 19_640,
      vatRate: 0.1,
      supplierDiscountRate: 0.018,
    });
    expect(line.preVatTotal).toBe(18_182);
    expect(line.discountTotal).toBe(327);
    expect(line.afterDiscountTotal).toBe(17_855);
    expect(line.vatTotal).toBe(1_785);
    expect(line.payableTotal).toBe(19_640);
  });

  it('supplier qty=6 scales totals', () => {
    const line = calcSupplierInputLine({
      faceValue: 20_000,
      quantity: 6,
      providerCostPayable: 19_640 * 6,
      vatRate: 0.1,
      supplierDiscountRate: 0.018,
    });
    expect(line.quantity).toBe(6);
    expect(line.preVatTotal).toBe(18_182 * 6);
    expect(line.payableTotal).toBe(19_640 * 6);
  });

  it('retail output: Viettel 100k sell 99k → unit excl 90k', () => {
    const line = calcRetailOutputLine({
      sellInclVatUnit: 99_000,
      quantity: 1,
      vatRate: 0.1,
    });
    expect(line.unitPriceExclVat).toBe(90_000);
    expect(line.vatAmount).toBe(9_000);
    expect(line.amountInclVat).toBe(99_000);
  });

  it('retail output game card uses 8% VAT', () => {
    const sell = 98_000;
    const line = calcRetailOutputLine({
      sellInclVatUnit: sell,
      quantity: 2,
      vatRate: 0.08,
    });
    expect(line.unitPriceExclVat).toBe(roundVnd(sell / 1.08));
    expect(line.amountInclVat).toBe(196_000);
    expect(line.amountExclVat + line.vatAmount).toBe(196_000);
  });

  it('uses confirmed eSale goods names for Viettel, Zing and Gosu', () => {
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'viettel-card',
        faceValue: 10_000,
        fallbackName: 'Viettel 10k',
      }),
    ).toBe('Mã thẻ Viettel 10.000VND');
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'zing-card',
        faceValue: 20_000,
        fallbackName: 'Zing 20k',
      }),
    ).toBe('Mã thẻ Zing 20.000VND');
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'zing-card',
        faceValue: 1_000_000,
        fallbackName: 'Zing 1tr',
      }),
    ).toBe('Mã thẻ Zing 1.000.000VND');
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'gosu-card',
        faceValue: 10_000,
        fallbackName: 'Gosu 10k',
      }),
    ).toBe('Thẻ Gosu 10.000');
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'garena-card',
        faceValue: 10_000,
        fallbackName: 'Garena 10k',
      }),
    ).toBe('Mã thẻ Garena 10.000VND');
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'garena-card',
        faceValue: 500_000,
        fallbackName: 'Garena 500k',
      }),
    ).toBe('Mã thẻ Garena 500.000VND');
    expect(
      esaleInvoiceGoodsName({
        productSlug: 'soha-card',
        faceValue: 100_000,
        fallbackName: 'Soha 100k',
      }),
    ).toBe('Soha 100k');
  });

  it('retail invoice line matches the e-invoice rounding', () => {
    const line = calcRetailInvoiceLine({
      sellInclVatUnit: 98_500,
      quantity: 11,
      vatRate: 0.08,
    });
    expect(line.amountInclVat).toBe(1_083_500);
    expect(line.amountExclVat).toBe(1_003_241);
    expect(line.vatAmount).toBe(80_259);
    expect(line.unitPriceExclVat).toBeCloseTo(91_203.7037, 3);
  });

  it('reads the invoice total in Vietnamese', () => {
    expect(vndInWords(34_475_000)).toBe(
      'Ba mươi bốn triệu bốn trăm bảy mươi lăm nghìn đồng',
    );
    expect(vndInWords(0)).toBe('Không đồng');
  });

  it('gateway fee invoice splits 0.77% fee before VAT', () => {
    const feeIncl = roundVnd(513_000 * 0.0077);
    const inv = calcGatewayFeeInvoice(feeIncl, 0.1);
    expect(inv.amountInclVat).toBe(feeIncl);
    expect(inv.amountExclVat + inv.vatAmount).toBe(feeIncl);
    const expectedExcl = splitInclusiveVat(feeIncl, 0.1).excl;
    expect(inv.amountExclVat).toBe(expectedExcl);
  });
});
