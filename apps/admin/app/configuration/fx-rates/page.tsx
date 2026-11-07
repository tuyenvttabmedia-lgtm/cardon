'use client';

import { useEffect, useState } from 'react';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { ApiClientError, settingsAdminApi } from '@/services/api-client';
import type { FxRateView } from '@/types/api';

export default function SettingsFxRatesPage() {
  return (
    <RequireRole role="SUPER_ADMIN">
      <FxRatesPanel />
    </RequireRole>
  );
}

function FxRatesPanel() {
  const [current, setCurrent] = useState<FxRateView | null>(null);
  const [rates, setRates] = useState<FxRateView[]>([]);
  const [rate, setRate] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [stalenessHours, setStalenessHours] = useState('24');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const body = await settingsAdminApi.getFxRates();
    setCurrent(body.current);
    setRates(body.rates);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function createDraft() {
    setBusy(true);
    setError(null);
    try {
      const hours = Number(stalenessHours);
      await settingsAdminApi.createFxRate({
        rate: rate.trim(),
        observedAt: new Date(observedAt).toISOString(),
        maxStalenessSeconds: Math.round(hours * 3600),
      });
      setRate('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, kind: 'publish' | 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'publish') await settingsAdminApi.publishFxRate(id);
      else if (kind === 'approve') await settingsAdminApi.approveFxRate(id);
      else await settingsAdminApi.rejectFxRate(id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Tỷ giá đang hiệu lực</h2>
        <p className="mt-2 text-sm text-slate-600">Quy ước cố định: 1 USD = X VND. Biến động trên 2% cần phê duyệt trước khi công bố.</p>
        {current ? (
          <p className="mt-3 text-2xl font-semibold">1 USD = {current.rate} VND</p>
        ) : (
          <p className="mt-3 text-sm">Chưa có tỷ giá EFFECTIVE. eSIM quốc tế không tạo được đơn.</p>
        )}
        {current && (
          <p className="mt-1 text-sm text-slate-600">
            Nguồn {current.sourceCode} · quan sát {current.observedAt} · staleness {current.maxStalenessSeconds}s
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Tạo tỷ giá nháp</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <Label>1 USD =</Label>
            <Input value={rate} onChange={(event) => setRate(event.target.value)} placeholder="25000" />
          </div>
          <div>
            <Label>Thời điểm quan sát</Label>
            <Input type="datetime-local" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} />
          </div>
          <div>
            <Label>Hiệu lực tối đa (giờ)</Label>
            <Input value={stalenessHours} onChange={(event) => setStalenessHours(event.target.value)} />
          </div>
        </div>
        <Button className="mt-4" disabled={busy || !rate.trim() || !observedAt} onClick={() => void createDraft()}>
          Lưu nháp
        </Button>
        {error && <ErrorMessage message={error} />}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Lịch sử</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Tỷ giá</th>
                <th>Trạng thái</th>
                <th>Biến động</th>
                <th>Quan sát</th>
                <th>Tạo lúc</th>
                <th>Người xác nhận</th>
                <th>Đơn đã dùng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2">{row.rate}</td>
                  <td>{row.status}</td>
                  <td>{row.bandResult ?? '—'}</td>
                  <td>{row.observedAt}</td>
                  <td>{row.createdAt}</td>
                  <td>{row.publishedByName ?? row.publishedById ?? '—'}</td>
                  <td>{row.usedByOrders}</td>
                  <td className="space-x-2 text-right">
                    {row.usedByOrders > 0 ? <span className="text-xs text-slate-500">Đã dùng, không sửa</span> : null}
                    {row.status === 'DRAFT' && (
                      <Button disabled={busy} onClick={() => void act(row.id, 'publish')}>
                        Công bố
                      </Button>
                    )}
                    {row.status === 'PENDING_REVIEW' && (
                      <>
                        <Button disabled={busy} onClick={() => void act(row.id, 'approve')}>
                          Phê duyệt
                        </Button>
                        <Button variant="secondary" disabled={busy} onClick={() => void act(row.id, 'reject')}>
                          Từ chối
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
