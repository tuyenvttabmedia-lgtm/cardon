'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import {
  computeAppliedPrice,
  computePreviewPrice,
  formatMarginDisplay,
  type MarginType,
  type ServiceMarginRule,
} from '@/lib/agent-margin';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { agentCenterApi, ApiClientError } from '@/services/api-client';

type MarginConfigPayload = {
  roundTo: number;
  applyScope: 'ALL_AGENTS';
  services: Record<string, ServiceMarginRule>;
  labels: Record<string, string>;
  sampleCosts: Record<string, number | null>;
  defaults: {
    roundTo: number;
    services: Record<string, ServiceMarginRule>;
  };
  lastUpdated: {
    at: string | null;
    email: string | null;
    role: string | null;
  };
};

export function AgentPricingTabPanel({
  agentId,
  data,
}: {
  agentId: string;
  data: Record<string, unknown>;
}) {
  void agentId;
  const items = (data.items ?? []) as Array<Record<string, unknown>>;
  const formula = String(data.formula ?? '');

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{formula}</p>
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left">{vi.pricing.colSku}</th>
              <th className="px-4 py-3 text-left">Nhóm sản phẩm</th>
              <th className="px-4 py-3 text-left">{vi.pricing.colProduct}</th>
              <th className="px-4 py-3 text-left">Giá vốn NCC</th>
              <th className="px-4 py-3 text-left">Biên lợi nhuận</th>
              <th className="px-4 py-3 text-left">Giá bán đại lý</th>
              <th className="px-4 py-3 text-left">Quy tắc</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={String(p.variantId)} className="border-b border-zinc-50">
                <td className="px-4 py-3 font-mono text-xs">{String(p.sku)}</td>
                <td className="px-4 py-3">{String(p.homeServiceLabel)}</td>
                <td className="px-4 py-3">{String(p.productName)}</td>
                <td className="px-4 py-3">{p.providerCost ? formatVnd(String(p.providerCost)) : '—'}</td>
                <td className="px-4 py-3">{p.cardonMargin ? formatVnd(String(p.cardonMargin)) : '—'}</td>
                <td className="px-4 py-3 font-medium">{formatVnd(String(p.agentPrice))}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{String(p.appliedRule)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MarginTypeRadios({
  groupKey,
  value,
  disabled,
  onChange,
}: {
  groupKey: string;
  value: MarginType;
  disabled: boolean;
  onChange: (type: MarginType) => void;
}) {
  const name = `margin-type-${groupKey}`;
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="radio"
          name={name}
          checked={value === 'PERCENT'}
          disabled={disabled}
          onChange={() => onChange('PERCENT')}
        />
        %
      </label>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="radio"
          name={name}
          checked={value === 'FIXED'}
          disabled={disabled}
          onChange={() => onChange('FIXED')}
        />
        VNĐ
      </label>
    </div>
  );
}

export function AgentMarginConfigForm() {
  const { can, user } = useAuth();
  const toast = useToast();
  const canEdit = can('pricing.manage') && user?.role !== 'SUPPORT';
  const [config, setConfig] = useState<MarginConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    void agentCenterApi.getMarginConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateRule(key: string, patch: Partial<ServiceMarginRule>) {
    if (!config) return;
    const rule = config.services[key];
    setConfig({
      ...config,
      services: {
        ...config.services,
        [key]: { ...rule, ...patch },
      },
    });
  }

  function resetDefaults() {
    if (!config) return;
    setConfig({
      ...config,
      roundTo: config.defaults.roundTo,
      services: structuredClone(config.defaults.services),
    });
    toast.success('Đã khôi phục giá trị mặc định — nhấn Lưu để áp dụng');
  }

  async function save() {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await agentCenterApi.updateMarginConfig({
        roundTo: config.roundTo,
        services: config.services,
        reason: reason || undefined,
      });
      setConfig(saved as MarginConfigPayload);
      toast.success('Đã lưu cấu hình giá bán đại lý');
      setReason('');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.pricing.loadError);
    } finally {
      setBusy(false);
    }
  }

  if (!config) return <p className="text-zinc-500">{vi.pricing.loading}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">{vi.agentCenter.navMarginConfig}</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Giá bán = Giá vốn nhà cung cấp + Biên lợi nhuận CardOn
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Nhóm sản phẩm map theo <strong>Product.homeService</strong> (Garena 10k, Viettel 20k, …). Làm tròn{' '}
          {config.roundTo.toLocaleString('vi-VN')}đ khi áp dụng thực tế.
        </p>
      </div>

      {config.lastUpdated.at && (
        <Card className="border-zinc-200 bg-zinc-50/80 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Cập nhật cuối</p>
          <p className="mt-1 text-sm text-zinc-800">{formatDateTime(config.lastUpdated.at)}</p>
          <p className="text-sm text-zinc-600">
            {config.lastUpdated.email ?? '—'}
            {config.lastUpdated.role ? ` · ${config.lastUpdated.role.replace(/_/g, ' ')}` : ''}
          </p>
        </Card>
      )}

      <Card className="p-4">
        <p className="text-sm font-medium text-zinc-800">Áp dụng cho</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked readOnly />
            Tất cả đại lý
          </label>
          <label className="flex items-center gap-2 text-zinc-400">
            <input type="radio" disabled />
            Đại lý ngoại lệ
            <span className="text-xs">(sắp có)</span>
          </label>
        </div>
      </Card>

      {error && <ErrorMessage message={error} />}
      {!canEdit && <p className="text-sm text-amber-600">{vi.pricing.readOnlySupport}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left">Nhóm sản phẩm</th>
              <th className="px-4 py-3 text-left">Giá vốn mẫu</th>
              <th className="px-4 py-3 text-left">Biên lợi nhuận</th>
              <th className="px-4 py-3 text-left">Giá bán dự kiến</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(config.services).map(([key, rule]) => {
              const sampleCost = config.sampleCosts[key];
              const preview =
                sampleCost != null ? computePreviewPrice(sampleCost, rule) : null;
              const applied =
                sampleCost != null
                  ? computeAppliedPrice(sampleCost, rule, config.roundTo)
                  : null;
              return (
                <tr key={key} className="border-b border-zinc-50 align-top">
                  <td className="px-4 py-3 font-medium">{config.labels[key] ?? key}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {sampleCost != null ? formatVnd(sampleCost) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <MarginTypeRadios
                        groupKey={key}
                        value={rule.marginType}
                        disabled={!canEdit}
                        onChange={(marginType) => updateRule(key, { marginType })}
                      />
                      <Input
                        type="number"
                        step={rule.marginType === 'PERCENT' ? '0.01' : '1'}
                        min={0}
                        disabled={!canEdit}
                        value={rule.value}
                        onChange={(e) => updateRule(key, { value: Number(e.target.value) })}
                        className="max-w-[140px]"
                      />
                      <p className="text-xs text-zinc-400">{formatMarginDisplay(rule)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {preview != null ? (
                      <div>
                        <p className="font-semibold text-zinc-900">{formatVnd(preview)}</p>
                        {applied != null && applied !== preview && (
                          <p className="text-xs text-zinc-500">
                            Sau làm tròn: {formatVnd(applied)}
                          </p>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Label>Lý do thay đổi (tuỳ chọn)</Label>
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" disabled={busy} onClick={resetDefaults}>
            Khôi phục mặc định
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {vi.app.save}
          </Button>
        </div>
      )}
    </div>
  );
}
