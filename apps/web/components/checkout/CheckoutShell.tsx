'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  SepayQrDisplay,
  PaymentMethodsEmpty,
  MobilePaymentMethodButton,
} from '@/components/checkout/PaymentPanel';
import { SepayPgCheckoutRedirect } from '@/components/checkout/SepayPgCheckoutRedirect';
import {
  CardOrderSummaryPanel,
  TelcoOrderSummaryPanel,
} from '@/components/checkout/CheckoutSummaryPanels';
import { QuantityInput, DEFAULT_MAX_QUANTITY } from '@/components/checkout/QuantityInput';
import { LoginRequiredModal } from '@/components/checkout/LoginRequiredModal';
import {
  CatalogDataPackageCard,
  CatalogDenomCard,
  CatalogLogoCard,
} from '@/components/catalog/CatalogSelectCard';
import { CatalogSelectorGrid } from '@/components/catalog/CatalogSelectorGrid';
import { CatalogDataPackageGrid } from '@/components/catalog/CatalogDataPackageGrid';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { getActiveVariants, useProducts } from '@/hooks/useProducts';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { buildCustomerPriceViewFromVariant } from '@/lib/customer-price';
import {
  clearPendingCheckout,
  loadPendingCheckout,
  savePendingCheckout,
} from '@/lib/checkout-persistence';
import {
  collectClientDeviceInfo,
  normalizeVnPhone,
  validateCheckout,
} from '@/lib/checkout-validation';
import { getAccessToken, hasAuthSession } from '@/lib/auth-storage';
import {
  collectCatalogVariants,
  findProductForVariant,
  variantStillInCatalog,
} from '@/lib/catalog-variants';
import type { CheckoutShellMode } from '@/lib/checkout-services';
import { formatDataPackageCard } from '@/lib/data-variant-display';
import { getSiteConfig, type PublicSiteConfig } from '@/lib/cms-api';
import { storeOrderGuestEmail } from '@/lib/order-guest-email';
import {
  filterProductsByHomeCategory,
  pickFirstCardHomeCategoryWithProducts,
  type HomeCardCategory,
} from '@/lib/home-catalog';
import {
  carrierLabel,
  DATA_CARRIERS,
  detectTelcoFromPhone,
  matchCarrier,
  TOPUP_CARRIERS,
} from '@/lib/topup-flow';
import { ApiClientError, orderApi, paymentApi } from '@/services/api-client';
import { cn, formatVnd, generateIdempotencyKey } from '@/lib/utils';
import type { OrderAmountLimitDetails } from '@/lib/order-limit';
import { parseOrderAmountLimitError } from '@/lib/order-limit';
import {
  buildOrderLimitPreview,
  OrderAmountLimitAlert,
} from '@/components/checkout/OrderAmountLimitAlert';
import type { Payment, Product, ProductVariant } from '@/types/api';

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="step-badge">{n}</span>
      <h3 className="font-bold text-cardon-navy">{title}</h3>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="animate-pulse space-y-6 rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="h-4 w-32 rounded bg-gray-100" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="h-4 w-28 rounded bg-gray-100" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] rounded-xl bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

function parseHomeCategory(value: string | null): HomeCardCategory | null {
  if (value === 'game' || value === 'phone') return value;
  return null;
}

function carrierLogo(products: Product[], mode: CheckoutShellMode, carrierId: string): string | null {
  const cat = mode === 'DATA' ? 'data' : 'topup';
  const match = filterProductsByHomeCategory(products, cat).find((p) => matchCarrier(p, carrierId));
  return match?.logoUrl ?? null;
}

export type CheckoutShellProps = {
  mode: CheckoutShellMode;
  initialCategory?: HomeCardCategory;
  title?: string;
  description?: string;
  anchorId?: string;
  serviceUnavailable?: React.ReactNode;
};

export function CheckoutShell(props: CheckoutShellProps) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutShellInner {...props} />
    </Suspense>
  );
}

function CheckoutShellInner({
  mode,
  initialCategory = 'game',
  title,
  description,
  anchorId = 'buy-card',
  serviceUnavailable,
}: CheckoutShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { products, loading, error } = useProducts();
  const payInFlightRef = useRef(false);
  const autoCatalogInitialized = useRef(false);

  const [category, setCategory] = useState<HomeCardCategory>(initialCategory);
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState('');
  const [carrierId, setCarrierId] = useState<string | null>(null);
  const [carrierManual, setCarrierManual] = useState(false);
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [restoredOnce, setRestoredOnce] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderLimitError, setOrderLimitError] = useState<OrderAmountLimitDetails | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [orderMeta, setOrderMeta] = useState<{ orderCode: string; email: string } | null>(null);

  const {
    methods: paymentMethods,
    paymentMethodCode,
    setPaymentMethodCode,
    selectedMethod,
    gateway,
    setGateway,
    hasMethods: hasPaymentMethods,
  } = usePaymentMethods();

  const dataReady = siteConfig?.data?.ready ?? false;
  const topupReady = siteConfig?.topup?.ready ?? false;
  const telcoReady = mode === 'DATA' ? dataReady : mode === 'TOPUP' ? topupReady : true;
  const pendingCategory = mode === 'CARD' ? category : mode === 'TOPUP' ? 'topup' : 'data';
  const variantType = mode === 'CARD' ? 'CARD' : mode === 'TOPUP' ? 'TOPUP' : 'DATA';

  useEffect(() => {
    void getSiteConfig().then(setSiteConfig);
  }, []);

  const cardProducts = useMemo(
    () => filterProductsByHomeCategory(products, category),
    [products, category],
  );

  const telcoProducts = useMemo(
    () => filterProductsByHomeCategory(products, mode === 'DATA' ? 'data' : 'topup'),
    [products, mode],
  );

  const filteredProducts = useMemo(() => {
    if (mode === 'CARD') return cardProducts;
    if (!carrierId) return telcoProducts;
    return telcoProducts.filter((p) => matchCarrier(p, carrierId));
  }, [mode, cardProducts, telcoProducts, carrierId]);

  const variantOptions = useMemo(
    () => collectCatalogVariants(filteredProducts, variantType, product),
    [filteredProducts, variantType, product],
  );

  const carriers = mode === 'DATA' ? DATA_CARRIERS : TOPUP_CARRIERS;

  const resolvedCarrierId = useMemo(() => {
    if (carrierId) return carrierId;
    const owner = product ?? findProductForVariant(filteredProducts, variant?.id);
    if (!owner) return null;
    return carriers.find((c) => matchCarrier(owner, c.id))?.id ?? null;
  }, [carrierId, product, filteredProducts, variant?.id, carriers]);

  const checkoutProduct = useMemo(
    () => product ?? findProductForVariant(filteredProducts, variant?.id),
    [product, filteredProducts, variant?.id],
  );

  const orderQuantity = mode === 'CARD' ? quantity : 1;

  const pricing = useMemo(
    () =>
      variant
        ? buildCustomerPriceViewFromVariant(variant, orderQuantity, selectedMethod)
        : null,
    [variant, orderQuantity, selectedMethod],
  );

  const orderLimitPreview = useMemo(() => {
    const limits = siteConfig?.orderLimits;
    if (!limits || !pricing) return null;
    const max = isAuthenticated
      ? limits.customerMaxOrderAmount
      : limits.guestMaxOrderAmount;
    if (!max || max <= 0) return null;
    if (pricing.totalPayment > max) {
      return buildOrderLimitPreview(max, pricing.totalPayment);
    }
    return null;
  }, [siteConfig, pricing, isAuthenticated]);

  const activeOrderLimit = orderLimitPreview ?? orderLimitError;
  const isOverOrderLimit = Boolean(orderLimitPreview);

  useEffect(() => {
    if (!orderLimitPreview) {
      setOrderLimitError(null);
    }
  }, [orderLimitPreview]);

  const packageLabel = variant && mode === 'DATA' ? formatDataPackageCard(variant).packageName : undefined;

  const handleCategoryChange = useCallback((next: HomeCardCategory) => {
    setCategory(next);
    setProduct(null);
    setVariant(null);
    setQuantity(1);
    setCheckoutError(null);
    setOrderLimitError(null);
    setPayment(null);
  }, []);

  const handleProductChange = useCallback((p: Product) => {
    setProduct(p);
    setVariant(null);
    setCheckoutError(null);
    setOrderLimitError(null);
  }, []);

  const handleVariantChange = useCallback(
    (v: ProductVariant) => {
      setVariant(v);
      setOrderLimitError(null);
      const owner = findProductForVariant(filteredProducts, v.id);
      if (owner) {
        setProduct(owner);
        if (mode !== 'CARD') {
          const hint = carriers.find((c) => matchCarrier(owner, c.id));
          if (hint) setCarrierId(hint.id);
        }
      }
    },
    [filteredProducts, mode, carriers],
  );

  const handleCarrierChange = useCallback(
    (id: string) => {
      if (mode === 'TOPUP') setCarrierManual(true);
      setCarrierId(id);
      const match = telcoProducts.find((p) => matchCarrier(p, id)) ?? null;
      setProduct(match);
      setVariant(null);
      setCheckoutError(null);
      setOrderLimitError(null);
    },
    [mode, telcoProducts],
  );

  const handleQuantityChange = useCallback((next: number) => {
    setQuantity(next);
    setOrderLimitError(null);
  }, []);

  const handlePaymentMethodChange = useCallback(
    (code: string) => {
      setPaymentMethodCode(code);
      setOrderLimitError(null);
    },
    [setPaymentMethodCode],
  );

  useEffect(() => {
    if (!variant) return;
    if (!variantStillInCatalog(variantOptions, variant.id)) setVariant(null);
  }, [variant, variantOptions]);

  useEffect(() => {
    if (mode !== 'CARD') return;
    const urlCategory = parseHomeCategory(searchParams.get('category'));
    if (urlCategory) handleCategoryChange(urlCategory);
    if (searchParams.get('section') === 'buy-card') {
      requestAnimationFrame(() => {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [mode, searchParams, handleCategoryChange, anchorId]);

  useEffect(() => {
    if (mode !== 'CARD' || loading || products.length === 0 || autoCatalogInitialized.current) return;
    const shouldRestore =
      searchParams.get('checkout') === 'resume' || loadPendingCheckout() !== null;
    if (shouldRestore) return;

    let cat = pickFirstCardHomeCategoryWithProducts(products);
    const urlCategory = parseHomeCategory(searchParams.get('category'));
    if (urlCategory) cat = urlCategory;
    if (typeof window !== 'undefined' && window.location.hash === '#mua-the') {
      if (filterProductsByHomeCategory(products, 'game').length > 0) cat = 'game';
    }
    setCategory(cat);
    autoCatalogInitialized.current = true;
  }, [mode, loading, products, searchParams]);

  useEffect(() => {
    if (mode !== 'CARD' || loading || cardProducts.length === 0) return;
    if (product && cardProducts.some((p) => p.id === product.id)) return;
    setProduct(cardProducts[0]);
    setVariant(null);
  }, [mode, loading, cardProducts, product]);

  useEffect(() => {
    if (mode === 'CARD' || loading || telcoProducts.length === 0) return;
    if (product && carrierId && matchCarrier(product, carrierId)) return;

    const list = mode === 'DATA' ? DATA_CARRIERS : TOPUP_CARRIERS;
    const preferred =
      mode === 'TOPUP' && telcoProducts.some((p) => matchCarrier(p, 'viettel'))
        ? 'viettel'
        : list.find((c) => telcoProducts.some((p) => matchCarrier(p, c.id)))?.id;
    if (!preferred) return;

    setCarrierId(preferred);
    setProduct(telcoProducts.find((p) => matchCarrier(p, preferred)) ?? null);
    setVariant(null);
  }, [mode, loading, telcoProducts, product, carrierId]);

  useEffect(() => {
    if (mode !== 'TOPUP' || carrierManual || !phone.trim()) return;
    const detected = detectTelcoFromPhone(phone);
    if (!detected) return;
    const available = telcoProducts.some((p) => matchCarrier(p, detected));
    if (available) {
      setCarrierId(detected);
      setProduct(telcoProducts.find((p) => matchCarrier(p, detected)) ?? null);
      setVariant(null);
    }
  }, [mode, phone, carrierManual, telcoProducts]);

  useEffect(() => {
    if (restoredOnce || loading || products.length === 0) return;
    const pending = loadPendingCheckout();
    if (!pending || !isAuthenticated || pending.category !== pendingCategory) return;

    if (mode === 'CARD') {
      const cat = pending.category as HomeCardCategory;
      setCategory(cat);
      setQuantity(pending.quantity);
    } else {
      setPhone(pending.phone);
    }

    setGateway(pending.gateway);
    if (pending.paymentMethodCode) setPaymentMethodCode(pending.paymentMethodCode);

    const p = products.find((x) => x.id === pending.productId);
    if (p) {
      if (mode === 'CARD' && !filterProductsByHomeCategory([p], category).length) {
        clearPendingCheckout();
        return;
      }
      setProduct(p);
      if (mode !== 'CARD') {
        const hint = carriers.find((c) => matchCarrier(p, c.id));
        if (hint) setCarrierId(hint.id);
      }
      const v = getActiveVariants(p).find((item) => {
        if (item.id !== pending.variantId) return false;
        if (mode === 'CARD') return item.type === 'CARD';
        return true;
      });
      if (v) setVariant(v);
    }

    clearPendingCheckout();
    setRestoredOnce(true);
    autoCatalogInitialized.current = true;
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [
    loading,
    products,
    isAuthenticated,
    restoredOnce,
    pendingCategory,
    mode,
    carriers,
    anchorId,
    setGateway,
    setPaymentMethodCode,
  ]);

  async function handlePay() {
    if (mode !== 'CARD' && !telcoReady) {
      setCheckoutError(
        mode === 'TOPUP'
          ? 'Dịch vụ nạp cước đang tạm ngưng. Vui lòng thử lại sau.'
          : 'Dịch vụ nạp data đang tạm ngưng. Vui lòng thử lại sau.',
      );
      return;
    }
    if (payInFlightRef.current || checkoutLoading) return;

    const validationError = validateCheckout({
      product: checkoutProduct,
      variant,
      quantity: orderQuantity,
      category: pendingCategory,
      phone,
      isAuthenticated,
    });

    if (validationError) {
      if (!isAuthenticated) {
        savePendingCheckout({
          category: pendingCategory,
          productId: checkoutProduct?.id ?? null,
          variantId: variant?.id ?? null,
          quantity: orderQuantity,
          phone,
          gateway: gateway ?? 'SEPAY',
          paymentMethodCode: paymentMethodCode ?? undefined,
        });
        setLoginModalOpen(true);
        return;
      }
      setCheckoutError(validationError);
      return;
    }

    if (!hasAuthSession() || !getAccessToken()) {
      const me = await refreshUser();
      if (!me?.email || !getAccessToken()) {
        savePendingCheckout({
          category: pendingCategory,
          productId: checkoutProduct?.id ?? null,
          variantId: variant?.id ?? null,
          quantity: orderQuantity,
          phone,
          gateway: gateway ?? 'SEPAY',
          paymentMethodCode: paymentMethodCode ?? undefined,
        });
        setLoginModalOpen(true);
        setCheckoutError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại để thanh toán.');
        return;
      }
    }

    if (!variant || !user?.email || !gateway || !paymentMethodCode || !hasPaymentMethods) {
      if (!hasPaymentMethods) setCheckoutError('Hiện chưa có phương thức thanh toán khả dụng');
      return;
    }

    if (orderLimitPreview) {
      setOrderLimitError(orderLimitPreview);
      setCheckoutError(null);
      return;
    }

    if (mode !== 'CARD' && !resolvedCarrierId) return;

    payInFlightRef.current = true;
    setCheckoutLoading(true);
    setCheckoutError(null);
    setOrderLimitError(null);
    setPayment(null);

    try {
      let order;
      if (mode === 'CARD') {
        order = await orderApi.create({
          items: [{ variantId: variant.id, quantity: orderQuantity }],
          paymentMethodCode,
          clientDeviceInfo: collectClientDeviceInfo(),
        });
      } else {
        const normalizedPhone = normalizeVnPhone(phone);
        const note =
          mode === 'TOPUP'
            ? `Nạp số: ${normalizedPhone} | ${carrierLabel(resolvedCarrierId) ?? resolvedCarrierId}`
            : `Nạp data: ${normalizedPhone} | ${variant.sku || variant.name}`;
        order = await orderApi.create({
          items: [{ variantId: variant.id, quantity: 1 }],
          guestPhone: normalizedPhone,
          customerNote: note,
          paymentMethodCode,
          clientDeviceInfo: collectClientDeviceInfo(),
        });
      }

      const pay = await paymentApi.create({ orderId: order.id, gateway }, generateIdempotencyKey());
      setPayment(pay);
      setOrderMeta({ orderCode: order.orderCode, email: user.email });
      storeOrderGuestEmail(order.id, user.email);

      if (gateway === 'MEGAPAY' && pay.paymentUrl && pay.displayMode !== 'qr_inline') {
        window.location.href = pay.paymentUrl;
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
          setOrderLimitError(limitDetails);
          setCheckoutError(null);
        } else if (err.message.includes('guestEmail is required')) {
          savePendingCheckout({
            category: pendingCategory,
            productId: checkoutProduct?.id ?? null,
            variantId: variant?.id ?? null,
            quantity: orderQuantity,
            phone,
            gateway: gateway ?? 'SEPAY',
            paymentMethodCode: paymentMethodCode ?? undefined,
          });
          setLoginModalOpen(true);
          setCheckoutError('Vui lòng đăng nhập để tiếp tục thanh toán.');
          setOrderLimitError(null);
        } else {
          setCheckoutError(err.message);
          setOrderLimitError(null);
        }
      } else {
        setCheckoutError('Thanh toán thất bại');
        setOrderLimitError(null);
      }
    } finally {
      setCheckoutLoading(false);
      payInFlightRef.current = false;
    }
  }

  const payButtonLabel = checkoutLoading
    ? 'Đang tạo giao dịch...'
    : isOverOrderLimit
      ? orderQuantity > 1
        ? 'Giảm số lượng để tiếp tục'
        : 'Đơn hàng vượt quá giới hạn'
      : 'Thanh toán';
  const canPay =
    mode === 'CARD'
      ? Boolean(variant && hasPaymentMethods && paymentMethodCode)
      : Boolean(
          variant &&
            resolvedCarrierId &&
            phone.trim() &&
            telcoReady &&
            hasPaymentMethods &&
            paymentMethodCode,
        );
  const payDisabled = !canPay || isOverOrderLimit || checkoutLoading;

  const showMobileBar = Boolean(variant);
  const gridClass =
    mode === 'CARD'
      ? 'lg:grid-cols-[minmax(0,1fr)_360px]'
      : 'lg:grid-cols-[minmax(0,65%)_minmax(0,35%)]';

  return (
    <div className={cn(showMobileBar ? 'pb-28 md:pb-0' : undefined)}>
      <LoginRequiredModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />

      <div className="space-y-4">
        {(title || description) && (
          <div className="text-center">
            {title && <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">{title}</h2>}
            {description && <p className="mt-1 text-sm text-cardon-gray">{description}</p>}
          </div>
        )}

        {serviceUnavailable}

        {loading && <CheckoutSkeleton />}
        {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}

        {!loading && !error && (
          <div
            id={anchorId}
            className={cn('scroll-mt-24 grid gap-6 lg:items-start', gridClass)}
          >
            <div className="min-h-[420px] space-y-8 rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
              {mode === 'CARD' && (
                <section className="min-h-[140px]">
                  <StepTitle n={1} title="Chọn loại thẻ" />
                  {cardProducts.length === 0 ? (
                    <p className="text-sm text-cardon-gray">Chưa có sản phẩm trong danh mục này.</p>
                  ) : (
                    <CatalogSelectorGrid>
                      {cardProducts.map((p) => (
                        <CatalogLogoCard
                          key={p.id}
                          name={p.name}
                          slug={p.slug}
                          logoUrl={p.logoUrl}
                          kind="card"
                          selected={product?.id === p.id}
                          onClick={() => handleProductChange(p)}
                        />
                      ))}
                    </CatalogSelectorGrid>
                  )}
                </section>
              )}

              {mode !== 'CARD' && (
                <div>
                  <label className="text-sm font-semibold text-cardon-navy">
                    {mode === 'TOPUP' ? 'Số điện thoại cần nạp' : 'Số điện thoại'}
                  </label>
                  <Input
                    className="mt-2"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (mode === 'TOPUP') setCarrierManual(false);
                    }}
                    placeholder="0912345678"
                  />
                </div>
              )}

              {mode !== 'CARD' && (
                <div>
                  <p className="text-sm font-semibold text-cardon-navy">Chọn nhà mạng</p>
                  <CatalogSelectorGrid className="mt-3">
                    {carriers.map((c) => {
                      const selected = carrierId === c.id;
                      const available = telcoProducts.some((p) => matchCarrier(p, c.id));
                      return (
                        <CatalogLogoCard
                          key={c.id}
                          name={c.label}
                          slug={c.id}
                          logoUrl={carrierLogo(products, mode, c.id)}
                          kind={mode === 'DATA' ? 'data' : 'topup'}
                          fallbackLabel={c.label}
                          selected={selected}
                          disabled={!available}
                          onClick={() => handleCarrierChange(c.id)}
                        />
                      );
                    })}
                  </CatalogSelectorGrid>
                </div>
              )}

              <section className={cn(mode === 'CARD' ? 'min-h-[120px]' : 'min-h-[96px]')}>
                {mode === 'CARD' && <StepTitle n={2} title="Chọn mệnh giá" />}
                {mode === 'TOPUP' && (
                  <p className="mb-3 text-sm font-semibold text-cardon-navy">Chọn mệnh giá</p>
                )}
                {mode === 'DATA' && (
                  <p className="mb-3 text-sm font-semibold text-cardon-navy">Chọn gói Data</p>
                )}

                {variantOptions.length === 0 ? (
                  <p className="text-sm text-cardon-gray">
                    {mode === 'DATA' ? 'Không có gói data khả dụng.' : 'Chưa có mệnh giá khả dụng'}
                  </p>
                ) : mode === 'DATA' ? (
                  <CatalogDataPackageGrid>
                    {variantOptions.map(({ variant: v }) => {
                      const card = formatDataPackageCard(v);
                      return (
                        <CatalogDataPackageCard
                          key={v.id}
                          packageName={card.packageName}
                          quotaLabel={card.quotaLabel}
                          faceValueLabel={card.faceValueLabel}
                          sellPriceLabel={card.sellPriceLabel}
                          selected={variant?.id === v.id}
                          onClick={() => handleVariantChange(v)}
                        />
                      );
                    })}
                  </CatalogDataPackageGrid>
                ) : (
                  <CatalogSelectorGrid>
                    {variantOptions.map(({ variant: v }) => (
                      <CatalogDenomCard
                        key={v.id}
                        faceValueLabel={formatVnd(v.faceValue)}
                        sellPriceLabel={formatVnd(v.sellPrice)}
                        selected={variant?.id === v.id}
                        onClick={() => handleVariantChange(v)}
                      />
                    ))}
                  </CatalogSelectorGrid>
                )}
              </section>

              {mode === 'CARD' && (
                <>
                  <StepTitle n={3} title="Chọn số lượng thẻ" />
                  <div className="flex flex-wrap items-center gap-4">
                    <QuantityInput
                      value={quantity}
                      min={1}
                      max={DEFAULT_MAX_QUANTITY}
                      onChange={handleQuantityChange}
                    />
                    <span className="text-sm text-cardon-green">Còn hàng: 999+</span>
                  </div>

                </>
              )}

              <div className="lg:hidden">
                {mode === 'CARD' ? (
                  <StepTitle n={4} title="Thanh toán" />
                ) : (
                  <p className="mb-3 text-sm font-semibold text-cardon-navy">Phương thức thanh toán</p>
                )}
                {hasPaymentMethods && paymentMethodCode ? (
                  <div className="grid gap-2">
                    {paymentMethods
                      .filter((m) => m.enabled)
                      .map((m) => (
                        <MobilePaymentMethodButton
                          key={m.methodCode}
                          method={m}
                          selected={paymentMethodCode === m.methodCode}
                          onSelect={() => handlePaymentMethodChange(m.methodCode)}
                        />
                      ))}
                  </div>
                ) : (
                  <PaymentMethodsEmpty />
                )}
                {activeOrderLimit && !checkoutError && (
                  <div className="mt-2">
                    <OrderAmountLimitAlert details={activeOrderLimit} />
                  </div>
                )}
                {checkoutError && !activeOrderLimit && (
                  <p className="mt-2 text-sm text-red-600">{checkoutError}</p>
                )}
              </div>
            </div>

            <aside className="hidden lg:block">
              {mode === 'CARD' ? (
                <CardOrderSummaryPanel
                  product={checkoutProduct}
                  variant={variant}
                  quantity={quantity}
                  pricing={pricing}
                  paymentMethods={paymentMethods}
                  paymentMethodCode={paymentMethodCode}
                  onPaymentMethodChange={handlePaymentMethodChange}
                  hasPaymentMethods={hasPaymentMethods}
                  loading={checkoutLoading}
                  error={checkoutError}
                  orderLimitError={activeOrderLimit}
                  onPay={handlePay}
                  payButtonLabel={payButtonLabel}
                  disabled={payDisabled}
                  isOverOrderLimit={isOverOrderLimit}
                />
              ) : (
                <TelcoOrderSummaryPanel
                  carrierLabel={carrierLabel(resolvedCarrierId)}
                  phone={phone}
                  variant={variant}
                  pricing={pricing}
                  paymentMethods={paymentMethods}
                  paymentMethodCode={paymentMethodCode}
                  onPaymentMethodChange={handlePaymentMethodChange}
                  hasPaymentMethods={hasPaymentMethods}
                  loading={checkoutLoading}
                  error={checkoutError}
                  orderLimitError={activeOrderLimit}
                  onPay={handlePay}
                  payButtonLabel={payButtonLabel}
                  disabled={payDisabled}
                  isOverOrderLimit={isOverOrderLimit}
                  packageLabel={packageLabel}
                />
              )}
              {payment?.checkoutUrl &&
                payment.checkoutFormFields &&
                gateway === 'SEPAY' && (
                  <SepayPgCheckoutRedirect
                    checkoutUrl={payment.checkoutUrl}
                    checkoutFormFields={payment.checkoutFormFields}
                  />
                )}
              {payment?.paymentUrl &&
                (gateway === 'SEPAY' || payment.displayMode === 'qr_inline') &&
                !payment.checkoutFormFields && (
                <div className="mt-4">
                  <SepayQrDisplay paymentUrl={payment.paymentUrl} bankInfo={payment.bankInfo} />
                  {orderMeta && (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-sm font-medium"
                      onClick={() =>
                        router.push(
                          `/checkout/success?orderCode=${orderMeta.orderCode}&email=${encodeURIComponent(orderMeta.email)}`,
                        )
                      }
                    >
                      Đã chuyển khoản — xem trạng thái
                    </button>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {showMobileBar && (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-40 border-t border-gray-200 bg-white p-3 shadow-lg lg:hidden">
          <div className="site-container flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-cardon-gray">Tổng tiền</p>
              <p className="text-lg font-bold text-cardon-danger">
                {pricing ? formatVnd(pricing.totalPayment) : '—'}
              </p>
            </div>
            <button
              type="button"
              className="btn-checkout !w-auto shrink-0 px-6"
              disabled={payDisabled}
              onClick={() => void handlePay()}
            >
              {payButtonLabel}
              {!checkoutLoading && pricing && !isOverOrderLimit
                ? ` ${formatVnd(pricing.totalPayment)}`
                : ''}
            </button>
          </div>
        </div>
      )}

      {payment?.checkoutUrl && payment.checkoutFormFields && gateway === 'SEPAY' && (
        <SepayPgCheckoutRedirect
          checkoutUrl={payment.checkoutUrl}
          checkoutFormFields={payment.checkoutFormFields}
        />
      )}
      {payment?.paymentUrl &&
        (gateway === 'SEPAY' || payment.displayMode === 'qr_inline') &&
        !payment.checkoutFormFields && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 lg:hidden">
          <div className="mx-auto mt-8 max-w-md rounded-2xl bg-white p-4">
            <SepayQrDisplay paymentUrl={payment.paymentUrl} bankInfo={payment.bankInfo} />
            <button type="button" className="mt-3 w-full text-sm text-cardon-gray" onClick={() => setPayment(null)}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
