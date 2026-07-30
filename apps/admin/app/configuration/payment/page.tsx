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

/** SePay gateway form (VietQR HMAC + optional Payment Gateway). */
function SepayGatewayForm({
  title,
  settings,
  onSave,
}: {
  title: string;
  settings: PaymentGatewaySettings;
  onSave: (body: Partial<PaymentGatewaySettings>) => Promise<void>;
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const sepayRuntime = useMemo(() => {
    const mode = form.integrationMode ?? 'legacy_qr';
    const env = form.environment ?? 'production';
    if (mode === 'legacy_qr') {
      return {
        host: 'qr.sepay.vn',
        hint:
          env === 'sandbox'
            ? 'Đang bật Sandbox nhưng chế độ vẫn là VietQR/chuyển khoản — QR luôn gọi qr.sepay.vn (không có sandbox QR). Muốn test sandbox: chọn SePay Payment Gateway và dùng merchant/IPN sandbox.'
            : 'Chế độ VietQR/chuyển khoản — QR tạo tại qr.sepay.vn, tiền về STK đã cấu hình.',
        warn: env === 'sandbox',
      };
    }
    const host = env === 'sandbox' ? 'pay-sandbox.sepay.vn' : 'pay.sepay.vn';
    return {
      host,
      hint: `Payment Gateway ${env} — checkout qua ${host}. Cần merchantId + secret + IPN secret đúng môi trường.`,
      warn: false,
    };
  }, [form.environment, form.integrationMode]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Cổng dự phòng bán lẻ + nạp hạn mức đại lý.</p>
        </div>
        <SettingsRuntimeBadges
          source={settings.source}
          configured={settings.configured}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{vi.app.enabled}</Label>
          <div className="mt-2">
            <input
              type="checkbox"
              checked={form.enabled ?? false}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
          </div>
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
          <p className="mt-1 text-xs text-slate-500">
            Chỉ áp dụng khi chế độ = <strong>SePay Payment Gateway</strong>. VietQR không có endpoint
            sandbox.
          </p>
        </div>
        <div
          className={`md:col-span-2 rounded-lg border p-3 text-sm ${
            sepayRuntime.warn
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          <p className="font-medium">Runtime: {sepayRuntime.host}</p>
          <p className="mt-1">{sepayRuntime.hint}</p>
        </div>
        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <strong>VietQR / CK:</strong> webhook HMAC (my.sepay.vn) → ô Webhook Secret. API Key chỉ khi
          SePay dùng auth API Key. Nội dung CK tiền tố <code>DH…</code>.
          <br />
          <strong>Payment Gateway:</strong> checkout hosted + IPN — dùng merchant sandbox/production
          riêng; môi trường Sandbox → <code>pay-sandbox.sepay.vn</code>.
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
        {(form.integrationMode ?? 'legacy_qr') === 'payment_gateway' ? (
          <>
            <div>
              <Label>Merchant ID (PG)</Label>
              <Input
                className="mt-1"
                value={form.merchantId ?? ''}
                onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
                placeholder="SP-TEST-…"
              />
            </div>
            <div>
              <Label>Merchant Secret Key (PG)</Label>
              <Input
                className="mt-1 font-mono"
                type="password"
                value={form.secretKey ?? ''}
                onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                placeholder="********"
              />
            </div>
            <div>
              <Label>IPN Secret Key</Label>
              <Input
                className="mt-1 font-mono"
                type="password"
                value={form.webhookSecret ?? ''}
                onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                placeholder="IPN secret sandbox/production"
              />
            </div>
            <div>
              <Label>Payment method (PG)</Label>
              <Select
                className="mt-1"
                value={
                  form.paymentMethod === 'NAPAS_BANK_TRANSFER'
                    ? 'NAPAS_BANK_TRANSFER'
                    : 'BANK_TRANSFER'
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    paymentMethod: e.target.value as 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER',
                  })
                }
              >
                <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                <option value="NAPAS_BANK_TRANSFER">NAPAS_BANK_TRANSFER</option>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>{vi.settings.apiKey} (tùy chọn — auth API Key)</Label>
              <Input
                className="mt-1 font-mono"
                type="password"
                value={form.apiKey ?? ''}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </div>
            <div>
              <Label>{vi.settings.webhookSecret} (HMAC Secret Key)</Label>
              <Input
                className="mt-1 font-mono"
                type="password"
                value={form.webhookSecret ?? ''}
                onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                placeholder="whsec_…"
              />
            </div>
            <div>
              <Label>{vi.settings.bankAccount}</Label>
              <Input
                className="mt-1"
                value={form.bankAccount ?? ''}
                onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
              />
            </div>
            <div>
              <Label>{vi.settings.bankCode}</Label>
              <Input
                className="mt-1"
                value={form.bankCode ?? ''}
                onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
              />
            </div>
            <div>
              <Label>{vi.settings.accountName}</Label>
              <Input
                className="mt-1"
                value={form.accountName ?? ''}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              />
            </div>
            <div>
              <Label>{vi.settings.qrTemplate}</Label>
              <Input
                className="mt-1"
                value={form.qrTemplate ?? ''}
                onChange={(e) => setForm({ ...form, qrTemplate: e.target.value })}
              />
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <Label>{vi.settings.webhookUrl}</Label>
          <Input
            className="mt-1"
            value={form.webhookUrl ?? ''}
            onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? vi.app.loading : vi.app.save}
        </Button>
        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
      </div>
    </Card>
  );
}

const MEGAPAY_METHOD_META: Record<
  string,
  { flowLabel: string; hint: string }
> = {
  DEPOSIT_CODE: {
    flowLabel: 'Luồng 1 · DepositCode',
    hint: 'registerVA → QR VietQR / VA inline',
  },
  VNPAYQR: {
    flowLabel: 'Luồng 2 · PG V1.4.6',
    hint: 'payType=QR · openPayment',
  },
  ZALOPAY: {
    flowLabel: 'Luồng 2 · PG V1.4.6',
    hint: 'payType=EW · bankCode=ZALO',
  },
};

function MegaPayGatewayCard({
  settings,
  onSaveGateway,
  onSaved,
}: {
  settings: PaymentGatewaySettings;
  onSaveGateway: (body: Partial<PaymentGatewaySettings>) => Promise<PaymentGatewaySettings>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(settings);
  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [allMethods, setAllMethods] = useState<PaymentMethodConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [methodsError, setMethodsError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    settingsAdminApi
      .getPaymentMethods()
      .then((data) => {
        setAllMethods(data.methods);
        setMethods(data.methods.filter((m) => m.gatewayCode === 'MEGAPAY'));
      })
      .catch((err) =>
        setMethodsError(err instanceof ApiClientError ? err.message : vi.app.requestFailed),
      );
  }, []);

  function patchMegapayMethod(methodCode: string, patch: Partial<PaymentMethodConfig>) {
    setMethods((prev) =>
      prev.map((m) => (m.methodCode === methodCode ? { ...m, ...patch } : m)),
    );
  }

  async function saveGateway() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveGateway(form);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveMethods() {
    setSavingMethods(true);
    setMethodsError(null);
    try {
      const megapayByCode = new Map(methods.map((m) => [m.methodCode, m]));
      const merged = allMethods.map((m) =>
        m.gatewayCode === 'MEGAPAY' ? (megapayByCode.get(m.methodCode) ?? m) : m,
      );
      for (const m of methods) {
        if (!merged.some((x) => x.gatewayCode === 'MEGAPAY' && x.methodCode === m.methodCode)) {
          merged.push(m);
        }
      }
      const data = await settingsAdminApi.updatePaymentMethods({ methods: merged });
      setAllMethods(data.methods);
      setMethods(data.methods.filter((m) => m.gatewayCode === 'MEGAPAY'));
      onSaved();
    } catch (err) {
      setMethodsError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSavingMethods(false);
    }
  }

  const orderedMethods = useMemo(() => {
    const order = ['DEPOSIT_CODE', 'VNPAYQR', 'ZALOPAY'];
    return [...methods].sort(
      (a, b) => order.indexOf(a.methodCode) - order.indexOf(b.methodCode),
    );
  }, [methods]);

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{vi.settings.megapay}</h2>
          <p className="mt-1 text-sm text-slate-500">
            2 luồng kỹ thuật · 3 công tắc method bán lẻ. SePay là cổng dự phòng.
          </p>
        </div>
        <SettingsRuntimeBadges
          source={settings.source}
          configured={settings.configured}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{vi.app.enabled} (gateway master)</Label>
          <div className="mt-2">
            <input
              type="checkbox"
              checked={form.enabled ?? false}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
          </div>
        </div>
        <div>
          <Label>{vi.settings.merchantId}</Label>
          <Input
            className="mt-1"
            value={form.merchantId ?? ''}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
            placeholder="merchant_code / merId"
          />
        </div>
        <div className="md:col-span-2">
          <Label>{vi.settings.callbackUrl} (IPN / DepositCode notify)</Label>
          <Input
            className="mt-1"
            value={form.callbackUrl ?? ''}
            onChange={(e) => setForm({ ...form, callbackUrl: e.target.value })}
            placeholder="https://cardon.vn/api/v1/payments/webhook/megapay"
          />
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Luồng 1 · DepositCode (VietQR / VA)</h3>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              settings.depositCodeReady
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {settings.depositCodeReady ? 'Đủ credential' : 'Thiếu credential'}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          Method <code>DEPOSIT_CODE</code> → <code>registerVA</code> (3DES) → QR inline. Verify notify
          bằng RSA public key.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Secret Key 3DES (24 ký tự)</Label>
            <Input
              className="mt-1 font-mono"
              type="password"
              value={form.secretKey ?? ''}
              onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
              placeholder="********"
            />
          </div>
          <div>
            <Label>Bank code (VA)</Label>
            <Input
              className="mt-1"
              value={form.bankCode ?? ''}
              onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
              placeholder="WOORIBANK"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Endpoint registerVA</Label>
            <Input
              className="mt-1 font-mono text-xs"
              value={form.endpoint ?? ''}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="https://…/registerVA"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Notify RSA public key (PEM)</Label>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
              rows={4}
              value={form.notifyPublicKey ?? ''}
              onChange={(e) => setForm({ ...form, notifyPublicKey: e.target.value })}
              placeholder={'-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Luồng 2 · MegaPay PG V1.4.6</h3>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              settings.pgLayerReady
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {settings.pgLayerReady ? 'Đủ credential' : 'Thiếu credential'}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          Method <code>VNPAYQR</code> / <code>ZALOPAY</code> → form + <code>openPayment</code>. Encode
          key riêng nếu khác key 3DES.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>PG Merchant ID (merId)</Label>
            <Input
              className="mt-1 font-mono"
              value={form.pgMerchantId ?? ''}
              onChange={(e) => setForm({ ...form, pgMerchantId: e.target.value })}
              placeholder="CARDON0001 (fallback = Merchant ID DepositCode)"
            />
          </div>
          <div>
            <Label>PG Encode Key</Label>
            <Input
              className="mt-1 font-mono"
              type="password"
              value={form.pgEncodeKey ?? ''}
              onChange={(e) => setForm({ ...form, pgEncodeKey: e.target.value })}
              placeholder="******** (fallback = 3DES)"
            />
          </div>
          <div>
            <Label>PG Refund Password (API hoàn tiền)</Label>
            <Input
              className="mt-1 font-mono"
              type="password"
              value={form.pgRefundPassword ?? ''}
              onChange={(e) => setForm({ ...form, pgRefundPassword: e.target.value })}
              placeholder="********"
            />
          </div>
          <div>
            <Label>PG Environment</Label>
            <Select
              className="mt-1"
              value={form.pgEnvironment ?? 'sandbox'}
              onChange={(e) =>
                setForm({
                  ...form,
                  pgEnvironment: e.target.value as 'sandbox' | 'production',
                })
              }
            >
              <option value="sandbox">{vi.app.sandbox}</option>
              <option value="production">{vi.app.production}</option>
            </Select>
          </div>
          <div>
            <Label>reqDomain (site công khai)</Label>
            <Input
              className="mt-1"
              value={form.reqDomain ?? ''}
              onChange={(e) => setForm({ ...form, reqDomain: e.target.value })}
              placeholder="https://cardon.vn"
            />
          </div>
          <div>
            <Label>{vi.settings.returnUrl}</Label>
            <Input
              className="mt-1"
              value={form.returnUrl ?? ''}
              onChange={(e) => setForm({ ...form, returnUrl: e.target.value })}
              placeholder="https://cardon.vn/checkout/result"
            />
          </div>
        </div>
      </section>

      {saveError && <ErrorMessage message={saveError} />}
      <Button onClick={() => void saveGateway()} disabled={saving}>
        {saving ? vi.app.loading : 'Lưu credential MegaPay'}
      </Button>

      <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
        <h3 className="font-semibold">3 công tắc method</h3>
        <p className="text-sm text-slate-600">
          Bật/tắt từng method trên checkout. Phí = % + cố định (đ/GD).
        </p>
        {methodsError && <ErrorMessage message={methodsError} />}
        <div className="space-y-3">
          {orderedMethods.map((method) => {
            const meta = MEGAPAY_METHOD_META[method.methodCode];
            return (
              <div
                key={method.methodCode}
                className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={method.enabled}
                        onChange={(e) =>
                          patchMegapayMethod(method.methodCode, { enabled: e.target.checked })
                        }
                      />
                      {method.displayName}
                    </label>
                    <code className="text-xs text-slate-500">{method.methodCode}</code>
                    {meta && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {meta.flowLabel}
                      </span>
                    )}
                  </div>
                  {meta && <p className="mt-1 text-xs text-slate-500">{meta.hint}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-28"
                    value={method.displayName}
                    onChange={(e) =>
                      patchMegapayMethod(method.methodCode, { displayName: e.target.value })
                    }
                    aria-label="Tên hiển thị"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-20"
                    value={method.percentageFee}
                    onChange={(e) =>
                      patchMegapayMethod(method.methodCode, {
                        percentageFee: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    aria-label="Phí %"
                  />
                  <span className="text-xs text-slate-400">%</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    className="w-24"
                    value={method.fixedFee}
                    onChange={(e) =>
                      patchMegapayMethod(method.methodCode, {
                        fixedFee: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    aria-label="Phí cố định"
                  />
                  <span className="text-xs text-slate-400">đ</span>
                </div>
              </div>
            );
          })}
        </div>
        <Button onClick={() => void saveMethods()} disabled={savingMethods}>
          {savingMethods ? vi.app.loading : 'Lưu 3 công tắc method'}
        </Button>
      </section>
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
    setRows((current) => {
      if (patch.priority == null) {
        return current.map((row) => (row.code === code ? { ...row, ...patch } : row));
      }

      const nextPriority = Math.max(1, Math.floor(Number(patch.priority)) || 1);
      const self = current.find((row) => row.code === code);
      if (!self) return current;

      const conflict = current.find(
        (row) => row.code !== code && row.priority === nextPriority,
      );

      return current.map((row) => {
        if (row.code === code) {
          return { ...row, ...patch, priority: nextPriority };
        }
        if (conflict && row.code === conflict.code) {
          return { ...row, priority: self.priority };
        }
        return row;
      });
    });
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
          <p className="text-sm text-slate-500">
            {vi.settings.gatewayPriorityHint} Đổi số của một gateway sẽ tự đổi chỗ với gateway đang giữ
            số đó.
          </p>
        </div>
        <SettingsRuntimeBadges source={strategy.source} secretsProtected={false} />
      </div>

      <div className="space-y-3">
        {sortedRows.map((row) => (
          <div key={row.code} className="rounded-lg border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="min-w-[5rem] text-lg font-semibold text-slate-800">
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
        <p className="text-sm text-slate-500">{vi.settings.comingSoonHint}</p>
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
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
    return <p className="text-slate-500">{vi.app.loading}</p>;
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
        <MegaPayGatewayCard
          settings={megapay}
          onSaveGateway={async (body) => {
            const next = await settingsAdminApi.updateMegapay(body);
            setMegapay(next);
            return next;
          }}
          onSaved={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
            void load();
          }}
        />
        <SepayGatewayForm
          title={vi.settings.sepay}
          settings={sepay}
          onSave={async (body) => {
            setSepay(await settingsAdminApi.updateSepay(body));
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
        />
        <ComingSoonGatewaysCard />
        <PaymentMethodsSection gatewayFilter="SEPAY" />
      </div>
    </RequireRole>
  );
}

function PaymentMethodsSection({
  gatewayFilter,
}: {
  gatewayFilter?: 'SEPAY' | 'MEGAPAY';
}) {
  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [allMethods, setAllMethods] = useState<PaymentMethodConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getPaymentMethods()
      .then((data) => {
        setAllMethods(data.methods);
        setMethods(
          gatewayFilter
            ? data.methods.filter((m) => m.gatewayCode === gatewayFilter)
            : data.methods,
        );
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, [gatewayFilter]);

  function patchMethod(index: number, patch: Partial<PaymentMethodConfig>) {
    setMethods((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function parseNonNegativeNumber(raw: string): number {
    const normalized = raw.replace(/,/g, '').trim();
    if (normalized === '') return 0;
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0) return 0;
    return value;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const byKey = new Map(
        methods.map((m) => [`${m.gatewayCode}:${m.methodCode}`, m] as const),
      );
      const merged = allMethods.map((m) => byKey.get(`${m.gatewayCode}:${m.methodCode}`) ?? m);
      const data = await settingsAdminApi.updatePaymentMethods({ methods: merged });
      setAllMethods(data.methods);
      setMethods(
        gatewayFilter
          ? data.methods.filter((m) => m.gatewayCode === gatewayFilter)
          : data.methods,
      );
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
      <h2 className="text-lg font-semibold">
        {gatewayFilter === 'SEPAY' ? 'Phương thức SePay' : 'Phương thức thanh toán'}
      </h2>
      <p className="text-sm text-slate-500">
        {gatewayFilter === 'SEPAY'
          ? 'Phí SePay (dự phòng). Ba method MegaPay chỉnh trong card MegaPay phía trên.'
          : 'Phí = % trên giá bán + phí cố định (đ/GD).'}
      </p>
      {error && <ErrorMessage message={error} />}
      {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-3">Gateway</th>
              <th className="py-2 pr-3">Mã</th>
              <th className="py-2 pr-3">Tên hiển thị</th>
              <th className="py-2 pr-3">Phí %</th>
              <th className="py-2 pr-3">Phí cố định (đ)</th>
              <th className="py-2 pr-3">Bật</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((method, index) => (
              <tr key={`${method.gatewayCode}-${method.methodCode}`} className="border-b border-slate-100">
                <td className="py-2 pr-3">{method.gatewayCode}</td>
                <td className="py-2 pr-3 font-mono text-xs">{method.methodCode}</td>
                <td className="py-2 pr-3">
                  <Input
                    value={method.displayName}
                    onChange={(e) => patchMethod(index, { displayName: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-24"
                    value={method.percentageFee}
                    onChange={(e) =>
                      patchMethod(index, { percentageFee: parseNonNegativeNumber(e.target.value) })
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    className="w-28"
                    value={method.fixedFee}
                    onChange={(e) =>
                      patchMethod(index, { fixedFee: parseNonNegativeNumber(e.target.value) })
                    }
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={method.enabled}
                    onChange={(e) => patchMethod(index, { enabled: e.target.checked })}
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
