'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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

function stepState(done: boolean, current: boolean): 'done' | 'current' | 'todo' {
  if (done) return 'done';
  if (current) return 'current';
  return 'todo';
}

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
          ? 'Đã lấy mã cài từ Airalo (GET /v2/orders/{code}?include=sims).'
          : `Đã đọc lại Airalo — ${result.fulfillmentStatus}. Không tạo eSIM mới. Chưa có LPA thì xem lỗi bên dưới.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gọi lại Airalo thất bại');
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
          ? 'Đã đóng QUERY claim. CREATE guard và provider reference được giữ. Cron có thể QUERY lại.'
          : 'Không đóng được claim (id/trạng thái không khớp). CREATE guard không đổi.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không đóng được QUERY claim');
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
          `Checkout host không phải Sandbox (${checkoutHost(payment.checkoutUrl || payment.paymentUrl) ?? 'unknown'}). Đã dừng, không mở cổng.`,
        );
        return;
      }
      setCheckout(payment);
      setMessage(`Đã tạo payment ${payment.paymentReference} · ${payment.status}. Mở checkout Sandbox bên dưới.`);
      await load();
    } catch (err) {
      const network = err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));
      setPayError(
        network
          ? 'Không rõ payment đã tạo hay chưa. Làm mới trang và kiểm tra payment hiện có. Không bấm tạo lại ngay.'
          : err instanceof ApiClientError
            ? err.message
            : 'Không tạo được payment',
      );
    } finally {
      creatingPayRef.current = false;
      setCreatingPay(false);
      setConfirmPay(false);
    }
  }

  return (
    <RequirePermission permission="orders.read">
      <div className="space-y-5">
        <PageHeader
          title={detail?.orderCode ?? 'Đơn eSIM'}
          subtitle="Thanh toán SePay rồi giao chuỗi LPA từ Airalo. Không PIN, không MegaPay, không đổi NCC."
          breadcrumbs={[
            { label: 'Đơn hàng eSIM', href: '/esim-ops' },
            { label: detail?.orderCode ?? 'Chi tiết' },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void load({ announce: true })}
                disabled={busy}
              >
                Làm mới
              </Button>
              {canRecover && (
                <Button onClick={() => void recover()} disabled={busy}>
                  {busy
                    ? 'Đang đọc Airalo…'
                    : hasAiralo
                      ? 'Đọc lại đơn Airalo'
                      : 'Chỉ đọc — không tạo eSIM mới'}
                </Button>
              )}
              {canCloseClaim && (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmCloseClaim(true)}
                  disabled={busy || closingClaim}
                >
                  Đóng QUERY claim
                </Button>
              )}
            </div>
          }
        />

        {error && <ErrorMessage message={error} />}
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {payError ? <ErrorMessage message={payError} /> : null}
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          IPN SePay về localhost có thể không tới. SMTP sandbox có thể thất bại — API chi tiết không trả
          queued/sent/failed, và event EMAIL_SENT lúc enqueue không phải bằng chứng đã gửi.
          eSIM Sandbox không dùng để cài trên thiết bị thật. Nguồn xác nhận thanh toán (gateway_query / webhook)
          không có trên API này nên không suy diễn.
        </p>
        {detail?.paidUnfulfilled && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Đã thu tiền nhưng chưa cấp được eSIM. Dùng đọc lại Airalo (QUERY) — không tạo đơn Airalo mới.
          </p>
        )}
        {detail?.lastError && !hasProfile && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Lỗi Airalo gần nhất: {detail.lastError}
          </p>
        )}

        {detail && (
          <>
            <Card className="grid gap-3 p-4 sm:grid-cols-4">
              <Step
                index={1}
                title="Thanh toán"
                state={stepState(paid, !paid)}
                note={paid ? 'SePay đã PAID' : detail.paymentStatus}
              />
              <Step
                index={2}
                title="Đơn Airalo"
                state={stepState(hasAiralo || hasProfile, paid && !hasAiralo && !hasProfile)}
                note={hasAiralo ? detail.airaloOrderId ?? 'Đã có code' : 'Chưa có Airalo code'}
              />
              <Step
                index={3}
                title="Mã cài LPA"
                state={stepState(hasProfile, paid && hasAiralo && !hasProfile)}
                note={hasProfile ? 'Đã lưu LPA' : 'Chưa có sims.qrcode'}
              />
              <Step
                index={4}
                title="Khách nhận"
                state={stepState(hasProfile && detail.fulfillmentStatus === 'COMPLETED', false)}
                note={detail.fulfillmentStatus === 'COMPLETED' ? 'Hoàn tất' : 'Chờ mã cài'}
              />
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Gói eSIM</h2>
                <dl className="space-y-2 text-sm">
                  <Row label="Tên gói" value={detail.packageTitle ?? '—'} />
                  <Row label="package_id" value={detail.providerProductCode ?? '—'} mono />
                  <Row label="Airalo code" value={detail.airaloOrderId ?? '—'} mono />
                  <Row label="Giá khách trả" value={formatVnd(detail.pricing.customerPaid)} />
                </dl>
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Khách hàng</h2>
                <dl className="space-y-2 text-sm">
                  <Row label="Tên" value={detail.customer.name ?? '—'} />
                  <Row label="Email" value={detail.customer.email ?? '—'} />
                  <Row label="Số điện thoại" value={detail.customer.phone ?? '—'} />
                  <Row label="Tạo lúc" value={formatDateTime(detail.createdAt)} />
                </dl>
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Mã cài eSIM</h2>
                {hasProfile ? (
                  <>
                    <CopyValueRow
                      label="qrcode / LPA:1$SM-DP+$matching_id"
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
                      ? `Chưa đọc được sims.qrcode từ GET /v2/orders/${detail.airaloOrderId}?include=sims. Sandbox Airalo vẫn trả mã test (thường LPA:1$lpa.airalo.com$TEST) nhưng không cài được lên máy thật.`
                      : 'Chưa có Airalo code. Nút trên sẽ POST /v2/orders một lần (package_id + quantity + type=sim).'}
                  </p>
                )}
              </Card>

              <Card className="space-y-3 p-4">
                <h2 className="font-semibold">Thanh toán SePay</h2>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(detail.paymentStatus)} status={detail.paymentStatus} />
                  <Badge tone={statusTone(detail.fulfillmentStatus)} status={detail.fulfillmentStatus} />
                  {detail.lane === 'sandbox' ? <Badge tone="neutral">Sandbox / test</Badge> : null}
                </div>
                <dl className="space-y-2 text-sm">
                  <Row label="Cổng" value={detail.pricing.paymentGateway ?? '—'} />
                  <Row label="Phương thức" value={detail.pricing.paymentMethod ?? '—'} />
                  <Row label="Phí cổng" value={formatVnd(detail.pricing.paymentFeeAmount)} />
                </dl>
                {detail.payments.map((payment) => (
                  <div key={payment.paymentReference} className="rounded border p-3 text-xs">
                    <p className="font-mono">{payment.paymentReference}</p>
                    <p>
                      {payment.gateway} · {formatVnd(payment.amount)} · {payment.status}
                    </p>
                    {payment.paidAt ? <p>Paid lúc {formatDateTime(payment.paidAt)}</p> : null}
                  </div>
                ))}
                {allowTestPayment ? (
                  <Button
                    size="sm"
                    disabled={creatingPay}
                    onClick={() => setConfirmPay(true)}
                  >
                    {creatingPay ? 'Đang tạo payment…' : 'Tạo payment SePay Sandbox'}
                  </Button>
                ) : null}
                {pendingPayment && !checkout ? (
                  <p className="text-xs text-slate-500">
                    Đã có payment PENDING. Checkout chỉ hiện trong phiên vừa tạo. Không tạo payment mới.
                  </p>
                ) : null}
                {checkout && sandboxForm ? (
                  <form action={sandboxForm.action} method="POST" className="space-y-2">
                    {Object.entries(sandboxForm.fields).map(([field, value]) => (
                      <input key={field} type="hidden" name={field} value={value} />
                    ))}
                    <p className="text-xs text-slate-500">
                      Cổng {checkoutHost(sandboxForm.action)} · {checkout.paymentReference} · {checkout.status}
                      {checkout.expiresAt ? ` · hết hạn ${formatDateTime(checkout.expiresAt)}` : ''}
                    </p>
                    <Button type="submit" size="sm">
                      Mở checkout SePay Sandbox
                    </Button>
                  </form>
                ) : null}
                {checkout && !sandboxForm ? (
                  <p className="text-xs text-amber-800">
                    Payment đã tạo nhưng thiếu signed form fields hoặc host không phải Sandbox. Không mở cổng.
                  </p>
                ) : null}
              </Card>
            </div>

            <Card className="space-y-3 p-4">
              <h2 className="font-semibold">Lịch sử thao tác quản trị</h2>
              {(detail.adminActions ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có audit gắn đơn này. Không gồm secret LPA.</p>
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

            <Card className="space-y-3 p-4">
              <h2 className="font-semibold">Nhật ký Airalo</h2>
              <p className="text-sm text-slate-500">
                CREATE = POST /v2/orders. QUERY = GET /v2/orders/&#123;code&#125;?include=sims. Một đơn CardOn chỉ
                tạo một đơn Airalo.
              </p>
              {detail.attempts.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có lần gọi Airalo.</p>
              ) : (
                <div className="space-y-2">
                  {detail.attempts.map((attempt) => (
                    <div key={attempt.id} className="rounded border p-3 text-sm">
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
          </>
        )}

        <Dialog
          open={confirmCloseClaim}
          onClose={() => {
            if (!closingClaim) {
              setConfirmCloseClaim(false);
              setCloseReason('');
            }
          }}
          title="Đóng QUERY claim"
          description="Chỉ đóng khóa QUERY SENT. Không gọi Airalo, không CREATE, không fulfill. Server từ chối nếu job GET vẫn chạy."
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
                placeholder="Ví dụ: job QUERY_OPEN đã rời active, worker không còn GET."
              />
            </label>
          </div>
        </Dialog>
        <Dialog
          open={confirmPay}
          onClose={() => { if (!creatingPay) setConfirmPay(false); }}
          title="Tạo payment SePay Sandbox"
          description="Chỉ tạo payment cho đơn kiểm thử của chính SUPER_ADMIN, đang chờ thanh toán. Không đánh dấu PAID thủ công."
          footer={(
            <>
              <Button size="sm" variant="ghost" disabled={creatingPay} onClick={() => setConfirmPay(false)}>Hủy</Button>
              <Button size="sm" disabled={creatingPay} onClick={() => void createSandboxPayment()}>
                {creatingPay ? 'Đang tạo…' : 'Xác nhận tạo một payment'}
              </Button>
            </>
          )}
        >
          <p className="text-sm text-slate-700">
            POST /payments · gateway SEPAY. Nếu timeout, làm mới trang và kiểm tra payment hiện có. Không bấm lại ngay.
          </p>
        </Dialog>
      </div>
    </RequirePermission>
  );
}

function Step({
  index,
  title,
  state,
  note,
}: {
  index: number;
  title: string;
  state: 'done' | 'current' | 'todo';
  note: string;
}) {
  const tone =
    state === 'done'
      ? 'border-emerald-200 bg-emerald-50'
      : state === 'current'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-slate-50';
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="text-xs text-slate-500">Bước {index}</p>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 break-all text-xs text-slate-600">{note}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={mono ? 'break-all text-right font-mono text-xs' : 'text-right'}>{value}</dd>
    </div>
  );
}
