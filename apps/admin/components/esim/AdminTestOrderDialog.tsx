'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  ADMIN_TEST_USD_DEFAULT,
  adminTestOrderPayload,
  isUnknownRequestFailure,
  matchRecoveredAdminTestOrder,
  parseAdminTestUsd,
  readPaypalApprovalUrl,
  type AdminTestPayMethod,
} from '@/lib/esim-admin-test-checkout';
import { formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { OrderView, PaymentCheckoutView, ProductVariant } from '@/types/api';

export type AdminTestPaypalSnapshot = {
  orderId: string;
  orderCode: string;
  packageName: string;
  catalogVnd: string;
  testAmountUsd: string;
  paymentStatus: string;
  approvalUrl: string | null;
};

type Phase =
  | 'idle'
  | 'creating-order'
  | 'reconciling-order'
  | 'creating-payment'
  | 'reconciling-payment'
  | 'ready';

function phaseLabel(phase: Phase): string | null {
  if (phase === 'creating-order') return 'Đang tạo đơn…';
  if (phase === 'reconciling-order') return 'Đang đối chiếu đơn hiện có…';
  if (phase === 'creating-payment') return 'Đang khởi tạo thanh toán…';
  if (phase === 'reconciling-payment') return 'Đang đối chiếu payment hiện có…';
  return null;
}

function paymentStatusLabel(status: string): string {
  if (status === 'SUCCESS' || status === 'PAID') return 'Thành công';
  if (status === 'FAILED' || status === 'CANCELLED') return 'Thất bại';
  if (status === 'PENDING' || status === 'WAITING_PAYMENT') return 'Đang chờ thanh toán';
  return status;
}

export function AdminTestOrderDialog({
  variant,
  allowed,
  onClose,
  onVietQrCreated,
  onPaypalReady,
  onBusy,
}: {
  variant: ProductVariant | null;
  allowed: boolean;
  onClose: () => void;
  onVietQrCreated: (order: OrderView) => void;
  onPaypalReady: (snapshot: AdminTestPaypalSnapshot) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const toast = useToast();
  const inflight = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const knownOrder = useRef<OrderView | null>(null);
  const orderUnknown = useRef(false);
  const paymentUnknown = useRef(false);
  const [method, setMethod] = useState<AdminTestPayMethod>('VIETQR');
  const [usd, setUsd] = useState(ADMIN_TEST_USD_DEFAULT);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AdminTestPaypalSnapshot | null>(null);

  useEffect(() => {
    knownOrder.current = null;
    orderUnknown.current = false;
    paymentUnknown.current = false;
    idempotencyKey.current = null;
    setMethod('VIETQR');
    setUsd(ADMIN_TEST_USD_DEFAULT);
    setPhase('idle');
    setError(null);
    setSnapshot(null);
  }, [variant?.id]);

  if (!allowed || !variant) return null;

  const usdAmount = method === 'PAYPAL' ? parseAdminTestUsd(usd) : ADMIN_TEST_USD_DEFAULT;
  const usdInvalid = method === 'PAYPAL' && usdAmount === null;
  const busy = phase !== 'idle' && phase !== 'ready';

  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);

  async function lookupWaitingOrder(): Promise<OrderView | null> {
    const list = await adminApi.listEsimOps({ lane: 'sandbox', take: 20 });
    const found = matchRecoveredAdminTestOrder(list.items, variant!, method);
    if (!found) return null;
    const detail = await adminApi.getEsimOpsDetail(found.id);
    return {
      id: detail.id,
      orderCode: detail.orderCode,
      paymentStatus: detail.paymentStatus,
      fulfillmentStatus: detail.fulfillmentStatus,
    } as OrderView;
  }

  function publishPaypal(order: OrderView, payment: PaymentCheckoutView | null, amount: string) {
    const approval = payment ? readPaypalApprovalUrl(payment) : { ok: false as const, reason: 'missing' as const };
    const next: AdminTestPaypalSnapshot = {
      orderId: order.id,
      orderCode: order.orderCode,
      packageName: variant?.name ?? order.items?.[0]?.variant?.name ?? '—',
      catalogVnd: formatVnd(variant?.sellPrice ?? order.sellAmount),
      testAmountUsd: amount,
      paymentStatus: payment?.status ?? order.paymentStatus,
      approvalUrl: approval.ok ? approval.url : null,
    };
    setSnapshot(next);
    onPaypalReady(next);
    if (payment && !approval.ok) {
      setError(
        approval.reason === 'missing'
          ? 'API không trả approval URL. Bấm thử lại thanh toán. Khóa idempotency được giữ, không tạo PayPal Order mới.'
          : 'Approval URL không thuộc PayPal Sandbox. Đã dừng, không mở cổng.',
      );
    } else {
      setError(null);
    }
    setPhase('ready');
  }

  async function submit() {
    if (!variant || inflight.current || usdInvalid) return;
    inflight.current = true;
    setError(null);
    try {
      let order = knownOrder.current;
      if (!order) {
        if (orderUnknown.current) {
          setPhase('reconciling-order');
          order = await lookupWaitingOrder();
          if (order) {
            knownOrder.current = order;
            orderUnknown.current = false;
          }
        }
        if (!order) {
          setPhase('creating-order');
          const payload = adminTestOrderPayload({
            variantId: variant.id,
            method,
            testAmountUsd: usd,
          });
          order = await adminApi.createEsimTestOrder(payload);
          knownOrder.current = order;
          orderUnknown.current = false;
          idempotencyKey.current = null;
          paymentUnknown.current = false;
        }
      }

      if (method === 'VIETQR') {
        onVietQrCreated(order);
        toast.success(`Đã tạo đơn kiểm thử ${order.orderCode}`);
        setPhase('idle');
        onClose();
        return;
      }

      const amount = parseAdminTestUsd(usd) ?? ADMIN_TEST_USD_DEFAULT;
      if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

      if (paymentUnknown.current) {
        setPhase('reconciling-payment');
        const detail = await adminApi.getEsimOpsDetail(order.id);
        const existing = detail.payments.find((payment) => payment.gateway === 'PAYPAL');
        if (existing && (existing.status === 'SUCCESS' || existing.status === 'PAID')) {
          publishPaypal(order, {
            id: existing.paymentReference,
            orderId: order.id,
            gateway: 'PAYPAL',
            paymentReference: existing.paymentReference,
            amount: existing.amount,
            status: existing.status,
            expiresAt: null,
            paidAt: existing.paidAt,
            createdAt: order.createdAt,
          }, amount);
          paymentUnknown.current = false;
          return;
        }
      }

      setPhase('creating-payment');
      const payment = await adminApi.createPaypalCheckout(order.id, idempotencyKey.current);
      paymentUnknown.current = false;
      publishPaypal(order, payment, amount);
      const approval = readPaypalApprovalUrl(payment);
      if (approval.ok) {
        toast.success(`Đã khởi tạo PayPal Sandbox cho ${order.orderCode}`);
      }
    } catch (err) {
      if (isUnknownRequestFailure(err)) {
        if (!knownOrder.current) orderUnknown.current = true;
        else paymentUnknown.current = true;
        setPhase('reconciling-order');
        try {
          if (!knownOrder.current) {
            const recovered = await lookupWaitingOrder();
            if (recovered) {
              knownOrder.current = recovered;
              orderUnknown.current = false;
              setError('Đã thấy đơn đang chờ. Bấm tiếp tục để khởi tạo thanh toán. Không tạo đơn mới.');
              setPhase('idle');
              return;
            }
          } else {
            await adminApi.getEsimOpsDetail(knownOrder.current.id);
          }
        } catch {
          // The read-only check failed too. Still do not POST again from this catch.
        }
        setPhase('idle');
        setError(
          'Không rõ request đã xong hay chưa. Đã đối chiếu đơn hiện có và không tạo đơn mới. Bấm tiếp tục để đối chiếu lại trước khi tạo.',
        );
        return;
      }
      setPhase('idle');
      setError(err instanceof ApiClientError ? err.message : 'Không tạo được đơn kiểm thử');
    } finally {
      inflight.current = false;
    }
  }

  const statusLine = phaseLabel(phase);
  const confirmLabel = busy
    ? statusLine
    : snapshot
      ? 'Thử lại thanh toán'
      : method === 'PAYPAL'
        ? 'Tạo đơn PayPal Sandbox'
        : 'Tạo một đơn VN / VietQR';

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose(); }}
      title="Tạo đơn eSIM kiểm thử"
      description="Đơn thử gắn tài khoản SUPER_ADMIN. Không phải eSIM bán cho khách. Không mở bán công khai."
      footer={(
        <>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
          <Button size="sm" disabled={busy || usdInvalid} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>SKU: <span className="font-mono">{variant.sku}</span></p>
        <p>Giá catalog: <strong>{formatVnd(variant.sellPrice)}</strong>. Đây là giá VND trên catalog, không phải số tiền PayPal.</p>
        <div>
          <Label htmlFor="admin-test-method">Phương thức thanh toán kiểm thử</Label>
          <Select
            id="admin-test-method"
            className="mt-1"
            value={method}
            disabled={busy || Boolean(knownOrder.current)}
            onChange={(event) => {
              setMethod(event.target.value as AdminTestPayMethod);
              setError(null);
              setSnapshot(null);
            }}
          >
            <option value="VIETQR">VietQR</option>
            <option value="PAYPAL">PayPal Sandbox</option>
          </Select>
        </div>
        {method === 'PAYPAL' ? (
          <div>
            <Label htmlFor="admin-test-usd">Số tiền thanh toán thử nghiệm (USD)</Label>
            <Input
              id="admin-test-usd"
              className="mt-1"
              inputMode="decimal"
              value={usd}
              disabled={busy}
              onChange={(event) => setUsd(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Đây là số tiền PayPal Sandbox thu thử, từ 0.01 đến 80.00 USD, tối đa 2 chữ số thập phân.
              Không phải giá bán catalog và không phải doanh thu.
            </p>
            {usdInvalid ? (
              <p className="mt-1 text-xs text-red-700">Nhập từ 0.01 đến 80.00, tối đa 2 chữ số thập phân.</p>
            ) : null}
          </div>
        ) : null}
        {statusLine ? <p className="text-xs font-medium text-slate-600">{statusLine}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {snapshot ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <p>Order ID: <span className="font-mono">{snapshot.orderId}</span></p>
            <p>Gói: {snapshot.packageName}</p>
            <p>Giá catalog: {snapshot.catalogVnd}</p>
            <p>Số tiền thanh toán thử nghiệm: {snapshot.testAmountUsd} USD</p>
            <p>Gateway: PayPal Sandbox</p>
            <p>Trạng thái payment: {paymentStatusLabel(snapshot.paymentStatus)}</p>
            {snapshot.approvalUrl ? (
              <a
                className="mt-2 inline-block font-medium text-admin-700 underline"
                href={snapshot.approvalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Mở PayPal Sandbox Checkout
              </a>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-slate-500">
          Nếu request timeout, hệ thống đối chiếu đơn và payment đang có trước khi tạo lại. Không bấm liên tiếp.
        </p>
      </div>
    </Dialog>
  );
}
