'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import {
  COMING_SOON_PAYMENT_GATEWAYS,
  priorityOrderLabel,
  validateGatewayPrioritiesClient,
} from '@/lib/payment-gateway.strategy';
import { vi } from '@/lib/i18n/vi';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type {
  PaymentGatewaySettings,
  PaymentMethodConfig,
  PaymentStrategySettings,
} from '@/types/api';

function GatewayForm({
  title,
  settings,
  onSave,
  fields,
}: {
  title: string;
  settings: PaymentGatewaySettings;
  onSave: (body: Partial<PaymentGatewaySettings>) => Promise<void>;
  fields: 'megapay' | 'sepay';
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <SettingsRuntimeBadges
          source={settings.source}
          configured={settings.configured}
          secretsProtected
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            id={`${fields}-enabled`}
            checked={Boolean(form.enabled)}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <Label htmlFor={`${fields}-enabled`}>{vi.app.enabled}</Label>
        </div>
        <div>
          <Label>{vi.app.environment}</Label>
          <Select
            className="mt-1"
            value={form.environment ?? 'production'}
            onChange={(e) =>
              setForm({ ...form, environment: e.target.value as 'sandbox' | 'production' })
            }
          >
            <option value="sandbox">{vi.app.sandbox}</option>
            <option value="production">{vi.app.production}</option>
          </Select>
        </div>
        {fields === 'megapay' && (
          <>
            <div>
              <Label>{vi.settings.merchantId}</Label>
              <Input className="mt-1" value={form.merchantId ?? ''} onChange={(e) => setForm({ ...form, merchantId: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.secretKey}</Label>
              <Input className="mt-1 font-mono" type="password" value={form.secretKey ?? ''} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} placeholder="********123" />
            </div>
            <div>
              <Label>{vi.settings.endpoint}</Label>
              <Input className="mt-1" value={form.endpoint ?? ''} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.returnUrl}</Label>
              <Input className="mt-1" value={form.returnUrl ?? ''} onChange={(e) => setForm({ ...form, returnUrl: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.callbackUrl}</Label>
              <Input className="mt-1" value={form.callbackUrl ?? ''} onChange={(e) => setForm({ ...form, callbackUrl: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.webhookSecret}</Label>
              <Input className="mt-1 font-mono" type="password" value={form.webhookSecret ?? ''} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} />
            </div>
          </>
        )}
        {fields === 'sepay' && (
          <>
            <div className="md:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              Webhook bank-transfer (my.sepay.vn): dùng <strong>HMAC-SHA256</strong> → điền Secret Key vào
              ô Webhook Secret bên dưới. Ô API Key chỉ cần khi webhook SePay chọn xác thực API Key (không
              bắt buộc với HMAC). Nội dung CK dùng mã <code>DH…</code> khớp bộ lọc tiền tố DH.
            </div>
            <div>
              <Label>Chế độ tích hợp</Label>
              <Select
                className="mt-1"
                value={form.integrationMode ?? 'legacy_qr'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    integrationMode: e.target.value as 'legacy_qr' | 'payment_gateway',
                  })
                }
              >
                <option value="legacy_qr">VietQR / chuyển khoản (webhook HMAC)</option>
                <option value="payment_gateway">SePay Payment Gateway (checkout + IPN)</option>
              </Select>
            </div>
            <div>
              <Label>{vi.settings.apiKey} (tùy chọn — auth API Key)</Label>
              <Input className="mt-1 font-mono" type="password" value={form.apiKey ?? ''} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.webhookSecret} (HMAC Secret Key)</Label>
              <Input className="mt-1 font-mono" type="password" value={form.webhookSecret ?? ''} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} placeholder="whsec_…" />
            </div>
            <div>
              <Label>{vi.settings.bankAccount}</Label>
              <Input className="mt-1" value={form.bankAccount ?? ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.bankCode}</Label>
              <Input className="mt-1" value={form.bankCode ?? ''} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.accountName}</Label>
              <Input className="mt-1" value={form.accountName ?? ''} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
            </div>
            <div>
              <Label>{vi.settings.qrTemplate}</Label>
              <Input className="mt-1" value={form.qrTemplate ?? ''} onChange={(e) => setForm({ ...form, qrTemplate: e.target.value })} />
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <Label>{vi.settings.webhookUrl}</Label>
          <Input className="mt-1" value={form.webhookUrl ?? ''} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} />
        </div>
      </div>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? vi.app.loading : vi.app.save}
      </Button>
    </Card>
  );
}

type GatewayPriorityRow = {
  code: 'MEGAPAY' | 'SEPAY';
  label: string;
  priority: number;
  enabled: boolean;
};

function GatewayPriorityCard({
  strategy,
  onSave,
}: {
  strategy: PaymentStrategySettings;
  onSave: (gateways: GatewayPriorityRow[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<GatewayPriorityRow[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next =
      strategy.gateways?.map((gateway) => ({
        code: gateway.code,
        label: gateway.label,
        priority: gateway.priority,
        enabled: gateway.enabled,
      })) ?? [];
    setRows(next.sort((a, b) => a.priority - b.priority));
  }, [strategy.gateways]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.priority - b.priority),
    [rows],
  );

  function updateRow(code: 'MEGAPAY' | 'SEPAY', patch: Partial<GatewayPriorityRow>) {
    setRows((current) => current.map((row) => (row.code === code ? { ...row, ...patch } : row)));
    setValidationError(null);
  }

  function bumpPriority(code: 'MEGAPAY' | 'SEPAY', delta: number) {
    const row = rows.find((item) => item.code === code);
    if (!row) return;
    updateRow(code, { priority: Math.max(1, row.priority + delta) });
  }

  async function save() {
    const error = validateGatewayPrioritiesClient(rows);
    if (error) {
      setValidationError(error);
      return;
    }
    setSaving(true);
    setValidationError(null);
    try {
      await onSave(rows);
    } catch (err) {
      setValidationError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{vi.settings.gatewayPriorityTitle}</h2>
          <p className="text-sm text-zinc-500">{vi.settings.gatewayPriorityHint}</p>
        </div>
        <SettingsRuntimeBadges source={strategy.source} secretsProtected={false} />
      </div>

      <div className="space-y-3">
        {sortedRows.map((row) => (
          <div
            key={row.code}
            className="rounded-lg border border-zinc-200 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="min-w-[5rem] text-lg font-semibold text-zinc-800">
                {priorityOrderLabel(row.priority)} {row.label}
              </span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(row.code, { enabled: e.target.checked })}
                />
                {vi.app.enabled}
              </label>
              <div className="flex items-center gap-2">
                <Label className="mb-0">{vi.settings.gatewayPriorityLabel}</Label>
                <Button type="button" variant="secondary" onClick={() => bumpPriority(row.code, -1)}>
                  −
                </Button>
                <Input
                  className="w-20 text-center"
                  type="number"
                  min={1}
                  value={row.priority}
                  onChange={(e) =>
                    updateRow(row.code, { priority: Number.parseInt(e.target.value, 10) || 0 })
                  }
                />
                <Button type="button" variant="secondary" onClick={() => bumpPriority(row.code, 1)}>
                  +
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {validationError && <ErrorMessage message={validationError} />}
      <Button disabled={saving} onClick={() => void save()}>
        {saving ? vi.app.loading : vi.app.save}
      </Button>
    </Card>
  );
}

function ComingSoonGatewaysCard() {
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{vi.settings.comingSoonGateways}</h2>
        <p className="text-sm text-zinc-500">{vi.settings.comingSoonHint}</p>
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm text-zinc-700">
        {COMING_SOON_PAYMENT_GATEWAYS.map((gateway) => (
          <li key={gateway.id}>{gateway.label}</li>
        ))}
      </ul>
    </Card>
  );
}

export default function SettingsPaymentPage() {
  const [megapay, setMegapay] = useState<PaymentGatewaySettings | null>(null);
  const [sepay, setSepay] = useState<PaymentGatewaySettings | null>(null);
  const [strategy, setStrategy] = useState<PaymentStrategySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setError(null);
    try {
      const [m, s, st] = await Promise.all([
        settingsAdminApi.getMegapay(),
        settingsAdminApi.getSepay(),
        settingsAdminApi.getPaymentStrategy(),
      ]);
      setMegapay(m);
      setSepay(s);
      setStrategy(st);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function reload() {
    await settingsAdminApi.reloadPayment();
    await load();
  }

  if (!megapay || !sepay || !strategy) {
    return <p className="text-zinc-500">{vi.app.loading}</p>;
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => void reload()}>
            {vi.app.reloadConfig}
          </Button>
        </div>
        <ConfigurationAuditBar module="payment" />
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        <GatewayPriorityCard
          strategy={strategy}
          onSave={async (gateways) => {
            setStrategy(
              await settingsAdminApi.updatePaymentStrategy({
                gateways: gateways.map((gateway) => ({
                  code: gateway.code,
                  priority: gateway.priority,
                  enabled: gateway.enabled,
                })),
              }),
            );
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />
        <GatewayForm
          title={vi.settings.sepay}
          settings={sepay}
          fields="sepay"
          onSave={async (body) => {
            setSepay(await settingsAdminApi.updateSepay(body));
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />
        <GatewayForm
          title={vi.settings.megapay}
          settings={megapay}
          fields="megapay"
          onSave={async (body) => {
            setMegapay(await settingsAdminApi.updateMegapay(body));
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />
        <ComingSoonGatewaysCard />
        <PaymentMethodsSection />
      </div>
    </RequireRole>
  );
}

function formatMethodFee(percentageFee: number, fixedFee: number): string {
  if (percentageFee > 0 && fixedFee > 0) return `${percentageFee}% + ${fixedFee.toLocaleString('vi-VN')}đ`;
  if (percentageFee > 0) return `${percentageFee}%`;
  if (fixedFee > 0) return `${fixedFee.toLocaleString('vi-VN')}đ`;
  return 'Miễn phí';
}

function PaymentMethodsSection() {
  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getPaymentMethods()
      .then((data) => setMethods(data.methods))
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data = await settingsAdminApi.updatePaymentMethods({ methods });
      setMethods(data.methods);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Phương thức thanh toán</h2>
      {error && <ErrorMessage message={error} />}
      {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-2 pr-3">Gateway</th>
              <th className="py-2 pr-3">Mã</th>
              <th className="py-2 pr-3">Tên hiển thị</th>
              <th className="py-2 pr-3">Phí</th>
              <th className="py-2 pr-3">Bật</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((method, index) => (
              <tr key={`${method.gatewayCode}-${method.methodCode}`} className="border-b border-zinc-100">
                <td className="py-2 pr-3">{method.gatewayCode}</td>
                <td className="py-2 pr-3 font-mono text-xs">{method.methodCode}</td>
                <td className="py-2 pr-3">
                  <Input
                    value={method.displayName}
                    onChange={(e) => {
                      const next = [...methods];
                      next[index] = { ...method, displayName: e.target.value };
                      setMethods(next);
                    }}
                  />
                </td>
                <td className="py-2 pr-3">{formatMethodFee(method.percentageFee, method.fixedFee)}</td>
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={method.enabled}
                    onChange={(e) => {
                      const next = [...methods];
                      next[index] = { ...method, enabled: e.target.checked };
                      setMethods(next);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? vi.app.loading : vi.app.save}
      </Button>
    </Card>
  );
}
