'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { formatVnd } from '@/lib/utils';
import { financeApi, ApiClientError } from '@/services/api-client';
import type { GatewayFeesReport, GatewayInvoiceRecord, PaymentSettlementReport } from '@/types/api';
import { useFinanceDates } from '@/components/finance/FinanceDateContext';
import { cn } from '@/lib/utils';

type PaymentsTab = 'settlement' | 'fees' | 'invoices';

type FinanceTabKey = 'tabSettlement' | 'tabFees' | 'tabGatewayInvoices';

const TABS: { id: PaymentsTab; labelKey: FinanceTabKey }[] = [
  { id: 'settlement', labelKey: 'tabSettlement' },
  { id: 'fees', labelKey: 'tabFees' },
  { id: 'invoices', labelKey: 'tabGatewayInvoices' },
];

export function FinancePaymentsPanel() {
  const { can } = useAuth();
  const { dateFrom, dateTo } = useFinanceDates();
  const [tab, setTab] = useState<PaymentsTab>('settlement');
  const [error, setError] = useState<string | null>(null);
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [settlementFilter, setSettlementFilter] = useState('');
  const [gatewayFees, setGatewayFees] = useState<GatewayFeesReport | null>(null);
  const [settlementReport, setSettlementReport] = useState<PaymentSettlementReport | null>(null);
  const [gatewayInvoices, setGatewayInvoices] = useState<GatewayInvoiceRecord[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    gatewayCode: 'SEPAY',
    period: '2026-06',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    totalTransactions: '',
    totalVolume: '',
    totalFee: '',
    vatAmount: '',
    invoiceNumber: '',
    notes: '',
  });

  useEffect(() => {
    if (tab === 'invoices') {
      financeApi.listGatewayInvoices().then(setGatewayInvoices).catch(() => undefined);
    }
  }, [tab]);

  async function loadFees() {
    setError(null);
    try {
      setGatewayFees(await financeApi.getGatewayFees(dateFrom, dateTo, gatewayFilter || undefined));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.finance.profitError);
    }
  }

  async function loadSettlement() {
    setError(null);
    try {
      const [settlement, fees] = await Promise.all([
        financeApi.getPaymentSettlement(
          dateFrom,
          dateTo,
          gatewayFilter || undefined,
          settlementFilter || undefined,
        ),
        financeApi.getGatewayFees(dateFrom, dateTo, gatewayFilter || undefined),
      ]);
      setSettlementReport(settlement);
      setGatewayFees(fees);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.finance.profitError);
    }
  }

  async function submitGatewayInvoice() {
    if (!can('finance.manage')) return;
    setError(null);
    try {
      await financeApi.upsertGatewayInvoice({
        gatewayCode: invoiceForm.gatewayCode,
        period: invoiceForm.period,
        periodStart: invoiceForm.periodStart,
        periodEnd: invoiceForm.periodEnd,
        totalTransactions: Number(invoiceForm.totalTransactions),
        totalVolume: invoiceForm.totalVolume,
        totalFee: invoiceForm.totalFee,
        vatAmount: invoiceForm.vatAmount || undefined,
        invoiceNumber: invoiceForm.invoiceNumber || undefined,
        notes: invoiceForm.notes || undefined,
      });
      setGatewayInvoices(await financeApi.listGatewayInvoices());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  const feeGroups = gatewayFees?.groups?.length
    ? gatewayFees.groups
    : gatewayFees
      ? [{ gateway: 'ALL', methods: gatewayFees.rows }]
      : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {vi.finance[t.labelKey]}
          </Button>
        ))}
      </div>
      {error && <ErrorMessage message={error} />}
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Cổng thanh toán</Label>
            <Input
              className="mt-1"
              placeholder="SEPAY / MEGAPAY"
              value={gatewayFilter}
              onChange={(e) => setGatewayFilter(e.target.value)}
            />
          </div>
          {tab === 'settlement' && (
            <div>
              <Label>Loại đối soát nhận tiền</Label>
              <Input
                className="mt-1"
                placeholder="DIRECT_TO_MERCHANT / GATEWAY_SETTLEMENT"
                value={settlementFilter}
                onChange={(e) => setSettlementFilter(e.target.value)}
              />
            </div>
          )}
        </div>
        {tab === 'settlement' && can('finance.manage') && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void loadSettlement()}>{vi.app.load}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void financeApi.exportPaymentsReconciliationCsv(dateFrom, dateTo, gatewayFilter || undefined)
              }
            >
              {vi.app.exportCsv}
            </Button>
          </div>
        )}
        {tab === 'fees' && (
          <div className="mt-4">
            <Button onClick={() => void loadFees()}>{vi.app.load}</Button>
          </div>
        )}
      </Card>

      {tab === 'settlement' && feeGroups.length > 0 && (
        <div className="space-y-6">
          {feeGroups.map((group) => (
            <Card key={group.gateway}>
              <h3 className="text-base font-semibold">{group.gateway}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-zinc-500">
                      <th className="py-2 pr-4">Phương thức</th>
                      <th className="py-2 pr-4">Số giao dịch</th>
                      <th className="py-2 pr-4">Tổng tiền khách trả</th>
                      <th className="py-2 pr-4">Phí dự kiến</th>
                      <th className="py-2 pr-4">Tiền nhận thực tế</th>
                      <th className="py-2">Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.methods.map((row) => {
                      const gap =
                        Number(row.totalCollected) - Number(row.totalFee) - Number(row.netAmount);
                      return (
                        <tr key={`${row.gateway}-${row.methodCode}`} className="border-b border-zinc-50">
                          <td className="py-3 pr-4">
                            <span className="ml-4 block border-l-2 border-zinc-200 pl-3">
                              {row.methodDisplayName ?? row.method}
                            </span>
                          </td>
                          <td className="py-3 pr-4">{row.transactionCount}</td>
                          <td className="py-3 pr-4">{formatVnd(row.totalCollected)}</td>
                          <td className="py-3 pr-4">{formatVnd(row.totalFee)}</td>
                          <td className="py-3 pr-4">{formatVnd(row.netAmount)}</td>
                          <td className={cn('py-3', Math.abs(gap) > 0 ? 'text-amber-700' : '')}>
                            {Math.abs(gap) > 0 ? formatVnd(String(gap)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'settlement' && settlementReport && (
        <Card>
          <h3 className="font-semibold">Đối soát nhận tiền theo cổng</h3>
          <div className="mt-4 space-y-4">
            {settlementReport.sections.map((section) => (
              <div
                key={`${section.settlementType}-${section.gateway}`}
                className="rounded-lg border border-zinc-100 p-4"
              >
                <h4 className="font-medium">
                  {section.gateway} · {section.settlementType}
                </h4>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Giao dịch</dt>
                    <dd>{section.transactionCount}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Tổng volume</dt>
                    <dd>{formatVnd(section.totalVolume)}</dd>
                  </div>
                  {'bankReceivedAmount' in section ? (
                    <>
                      <div>
                        <dt className="text-zinc-500">Tiền về ngân hàng</dt>
                        <dd>{formatVnd(section.bankReceivedAmount)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Phí cổng (hóa đơn)</dt>
                        <dd>{formatVnd(section.gatewayFeeInvoice)}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="text-zinc-500">Cổng thu hộ</dt>
                        <dd>{formatVnd(section.gatewayCollected)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Phí cổng</dt>
                        <dd>{formatVnd(section.gatewayFee)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Đối soát nhận tiền dự kiến</dt>
                        <dd>{formatVnd(section.expectedSettlement)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Đối soát nhận tiền thực tế</dt>
                        <dd>{section.actualSettlement ? formatVnd(section.actualSettlement) : '—'}</dd>
                      </div>
                      {section.settlementGap ? (
                        <div>
                          <dt className="text-zinc-500">Chênh lệch</dt>
                          <dd className="text-amber-700">{formatVnd(section.settlementGap)}</dd>
                        </div>
                      ) : null}
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'fees' && gatewayFees && (
        <Card>
          <div className="space-y-8">
            {feeGroups.map((group) => (
              <div key={group.gateway}>
                <h3 className="mb-3 text-base font-semibold">{group.gateway}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-zinc-500">
                        <th className="py-2 pr-4">Phương thức</th>
                        <th className="py-2 pr-4">Cổng thanh toán</th>
                        <th className="py-2 pr-4">% phí</th>
                        <th className="py-2 pr-4">Phí cố định</th>
                        <th className="py-2 pr-4">Tổng phí</th>
                        <th className="py-2">Giao dịch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.methods.map((row) => (
                        <tr key={`${row.gateway}-${row.methodCode}`} className="border-b border-zinc-50">
                          <td className="py-3 pr-4">{row.methodDisplayName ?? row.method}</td>
                          <td className="py-3 pr-4">{row.gateway}</td>
                          <td className="py-3 pr-4">{row.percentFee}%</td>
                          <td className="py-3 pr-4">{formatVnd(row.fixedFee)}</td>
                          <td className="py-3 pr-4">{formatVnd(row.totalFee)}</td>
                          <td className="py-3">{row.transactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="space-y-6">
          {can('finance.manage') && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Cổng thanh toán</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.gatewayCode}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, gatewayCode: e.target.value })}
                />
              </div>
              <div>
                <Label>Kỳ</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.period}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, period: e.target.value })}
                />
              </div>
              <div>
                <Label>Từ ngày</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={invoiceForm.periodStart}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, periodStart: e.target.value })}
                />
              </div>
              <div>
                <Label>Đến ngày</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={invoiceForm.periodEnd}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, periodEnd: e.target.value })}
                />
              </div>
              <div>
                <Label>Số giao dịch</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.totalTransactions}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, totalTransactions: e.target.value })}
                />
              </div>
              <div>
                <Label>Volume</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.totalVolume}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, totalVolume: e.target.value })}
                />
              </div>
              <div>
                <Label>Phí</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.totalFee}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, totalFee: e.target.value })}
                />
              </div>
              <div>
                <Label>VAT</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.vatAmount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, vatAmount: e.target.value })}
                />
              </div>
              <div>
                <Label>Số hóa đơn</Label>
                <Input
                  className="mt-1"
                  value={invoiceForm.invoiceNumber}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Button onClick={() => void submitGatewayInvoice()}>Lưu & đối soát</Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 pr-4">Số hóa đơn</th>
                  <th className="py-2 pr-4">Kỳ</th>
                  <th className="py-2 pr-4">Cổng thanh toán</th>
                  <th className="py-2 pr-4">Phí</th>
                  <th className="py-2 pr-4">VAT</th>
                  <th className="py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {gatewayInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-50">
                    <td className="py-3 pr-4 font-mono text-xs">{inv.invoiceNumber ?? '—'}</td>
                    <td className="py-3 pr-4">{inv.period}</td>
                    <td className="py-3 pr-4">{inv.gatewayCode}</td>
                    <td className="py-3 pr-4">{formatVnd(inv.totalFee)}</td>
                    <td className="py-3 pr-4">{formatVnd(inv.vatAmount)}</td>
                    <td className="py-3">
                      <Badge
                        tone={
                          inv.status === 'MATCHED' ? 'success' : inv.status === 'DIFFERENCE' ? 'warning' : 'default'
                        }
                      >
                        {inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
