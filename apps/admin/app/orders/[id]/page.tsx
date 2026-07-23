'use client';



import Link from 'next/link';

import { useParams } from 'next/navigation';

import { useEffect, useState } from 'react';

import { RequirePermission } from '@/components/layout/AdminShell';

import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';

import { Button, Input } from '@/components/ui/Form';

import { useAuth } from '@/hooks/useAuth';

import { translateStatus } from '@/lib/i18n';
import { vi } from '@/lib/i18n/vi';

import { formatDateTime, formatVnd } from '@/lib/utils';

import { adminApi, ApiClientError } from '@/services/api-client';
import { CopyValueRow, formatExpire } from '@/components/orders/DeliveryField';
import { CardPinField } from '@/components/orders/CardPinField';
import { CardDeliveryTools } from '@/components/orders/CardDeliveryTools';

import type { AdminOrderDetail } from '@/types/api';



const TABS = [
  { id: 'overview' as const, label: vi.orders.tabOverview },
  { id: 'payment' as const, label: vi.orders.tabPayment },
  { id: 'delivery' as const, label: 'Giao hàng' },
  { id: 'provider' as const, label: vi.orders.tabProvider },
  { id: 'journal' as const, label: 'Nhật ký xử lý' },
];



export default function OrderDetailPage() {

  const params = useParams<{ id: string }>();

  const { can } = useAuth();

  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);

  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');

  const [gatewayFilter, setGatewayFilter] = useState('');

  const [error, setError] = useState<string | null>(null);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function load(filter?: string) {
    setError(null);
    try {
      const data = await adminApi.getOrderDetail(params.id, filter || undefined);
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.orders.loadError);
    }
  }

  async function runAction(label: string, action: () => Promise<{ fulfillmentStatus?: string } | unknown>) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await action();
      const status =
        result && typeof result === 'object' && 'fulfillmentStatus' in result
          ? String((result as { fulfillmentStatus?: string }).fulfillmentStatus ?? '')
          : '';
      setActionMessage(
        status && status !== 'COMPLETED'
          ? `${label} — xong (${status}). Đơn chưa hoàn tất — NCC có thể vẫn đang xử lý.`
          : `${label} — thành công`,
      );
      await load(gatewayFilter || undefined);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `${label} — thất bại`);
    } finally {
      setActionBusy(false);
    }
  }



  useEffect(() => {

    void load();

  }, [params.id]);



  return (

    <RequirePermission permission="orders.read">

      <div className="space-y-6">

        <div className="flex items-center justify-between">

          <div>

            <Link href="/orders" className="text-sm text-admin-600 hover:underline">

              ← {vi.orders.title}

            </Link>

            <h1 className="text-2xl font-bold">{detail?.overview.orderCode ?? vi.orders.detail}</h1>

          </div>

          {can('orders.retry') && detail && (
            <div className="flex flex-wrap items-center gap-2">
              {(detail.order.fulfillmentStatus === 'COMPLETED' ||
                (detail.cardDelivery?.cardCount ?? 0) > 0) && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionBusy}
                  onClick={() => void runAction('Gửi lại email', () => adminApi.resendOrderEmail(params.id))}
                >
                  Gửi lại email
                </Button>
              )}
              {detail.order.paymentStatus === 'PAID' &&
                (detail.order.fulfillmentStatus === 'WAITING_ADMIN_RETRY' ||
                  detail.order.fulfillmentStatus === 'NEED_MANUAL_REVIEW' ||
                  (detail.order.fulfillmentStatus === 'PENDING' &&
                    (detail.cardDelivery?.cardCount ?? 0) === 0)) && (
                <>
                  <Button
                    disabled={actionBusy}
                    title="Đối chiếu MMS MegaPay (Merchant trx Id ≈ PAY-…) nếu nghi tiền chưa về cổng, rồi mới bấm Giao lại"
                    onClick={() => void runAction(vi.orders.retryFulfillment, () => adminApi.retryOrder(params.id))}
                  >
                    {actionBusy ? 'Đang giao…' : vi.orders.retryFulfillment}
                  </Button>
                  {detail.order.fulfillmentStatus === 'NEED_MANUAL_REVIEW' && (
                    <>
                      <Button
                        variant="secondary"
                        disabled={actionBusy}
                        onClick={() =>
                          void adminApi.orderManualRecovery(params.id, 'switch_provider').then(() => load())
                        }
                      >
                        Đổi NCC
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={actionBusy}
                        onClick={() =>
                          void adminApi.orderManualRecovery(params.id, 'mark_fulfilled').then(() => load())
                        }
                      >
                        Đánh dấu hoàn tất
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={actionBusy}
                        onClick={() =>
                          void adminApi.orderManualRecovery(params.id, 'refund').then(() => load())
                        }
                      >
                        Hoàn tiền
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

        </div>

        {error && <ErrorMessage message={error} />}
        {actionMessage && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{actionMessage}</p>
        )}

        <div className="flex flex-wrap gap-2">

          {TABS.map((t) => (

            <button

              key={t.id}

              type="button"

              onClick={() => setTab(t.id)}

              className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? 'bg-admin-100 text-admin-800' : 'bg-zinc-100'}`}

            >

              {t.label}

            </button>

          ))}

        </div>



        {detail && tab === 'overview' && (

          <Card className="space-y-4 p-4">

            <div className="grid gap-3 md:grid-cols-2">

              <p>

                <strong>{vi.orders.customer}:</strong>{' '}

                {detail.overview.customer.fullName ?? detail.overview.customer.email ?? detail.overview.customer.guestEmail}

              </p>

              <p>

                <strong>{vi.orders.email}:</strong>{' '}

                {detail.overview.customer.email ?? detail.overview.customer.guestEmail ?? '—'}

              </p>

              <p>

                <strong>{vi.orders.phone}:</strong>{' '}

                {detail.overview.customer.phone ?? detail.overview.customer.guestPhone ?? '—'}

              </p>

              <p>

                <strong>{vi.orders.createdAt}:</strong> {formatDateTime(detail.overview.createdAt)}

              </p>

              <p>

                <strong>{vi.orders.total}:</strong> {formatVnd(detail.overview.totalAmount)}

              </p>

              <p>

                <strong>{vi.orders.status}:</strong>{' '}

                <Badge tone={statusTone(detail.overview.paymentStatus)} status={detail.overview.paymentStatus} /> /{' '}

                <Badge tone={statusTone(detail.overview.fulfillmentStatus)} status={detail.overview.fulfillmentStatus} />

              </p>

            </div>

            {detail.paymentTrace?.length > 0 && (
              <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-4 text-sm">
                <h3 className="font-semibold text-sky-950">Đối soát thanh toán (MMS)</h3>
                <p className="mt-1 text-xs text-sky-800">
                  Tra MegaPay MMS → Transaction history: khớp <strong>Merchant trx Id</strong> với mã PAY bên
                  dưới + số tiền + trạng thái Approval trước khi thử lại NCC (nếu nghi tiền chưa về).
                </p>
                <dl className="mt-3 grid gap-2 md:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Order ID (CardOn)</dt>
                    <dd className="font-mono text-xs">{detail.overview.orderCode}</dd>
                  </div>
                  {detail.paymentTrace.slice(0, 2).map((p) => (
                    <div key={String(p.id)} className="contents">
                      <div>
                        <dt className="text-zinc-500">Merchant trx Id ≈ paymentReference</dt>
                        <dd className="font-mono text-xs break-all">{String(p.paymentReference ?? '—')}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Transaction ID ≈ gateway</dt>
                        <dd className="font-mono text-xs break-all">
                          {String(p.gatewayTransactionId ?? '—')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Số tiền / TT payment</dt>
                        <dd>
                          {formatVnd(String(p.amount))} · {String(p.status)}
                          {p.paidAt ? ` · ${formatDateTime(String(p.paidAt))}` : ''}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {detail.overview.pricing && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg bg-zinc-50 p-4 text-sm">
                  <h3 className="font-semibold">Khách hàng</h3>
                  <dl className="mt-3 space-y-2">
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Mệnh giá</dt>
                      <dd>{formatVnd(detail.overview.pricing.faceValue)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Giảm</dt>
                      <dd>{formatVnd(detail.overview.pricing.discountAmount)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Phương thức</dt>
                      <dd>{detail.overview.pricing.methodDisplayName ?? detail.overview.pricing.methodCode ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Phí thanh toán</dt>
                      <dd>{formatVnd(detail.overview.pricing.paymentFeeAmount)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2 font-semibold">
                      <dt>Đã trả</dt>
                      <dd>{formatVnd(detail.overview.pricing.customerPaid)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-lg bg-zinc-50 p-4 text-sm">
                  <h3 className="font-semibold">Nội bộ</h3>
                  <dl className="mt-3 space-y-2">
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Sell amount</dt>
                      <dd>{formatVnd(detail.overview.pricing.sellAmount)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Cổng thanh toán</dt>
                      <dd>{detail.overview.pricing.gatewayCode ?? detail.overview.pricing.paymentGateway ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Method code</dt>
                      <dd className="font-mono text-xs">
                        {detail.overview.pricing.methodCode ?? detail.overview.pricing.paymentMethodCode ?? '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Đối soát nhận tiền</dt>
                      <dd className="font-mono text-xs">
                        {detail.overview.pricing.settlementType ?? '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Gateway fee</dt>
                      <dd>{formatVnd(detail.overview.pricing.paymentFeeAmount)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Provider cost</dt>
                      <dd>{formatVnd(detail.overview.pricing.providerCost)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2 font-semibold text-emerald-700">
                      <dt>Profit</dt>
                      <dd>{formatVnd(detail.overview.pricing.profit)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            <table className="w-full text-sm">

              <thead>

                <tr className="border-b">

                  <th className="py-2 text-left">{vi.orders.product}</th>

                  <th className="py-2 text-left">Loại</th>

                  <th>{vi.orders.quantity}</th>

                  <th className="py-2 text-right">Mệnh giá</th>

                  <th className="py-2 text-right">Giá bán</th>

                  <th className="py-2 text-left">Trạng thái giao</th>

                </tr>

              </thead>

              <tbody>

                {detail.overview.products.map((p, i) => (

                  <tr key={i} className="border-b">

                    <td className="py-2">{p.name}</td>

                    <td className="py-2">{p.type}</td>

                    <td className="py-2 text-center">{p.quantity}</td>

                    <td className="py-2 text-right">{formatVnd(p.faceValue)}</td>

                    <td className="py-2 text-right">{formatVnd(p.sellPrice)}</td>

                    <td className="py-2">{translateStatus(p.deliveryStatus)}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </Card>

        )}



        {detail && tab === 'payment' && (

          <Card className="space-y-4 p-4">

            <div className="flex gap-2">

              <Input

                placeholder={vi.orders.filterGateway}

                value={gatewayFilter}

                onChange={(e) => setGatewayFilter(e.target.value)}

              />

              <Button type="button" onClick={() => void load(gatewayFilter)}>

                {vi.orders.filter}

              </Button>

            </div>

            {detail.paymentTrace.map((p) => (

              <div key={String(p.id)} className="rounded border p-3 text-sm">

                <p>

                  <strong>{vi.orders.ref}:</strong> {String(p.paymentReference)} | <strong>{vi.orders.gateway}:</strong>{' '}

                  {String(p.gateway)}

                </p>

                <p>

                  <strong>{vi.orders.gatewayTx}:</strong> {String(p.gatewayTransactionId ?? '—')} |{' '}

                  <strong>{vi.orders.bankTx}:</strong> {String(p.bankTransactionId ?? '—')}

                </p>

                <p>

                  <strong>{vi.orders.amount}:</strong> {formatVnd(String(p.amount))} | <strong>{vi.orders.paidAt}:</strong>{' '}

                  {p.paidAt ? formatDateTime(String(p.paidAt)) : '—'}

                </p>

                <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-50 p-2 text-xs">

                  {JSON.stringify(p.gatewayRawResponse, null, 2)}

                </pre>

              </div>

            ))}

          </Card>

        )}



        {detail && tab === 'provider' && (

          <Card className="space-y-4 p-4">

            {detail.providerTrace.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Chưa có giao dịch nhà cung cấp. Thường do đơn chưa thanh toán thành công hoặc chưa bắt đầu giao hàng.
              </p>
            ) : (
            detail.providerTrace.map((tx) => (

              <div key={String(tx.id)} className="rounded border p-3 text-sm">

                <p>

                  <strong>{vi.orders.provider}:</strong> {String(tx.providerCode)} | <strong>{vi.orders.requestId}:</strong>{' '}

                  {String(tx.requestId)}

                </p>

                <p>

                  <strong>{vi.orders.attempt}:</strong> {String(tx.attempt)} | <strong>{vi.orders.status}:</strong>{' '}

                  {String(tx.status)} | <strong>{vi.orders.cost}:</strong> {String(tx.cost ?? '—')}

                </p>

                <pre className="mt-2 max-h-32 overflow-auto rounded bg-zinc-50 p-2 text-xs">

                  {JSON.stringify(tx.responsePayload, null, 2)}

                </pre>

              </div>

            ))
            )}

          </Card>

        )}



        {detail && tab === 'delivery' && detail.delivery && (
          <Card className="space-y-6 p-4">
            {detail.delivery.type === 'CARD' ? (
              <>
                <section className="grid gap-3 md:grid-cols-3 text-sm">
                  <div>
                    <p className="text-xs text-zinc-500">Product</p>
                    <p className="font-medium">{detail.delivery.productName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Face value</p>
                    <p className="font-medium">
                      {detail.delivery.faceValue ? formatVnd(detail.delivery.faceValue) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Quantity</p>
                    <p className="font-medium">{detail.delivery.quantity ?? '—'}</p>
                  </div>
                </section>
                <section className="space-y-4 border-t border-zinc-100 pt-6">
                  <h3 className="font-semibold">Cards</h3>
                  <CardDeliveryTools orderId={params.id} items={detail.delivery.items} />
                  {detail.delivery.items.length === 0 ? (
                    <p className="text-sm text-zinc-500">Chưa có thẻ được giao</p>
                  ) : (
                    detail.delivery.items.map((card, index) => (
                      <div key={card.id} className="space-y-3 rounded border p-4 text-sm">
                        <p className="font-semibold">Card #{index + 1}</p>
                        <CopyValueRow label="Serial" value={card.serial ?? '—'} />
                        <CardPinField
                          orderId={params.id}
                          cardId={card.cardId ?? card.id}
                          pin={card.pin}
                          pinMasked={card.pinMasked}
                        />
                        <div>
                          <p className="text-xs text-zinc-500">Expire</p>
                          <p>{formatExpire(card.expiredAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">Provider</p>
                          <p>{card.providerName ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">Delivered at</p>
                          <p>{card.deliveredAt ? formatDateTime(card.deliveredAt) : '—'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </>
            ) : (
              <section className="space-y-4">
                <h3 className="font-semibold">
                  {detail.delivery.type === 'DATA' ? 'Nạp data' : 'Nạp cước'}
                </h3>
                {detail.delivery.items.length === 0 ? (
                  <p className="text-sm text-zinc-500">Chưa có giao dịch nạp</p>
                ) : (
                  detail.delivery.items.map((item) => (
                    <div key={item.id} className="space-y-2 rounded border p-4 text-sm">
                      <div>
                        <p className="text-xs text-zinc-500">Phone number</p>
                        <p className="font-mono">{item.phoneNumber ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Carrier</p>
                        <p>{item.telco ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Package</p>
                        <p>{item.packageName ?? item.productName ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Provider transaction id</p>
                        <p className="font-mono">{item.providerTransactionId ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Completed time</p>
                        <p>{item.deliveredAt ? formatDateTime(item.deliveredAt) : '—'}</p>
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
            <p className="border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              {vi.orders.emailDelivery}: {detail.cardDelivery.emailDeliveryStatus}
            </p>
          </Card>
        )}

        {detail && tab === 'journal' && (
          <Card className="space-y-6 p-4">
            <section>
              <h3 className="font-semibold">Nhật ký xử lý</h3>
              {(detail.fulfillmentTimeline ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Chưa có sự kiện giao hàng</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {detail.fulfillmentTimeline!.map((event) => (
                    <div key={event.id} className="flex gap-3 border-l-2 border-admin-200 pl-4">
                      <div>
                        <p className="text-sm font-semibold">{event.message}</p>
                        <p className="text-xs text-zinc-500">
                          {translateStatus(event.eventType)} · <span className="font-mono">{event.eventType}</span> ·{' '}
                          {formatDateTime(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {detail.auditTimeline.length > 0 && (
              <section className="border-t border-zinc-100 pt-6">
                <h3 className="font-semibold text-zinc-700">Nhật ký quản trị</h3>
                <div className="mt-4 space-y-2">
                  {detail.auditTimeline.map((a) => (
                    <div key={String(a.id)} className="border-b py-2 text-sm">
                      <strong>{String(a.action)}</strong> — {formatDateTime(String(a.createdAt))} —{' '}
                      {String(a.actorEmail ?? 'system')}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </Card>
        )}

      </div>
    </RequirePermission>
  );
}
