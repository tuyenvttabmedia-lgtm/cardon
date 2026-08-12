import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { VatDailyQueryDto } from '../dto/finance.dto';
import {
  VAT_PRODUCT_LINE_LABELS,
  VatProductLine,
  calcGatewayFeeInvoice,
  calcRetailOutputLine,
  calcSupplierInputLine,
  mapHomeServiceToVatLine,
  roundVnd,
  vatRateForLine,
} from '../entities/vat-invoice.engine';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';
import { FinanceRepository } from '../repositories/finance.repository';

type ItemRow = Awaited<
  ReturnType<FinanceRepository['findB2cCompletedOrderItemsForVat']>
>[number];

function dec(n: Decimal | number | string | null | undefined): number {
  if (n == null) return 0;
  return Number(n);
}

@Injectable()
export class VatDailyService {
  constructor(private readonly repository: FinanceRepository) {}

  async getSupplierPack(query: VatDailyQueryDto) {
    const items = await this.loadItems(query);
    const filtered = this.filterByLine(items, query.productLine);
    const groups = new Map<
      string,
      {
        sku: string;
        name: string;
        productLine: VatProductLine;
        vatRate: number;
        faceValue: number;
        quantity: number;
        providerCostPayable: number;
      }
    >();

    for (const item of filtered) {
      const line = mapHomeServiceToVatLine(item.variant.product.homeService);
      const vatRate = vatRateForLine(line);
      const face = dec(item.variant.faceValue);
      const qty = item.quantity;
      const mappingCost = item.variant.providerMappings[0]?.providerCost;
      const unitCost =
        mappingCost != null
          ? dec(mappingCost)
          : this.allocateUnitProviderCost(item, face, qty);
      const key = `${item.variant.sku}|${face}|${line}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += qty;
        existing.providerCostPayable += unitCost * qty;
      } else {
        groups.set(key, {
          sku: item.variant.sku,
          name: item.variant.name,
          productLine: line,
          vatRate,
          faceValue: face,
          quantity: qty,
          providerCostPayable: unitCost * qty,
        });
      }
    }

    const rows = Array.from(groups.values()).map((g, index) => {
      // Derive % CK from SKU payable (providerCost) vs face — do not freeze first-row rate.
      const calc = calcSupplierInputLine({
        faceValue: g.faceValue,
        quantity: g.quantity,
        providerCostPayable: roundVnd(g.providerCostPayable),
        vatRate: g.vatRate,
      });
      return {
        stt: index + 1,
        sku: g.sku,
        name: g.name,
        productLine: g.productLine,
        productLineLabel: VAT_PRODUCT_LINE_LABELS[g.productLine],
        unit: 'Thẻ',
        quantity: calc.quantity,
        faceValue: g.faceValue,
        unitPriceFactor: Number(calc.unitPriceFactor.toFixed(5)),
        preVatTotal: calc.preVatTotal,
        supplierDiscountRatePct: Number((calc.supplierDiscountRate * 100).toFixed(4)),
        discountTotal: calc.discountTotal,
        afterDiscountTotal: calc.afterDiscountTotal,
        vatRatePct: calc.vatRate * 100,
        vatTotal: calc.vatTotal,
        payableTotal: calc.payableTotal,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.preVatTotal += row.preVatTotal;
        acc.discountTotal += row.discountTotal;
        acc.afterDiscountTotal += row.afterDiscountTotal;
        acc.vatTotal += row.vatTotal;
        acc.payableTotal += row.payableTotal;
        acc.quantity += row.quantity;
        return acc;
      },
      {
        preVatTotal: 0,
        discountTotal: 0,
        afterDiscountTotal: 0,
        vatTotal: 0,
        payableTotal: 0,
        quantity: 0,
      },
    );

    return {
      kind: 'SUPPLIER_INPUT' as const,
      buyerName: null,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      productLine: query.productLine ?? null,
      rows,
      totals,
    };
  }

  async getRetailOutputPack(query: VatDailyQueryDto & { vatRatePct: 8 | 10 }) {
    const items = await this.loadItems(query);
    const vatRate = query.vatRatePct / 100;
    const allowedLines: VatProductLine[] =
      query.vatRatePct === 8 ? ['GAME_CARD'] : ['TOPUP', 'PHONE_CARD', 'DATA', 'OTHER'];

    const filtered = items.filter((item) => {
      const line = mapHomeServiceToVatLine(item.variant.product.homeService);
      if (!allowedLines.includes(line)) return false;
      if (query.productLine && line !== query.productLine) return false;
      return true;
    });

    const groups = new Map<
      string,
      {
        sku: string;
        name: string;
        productLine: VatProductLine;
        sellInclVatUnit: number;
        quantity: number;
      }
    >();

    for (const item of filtered) {
      const line = mapHomeServiceToVatLine(item.variant.product.homeService);
      const sellUnit = dec(item.unitPrice);
      const key = `${item.variant.sku}|${sellUnit}|${line}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        groups.set(key, {
          sku: item.variant.sku,
          name: item.variant.name,
          productLine: line,
          sellInclVatUnit: sellUnit,
          quantity: item.quantity,
        });
      }
    }

    const rows = Array.from(groups.values()).map((g, index) => {
      const calc = calcRetailOutputLine({
        sellInclVatUnit: g.sellInclVatUnit,
        quantity: g.quantity,
        vatRate,
      });
      return {
        stt: index + 1,
        sku: g.sku,
        name: g.name,
        productLine: g.productLine,
        productLineLabel: VAT_PRODUCT_LINE_LABELS[g.productLine],
        unit: 'Thẻ',
        quantity: calc.quantity,
        unitPriceExclVat: calc.unitPriceExclVat,
        amountExclVat: calc.amountExclVat,
        vatRatePct: query.vatRatePct,
        vatAmount: calc.vatAmount,
        amountInclVat: calc.amountInclVat,
        sellInclVatUnit: g.sellInclVatUnit,
      };
    });

    const details = filtered.map((item) => {
      const line = mapHomeServiceToVatLine(item.variant.product.homeService);
      const sellUnit = dec(item.unitPrice);
      const calc = calcRetailOutputLine({
        sellInclVatUnit: sellUnit,
        quantity: item.quantity,
        vatRate,
      });
      const fee = dec(item.order.paymentFeeAmount);
      const orderSell = dec(item.order.sellAmount) || 1;
      const allocatedFee = roundVnd(fee * ((sellUnit * item.quantity) / orderSell));
      return {
        orderId: item.order.id,
        orderCode: item.order.orderCode,
        createdAt: item.order.createdAt.toISOString(),
        sku: item.variant.sku,
        productLine: line,
        productLineLabel: VAT_PRODUCT_LINE_LABELS[line],
        quantity: item.quantity,
        sellInclVatUnit: sellUnit,
        unitPriceExclVat: calc.unitPriceExclVat,
        vatAmount: calc.vatAmount,
        amountInclVat: calc.amountInclVat,
        paymentFeeAmount: allocatedFee,
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.amountExclVat += row.amountExclVat;
        acc.vatAmount += row.vatAmount;
        acc.amountInclVat += row.amountInclVat;
        acc.quantity += row.quantity;
        return acc;
      },
      { amountExclVat: 0, vatAmount: 0, amountInclVat: 0, quantity: 0 },
    );

    const paymentFeeIncl = details.reduce((s, d) => s + d.paymentFeeAmount, 0);

    return {
      kind: 'RETAIL_OUTPUT' as const,
      buyerName: 'Khách lẻ',
      vatRatePct: query.vatRatePct,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      rows,
      details,
      totals,
      paymentFeeIncl: roundVnd(paymentFeeIncl),
      paymentFeeInvoice: calcGatewayFeeInvoice(roundVnd(paymentFeeIncl), 0.1),
    };
  }

  async getGatewayFeePack(query: VatDailyQueryDto) {
    const out10 = await this.getRetailOutputPack({ ...query, vatRatePct: 10 });
    const out8 = await this.getRetailOutputPack({ ...query, vatRatePct: 8 });
    const feeIncl = roundVnd(out10.paymentFeeIncl + out8.paymentFeeIncl);
    const invoice = calcGatewayFeeInvoice(feeIncl, 0.1);
    return {
      kind: 'GATEWAY_FEE' as const,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sellerName: 'Cổng thanh toán (MegaPay / SePay)',
      buyerName: 'CÔNG TY TNHH GIẢI PHÁP KEYON',
      description: `Phí hỗ trợ thanh toán trực tuyến tháng theo doanh thu bán lẻ ${query.dateFrom} → ${query.dateTo}`,
      quantity: 1,
      unitPriceExclVat: invoice.amountExclVat,
      amountExclVat: invoice.amountExclVat,
      vatRatePct: 10,
      vatAmount: invoice.vatAmount,
      amountInclVat: invoice.amountInclVat,
      retailAmountInclVat: out10.totals.amountInclVat + out8.totals.amountInclVat,
    };
  }

  async getMonthlySummary(query: VatDailyQueryDto) {
    const items = await this.loadItems(query);
    const byLine = new Map<
      VatProductLine,
      { quantity: number; sellIncl: number; providerCost: number; paymentFee: number }
    >();

    for (const item of items) {
      const line = mapHomeServiceToVatLine(item.variant.product.homeService);
      const sell = dec(item.unitPrice) * item.quantity;
      const face = dec(item.variant.faceValue);
      const mappingCost = item.variant.providerMappings[0]?.providerCost;
      const unitCost =
        mappingCost != null
          ? dec(mappingCost)
          : this.allocateUnitProviderCost(item, face, item.quantity);
      const orderSell = dec(item.order.sellAmount) || 1;
      const fee = roundVnd(dec(item.order.paymentFeeAmount) * (sell / orderSell));
      const cur = byLine.get(line) ?? { quantity: 0, sellIncl: 0, providerCost: 0, paymentFee: 0 };
      cur.quantity += item.quantity;
      cur.sellIncl += sell;
      cur.providerCost += unitCost * item.quantity;
      cur.paymentFee += fee;
      byLine.set(line, cur);
    }

    const rows = Array.from(byLine.entries()).map(([productLine, v]) => {
      const vatRate = vatRateForLine(productLine);
      const retail = calcRetailOutputLine({
        sellInclVatUnit: v.quantity > 0 ? v.sellIncl / v.quantity : 0,
        quantity: Math.max(1, v.quantity),
        vatRate,
      });
      // Recalc totals from aggregate sell to avoid unit drift
      const excl = roundVnd(v.sellIncl / (1 + vatRate));
      const vat = v.sellIncl - excl;
      return {
        productLine,
        productLineLabel: VAT_PRODUCT_LINE_LABELS[productLine],
        vatRatePct: vatRate * 100,
        quantity: v.quantity,
        amountExclVat: excl,
        vatAmount: vat,
        amountInclVat: v.sellIncl,
        supplierPayable: roundVnd(v.providerCost),
        paymentFeeIncl: roundVnd(v.paymentFee),
        marginApprox: roundVnd(v.sellIncl - v.providerCost - v.paymentFee),
        retailCheckIncl: retail.amountInclVat,
      };
    });

    return {
      kind: 'MONTHLY_SUMMARY' as const,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      rows,
    };
  }

  private async loadItems(query: VatDailyQueryDto) {
    const range = assertFinanceDateRange(query.dateFrom, query.dateTo);
    return this.repository.findB2cCompletedOrderItemsForVat(range.from, range.to);
  }

  private filterByLine(items: ItemRow[], productLine?: string) {
    if (!productLine) return items;
    return items.filter(
      (item) => mapHomeServiceToVatLine(item.variant.product.homeService) === productLine,
    );
  }

  private allocateUnitProviderCost(item: ItemRow, faceUnit: number, qty: number): number {
    const orderFace = dec(item.order.faceValue);
    const orderCost = dec(item.order.providerCost);
    if (orderFace > 0 && orderCost > 0) {
      return (orderCost * (faceUnit * qty)) / orderFace / qty;
    }
    if (qty > 0 && orderCost > 0) return orderCost / qty;
    return faceUnit;
  }
}
