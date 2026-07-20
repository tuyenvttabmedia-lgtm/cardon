'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CustomerPriceBreakdown } from '@/components/checkout/CustomerPriceBreakdown';
import { QuantityInput, DEFAULT_MAX_QUANTITY } from '@/components/checkout/QuantityInput';
import { PaymentMethodPicker, PaymentMethodsEmpty, SepayQrDisplay } from '@/components/checkout/PaymentPanel';
import { SepayPgCheckoutRedirect } from '@/components/checkout/SepayPgCheckoutRedirect';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { buildCustomerPriceViewFromVariant } from '@/lib/customer-price';
import { findProductBySlug, getActiveVariants, useProducts } from '@/hooks/useProducts';
import { ApiClientError, orderApi, paymentApi } from '@/services/api-client';
import { parseOrderAmountLimitError } from '@/lib/order-limit';
import { formatVnd, generateIdempotencyKey } from '@/lib/utils';
import { storeOrderGuestEmail } from '@/lib/order-guest-email';

export default function CheckoutPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const { products } = useProducts();
  const {
    methods: paymentMethods,
    paymentMethodCode,
    setPaymentMethodCode,
    selectedMethod,
    gateway,
    hasMethods: hasPaymentMethods,
  } = usePaymentMethods();

  const variantId = searchParams.get('variantId') ?? '';
  const initialQuantity = Math.max(1, Number(searchParams.get('quantity') ?? 1));
  const slug = searchParams.get('slug') ?? '';

  const product = findProductBySlug(products, slug);
  const variant = getActiveVariants(product ?? { variants: [] } as never).find(
    (v) => v.id === variantId,
  );

  const [guestEmail, setGuestEmail] = useState('');
  const [quantity, setQuantity] = useState(initialQuantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Awaited<ReturnType<typeof paymentApi.create>> | null>(null);
  const [orderMeta, setOrderMeta] = useState<{ orderCode: string; email: string } | null>(null);

  useEffect(() => {
    setQuantity(initialQuantity);
  }, [initialQuantity]);

  useEffect(() => {
    if (user?.email) {
      setGuestEmail(user.email);
    }
  }, [user?.email]);

  const pricing = useMemo(
    () =>
      variant ? buildCustomerPriceViewFromVariant(variant, quantity, selectedMethod) : null,
    [variant, quantity, selectedMethod],
  );

  async function handleCheckout() {
    if (!variant || !gateway || !paymentMethodCode || !hasPaymentMethods) {
      if (!hasPaymentMethods) {
        setError('Hiện chưa có phương thức thanh toán khả dụng');
      }
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const email = isAuthenticated ? user?.email : guestEmail.trim();
      if (!email) {
        throw new Error('Vui lòng nhập email để nhận đơn hàng');
      }

      const order = await orderApi.create({
        items: [{ variantId: variant.id, quantity }],
        guestEmail: isAuthenticated ? undefined : email,
        paymentMethodCode,
      });

      const pay = await paymentApi.create(
        { orderId: order.id, gateway },
        generateIdempotencyKey(),
      );

      setPayment(pay);
      setOrderMeta({ orderCode: order.orderCode, email: email ?? order.guestEmail ?? '' });
      storeOrderGuestEmail(order.id, email ?? order.guestEmail ?? '');

      if (gateway === 'MEGAPAY' && pay.paymentUrl && pay.displayMode !== 'qr_inline') {
        window.location.href = pay.paymentUrl;
        return;
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        const limitDetails = parseOrderAmountLimitError({
          code: err.code,
          message: err.message,
          limit: err.details?.limit,
          current: err.details?.current,
        });
        if (limitDetails) {
          setError(null);
          // CheckoutPageClient uses plain error string — format inline for legacy page
          setError(
            `Đơn hàng vượt quá giới hạn cho phép. Giới hạn: ${limitDetails.limit.toLocaleString('vi-VN')} đ · Hiện tại: ${limitDetails.current.toLocaleString('vi-VN')} đ`,
          );
        } else {
          setError(err.message);
        }
      } else {
        setError('Thanh toán thất bại');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!variant) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">Thiếu thông tin sản phẩm. Quay lại danh mục.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-cardon-navy">Thanh toán</h1>

        <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-6 shadow-card">
          <p className="font-semibold text-cardon-navy">{product?.name ?? variant.name}</p>
          <p className="text-sm text-cardon-gray">{variant.name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-cardon-gray">Số lượng:</span>
            <QuantityInput
              value={quantity}
              min={1}
              max={DEFAULT_MAX_QUANTITY}
              onChange={setQuantity}
            />
          </div>
          <div className="mt-4">
            <CustomerPriceBreakdown pricing={pricing} />
          </div>
        </div>

        {!isAuthenticated && (
          <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-6 shadow-card">
            <h2 className="font-semibold text-cardon-navy">Thông tin khách</h2>
            <p className="mt-1 text-sm text-cardon-gray">Nhập email để tra cứu đơn hàng</p>
            <Input
              className="mt-3"
              type="email"
              placeholder="email@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
            <p className="mt-3 text-sm text-cardon-gray">
              Đã có tài khoản?{' '}
              <a href="/login" className="font-semibold text-cardon-blue hover:underline">
                Đăng nhập
              </a>
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-6 shadow-card">
          <h2 className="font-semibold text-cardon-navy">Phương thức thanh toán</h2>
          <div className="mt-4">
            {hasPaymentMethods && paymentMethodCode ? (
              <PaymentMethodPicker
                methods={paymentMethods}
                value={paymentMethodCode}
                onChange={setPaymentMethodCode}
              />
            ) : (
              <PaymentMethodsEmpty />
            )}
          </div>
          <Button
            className="mt-6 w-full"
            size="lg"
            disabled={loading || !hasPaymentMethods || !paymentMethodCode}
            onClick={handleCheckout}
          >
            {loading ? 'Đang xử lý...' : `Tạo đơn & thanh toán${pricing ? ` ${formatVnd(pricing.totalPayment)}` : ''}`}
          </Button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {payment?.checkoutUrl && payment.checkoutFormFields && gateway === 'SEPAY' && (
          <SepayPgCheckoutRedirect
            checkoutUrl={payment.checkoutUrl}
            checkoutFormFields={payment.checkoutFormFields}
          />
        )}
        {payment?.paymentUrl &&
          (gateway === 'SEPAY' || payment.displayMode === 'qr_inline') &&
          !payment.checkoutFormFields && (
          <div className="mt-6">
            <SepayQrDisplay paymentUrl={payment.paymentUrl} bankInfo={payment.bankInfo} />
            {orderMeta && (
              <Button
                className="mt-4 w-full"
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/checkout/success?orderCode=${orderMeta.orderCode}&email=${encodeURIComponent(orderMeta.email)}`,
                  )
                }
              >
                Tôi đã chuyển khoản — xem trạng thái
              </Button>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
