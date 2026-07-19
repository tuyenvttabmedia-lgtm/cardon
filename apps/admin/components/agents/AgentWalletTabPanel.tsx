'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorMessage, StatCard, statusTone } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { formatVndDigits, parseVndDigits, validateVndAmount } from '@/lib/vnd-input';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { agentCenterApi, ApiClientError } from '@/services/api-client';

const CREDIT_CATEGORIES = [
  { id: 'CONTRACT', label: 'Hợp đồng' },
  { id: 'BANK_TRANSFER', label: 'Chuyển khoản ngân hàng' },
  { id: 'PROMOTION', label: 'Khuyến mãi' },
  { id: 'COMPENSATION', label: 'Bồi hoàn' },
  { id: 'CORRECTION', label: 'Hiệu chỉnh' },
  { id: 'OTHER', label: 'Khác' },
] as const;

type WalletSection = 'ledger' | 'deposits' | 'manual';

export function AgentWalletTabPanel({
  agentId,
  agentName,
  canCredit,
  canApprove,
  canDebit,
  canDepositOnBehalf,
  openTopupInitially,
}: {
  agentId: string;
  agentName: string;
  canCredit: boolean;
  canApprove: boolean;
  canDebit: boolean;
  canDepositOnBehalf: boolean;
  openTopupInitially?: boolean;
}) {
  const toast = useToast();
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [ledger, setLedger] = useState<Array<Record<string, unknown>>>([]);
  const [deposits, setDeposits] = useState<Array<Record<string, unknown>>>([]);
  const [manualOps, setManualOps] = useState<Array<Record<string, unknown>>>([]);
  const [section, setSection] = useState<WalletSection>('ledger');
  const [ledgerFilter, setLedgerFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creditOpen, setCreditOpen] = useState(false);
  const [debitOpen, setDebitOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [amountRaw, setAmountRaw] = useState('');
  const [category, setCategory] = useState<string>('BANK_TRANSFER');
  const [reason, setReason] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const parsedAmount = useMemo(() => parseVndDigits(amountRaw), [amountRaw]);
  const amountError = amountRaw ? validateVndAmount(parsedAmount, false) : null;
  const limits = (summary?.limits ?? {}) as Record<string, number>;
  const approvalThreshold = limits.approvalThreshold ?? 50_000_000;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sum, led, dep, man] = await Promise.all([
        agentCenterApi.walletSummary(agentId),
        agentCenterApi.walletLedger(agentId, { skip: 0, take: 50, q: ledgerFilter || undefined }),
        agentCenterApi.walletDeposits(agentId, { skip: 0, take: 20 }),
        agentCenterApi.walletManualOperations(agentId, { skip: 0, take: 30 }),
      ]);
      setSummary(sum);
      setLedger((led.items as Array<Record<string, unknown>>) ?? []);
      setDeposits((dep.items as Array<Record<string, unknown>>) ?? []);
      setManualOps((man.items as Array<Record<string, unknown>>) ?? []);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được ví đại lý');
    }
  }, [agentId, ledgerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openTopupInitially && canCredit) setCreditOpen(true);
  }, [openTopupInitially, canCredit]);

  function resetForm() {
    setAmountRaw('');
    setCategory('BANK_TRANSFER');
    setReason('');
    setReferenceCode('');
    setConfirmText('');
  }

  async function submitCredit() {
    if (amountError || !reason.trim() || parsedAmount < 10_000) {
      toast.error('Vui lòng kiểm tra số tiền và lý do');
      return;
    }
    if (confirmText.trim().toUpperCase() !== 'XAC NHAN') {
      toast.error('Nhập XAC NHAN để xác nhận');
      return;
    }
    setBusy(true);
    try {
      const res = await agentCenterApi.walletManualCredit(agentId, {
        amount: String(parsedAmount),
        category,
        reason: reason.trim(),
        referenceCode: referenceCode.trim() || undefined,
      });
      if (res.message) toast.success(String(res.message));
      else toast.success('Đã nạp ví thành công');
      setCreditOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Nạp ví thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function submitDebit() {
    if (amountError || !reason.trim() || parsedAmount < 10_000) return;
    if (confirmText.trim().toUpperCase() !== 'TRU VI') {
      toast.error('Nhập TRU VI để xác nhận trừ ví');
      return;
    }
    setBusy(true);
    try {
      await agentCenterApi.walletManualDebit(agentId, {
        amount: String(parsedAmount),
        category,
        reason: reason.trim(),
        referenceCode: referenceCode.trim() || undefined,
      });
      toast.success('Đã trừ ví');
      setDebitOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Trừ ví thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function submitDepositOnBehalf() {
    if (amountError || parsedAmount < 10_000) return;
    setBusy(true);
    try {
      await agentCenterApi.walletDepositOnBehalf(agentId, { amount: String(parsedAmount) });
      toast.success('Đã tạo yêu cầu nạp cổng — xem mục Nạp cổng');
      setDepositOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Tạo nạp cổng thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setBusy(true);
    try {
      await agentCenterApi.walletApproveCredit(agentId, id);
      toast.success('Đã duyệt nạp ví');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Duyệt thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    const r = window.prompt('Lý do từ chối:');
    if (!r?.trim()) return;
    setBusy(true);
    try {
      await agentCenterApi.walletRejectCredit(agentId, id, r.trim());
      toast.success('Đã từ chối yêu cầu');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Từ chối thất bại');
    } finally {
      setBusy(false);
    }
  }

  const pendingApprovals = Number(summary?.pendingApprovals ?? 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600">
        Quản lý số dư đại lý — nạp thủ công tách biệt với nạp cổng (SePay/MegaPay) và sao kê.
      </p>
      {error && <ErrorMessage message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Số dư" value={formatVnd(String(summary?.balance ?? '0'))} />
        <StatCard label="Đang giữ" value={formatVnd(String(summary?.heldAmount ?? '0'))} />
        <StatCard label="Khả dụng" value={formatVnd(String(summary?.available ?? '0'))} />
        <StatCard label="Chờ nạp cổng" value={formatVnd(String(summary?.pendingDeposit ?? '0'))} />
      </div>

      {(canCredit || canDebit || canDepositOnBehalf) && (
        <Card className="flex flex-wrap gap-2 p-4">
          {canCredit && (
            <Button onClick={() => { resetForm(); setCreditOpen(true); }} disabled={busy}>
              Nạp ví thủ công
            </Button>
          )}
          {canDepositOnBehalf && (
            <Button variant="secondary" disabled={busy} onClick={() => { resetForm(); setDepositOpen(true); }}>
              Tạo nạp cổng (hộ)
            </Button>
          )}
          {canDebit && (
            <Button variant="danger" disabled={busy} onClick={() => { resetForm(); setDebitOpen(true); }}>
              Trừ ví (SUPER_ADMIN)
            </Button>
          )}
          {pendingApprovals > 0 && (
            <Badge tone="warning">{pendingApprovals} yêu cầu chờ duyệt</Badge>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        {(['ledger', 'deposits', 'manual'] as WalletSection[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={section === s ? 'primary' : 'ghost'}
            onClick={() => setSection(s)}
          >
            {s === 'ledger' ? 'Sổ cái' : s === 'deposits' ? 'Nạp cổng' : 'Thao tác Admin'}
          </Button>
        ))}
      </div>

      {section === 'ledger' && (
        <Card className="overflow-x-auto p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Sổ cái</h3>
            <Input
              className="max-w-xs"
              placeholder="Tìm ref, mô tả..."
              value={ledgerFilter}
              onChange={(e) => setLedgerFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void load()}
            />
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Thời gian</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-left">Số tiền</th>
                <th className="px-3 py-2 text-left">Số dư sau</th>
                <th className="px-3 py-2 text-left">Tham chiếu</th>
                <th className="px-3 py-2 text-left">Người thực hiện</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={String(e.id)} className="border-b border-zinc-50">
                  <td className="px-3 py-2">{formatDateTime(String(e.createdAt))}</td>
                  <td className="px-3 py-2">{String(e.type)}</td>
                  <td className="px-3 py-2">{formatVnd(String(e.amount))}</td>
                  <td className="px-3 py-2">{formatVnd(String(e.afterBalance))}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {String(e.referenceType ?? '—')} / {String(e.referenceId ?? '').slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-xs">{String(e.createdByEmail ?? 'Hệ thống')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {section === 'deposits' && (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Mã</th>
                <th className="px-3 py-2 text-left">Số tiền</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-left">Cổng</th>
                <th className="px-3 py-2 text-left">Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-zinc-500">
                    Chưa có giao dịch nạp cổng.
                  </td>
                </tr>
              ) : (
                deposits.map((d) => (
                  <tr key={String(d.id)} className="border-b border-zinc-50">
                    <td className="px-3 py-2 font-mono text-xs">{String(d.paymentReference)}</td>
                    <td className="px-3 py-2">{formatVnd(String(d.amount))}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(String(d.status))} status={String(d.status)} />
                    </td>
                    <td className="px-3 py-2">{String(d.gateway)}</td>
                    <td className="px-3 py-2">{formatDateTime(String(d.createdAt))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}

      {section === 'manual' && (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Thời gian</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-left">Danh mục</th>
                <th className="px-3 py-2 text-left">Số tiền</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-left">Người yêu cầu</th>
                <th className="px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {manualOps.map((m) => (
                <tr key={String(m.id)} className="border-b border-zinc-50">
                  <td className="px-3 py-2">{formatDateTime(String(m.createdAt))}</td>
                  <td className="px-3 py-2">{String(m.type)}</td>
                  <td className="px-3 py-2">{String(m.categoryLabel ?? m.category)}</td>
                  <td className="px-3 py-2">{formatVnd(String(m.amount))}</td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone(String(m.status))} status={String(m.status)} />
                  </td>
                  <td className="px-3 py-2 text-xs">{String(m.requestedByEmail)}</td>
                  <td className="px-3 py-2">
                    {canApprove && m.status === 'PENDING_APPROVAL' && (
                      <div className="flex gap-1">
                        <Button size="sm" disabled={busy} onClick={() => void approve(String(m.id))}>
                          Duyệt
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reject(String(m.id))}>
                          Từ chối
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creditOpen && (
        <WalletModal title={`Nạp ví — ${agentName}`} onClose={() => setCreditOpen(false)}>
          <WalletFormFields
            amountRaw={amountRaw}
            setAmountRaw={setAmountRaw}
            parsedAmount={parsedAmount}
            amountError={amountError}
            category={category}
            setCategory={setCategory}
            reason={reason}
            setReason={setReason}
            referenceCode={referenceCode}
            setReferenceCode={setReferenceCode}
            confirmLabel="Nhập XAC NHAN để xác nhận"
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            hint={
              parsedAmount > approvalThreshold
                ? `Số tiền > ${formatVnd(String(approvalThreshold))} — ACCOUNTANT sẽ cần duyệt ADMIN.`
                : `Tối thiểu 10.000đ.`
            }
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreditOpen(false)}>Hủy</Button>
            <Button disabled={busy} onClick={() => void submitCredit()}>Xác nhận nạp</Button>
          </div>
        </WalletModal>
      )}

      {debitOpen && (
        <WalletModal title={`Trừ ví — ${agentName}`} onClose={() => setDebitOpen(false)}>
          <WalletFormFields
            amountRaw={amountRaw}
            setAmountRaw={setAmountRaw}
            parsedAmount={parsedAmount}
            amountError={amountError}
            category={category}
            setCategory={setCategory}
            reason={reason}
            setReason={setReason}
            referenceCode={referenceCode}
            setReferenceCode={setReferenceCode}
            confirmLabel="Nhập TRU VI để xác nhận"
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            hint="Chỉ SUPER_ADMIN. Kiểm tra số dư khả dụng trước khi trừ."
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDebitOpen(false)}>Hủy</Button>
            <Button variant="danger" disabled={busy} onClick={() => void submitDebit()}>Xác nhận trừ</Button>
          </div>
        </WalletModal>
      )}

      {depositOpen && (
        <WalletModal title="Tạo nạp cổng hộ đại lý" onClose={() => setDepositOpen(false)}>
          <div className="space-y-3">
            <div>
              <Label>Số tiền (VNĐ)</Label>
              <Input
                className="mt-1"
                value={amountRaw}
                onChange={(e) => setAmountRaw(formatVndDigits(parseVndDigits(e.target.value)))}
                placeholder="500.000"
              />
              {amountError && <p className="mt-1 text-xs text-red-600">{amountError}</p>}
            </div>
            <p className="text-xs text-zinc-500">
              Tạo yêu cầu SePay/MegaPay — đại lý thanh toán qua QR/chuyển khoản. Số dư cộng sau webhook.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDepositOpen(false)}>Hủy</Button>
            <Button disabled={busy} onClick={() => void submitDepositOnBehalf()}>Tạo yêu cầu</Button>
          </div>
        </WalletModal>
      )}
    </div>
  );
}

function WalletModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function WalletFormFields({
  amountRaw,
  setAmountRaw,
  parsedAmount,
  amountError,
  category,
  setCategory,
  reason,
  setReason,
  referenceCode,
  setReferenceCode,
  confirmLabel,
  confirmText,
  setConfirmText,
  hint,
}: {
  amountRaw: string;
  setAmountRaw: (v: string) => void;
  parsedAmount: number;
  amountError: string | null;
  category: string;
  setCategory: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  referenceCode: string;
  setReferenceCode: (v: string) => void;
  confirmLabel: string;
  confirmText: string;
  setConfirmText: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Số tiền (VNĐ)</Label>
        <Input
          className="mt-1"
          value={amountRaw}
          onChange={(e) => setAmountRaw(formatVndDigits(parseVndDigits(e.target.value)))}
          placeholder="10.000.000"
        />
        {!amountError && parsedAmount > 0 && (
          <p className="mt-1 text-xs text-zinc-500">{formatVnd(String(parsedAmount))}</p>
        )}
        {amountError && <p className="mt-1 text-xs text-red-600">{amountError}</p>}
      </div>
      <div>
        <Label>Loại nạp</Label>
        <select
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CREDIT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <Label>Lý do (bắt buộc)</Label>
        <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div>
        <Label>Mã tham chiếu (HĐ, UNC…)</Label>
        <Input className="mt-1" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} />
      </div>
      <div>
        <Label>{confirmLabel}</Label>
        <Input className="mt-1 font-mono" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
      </div>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
