'use client';

import { useState } from 'react';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { RequirePermission } from '@/components/layout/AdminShell';
import { vi } from '@/lib/i18n/vi';
import { operationsApi, ApiClientError } from '@/services/api-client';

const ACTIONS = [
  { id: 'replay_webhook', label: 'Replay webhook', needsWebhook: true },
  { id: 'recheck_provider', label: 'Recheck provider', needsOrder: true },
  { id: 'resend_pin', label: 'Gửi lại PIN', needsOrder: true },
  { id: 'resend_email', label: 'Gửi lại email', needsOrder: true },
  { id: 'rebuild_ledger_summary', label: 'Tổng hợp sổ quỹ', needsOrder: true },
  { id: 'mark_reconciled', label: 'Đánh dấu đối soát', needsOrder: false },
  { id: 'lock_order', label: 'Khóa đơn', needsOrder: true },
  { id: 'unlock_order', label: 'Mở khóa đơn', needsOrder: true },
  { id: 'cancel_safely', label: 'Hủy an toàn', needsOrder: true },
  { id: 'send_telegram', label: 'Gửi Telegram', needsOrder: false },
  { id: 'create_note', label: 'Ghi chú nội bộ', needsOrder: false },
] as const;

function ManualOperationsForm() {
  const [action, setAction] = useState<string>(ACTIONS[0].id);
  const [orderId, setOrderId] = useState('');
  const [webhookId, setWebhookId] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const selected = ACTIONS.find((a) => a.id === action)!;

  async function execute() {
    if ('needsOrder' in selected && selected.needsOrder && !orderId.trim()) {
      setError('Vui lòng nhập Order ID');
      return;
    }
    if ('needsWebhook' in selected && selected.needsWebhook && !webhookId.trim()) {
      setError('Vui lòng nhập Webhook ID');
      return;
    }
    if (!window.confirm(`Xác nhận thao tác: ${selected.label}?`)) return;

    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const result = await operationsApi.manualAction(action, {
        orderId: orderId.trim() || undefined,
        webhookId: webhookId.trim() || undefined,
        note: note.trim() || undefined,
      });
      setMessage(result.message ?? 'Đã thực hiện thành công');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="p-6">
        <p className="text-sm text-zinc-500">
          Mọi thao tác đều đi qua service layer và được ghi vào Activity Log. Không chỉnh sửa database trực tiếp.
        </p>

        {error && <div className="mt-4"><ErrorMessage message={error} /></div>}
        {message && (
          <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <Label>{vi.operations.manualAction}</Label>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {'needsOrder' in selected && selected.needsOrder && (
            <div>
              <Label>{vi.operations.orderId}</Label>
              <Input className="mt-1 font-mono text-sm" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            </div>
          )}

          {'needsWebhook' in selected && selected.needsWebhook && (
            <div>
              <Label>{vi.operations.webhookId}</Label>
              <Input className="mt-1 font-mono text-sm" value={webhookId} onChange={(e) => setWebhookId(e.target.value)} />
            </div>
          )}

          <div>
            <Label>{vi.operations.note}</Label>
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <Button onClick={() => void execute()} disabled={running}>
            {running ? vi.app.loading : vi.operations.execute}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function ManualOperationsPage() {
  return (
    <RequirePermission permission="operations.manage">
      <ManualOperationsForm />
    </RequirePermission>
  );
}
