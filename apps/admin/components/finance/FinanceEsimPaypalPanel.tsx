'use client';

import { useEffect, useState } from 'react';
import { useFinanceDates } from '@/components/finance/FinanceDateContext';
import { Card, ErrorMessage, StatCard } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ApiClientError, financeApi } from '@/services/api-client';
import type { PaypalFeeMatchRow, PaypalReportImportView } from '@/types/api';

export function FinanceEsimPaypalPanel() {
  const { dateFrom, dateTo } = useFinanceDates();
  const [imports, setImports] = useState<PaypalReportImportView[]>([]);
  const [matches, setMatches] = useState<PaypalFeeMatchRow[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await financeApi.listPaypalImports();
      setImports(list);
      if (selectedImportId) {
        const detail = await financeApi.getPaypalImport(selectedImportId);
        setMatches(detail.matches);
        setSummary(detail.summary);
      } else {
        const rows = await financeApi.listPaypalMatches({});
        setMatches(rows);
        setSummary({});
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không tải được PayPal fee');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [selectedImportId]);

  async function onUpload() {
    if (!file) {
      setError('Chọn file CSV Activity Download');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await financeApi.importPaypalActivityCsv(file, {
        periodFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
        periodTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
      });
      setSelectedImportId(result.import.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  }

  async function onExport() {
    try {
      const csv = await financeApi.exportPaypalMatches(selectedImportId ?? undefined);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'esim-paypal-fee-recon.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Xuất CSV thất bại');
    }
  }

  const matched = summary.MATCHED ?? 0;
  const missingGw = summary.MISSING_GATEWAY ?? 0;
  const missingLocal = summary.MISSING_LOCAL ?? 0;
  const mismatch = (summary.AMOUNT_MISMATCH ?? 0) + (summary.CURRENCY_MISMATCH ?? 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-slate-600">
          Đối soát Capture / Fee PayPal (CSV-first). Phí ước tính (`paymentFeeAmount`) và phí thực
          (cột Fee CSV) tách biệt. Payout không tính doanh thu. Header map đang{' '}
          <strong>provisional</strong> — cần xác nhận bằng file Activity Download thật từ KEYON.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">PayPal Activity Download CSV</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="mt-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button size="sm" onClick={() => void onUpload()} disabled={uploading || !file}>
            {uploading ? 'Đang import…' : 'Import + match'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            Tải lại
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void onExport()}>
            Xuất CSV đối soát
          </Button>
        </div>
        {error ? <ErrorMessage message={error} /> : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MATCHED" value={String(matched)} />
        <StatCard label="MISSING_GATEWAY" value={String(missingGw)} />
        <StatCard label="MISSING_LOCAL" value={String(missingLocal)} />
        <StatCard label="AMOUNT/CURRENCY mismatch" value={String(mismatch)} />
      </div>

      <Card className="overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Lịch sử import</h2>
        <Table>
          <THead>
            <TR>
              <TH>File</TH>
              <TH>Hash</TH>
              <TH>Rows</TH>
              <TH>Status</TH>
              <TH>Provisional</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {imports.map((row) => (
              <TR key={row.id}>
                <TD>{row.originalFilename}</TD>
                <TD className="font-mono text-xs">{row.fileHash.slice(0, 12)}…</TD>
                <TD>{row.rowCount}</TD>
                <TD>{row.status}</TD>
                <TD>{row.headerProvisional ? 'yes' : 'no'}</TD>
                <TD>
                  <Button size="sm" variant="secondary" onClick={() => setSelectedImportId(row.id)}>
                    Xem
                  </Button>
                </TD>
              </TR>
            ))}
            {imports.length === 0 ? (
              <TR>
                <TD colSpan={6}>Chưa có import.</TD>
              </TR>
            ) : null}
          </TBody>
        </Table>
      </Card>

      <Card className="overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Kết quả match {selectedImportId ? `(import ${selectedImportId.slice(0, 8)}…)` : ''}
        </h2>
        <Table>
          <THead>
            <TR>
              <TH>Status</TH>
              <TH>Payment ref</TH>
              <TH>Capture / Txn</TH>
              <TH>Gross Cardon</TH>
              <TH>Gross PayPal</TH>
              <TH>Fee ước tính</TH>
              <TH>Fee PayPal</TH>
              <TH>Net</TH>
              <TH>Kind</TH>
            </TR>
          </THead>
          <TBody>
            {matches.map((m) => (
              <TR key={m.id}>
                <TD>{m.matchStatus}</TD>
                <TD className="font-mono text-xs">{m.paymentReference ?? '—'}</TD>
                <TD className="font-mono text-xs">{m.paypalTxnId ?? '—'}</TD>
                <TD>{m.grossCardon ?? '—'}</TD>
                <TD>{m.grossPaypal ?? '—'}</TD>
                <TD>{m.feeEstimated ?? '—'}</TD>
                <TD>{m.feeActual ?? '—'}</TD>
                <TD>{m.netPaypal ?? '—'}</TD>
                <TD>{m.lineKind ?? '—'}</TD>
              </TR>
            ))}
            {matches.length === 0 ? (
              <TR>
                <TD colSpan={9}>Chưa có match.</TD>
              </TR>
            ) : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
