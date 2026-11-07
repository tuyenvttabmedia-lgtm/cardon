'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EsimFlag } from '@/components/esim/EsimFlag';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { formatVnd } from '@/lib/utils';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type {
  AiraloCatalogueView,
  AiraloImportSummary,
  EsimCatalogLifecycle,
  ProviderAiraloSettings,
} from '@/types/api';

const LIFECYCLE_LABEL: Record<EsimCatalogLifecycle, string> = {
  IMPORTED: 'Đã nhập',
  MAPPED: 'Đã map',
  REVIEW_REQUIRED: 'Cần duyệt',
  PUBLISHED: 'Đang bán',
  INACTIVE: 'Ngừng bán',
};

export default function SettingsAiraloPage() {
  const [form, setForm] = useState<ProviderAiraloSettings | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [usdVndRate, setUsdVndRate] = useState('26000');
  const [accountMode, setAccountMode] = useState<'sandbox' | 'production'>('sandbox');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalogueHint, setCatalogueHint] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<AiraloImportSummary | null>(null);
  const [catalogue, setCatalogue] = useState<AiraloCatalogueView | null>(null);
  const [lifecycleFilter, setLifecycleFilter] = useState<EsimCatalogLifecycle | 'ALL'>('PUBLISHED');

  const loadCatalogue = useCallback(async () => {
    const next = await settingsAdminApi.getAiraloCatalogue();
    setCatalogue(next);
  }, []);

  useEffect(() => {
    settingsAdminApi
      .getAiralo()
      .then((next) => {
        setForm(next);
        setBaseUrl(next.baseUrl ?? '');
        setUsdVndRate(String(next.usdVndRate ?? 26000));
        setAccountMode(next.accountMode === 'production' ? 'production' : 'sandbox');
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
    loadCatalogue().catch(() => undefined);
  }, [loadCatalogue]);

  const visiblePackages = useMemo(() => {
    const rows = catalogue?.packages ?? [];
    if (lifecycleFilter === 'ALL') return rows;
    return rows.filter((row) => row.lifecycle === lifecycleFilter);
  }, [catalogue, lifecycleFilter]);

  async function save() {
    if (!form) return;
    const rate = Number(usdVndRate);
    if (!Number.isFinite(rate) || rate < 10000) {
      setError('Tỷ giá USD/VND phải từ 10.000 trở lên');
      return;
    }
    if (accountMode === 'production' && form.accountMode !== 'production') {
      const confirmed = window.confirm(
        'Production trên Airalo Partner là một chiều. Chỉ bật khi tài khoản Partner đã là Production. CardOn không tự đổi tài khoản Airalo.',
      );
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    setCatalogueHint(null);
    try {
      const next = await settingsAdminApi.updateAiralo({
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        ...(baseUrl.trim() && baseUrl.trim() !== form.baseUrl
          ? { baseUrl: baseUrl.trim() }
          : {}),
        usdVndRate: rate,
        accountMode,
      });
      setForm(next);
      setClientId('');
      setClientSecret('');
      setBaseUrl(next.baseUrl ?? '');
      setUsdVndRate(String(next.usdVndRate ?? rate));
      setAccountMode(next.accountMode === 'production' ? 'production' : 'sandbox');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function readCatalogue() {
    setBusy(true);
    setError(null);
    setCatalogueHint(null);
    try {
      const result = await settingsAdminApi.testAiraloCatalogue();
      const names = result.names.length > 0 ? result.names.join(', ') : 'Catalogue trống';
      setCatalogueHint(`API v2: ${result.count} gói. ${names}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function importCatalogue() {
    setBusy(true);
    setError(null);
    try {
      const summary = await settingsAdminApi.importAiraloCatalogue();
      setImportSummary(summary);
      await loadCatalogue();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function changeLifecycle(id: string, lifecycle: EsimCatalogLifecycle) {
    setBusy(true);
    setError(null);
    try {
      await settingsAdminApi.setAiraloPackageLifecycle(id, lifecycle);
      await loadCatalogue();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return error ? <ErrorMessage message={error} /> : <p className="text-slate-500">{vi.app.loading}</p>;
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges
            source={form.source}
            secretsProtected={Boolean(form.configured)}
          />
          <p className="text-sm text-slate-600">
            Airalo Partner API v2. Credential nhập tại đây, không ghi eSale. Sandbox không còn host
            riêng — <span className="font-mono">sandbox-partners-api.airalo.com</span> đã NXDOMAIN.
            Dùng <span className="font-mono">https://partners-api.airalo.com</span>; chế độ Sandbox
            bật trên tài khoản Partner Airalo, cùng URL và cùng credential. Giá bán = giá vốn VND +
            30%, làm tròn nghìn.
          </p>
          <div>
            <Label htmlFor="airalo-base-url">Base URL</Label>
            <Input
              id="airalo-base-url"
              className="mt-1 font-mono text-sm"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://partners-api.airalo.com"
            />
            <p className="mt-1 text-xs text-slate-500">
              Host còn resolve: partners-api.airalo.com. Đổi URL không đổi Sandbox/Production — Airalo
              quyết định theo tài khoản.
            </p>
          </div>
          <div>
            <Label htmlFor="airalo-client-id">Client ID</Label>
            <Input
              id="airalo-client-id"
              className="mt-1 font-mono text-sm"
              autoComplete="off"
              placeholder={form.clientId ? String(form.clientId) : 'Dán client_id để lưu'}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="airalo-client-secret">Client secret</Label>
            <Input
              id="airalo-client-secret"
              type="password"
              className="mt-1 font-mono text-sm"
              autoComplete="off"
              placeholder="Dán client_secret để lưu"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
            {form.configured && (
              <p className="mt-1 text-xs text-slate-500">
                Đã có credential. Ô trống giữ giá trị hiện tại.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="airalo-usd-vnd">Tỷ giá USD → VND (khi Airalo không trả VND)</Label>
            <Input
              id="airalo-usd-vnd"
              className="mt-1 font-mono text-sm"
              value={usdVndRate}
              onChange={(event) => setUsdVndRate(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="airalo-account-mode">Chế độ tài khoản Airalo</Label>
            <select
              id="airalo-account-mode"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={accountMode}
              onChange={(event) =>
                setAccountMode(event.target.value === 'production' ? 'production' : 'sandbox')
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Cùng host partners-api.airalo.com. Banner Sandbox và email TEST chỉ theo cờ này, không
              đoán từ dạng matching_id. Mã Sandbox không cài máy thật — QR, Apple và hướng dẫn giữ
              như Production.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? 'Đang lưu…' : vi.app.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !form.configured}
              onClick={() => void readCatalogue()}
            >
              Kiểm tra API v2
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !form.configured}
              onClick={() => void importCatalogue()}
            >
              Cập nhật catalogue
            </Button>
          </div>
          {catalogueHint && <p className="text-sm text-slate-700">{catalogueHint}</p>}
          {importSummary && (
            <p className="text-sm text-slate-700">
              Đã nhập {importSummary.imported} gói. Publish {importSummary.published}, map{' '}
              {importSummary.mapped}, cần duyệt {importSummary.reviewRequired}. Điểm đến:{' '}
              {importSummary.destinationsPublished.join(', ') || 'chưa có'}.
            </p>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-800">Trạng thái catalogue</p>
            {(['ALL', 'PUBLISHED', 'MAPPED', 'REVIEW_REQUIRED', 'IMPORTED', 'INACTIVE'] as const).map((key) => (
              <Button
                key={key}
                type="button"
                variant={lifecycleFilter === key ? 'primary' : 'secondary'}
                onClick={() => setLifecycleFilter(key)}
              >
                {key === 'ALL' ? 'Tất cả' : LIFECYCLE_LABEL[key]}
                {key !== 'ALL' && catalogue?.counts[key] != null ? ` (${catalogue.counts[key]})` : ''}
              </Button>
            ))}
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Điểm đến</TH>
                <TH>Gói</TH>
                <TH>Giá vốn</TH>
                <TH>Giá bán</TH>
                <TH>Trạng thái</TH>
                <TH>Thao tác</TH>
              </TR>
            </THead>
            <TBody>
              {visiblePackages.length === 0 ? (
                <TableEmpty colSpan={6} message="Chưa có gói. Lưu credential rồi bấm Import + publish." />
              ) : (
                visiblePackages.slice(0, 200).map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <EsimFlag
                          iso={
                            row.destinationKey === 'asia'
                              ? 'ASIA'
                              : row.destinationKey === 'europe'
                                ? 'EUROPE'
                                : row.countryIso || row.destinationKey
                          }
                        />
                        <span>{row.destinationKey.toUpperCase()}</span>
                      </span>
                    </TD>
                    <TD>
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-slate-500">{row.providerPackageId}</div>
                    </TD>
                    <TD>{formatVnd(row.costVnd)}</TD>
                    <TD>{formatVnd(row.sellPriceVnd)}</TD>
                    <TD>
                      <Badge>{LIFECYCLE_LABEL[row.lifecycle]}</Badge>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {row.lifecycle !== 'PUBLISHED' && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void changeLifecycle(row.id, 'PUBLISHED')}
                          >
                            Publish
                          </Button>
                        )}
                        {row.lifecycle === 'PUBLISHED' && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void changeLifecycle(row.id, 'INACTIVE')}
                          >
                            Ngừng bán
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </RequireRole>
  );
}
