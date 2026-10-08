'use client';

import { useEffect, useState } from 'react';
import { Card, StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { TabStrip } from '@/components/ui/Navigation';
import { useFinanceDates } from '@/components/finance/FinanceDateContext';
import { formatVnd } from '@/lib/utils';
import { financeApi } from '@/services/api-client';
import type {
  VatGatewayFeePack,
  VatMonthlySummary,
  VatRetailOutputPack,
  VatSupplierPack,
} from '@/types/api';

function Money({ value }: { value: number }) {
  return <>{formatVnd(value)}</>;
}

export function FinanceSupplierPanel() {
  const { dateFrom, dateTo } = useFinanceDates();
  const [line, setLine] = useState<'ALL' | 'TOPUP' | 'PHONE_CARD' | 'GAME_CARD'>('ALL');
  const [data, setData] = useState<VatSupplierPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const pack = await financeApi.getVatSupplier(
        dateFrom,
        dateTo,
        line === 'ALL' ? undefined : line,
      );
      setData(pack);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được đối soát NCC');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo, line]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['ALL', 'Tất cả'],
            ['TOPUP', 'Nạp cước 10%'],
            ['PHONE_CARD', 'Thẻ ĐT 10%'],
            ['GAME_CARD', 'Thẻ game 8%'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={line === id ? 'primary' : 'secondary'}
            onClick={() => setLine(id)}
          >
            {label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Đang tải…' : 'Tải lại'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Cộng tiền hàng" value={<Money value={data.totals.afterDiscountTotal} />} />
            <StatCard label="Tiền thuế GTGT" value={<Money value={data.totals.vatTotal} />} />
            <StatCard label="Tổng cộng thanh toán NCC" value={<Money value={data.totals.payableTotal} />} />
          </div>

          <Card className="overflow-x-auto p-0">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
              Hóa đơn đầu vào NCC · số lượng = số thẻ · CK từ SKU
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">STT</th>
                  <th className="px-3 py-2">Mã VT</th>
                  <th className="px-3 py-2">Tên hàng hóa, dịch vụ</th>
                  <th className="px-3 py-2">Đơn vị tính</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Đơn giá</th>
                  <th className="px-3 py-2 text-right">Tổng tiền</th>
                  <th className="px-3 py-2 text-right">% CK</th>
                  <th className="px-3 py-2 text-right">Tiền CK</th>
                  <th className="px-3 py-2 text-right">Thành tiền</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">Phải trả</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={`${row.sku}-${row.stt}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.stt}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.unit}</td>
                    <td className="px-3 py-2 text-right">{row.quantity}</td>
                    <td className="px-3 py-2 text-right">{row.unitPriceFactor.toFixed(5)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.preVatTotal)}</td>
                    <td className="px-3 py-2 text-right">{row.supplierDiscountRatePct}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.discountTotal)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.afterDiscountTotal)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.vatTotal)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatVnd(row.payableTotal)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                      Không có đơn B2C hoàn tất trong kỳ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function formatInvoiceDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatInvoicePeriod(dateFrom: string, dateTo: string): string {
  const from = formatInvoiceDay(dateFrom);
  const to = formatInvoiceDay(dateTo);
  return from === to ? from : `${from} → ${to}`;
}

function formatInvoiceAmount(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatInvoiceUnitPrice(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function FinanceRetailOutputPanel() {
  const { dateFrom, dateTo } = useFinanceDates();
  const [vatTab, setVatTab] = useState<'10' | '8'>('10');
  const [data, setData] = useState<VatRetailOutputPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(pct: 8 | 10) {
    setLoading(true);
    setError(null);
    try {
      setData(await financeApi.getVatRetailOutput(dateFrom, dateTo, pct));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được HĐ đầu ra');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(Number(vatTab) as 8 | 10);
  }, [dateFrom, dateTo, vatTab]);

  return (
    <div className="space-y-4">
      <TabStrip
        ariaLabel="Thuế suất HĐ đầu ra"
        active={vatTab}
        onSelect={setVatTab}
        items={[
          { id: '10', label: 'HĐ VAT 10% · Nạp cước + Thẻ ĐT' },
          { id: '8', label: 'HĐ VAT 8% · Thẻ game' },
        ]}
      />

      <p className="text-sm text-slate-600">
        Người mua: <strong>Khách lẻ</strong>. Bảng kê theo kỳ đang lọc, không gồm đại lý và không gồm phí cổng.
        Chiết khấu: <strong>Không có chiết khấu</strong>.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Đang tải…</p>}

      {data && (
        <Card className="overflow-x-auto p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold">
              HÓA ĐƠN GTGT · VAT {data.vatRatePct}% · Buyer: {data.buyerName}
            </div>
            <div className="text-sm text-slate-600">
              Kỳ lọc: <strong>{formatInvoicePeriod(data.dateFrom, data.dateTo)}</strong>
            </div>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">STT</th>
                <th className="px-3 py-2">Tên hàng hóa, dịch vụ</th>
                <th className="px-3 py-2">ĐVT</th>
                <th className="px-3 py-2 text-right">Số lượng</th>
                <th className="px-3 py-2 text-right">Đơn giá</th>
                <th className="px-3 py-2 text-right">Thành tiền</th>
                <th className="px-3 py-2 text-right">Thuế suất GTGT</th>
                <th className="px-3 py-2 text-right">Thuế GTGT</th>
                <th className="px-3 py-2 text-right">Cộng</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.sku}-${row.stt}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.stt}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.unit}</td>
                  <td className="px-3 py-2 text-right">{row.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatInvoiceUnitPrice(row.unitPriceExclVat)}</td>
                  <td className="px-3 py-2 text-right">{formatInvoiceAmount(row.amountExclVat)}</td>
                  <td className="px-3 py-2 text-right">{row.vatRatePct}%</td>
                  <td className="px-3 py-2 text-right">{formatInvoiceAmount(row.vatAmount)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatInvoiceAmount(row.amountInclVat)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Không có dòng hàng VAT {data.vatRatePct}% trong kỳ{' '}
                    {formatInvoicePeriod(data.dateFrom, data.dateTo)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-slate-200 px-4 py-4">
            <div className="w-full max-w-md space-y-2 text-sm">
              <div className="flex justify-between gap-6">
                <span>Tổng tiền trước thuế</span>
                <span>{formatInvoiceAmount(data.totals.amountExclVat)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span>Tổng tiền thuế GTGT</span>
                <span>{formatInvoiceAmount(data.totals.vatAmount)}</span>
              </div>
              <div className="flex justify-between gap-6 border-t border-slate-200 pt-2 font-semibold">
                <span>Tổng cộng tiền thanh toán</span>
                <span>{formatInvoiceAmount(data.totals.amountInclVat)}</span>
              </div>
              <p className="text-xs text-slate-500">
                Theo kỳ lọc {formatInvoicePeriod(data.dateFrom, data.dateTo)}
              </p>
              <p className="text-slate-700">
                Số tiền viết bằng chữ:{' '}
                <strong>{data.amountInWords}</strong>
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export function FinanceGatewayFeePanel() {
  const { dateFrom, dateTo } = useFinanceDates();
  const [data, setData] = useState<VatGatewayFeePack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void financeApi
      .getVatGatewayFee(dateFrom, dateTo)
      .then(setData)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Lỗi');
        setData(null);
      });
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Layout HĐ phí cổng (MegaPay): đơn giá = phí trước VAT. CardOn chịu phí — khách trả giá bán;
        phí 0,77% snapshot trên giá bán (charged amount) khớp settlement thu hộ.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Cộng tiền hàng" value={<Money value={data.amountExclVat} />} />
            <StatCard label="Tiền thuế GTGT 10%" value={<Money value={data.vatAmount} />} />
            <StatCard label="Tổng cộng thanh toán" value={<Money value={data.amountInclVat} />} />
          </div>
          <Card className="overflow-x-auto p-0">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
              HĐ phí cổng · Buyer: {data.buyerName}
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">STT</th>
                  <th className="px-3 py-2">Tên hàng hóa, dịch vụ</th>
                  <th className="px-3 py-2">Đơn vị tính</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Đơn giá (trước VAT)</th>
                  <th className="px-3 py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2">1</td>
                  <td className="px-3 py-2">{data.description}</td>
                  <td className="px-3 py-2">Lần</td>
                  <td className="px-3 py-2 text-right">{data.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(data.unitPriceExclVat)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatVnd(data.amountExclVat)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-slate-500">
            Doanh thu HĐ hàng (đã VAT): {formatVnd(data.retailAmountInclVat)} → phí dự kiến{' '}
            {formatVnd(data.amountInclVat)}.
          </p>
        </>
      )}
    </div>
  );
}

export function FinanceVatSummaryPanel() {
  const { dateFrom, dateTo } = useFinanceDates();
  const [data, setData] = useState<VatMonthlySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void financeApi
      .getVatSummary(dateFrom, dateTo)
      .then(setData)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Lỗi');
        setData(null);
      });
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <Card className="overflow-x-auto p-0">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
            Tổng hợp theo nhóm VAT · {data.dateFrom} → {data.dateTo}
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Nhóm</th>
                <th className="px-3 py-2">Đơn vị tính</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">SL thẻ</th>
                <th className="px-3 py-2 text-right">Doanh thu (khách trả)</th>
                <th className="px-3 py-2 text-right">Thành tiền NCC</th>
                <th className="px-3 py-2 text-right">Phí cổng (CardOn chịu)</th>
                <th className="px-3 py-2 text-right">Biên tạm (sau phí)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.productLine} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.productLineLabel}</td>
                  <td className="px-3 py-2">Thẻ</td>
                  <td className="px-3 py-2 text-right">{row.vatRatePct}%</td>
                  <td className="px-3 py-2 text-right">{row.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(row.amountInclVat)}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(row.supplierPayable)}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(row.paymentFeeIncl)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatVnd(row.marginApprox)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Chưa có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
