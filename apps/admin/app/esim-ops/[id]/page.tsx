'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CopyIdButton } from '@/components/esim-ops/CopyIdButton';
import { EsimOpsShell } from '@/components/esim-ops/EsimOpsShell';
import { EsimOpsTimeline } from '@/components/esim-ops/EsimOpsTimeline';
import {
  buildEsimOrderTimeline,
  formatEsimMoney,
  fulfillmentTone,
  gatewayLabel,
  paymentTone,
} from '@/components/esim-ops/esim-ops-ui';
import { RequirePermission } from '@/components/layout/AdminShell';
import { CopyValueRow } from '@/components/orders/DeliveryField';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import {
  canCreateTestPayment,
  checkoutHost,
  sandboxCheckoutForm,
  sepaySandboxCheckoutAction,
} from '@/lib/esim-admin-ops';
import { selectCloseQueryClaim } from '@/lib/esim-query-claim';
import { applyRevealForOrder, revealStateForOrder } from '@/lib/esim-reveal-state';
import { LatestRequestTracker } from '@/lib/latest-request';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { EsimOpsDetail, PaymentCheckoutView } from '@/types/api';

export default function EsimOpsDetailPage() {
  const params = useParams<{ id: string }>();
  const { can, user } = useAuth();
  const [detail, setDetail] = useState<EsimOpsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [boundOrderId, setBoundOrderId] = useState<string | undefined>(params.id);
  const [revealing, setRevealing] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmRecover, setConfirmRecover] = useState(false);
  const [confirmCloseClaim, setConfirmCloseClaim] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closingClaim, setClosingClaim] = useState(false);
  const [creatingPay, setCreatingPay] = useState(false);
  const [checkout, setCheckout] = useState<PaymentCheckoutView | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const creatingPayRef = useRef(false);
  const loadRequestsRef = useRef(new LatestRequestTracker<'ops-detail'>());
  const orderIdRef = useRef(params.id);
  orderIdRef.current = params.id;
  const aligned = revealStateForOrder(boundOrderId, params.id, revealed, null);
  if (aligned.boundOrderId !== boundOrderId) {
    loadRequestsRef.current.invalidate('ops-detail');
    setBoundOrderId(aligned.boundOrderId);
    setRevealed(aligned.value);
    setRevealing(false);
    setDetail(null);
    setError(null);
    setMessage(null);
    setCheckout(null);
    setPayError(null);
    setConfirmCloseClaim(false);
    setConfirmRecover(false);
    setCloseReason('');
    setClosingClaim(false);
  }

  const load = useCallback(async (opts?: { announce?: boolean }) => {
    const token = loadRequestsRef.current.begin('ops-detail');
    setError(null);
    try {
      const data = await adminApi.getEsimOpsDetail(params.id);
      if (!loadRequestsRef.current.isLatest(token)) return;
      setDetail(data);
      if (opts?.announce) {
        setMessage(`Đã tải lại lúc ${new Date().toLocaleTimeString('vi-VN')}`);
      }
    } catch (err) {
      if (!loadRequestsRef.current.isLatest(token)) return;
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recover() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.recoverEsimOrder(params.id);
      setMessage(
        result.fulfillmentStatus === 'COMPLETED'
          ? 'Đã lấy mã cài từ nhà cung cấp.'
          : `Đã đọc lại nhà cung cấp — ${result.fulfillmentStatus}. Không tạo eSIM mới. Chưa có mã cài thì xem lỗi bên dưới.`,
      );
      setConfirmRecover(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không đọc được đơn từ nhà cung cấp');
    } finally {
      setBusy(false);
    }
  }

  const paid = detail?.paymentStatus === 'PAID';
  const hasProfile = Boolean(detail?.profilePresent);
  const hasAiralo = Boolean(detail?.airaloOrderId);
  const allowTestPayment = canCreateTestPayment({
    role: user?.role,
    userEmail: user?.email,
    customerEmail: detail?.customer.email,
    paymentStatus: detail?.paymentStatus,
    payments: detail?.payments,
  });
  const pendingPayment = Boolean(
    detail?.payments.some((payment) => payment.status.toUpperCase() === 'PENDING'),
  );
  const sandboxForm = checkout ? sandboxCheckoutForm(checkout) : null;
  const closeClaim = detail ? selectCloseQueryClaim(detail.attempts) : null;
  const canCloseClaim = can('orders.retry') && !hasProfile && Boolean(closeClaim);
  const canRecover =
    can('orders.retry') &&
    paid &&
    !hasProfile &&
    (detail?.fulfillmentStatus === 'NEED_MANUAL_REVIEW' ||
      detail?.fulfillmentStatus === 'WAITING_ADMIN_RETRY' ||
      detail?.fulfillmentStatus === 'PENDING');
  const timeline = detail ? buildEsimOrderTimeline(detail) : [];
  const latestFailedAttempt = detail
    ? [...detail.attempts].reverse().find((row) => Boolean(row.errorMessage))
    : null;
  const needsAttention = Boolean(
    detail && (
      detail.paidUnfulfilled
      || detail.lastError
      || ['NEED_MANUAL_REVIEW', 'WAITING_ADMIN_RETRY', 'FAILED'].includes(detail.fulfillmentStatus)
      || ['EXPIRED', 'FAILED'].includes(detail.paymentStatus)
    ),
  );

  async function closeQueryClaim() {
    if (!detail || !closeClaim || closingClaim || closeReason.trim() === '') return;
    setClosingClaim(true);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.closeEsimQueryClaim(detail.id, {
        queryAttemptId: closeClaim.queryAttemptId,
        createAttemptId: closeClaim.createAttemptId,
        reason: closeReason.trim(),
      });
      setConfirmCloseClaim(false);
      setCloseReason('');
      setMessage(
        result.result === 'closed'
          ? 'Đã đóng claim truy vấn. Giữ khóa tạo đơn và mã nhà cung cấp. Hệ thống có thể truy vấn lại.'
          : 'Không đóng được claim (id hoặc trạng thái không khớp). Khóa tạo đơn không đổi.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không đóng được claim truy vấn');
    } finally {
      setClosingClaim(false);
    }
  }

  async function createSandboxPayment() {
    if (!detail || creatingPayRef.current || !allowTestPayment) return;
    creatingPayRef.current = true;
    setCreatingPay(true);
    setPayError(null);
    try {
      const payment = await adminApi.createSepayCheckout(detail.id, crypto.randomUUID());
      const action = sepaySandboxCheckoutAction(payment);
      if (!action) {
        setPayError(
          `Host thanh toán không phải môi trường thử (${checkoutHost(payment.checkoutUrl || payment.paymentUrl) ?? 'unknown'}). Đã dừng, không mở cổng.`,
        );
        return;
      }
      setCheckout(payment);
      setMessage(`Đã tạo thanh toán ${payment.paymentReference} · ${payment.status}. Mở checkout thử bên dưới.`);
      await load();
    } catch (err) {
      const network = err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));
      setPayError(
        network
          ? 'Không rõ thanh toán đã tạo hay chưa. Làm mới trang và kiểm tra payment hiện có. Không bấm tạo lại ngay.'
          : err instanceof ApiClientError
            ? err.message
            : 'Không tạo được thanh toán',
      );
    } finally {
      creatingPayRef.current = false;
      setCreatingPay(false);
      setConfirmPay(false);
    }
  }

  return (
    <RequirePermission permission="orders.read">
      <EsimOpsShell>
        <PageHeader
          title={detail?.orderCode ?? 'Đơn eSIM'}
          subtitle="Giá đã khóa lúc tạo đơn, thanh toán và lần gọi nhà cung cấp. Không tính lại bằng tỷ giá hiện tại."
          breadcrumbs={[
            { label: 'Đơn hàng eSIM', href: '/esim-ops' },
            { label: detail?.orderCode ?? 'Chi tiết' },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              {detail ? <CopyIdButton value={detail.orderCode} className="!px-2.5 !py-1.5 !text-xs" /> : null}
              <Button
                variant="secondary"
                onClick={() => void load({ announce: true })}
                disabled={busy}
              >
                Làm mới
              </Button>
              {canRecover && (
                <Button onClick={() => setConfirmRecover(true)} disabled={busy}>
                  {busy
                    ? 'Đang đọc nhà cung cấp…'
                    : hasAiralo
                      ? 'Đọc lại đơn nhà cung cấp'
                      : 'Chỉ đọc — không tạo eSIM mới'}
                </Button>
              )}
              {canCloseClaim && (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmCloseClaim(true)}
                  disabled={busy || closingClaim}
                >
                  Đóng claim truy vấn
                </Button>
              )}
            </div>
          }
        />

        {error && <ErrorMessage message={error} />}
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {payError ? <ErrorMessage message={payError} /> : null}

        {detail && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={paymentTone(detail.paymentStatus)} status={detail.paymentStatus} />
            <Badge tone={fulfillmentTone(detail.fulfillmentStatus)} status={detail.fulfillmentStatus} />
            {detail.lane === 'sandbox' ? <Badge tone="neutral">Đơn thử</Badge> : null}
            <span className="text-xs text-slate-500">Tạo lúc {formatDateTime(detail.createdAt)}</span>
          </div>
        )}

        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Môi trường local: IPN cổng thanh toán có thể không tới localhost. Email thử có thể thất bại.
          Đơn thử không dùng để cài trên thiết bị thật. Xác nhận thanh toán dựa trên đồng bộ cổng hoặc webhook.
        </p>

        {needsAttention && detail ? (
          <Card className="space-y-2 border-amber-200 bg-amber-50/80 p-4">
            <h2 className="font-semibold text-amber-950">Cần kiểm tra</h2>
            {detail.paidUnfulfilled ? (
              <p className="text-sm text-amber-950">
                Đã thu tiền nhưng chưa cấp được eSIM. Dùng «Đọc lại đơn nhà cung cấp» — không tạo đơn mới.
              </p>
            ) : null}
            {detail.lastError && !hasProfile ? (
              <p className="text-sm text-amber-950">
                Lỗi nhà cung cấp gần nhất: {detail.lastError}
              </p>
            ) : null}
            {latestFailedAttempt ? (
              <dl className="grid gap-1 text-sm text-amber-950 sm:grid-cols-2">
                <Row label="Thành phần" value="Provider / Fulfillment" />
                <Row label="Thao tác" value={latestFailedAttempt.operation} />
                <Row label="Kết quả" value={latestFailedAttempt.outcome} />
                <Row
                  label="Thời điểm"
                  value={formatDateTime(latestFailedAttempt.completedAt ?? latestFailedAttempt.createdAt)}
                />
                {latestFailedAttempt.errorMessage ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-amber-800">Thông báo lỗi</p>
                    <p className="mt-0.5 break-words text-sm">{latestFailedAttempt.errorMessage}</p>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {canRecover ? (
              <p className="text-xs text-amber-800">Hành động được phép: đọc lại đơn nhà cung cấp (không tạo đơn mới).</p>
            ) : null}
          </Card>
        ) : null}

        {detail && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Thông tin khách hàng</h2>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Tên" value={detail.customer.name ?? '—'} />
                  <Row label="Email" value={detail.customer.email ?? '—'} />
                  <Row label="Số điện thoại" value={detail.customer.phone ?? '—'} />
                  <Row label="Tạo lúc" value={formatDateTime(detail.createdAt)} />
                </dl>
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Sản phẩm eSIM</h2>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Tên gói" value={detail.packageTitle ?? '—'} />
                  <Row label="Nhà cung cấp" value={detail.providerName ?? detail.providerCode ?? '—'} />
                  <Row label="Mã gói NCC" value={detail.providerProductCode ?? '—'} mono />
                  <Row label="Mã đơn NCC" value={detail.airaloOrderId ?? '—'} mono />
                  <Row label="Chế độ NCC" value={detail.providerMode ?? '—'} />
                  <Row label="Giá khách (legacy)" value={formatVnd(detail.pricing.customerPaid)} />
                </dl>
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Giá đã khóa</h2>
                <p className="text-xs text-slate-500">Không tính lại bằng tỷ giá hiện tại.</p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Thị trường" value={detail.snapshot?.esimMarket ?? '—'} />
                  <Row label="Khóa lúc" value={detail.snapshot?.pricingLockedAt ? formatDateTime(detail.snapshot.pricingLockedAt) : '—'} />
                  <Row label="Catalog" value={moneyPair(detail.snapshot?.catalogAmount, detail.snapshot?.catalogCurrency)} />
                  <Row label="Khách trả" value={moneyPair(detail.snapshot?.chargeAmount, detail.snapshot?.chargeCurrency)} />
                  <Row label="Giá vốn" value={moneyPair(detail.snapshot?.costAmount, detail.snapshot?.costCurrency)} />
                  <Row label="Tỷ giá" value={detail.snapshot?.fxRate ?? '—'} mono />
                  <Row label="Mã tỷ giá" value={detail.snapshot?.fxRateId ?? '—'} mono />
                  <Row label="Tỷ giá lúc" value={detail.snapshot?.fxAsOf ? formatDateTime(detail.snapshot.fxAsOf) : '—'} />
                </dl>
              </Card>

              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Thanh toán</h2>
                  <Link href="/esim-ops/payments" className="text-sm text-admin-700 hover:underline">
                    Mở danh sách thanh toán
                  </Link>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Cổng" value={gatewayLabel(detail.pricing.paymentGateway)} />
                  <Row label="Phương thức" value={detail.pricing.paymentMethod ?? '—'} />
                  <Row label="Phí cổng" value={formatVnd(detail.pricing.paymentFeeAmount)} />
                  <Row label="Trạng thái đơn" value={detail.paymentStatus} />
                </dl>
                {detail.payments.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có payment gắn đơn này.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.payments.map((payment) => (
                      <div key={payment.paymentReference} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold">{payment.paymentReference}</span>
                          <CopyIdButton value={payment.paymentReference} />
                          <Badge tone={statusTone(payment.status)} status={payment.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {gatewayLabel(payment.gateway)} ·{' '}
                          {formatEsimMoney(
                            payment.amount,
                            payment.currency ?? (payment.gateway === 'PAYPAL' ? 'USD' : 'VND'),
                          )}
                          {payment.productLane ? ` · ${payment.productLane}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Tạo: {payment.createdAt ? formatDateTime(payment.createdAt) : '—'}
                          {payment.paidAt ? ` · Paid: ${formatDateTime(payment.paidAt)}` : ''}
                        </p>
                        <Link
                          href={`/esim-ops/payments?q=${encodeURIComponent(payment.paymentReference)}`}
                          className="mt-2 inline-block text-xs font-medium text-admin-700 hover:underline"
                        >
                          Xem trên trang Thanh toán
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
                {allowTestPayment ? (
                  <Button
                    size="sm"
                    disabled={creatingPay}
                    onClick={() => setConfirmPay(true)}
                  >
                    {creatingPay ? 'Đang tạo thanh toán…' : 'Tạo thanh toán thử (Viet QR)'}
                  </Button>
                ) : null}
                {pendingPayment && !checkout ? (
                  <p className="text-xs text-slate-500">
                    Đã có thanh toán đang chờ. Checkout chỉ hiện trong phiên vừa tạo. Không tạo payment mới.
                  </p>
                ) : null}
                {checkout && sandboxForm ? (
                  <form action={sandboxForm.action} method="POST" className="space-y-2">
                    {sandboxForm.fields.map(([field, value]) => (
                      <input key={field} type="hidden" name={field} value={value} />
                    ))}
                    <p className="text-xs text-slate-500">
                      Cổng {checkoutHost(sandboxForm.action)} · {checkout.paymentReference} · {checkout.status}
                      {checkout.expiresAt ? ` · hết hạn ${formatDateTime(checkout.expiresAt)}` : ''}
                    </p>
                    <Button type="submit" size="sm">
                      Mở checkout thử
                    </Button>
                  </form>
                ) : null}
                {checkout && !sandboxForm ? (
                  <p className="text-xs text-amber-800">
                    Đã tạo thanh toán nhưng thiếu form ký hoặc host không phải môi trường thử. Không mở cổng.
                  </p>
                ) : null}
              </Card>

              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Fulfillment / nhà cung cấp</h2>
                  <Link
                    href={`/esim-ops/attempts?q=${encodeURIComponent(detail.orderCode)}`}
                    className="text-sm text-admin-700 hover:underline"
                  >
                    Mở nhật ký cấp
                  </Link>
                </div>
                <p className="text-sm text-slate-500">
                  CREATE = tạo đơn NCC. QUERY = đọc lại đơn NCC để lấy mã cài. Một đơn CardOn chỉ tạo một đơn nhà cung cấp.
                </p>
                {detail.attempts.length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có lần gọi nhà cung cấp.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.attempts.map((attempt) => (
                      <div key={attempt.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <p>
                          <strong>{attempt.operation}</strong> · {attempt.outcome}
                          {attempt.providerStatus ? ` · ${attempt.providerStatus}` : ''}
                        </p>
                        <p className="font-mono text-xs text-slate-600">
                          {attempt.providerReference ?? 'không có code'} · {formatDateTime(attempt.createdAt)}
                        </p>
                        {attempt.errorMessage && (
                          <p className="mt-1 text-xs text-amber-800">{attempt.errorMessage}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Mã cài eSIM</h2>
                {hasProfile ? (
                  <>
                    <CopyValueRow
                      label="Mã cài (QR / chuỗi cài đặt)"
                      value={aligned.value ?? detail.installSecretMasked ?? '—'}
                    />
                    {detail.canRevealInstallSecret ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={revealing}
                        onClick={() => {
                          if (aligned.value) {
                            setRevealed(null);
                            return;
                          }
                          setRevealing(true);
                          const requested = params.id;
                          void adminApi
                            .revealEsimInstallSecret(requested)
                            .then((payload) => {
                              const next = applyRevealForOrder(
                                requested,
                                orderIdRef.current,
                                payload.installSecret,
                              );
                              if (next) setRevealed(next);
                            })
                            .catch((err) => {
                              if (orderIdRef.current !== requested) return;
                              setError(err instanceof ApiClientError ? err.message : 'Không mở được mã cài');
                            })
                            .finally(() => {
                              if (orderIdRef.current === requested) setRevealing(false);
                            });
                        }}
                      >
                        {revealing ? 'Đang mở…' : aligned.value ? 'Ẩn mã' : 'Hiện mã cài'}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-600">
                    {hasAiralo
                      ? `Chưa đọc được mã cài từ đơn nhà cung cấp ${detail.airaloOrderId}. Môi trường thử có thể trả mã giả — không cài lên máy thật.`
                      : 'Chưa có mã đơn nhà cung cấp. Nút «Đọc lại» chỉ đọc; tạo đơn NCC xảy ra khi fulfillment chạy.'}
                  </p>
                )}
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Lịch sử thao tác quản trị</h2>
                {(detail.adminActions ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">Chưa có nhật ký thao tác. Không gồm mã cài bí mật.</p>
                ) : (
                  <div className="space-y-2">
                    {(detail.adminActions ?? []).map((row) => (
                      <div key={row.id} className="rounded border p-3 text-sm">
                        <p>
                          <strong>{row.action}</strong> · {row.actor}
                        </p>
                        <p className="text-xs text-slate-500">{formatDateTime(row.at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card className="h-fit space-y-3 p-4 xl:sticky xl:top-4">
              <h2 className="font-semibold">Tiến trình đơn</h2>
              <p className="text-xs text-slate-500">
                Chỉ đánh dấu bước khi có bằng chứng trên đơn. Không tự tạo timestamp.
              </p>
              <EsimOpsTimeline steps={timeline} />
            </Card>
          </div>
        )}

        <Dialog
          open={confirmRecover}
          onClose={() => {
            if (!busy) setConfirmRecover(false);
          }}
          title="Xác nhận đọc lại nhà cung cấp"
          description={
            detail
              ? `Đơn ${detail.orderCode} · TT ${detail.paymentStatus} · Giao ${detail.fulfillmentStatus}`
              : undefined
          }
          closeOnOverlayClick={!busy}
          footer={(
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmRecover(false)}
              >
                Hủy
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void recover()}
              >
                {busy ? 'Đang đọc nhà cung cấp…' : 'Xác nhận đọc lại'}
              </Button>
            </>
          )}
        >
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Thao tác truy vấn / recovery hiện tại: đọc lại đơn nhà cung cấp đã tạo để lấy mã cài
              (nếu có).
            </p>
            <p className="font-medium text-slate-900">
              Không tạo eSIM mới. Không mở đơn NCC mới. Hủy sẽ không gọi API.
            </p>
            {detail?.airaloOrderId ? (
              <p className="font-mono text-xs text-slate-500">
                Mã NCC tham chiếu: {detail.airaloOrderId}
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                Chưa có mã đơn nhà cung cấp trên hồ sơ — nút vẫn chỉ đọc theo API recover hiện tại.
              </p>
            )}
          </div>
        </Dialog>
        <Dialog
          open={confirmCloseClaim}
          onClose={() => {
            if (!closingClaim) {
              setConfirmCloseClaim(false);
              setCloseReason('');
            }
          }}
          title="Đóng claim truy vấn"
          description="Chỉ đóng khóa truy vấn đang gửi. Không gọi nhà cung cấp, không tạo đơn mới, không fulfill. Hệ thống từ chối nếu job đọc đơn vẫn chạy."
          footer={(
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={closingClaim}
                onClick={() => {
                  setConfirmCloseClaim(false);
                  setCloseReason('');
                }}
              >
                Hủy
              </Button>
              <Button
                size="sm"
                disabled={closingClaim || closeReason.trim() === '' || !closeClaim}
                onClick={() => void closeQueryClaim()}
              >
                {closingClaim ? 'Đang đóng…' : 'Xác nhận đóng claim'}
              </Button>
            </>
          )}
        >
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              QUERY {closeClaim?.queryAttemptId ?? '—'} · CREATE {closeClaim?.createAttemptId ?? '—'}
            </p>
            <p>
              Đợi job <span className="font-mono">esim-query-open-*</span> /{' '}
              <span className="font-mono">esim-fulfill-*</span> rời active/waiting. Không dùng timeout
              làm bằng chứng GET đã dừng.
            </p>
            <label className="block">
              <span className="text-xs text-slate-500">Lý do đóng claim</span>
              <textarea
                className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                rows={3}
                maxLength={512}
                value={closeReason}
                onChange={(event) => setCloseReason(event.target.value)}
                placeholder="Ví dụ: job truy vấn đã rời hàng đợi, worker không còn đọc đơn."
              />
            </label>
          </div>
        </Dialog>
        <Dialog
          open={confirmPay}
          onClose={() => { if (!creatingPay) setConfirmPay(false); }}
          title="Tạo thanh toán thử (Viet QR)"
          description="Chỉ tạo thanh toán cho đơn kiểm thử của SUPER_ADMIN đang chờ thanh toán. Không đánh dấu đã thanh toán thủ công."
          footer={(
            <>
              <Button size="sm" variant="ghost" disabled={creatingPay} onClick={() => setConfirmPay(false)}>Hủy</Button>
              <Button size="sm" disabled={creatingPay} onClick={() => void createSandboxPayment()}>
                {creatingPay ? 'Đang tạo…' : 'Xác nhận tạo thanh toán'}
              </Button>
            </>
          )}
        >
          <p className="text-sm text-slate-700">
            Tạo thanh toán chuyển khoản Viet QR. Nếu timeout, làm mới trang và kiểm tra payment hiện có. Không bấm lại ngay.
          </p>
        </Dialog>
      </EsimOpsShell>
    </RequirePermission>
  );
}

function moneyPair(amount?: string | null, currency?: string | null): string {
  return formatEsimMoney(amount, currency);
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={mono ? 'break-all text-right font-mono text-xs' : 'text-right'}>{value}</dd>
    </div>
  );
}
