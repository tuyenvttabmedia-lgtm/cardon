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
                  <th className="px-3 py-2">ĐVT</th>
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
        Người mua: <strong>Khách lẻ</strong>. Đơn giá = giá bán website sau CK ÷ (1+VAT). Không gồm đại lý.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Đang tải…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Cộng tiền hàng (trước thuế)" value={<Money value={data.totals.amountExclVat} />} />
            <StatCard label={`Tiền thuế GTGT ${data.vatRatePct}%`} value={<Money value={data.totals.vatAmount} />} />
            <StatCard label="Tổng cộng thanh toán" value={<Money value={data.totals.amountInclVat} />} />
          </div>

          <Card className="overflow-x-auto p-0">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
              HÓA ĐƠN GTGT · VAT {data.vatRatePct}% · Buyer: {data.buyerName}
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">STT</th>
                  <th className="px-3 py-2">Tên hàng hóa, dịch vụ</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Đơn giá (trước VAT)</th>
                  <th className="px-3 py-2 text-right">Thành tiền trước thuế</th>
                  <th className="px-3 py-2 text-right">Thuế suất</th>
                  <th className="px-3 py-2 text-right">Tiền thuế</th>
                  <th className="px-3 py-2 text-right">Tổng thanh toán</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={`${row.sku}-${row.stt}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.stt}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.unit}</td>
                    <td className="px-3 py-2 text-right">{row.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.unitPriceExclVat)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.amountExclVat)}</td>
                    <td className="px-3 py-2 text-right">{row.vatRatePct}%</td>
                    <td className="px-3 py-2 text-right">{formatVnd(row.vatAmount)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatVnd(row.amountInclVat)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                      Không có dòng hàng VAT {data.vatRatePct}% trong kỳ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-0">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
              Bảng kê đơn (đối chiếu — không in lên HĐ)
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Mã đơn</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Giá bán đã VAT</th>
                  <th className="px-3 py-2 text-right">Đơn giá trước VAT</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">Phí 0,77%</th>
                </tr>
              </thead>
              <tbody>
                {data.details.map((d) => (
                  <tr key={`${d.orderId}-${d.sku}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{d.orderCode}</td>
                    <td className="px-3 py-2">{d.sku}</td>
                    <td className="px-3 py-2 text-right">{d.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(d.sellInclVatUnit)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(d.unitPriceExclVat)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(d.vatAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(d.paymentFeeAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
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
        Layout HĐ phí cổng (MegaPay): đơn giá = phí trước VAT. Phí khách trả 0,77% trên giá bán sau CK.
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
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Đơn giá (trước VAT)</th>
                  <th className="px-3 py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2">1</td>
                  <td className="px-3 py-2">{data.description}</td>
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
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">SL thẻ</th>
                <th className="px-3 py-2 text-right">Doanh thu HĐ ra</th>
                <th className="px-3 py-2 text-right">Thành tiền NCC</th>
                <th className="px-3 py-2 text-right">Phí cổng</th>
                <th className="px-3 py-2 text-right">Biên tạm</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.productLine} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.productLineLabel}</td>
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
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
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
