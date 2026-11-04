'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CustomerPriceBreakdown } from '@/components/checkout/CustomerPriceBreakdown';
import { QuantityInput, DEFAULT_MAX_QUANTITY } from '@/components/checkout/QuantityInput';
import { PaymentMethodPicker, PaymentMethodsEmpty } from '@/components/checkout/PaymentPanel';
import { SepayPgCheckoutRedirect } from '@/components/checkout/SepayPgCheckoutRedirect';
import { MegapayPgCheckoutOpen } from '@/components/checkout/MegapayPgCheckoutOpen';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { buildCustomerPriceViewFromVariant } from '@/lib/customer-price';
import { findProductBySlug, getActiveVariants, useProducts } from '@/hooks/useProducts';
import { listEsimPreviewOffers, type EsimPreviewOffer } from '@/lib/esim-offers';
import { findPaymentMethod, methodGateway } from '@/lib/payment-methods';
import { ApiClientError, orderApi, paymentApi } from '@/services/api-client';
import { parseOrderAmountLimitError } from '@/lib/order-limit';
import { isInlineQrPayment, persistAndPathForQrPayment } from '@/lib/checkout-qr-flow';
import { formatVnd, generateIdempotencyKey } from '@/lib/utils';
import type { Product } from '@/types/api';
import { storeOrderGuestEmail } from '@/lib/order-guest-email';
import { EsimSalesOffNotice } from '@/components/esim/EsimSalesOffNotice';
import { filterEsimVnPaymentMethods, preferEsimVnMethodCode } from '@/lib/esim-vn-checkout';

export default function CheckoutPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { products } = useProducts();
  const [esimOffers, setEsimOffers] = useState<EsimPreviewOffer[]>([]);
  const [esimOffersReady, setEsimOffersReady] = useState(false);
  const [esimSalesOpen, setEsimSalesOpen] = useState(false);
  const {
    methods: allPaymentMethods,
    paymentMethodCode,
    setPaymentMethodCode,
  } = usePaymentMethods();

  const variantId = searchParams.get('variantId') ?? '';
  const initialQuantity = Math.max(1, Number(searchParams.get('quantity') ?? 1));
  const slug = searchParams.get('slug') ?? '';

  const esimOffer = esimOffers.find((offer) => offer.variantId === variantId);
  const isEsim = Boolean(esimOffer);
  const paymentMethods = isEsim
    ? filterEsimVnPaymentMethods(allPaymentMethods)
    : allPaymentMethods.filter((m) => m.enabled);
  const hasPaymentMethods = paymentMethods.length > 0;
  const selectedMethod = findPaymentMethod(paymentMethods, paymentMethodCode);
  const gateway = selectedMethod ? methodGateway(selectedMethod) : null;
  const esimProduct: Product | undefined = esimOffer
    ? {
        id: esimOffer.productId,
        categoryId: '',
        slug: esimOffer.productSlug,
        name: esimOffer.productName,
        description: esimOffer.summary,
        status: 'ACTIVE',
        variants: [
          {
            id: esimOffer.variantId,
            productId: esimOffer.productId,
            sku: esimOffer.sku,
            name: esimOffer.title,
            type: 'ESIM' as never,
            faceValue: String(esimOffer.sellPriceVnd),
            sellPrice: String(esimOffer.sellPriceVnd),
            status: 'ACTIVE',
          },
        ],
      }
    : undefined;
  const product = findProductBySlug(products, slug) ?? esimProduct;
  const variant = getActiveVariants(product ?? { variants: [] } as never).find(
    (v) => v.id === variantId,
  );

  const [guestEmail, setGuestEmail] = useState('');
  const [quantity, setQuantity] = useState(initialQuantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Awaited<ReturnType<typeof paymentApi.create>> | null>(null);
  const [paidOrderMeta, setPaidOrderMeta] = useState<{
    orderId: string;
    orderCode: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    setQuantity(isEsim ? 1 : initialQuantity);
  }, [initialQuantity, isEsim]);

  useEffect(() => {
    void listEsimPreviewOffers().then((result) => {
      if (result.ok) {
        setEsimOffers(result.offers);
        setEsimSalesOpen(result.salesOpen);
      }
      setEsimOffersReady(true);
    });
  }, []);

  useEffect(() => {
    if (user?.email) {
      setGuestEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!isEsim || authLoading || isAuthenticated) return;
    const next = `/checkout?slug=${encodeURIComponent(slug)}&variantId=${encodeURIComponent(variantId)}&quantity=1`;
    router.replace(`/login?redirect=${encodeURIComponent(next)}`);
  }, [isEsim, authLoading, isAuthenticated, slug, variantId, router]);

  useEffect(() => {
    if (!isEsim || paymentMethods.length === 0) return;
    const preferred = preferEsimVnMethodCode(paymentMethods);
    if (preferred && preferred !== paymentMethodCode) {
      setPaymentMethodCode(preferred);
    }
  }, [isEsim, paymentMethods, paymentMethodCode, setPaymentMethodCode]);

  const pricing = useMemo(
    () =>
      variant ? buildCustomerPriceViewFromVariant(variant, quantity, selectedMethod) : null,
    [variant, quantity, selectedMethod],
  );

  async function handleCheckout() {
    if (!variant || !gateway || !paymentMethodCode || !hasPaymentMethods) {
      if (!hasPaymentMethods) {
        setError(
          isEsim
            ? 'Thanh toán tạm thời chưa khả dụng. Thử lại sau hoặc liên hệ hỗ trợ.'
            : 'Hiện chưa có phương thức thanh toán khả dụng',
        );
      }
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (isEsim && !esimSalesOpen) {
        throw new Error('Chưa mở bán');
      }
      if (isEsim && !isAuthenticated) {
        throw new Error('Đăng nhập trước khi mua eSIM');
      }
      const email = isAuthenticated ? user?.email : guestEmail.trim();
      if (!email) {
        throw new Error('Vui lòng nhập email để nhận đơn hàng');
      }

      const order = await orderApi.create({
        items: [{ variantId: variant.id, quantity: isEsim ? 1 : quantity }],
        guestEmail: isAuthenticated ? undefined : email,
        paymentMethodCode,
        ...(isEsim ? { market: 'VN' as const } : {}),
      });

      const pay = await paymentApi.create(
        { orderId: order.id, gateway: isEsim ? 'SEPAY' : gateway },
        generateIdempotencyKey(),
      );

      const resolvedEmail = email ?? order.guestEmail ?? '';
      setPayment(pay);
      setPaidOrderMeta({
        orderId: order.id,
        orderCode: order.orderCode,
        email: resolvedEmail,
      });
      storeOrderGuestEmail(order.id, resolvedEmail);

      if (isInlineQrPayment(pay)) {
        router.push(
          persistAndPathForQrPayment({
            orderId: order.id,
            orderCode: order.orderCode,
            email: resolvedEmail,
            payment: pay,
          }),
        );
        return;
      }

      // MegaPay PG layer (VNPAYQR / ZaloPay) opens via MegapayPgCheckoutOpen below.
      // SePay / other redirect forms handled by checkout form components.
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

  if (!variant || (isEsim && (authLoading || !isAuthenticated))) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">
          {!esimOffersReady || (isEsim && authLoading)
            ? 'Đang tải gói eSIM...'
            : isEsim
              ? 'Đang chuyển tới đăng nhập...'
              : 'Thiếu thông tin sản phẩm. Quay lại danh mục.'}
        </p>
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
            {isEsim ? (
              <span className="text-sm font-semibold text-cardon-navy">1</span>
            ) : (
              <QuantityInput
                value={quantity}
                min={1}
                max={DEFAULT_MAX_QUANTITY}
                onChange={setQuantity}
              />
            )}
          </div>
          <div className="mt-4">
            <CustomerPriceBreakdown pricing={pricing} />
          </div>
        </div>

        {!isEsim && !isAuthenticated && (
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
          {isEsim && !esimSalesOpen ? (
            <div className="mt-6">
              <EsimSalesOffNotice compact />
            </div>
          ) : (
            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={loading || !hasPaymentMethods || !paymentMethodCode || (isEsim && !isAuthenticated)}
              onClick={handleCheckout}
            >
              {loading ? 'Đang xử lý...' : `Tạo đơn & thanh toán${pricing ? ` ${formatVnd(pricing.totalPayment)}` : ''}`}
            </Button>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {payment?.checkoutUrl && payment.checkoutFormFields && payment.gateway === 'SEPAY' && (
          <SepayPgCheckoutRedirect
            checkoutUrl={payment.checkoutUrl}
            checkoutFormFields={payment.checkoutFormFields}
          />
        )}
        {payment?.checkoutFormFields &&
          payment.checkoutClient &&
          payment.gateway === 'MEGAPAY' &&
          payment.displayMode !== 'qr_inline' && (
            <MegapayPgCheckoutOpen
              checkoutFormFields={payment.checkoutFormFields}
              checkoutClient={payment.checkoutClient}
              orderId={paidOrderMeta?.orderId ?? payment.orderId}
              orderCode={paidOrderMeta?.orderCode}
              email={paidOrderMeta?.email}
              paymentReference={payment.paymentReference}
              resumeHref={`/checkout?${new URLSearchParams({
                slug: slug || product?.slug || '',
                variantId: variant.id,
                quantity: String(quantity),
              }).toString()}`}
              amount={payment.amount}
            />
          )}
      </div>
    </PageContainer>
  );
}
