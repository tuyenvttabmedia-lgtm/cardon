'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CustomerPriceBreakdown } from '@/components/checkout/CustomerPriceBreakdown';
import { QuantityInput, DEFAULT_MAX_QUANTITY } from '@/components/checkout/QuantityInput';
import { PaymentMethodPicker, PaymentMethodsEmpty } from '@/components/checkout/PaymentPanel';
import { SepayPgCheckoutRedirect } from '@/components/checkout/SepayPgCheckoutRedirect';
import { MegapayPgCheckoutOpen } from '@/components/checkout/MegapayPgCheckoutOpen';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  TurnstileField,
  captchaErrorFromApi,
  isTurnstileSiteKeyConfigured,
  type TurnstileFieldHandle,
} from '@/components/security/TurnstileField';
import { useTurnstileSiteKey } from '@/hooks/useTurnstileSiteKey';
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
import { isInlineQrPayment, isSepayPgCheckout, persistAndPathForQrPayment } from '@/lib/checkout-qr-flow';
import { generateIdempotencyKey, getApiBaseUrl } from '@/lib/utils';
import type { Product } from '@/types/api';
import { storeOrderGuestEmail } from '@/lib/order-guest-email';
import { EsimSalesOffNotice } from '@/components/esim/EsimSalesOffNotice';
import { VnOnlyMarketNotice } from '@/components/market/VnOnlyMarketNotice';
import { useRetailMarket } from '@/hooks/useRetailMarket';
import { useLocale, useMoney, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { readBrowserLocale } from '@/lib/i18n/locale';
import {
  esimBuyerMarket,
  esimMarketForGateway,
  esimOptionKey,
  esimOrderCreateBody,
  esimPayLabel,
  esimReferenceNote,
  filterEsimQuotedOptions,
  type EsimQuoteView,
} from '@/lib/esim-checkout-options';
import { isPaypalApprovalUrl, paymentMethodsForCheckout } from '@/lib/esim-paypal';
import { withLocalePrefix } from '@/lib/i18n/locale';

export default function CheckoutPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const t = useT();
  const money = useMoney();
  const { locale } = useLocale();
  const { products } = useProducts();
  const retailMarket = useRetailMarket();
  const [esimOffers, setEsimOffers] = useState<EsimPreviewOffer[]>([]);
  const [esimOffersReady, setEsimOffersReady] = useState(false);
  const [esimSalesOpen, setEsimSalesOpen] = useState(false);
  const {
    methods: allPaymentMethods,
    paymentMethodCode,
    setPaymentMethodCode,
    loading: paymentMethodsLoading,
  } = usePaymentMethods();

  const variantId = searchParams.get('variantId') ?? '';
  const initialQuantity = Math.max(1, Number(searchParams.get('quantity') ?? 1));
  const slug = searchParams.get('slug') ?? '';

  const esimOffer = esimOffers.find((offer) => offer.variantId === variantId);
  // eSIM checkout links use variantId without a card slug. Do not wait on locale offer reload.
  const maybeEsim = Boolean(variantId) && (!slug || Boolean(esimOffer));
  const [quote, setQuote] = useState<EsimQuoteView | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
  const [payPhase, setPayPhase] = useState<'order' | 'payment' | null>(null);
  const isEsim = Boolean(esimOffer) || maybeEsim;
  const vnOnlyBlocked = retailMarket === 'INTL' && !isEsim;
  const paymentMethods = paymentMethodsForCheckout({
    methods: allPaymentMethods,
    isEsim: false,
    market: 'VN',
  });
  const methodsReady = !paymentMethodsLoading;
  const quotedOptions = filterEsimQuotedOptions(quote?.paymentOptions ?? [], allPaymentMethods, methodsReady);
  const selectedOption =
    quotedOptions.find((option) => esimOptionKey(option) === selectedOptionKey) ?? quotedOptions[0] ?? null;
  const esimMethod = selectedOption
    ? allPaymentMethods.find((method) => {
        if (method.methodCode.toUpperCase() !== selectedOption.methodCode.toUpperCase()) return false;
        if (method.gatewayCode !== selectedOption.gateway) return false;
        if (selectedOption.gateway === 'MEGAPAY') return method.esimEnabled === true;
        return method.enabled;
      }) ?? null
    : null;
  const buyerMarket = esimBuyerMarket(quote);
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
  const captchaRef = useRef<TurnstileFieldHandle>(null);
  const turnstileSiteKey = useTurnstileSiteKey();
  const captchaRequired = !isAuthenticated && isTurnstileSiteKeyConfigured(turnstileSiteKey);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
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
    void listEsimPreviewOffers(locale).then((result) => {
      if (result.ok) {
        setEsimOffers(result.offers);
        setEsimSalesOpen(result.salesOpen);
      }
      setEsimOffersReady(true);
    });
  }, [locale]);

  useEffect(() => {
    if (user?.email) {
      setGuestEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!isEsim || authLoading || isAuthenticated) return;
    const checkoutPath = withLocalePrefix('/checkout', locale);
    const query = slug
      ? `slug=${encodeURIComponent(slug)}&variantId=${encodeURIComponent(variantId)}&quantity=1`
      : `variantId=${encodeURIComponent(variantId)}&quantity=1`;
    const next = `${checkoutPath}?${query}`;
    router.replace(`${withLocalePrefix('/login', locale)}?redirect=${encodeURIComponent(next)}`);
  }, [isEsim, authLoading, isAuthenticated, slug, variantId, router, locale]);

  useEffect(() => {
    if (!maybeEsim || !variantId) {
      setQuote(null);
      setQuoteState('idle');
      setSelectedOptionKey(null);
      return;
    }
    let cancelled = false;
    setQuoteState('loading');
    void fetch(`${getApiBaseUrl()}/esim/quote?variantId=${encodeURIComponent(variantId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as { data?: EsimQuoteView };
        if (!response.ok || !body.data || !Array.isArray(body.data.paymentOptions)) {
          throw new Error('quote');
        }
        const data = body.data;
        data.paymentOptions = data.paymentOptions.map((option) => ({
          ...option,
          methodCode:
            option.methodCode ||
            (option.gateway === 'PAYPAL' ? 'PAYPAL' : option.gateway === 'SEPAY' ? 'VIETQR' : option.gateway),
        }));
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setQuote(data);
        setQuoteState('ready');
        setSelectedOptionKey((prev) => {
          const keys = data.paymentOptions.map((option) => esimOptionKey(option));
          if (prev && keys.includes(prev)) return prev;
          return data.paymentOptions[0] ? esimOptionKey(data.paymentOptions[0]) : null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setQuote(null);
          setQuoteState('error');
          setSelectedOptionKey(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [maybeEsim, variantId]);

  useEffect(() => {
    if (!selectedOption) return;
    const key = esimOptionKey(selectedOption);
    if (selectedOptionKey !== key) {
      setSelectedOptionKey(key);
    }
  }, [selectedOption, selectedOptionKey]);

  const pricing = useMemo(
    () =>
      variant ? buildCustomerPriceViewFromVariant(variant, quantity, selectedMethod) : null,
    [variant, quantity, selectedMethod],
  );

  async function handleCheckout() {
    if (isEsim) {
      if (!variant || !selectedOption || !esimMethod) {
        setError(t('checkout.esimNoMethod'));
        return;
      }
    } else if (!variant || !gateway || !paymentMethodCode || !hasPaymentMethods) {
      if (!hasPaymentMethods) setError(t('checkout.noMethods'));
      return;
    }
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      if (vnOnlyBlocked) {
        throw new Error('Sản phẩm này chỉ bán tại Việt Nam.');
      }
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
      if (captchaRequired && !captchaToken) {
        throw new Error('Vui lòng hoàn tất xác minh bảo mật');
      }

      if (isEsim) {
        if (!quote || !selectedOption || !esimMethod) {
          throw new Error(t('checkout.esimNoMethod'));
        }
        setPayPhase('order');
        const created = await orderApi.create({
          ...esimOrderCreateBody({
            variantId: variant.id,
            paymentMethodCode: esimMethod.methodCode,
            market: esimMarketForGateway(selectedOption.gateway),
            locale: readBrowserLocale(),
          }),
          guestEmail: undefined,
        });
        // Reused PAID order (fulfillment still running): open the order, do not create payment.
        if (created.paymentStatus === 'PAID') {
          router.push(withLocalePrefix(`/orders/${created.id}`, locale));
          return;
        }
        setPayPhase('payment');
        const pay = await paymentApi.create(
          { orderId: created.id, gateway: selectedOption.gateway },
          generateIdempotencyKey(),
        );
        if (selectedOption.gateway === 'PAYPAL') {
          if (!isPaypalApprovalUrl(pay.paymentUrl)) {
            throw new Error(t('checkout.esimPayFailed'));
          }
          window.location.assign(pay.paymentUrl);
          return;
        }
        const resolvedEmail = email ?? created.guestEmail ?? '';
        setPayment(pay);
        setPaidOrderMeta({
          orderId: created.id,
          orderCode: created.orderCode,
          email: resolvedEmail,
        });
        storeOrderGuestEmail(created.id, resolvedEmail);
        if (isInlineQrPayment(pay)) {
          router.push(
            persistAndPathForQrPayment({
              orderId: created.id,
              orderCode: created.orderCode,
              email: resolvedEmail,
              payment: pay,
            }),
          );
          return;
        }
        if (selectedOption.gateway === 'MEGAPAY') {
          if (!pay.checkoutFormFields || !pay.checkoutClient || pay.displayMode === 'qr_inline') {
            throw new Error(t('checkout.esimPayFailed'));
          }
          return;
        }
        if (!isSepayPgCheckout(pay)) {
          throw new Error(t('checkout.esimPayFailed'));
        }
        return;
      }

      if (!gateway || !paymentMethodCode) {
        setError(t('checkout.noMethods'));
        return;
      }
      const order = await orderApi.create({
        items: [{ variantId: variant.id, quantity }],
        guestEmail: isAuthenticated ? undefined : email,
        paymentMethodCode,
        locale: readBrowserLocale(),
        captchaToken: !isAuthenticated ? captchaToken || undefined : undefined,
      });

      const resolvedEmail = email ?? order.guestEmail ?? '';
      const pay = await paymentApi.create(
        {
          orderId: order.id,
          gateway,
          ...(isAuthenticated ? {} : { guestEmail: resolvedEmail }),
        },
        generateIdempotencyKey(),
      );
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
      const captchaErr = captchaErrorFromApi(err);
      if (captchaErr) {
        setError(captchaErr.message);
        if (captchaErr.shouldReset) {
          captchaRef.current?.reset();
          setCaptchaToken(null);
        }
      } else if (err instanceof ApiClientError) {
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
            `${t('checkout.overLimit')}: ${money(limitDetails.limit)} · ${money(limitDetails.current)}`,
          );
        } else if (isEsim && /FX_EXPIRED|FX_UNAVAILABLE|FX_MISSING|FX_STALE/i.test(err.message)) {
          setError(t('checkout.esimFxUnavailable'));
        } else if (isEsim && /payment window has expired|order payment window has expired/i.test(err.message)) {
          setError(t('checkout.esimExpired'));
        } else if (isEsim) {
          setError(t('checkout.esimPayFailed'));
        } else {
          setError(customerFacingError(locale, err));
        }
      } else if (isEsim && quoteState === 'error') {
        setError(t('checkout.esimOffline'));
      } else {
        setError(isEsim ? t('checkout.esimPayFailed') : customerFacingError(locale, err));
      }
    } finally {
      setLoading(false);
      setPayPhase(null);
    }
  }

  if (!variant || (isEsim && (authLoading || !isAuthenticated))) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">
          {!esimOffersReady || (isEsim && authLoading) || (maybeEsim && quoteState === 'loading')
            ? t('checkout.esimLoading')
            : isEsim
              ? t('checkout.toLogin')
              : t('checkout.missingProduct')}
        </p>
      </PageContainer>
    );
  }

  if (isEsim && (esimOffer || quote)) {
    const planName = esimOffer?.productName ?? variant.name;
    const planTitle = esimOffer?.title ?? variant.name;
    const cta = selectedOption ? esimPayLabel(locale, selectedOption) : t('checkout.esimNoMethod');
    const note = selectedOption ? esimReferenceNote(locale, selectedOption) : null;
    const busyLabel = payPhase === 'payment' ? t('checkout.esimCreatingPayment') : t('checkout.esimCreatingOrder');
    const quotePending = quoteState === 'loading' || quoteState === 'idle' || !methodsReady;
    return (
      <PageContainer>
        <div className="mx-auto grid max-w-5xl gap-6 pb-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <section className="min-w-0 rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-cardon-blue">{t('checkout.esimPlan')}</p>
            <h1 className="mt-2 text-2xl font-bold text-cardon-navy">{planName}</h1>
            <p className="mt-1 text-base text-cardon-dark">{planTitle}</p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Fact label={t('checkout.esimCountry')} value={esimOffer?.countryName || esimOffer?.countryIso || '—'} />
              <Fact label={t('checkout.esimData')} value={esimOffer?.dataLabel || '—'} />
              <Fact label={t('checkout.esimDuration')} value={esimOffer?.durationLabel || '—'} />
              <Fact label={t('checkout.esimQty')} value="1" />
              <Fact
                label={t('checkout.esimNetwork')}
                value={(esimOffer?.networks?.length ? esimOffer.networks : esimOffer?.operators ?? []).slice(0, 3).join(', ') || '—'}
              />
              <Fact label={t('checkout.esimSpeed')} value={esimOffer?.speedLabel || '—'} />
              <Fact label={t('checkout.esimActivation')} value={esimOffer?.activationLabel || ''} />
            </dl>
            {esimOffer?.shortInfo || esimOffer?.summary ? (
              <p className="mt-4 text-sm leading-relaxed text-cardon-dark">{esimOffer.shortInfo || esimOffer.summary}</p>
            ) : null}
            <p className="mt-5 text-sm text-cardon-gray">
              {t('checkout.esimReference')}{' '}
              <span className="font-semibold text-cardon-navy">
                {money(Number(quote?.catalogAmount ?? esimOffer?.sellPriceVnd ?? variant.sellPrice))}
              </span>
            </p>
          </section>
          <section className="min-w-0 rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6 lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-lg font-semibold text-cardon-navy">{t('checkout.esimPayWith')}</h2>
            {quotePending ? (
              <p className="mt-4 text-sm text-cardon-gray">{t('checkout.esimQuoteLoading')}</p>
            ) : quotedOptions.length === 0 ? (
              <p className="mt-4 text-sm text-red-700">{quoteState === 'error' ? t('checkout.esimOffline') : t('checkout.esimNoMethod')}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {quotedOptions.map((option) => {
                  const key = esimOptionKey(option);
                  const selected = key === (selectedOption ? esimOptionKey(selectedOption) : null);
                  const title =
                    option.gateway === 'PAYPAL'
                      ? t('checkout.esimPayPal')
                      : option.gateway === 'MEGAPAY'
                        ? option.methodCode === 'ZALOPAY'
                          ? t('checkout.esimZaloPay')
                          : t('checkout.esimVnPayQr')
                        : t('checkout.esimSePay');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedOptionKey(key)}
                      className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? 'border-cardon-blue bg-blue-50' : 'border-cardon-border bg-white'}`}
                    >
                      <span className="block text-sm font-semibold text-cardon-navy">{title}</span>
                      <span className="mt-1 block text-base font-bold text-cardon-navy">{esimPayLabel(locale, option)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {note ? <p className="mt-4 text-sm leading-relaxed text-cardon-gray">{note}</p> : null}
            {quote ? (
              <p className="mt-3 text-sm leading-relaxed text-cardon-gray">
                {t(buyerMarket === 'INTL' ? 'checkout.esimForeignMethod' : 'checkout.esimVnMethods')}
              </p>
            ) : null}
            {!esimSalesOpen ? (
              <div className="mt-4"><EsimSalesOffNotice compact /></div>
            ) : null}
            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-5 mt-5 border-t border-cardon-border bg-white px-5 py-4 lg:static lg:mx-0 lg:border-0 lg:px-0 lg:py-0">
              <Button className="w-full" size="lg" disabled={loading || !esimSalesOpen || !selectedOption} onClick={handleCheckout}>
                {loading ? busyLabel : cta}
              </Button>
              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            </div>
          </section>
        </div>
        {payment?.checkoutUrl && payment.checkoutFormFields && payment.gateway === 'SEPAY' && (
          <SepayPgCheckoutRedirect checkoutUrl={payment.checkoutUrl} checkoutFormFields={payment.checkoutFormFields} />
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
                quantity: '1',
              }).toString()}`}
              amount={payment.amount}
            />
          )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-cardon-navy">{t('checkout.payTitle')}</h1>

        <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-6 shadow-card">
          <p className="font-semibold text-cardon-navy">{product?.name ?? variant.name}</p>
          <p className="text-sm text-cardon-gray">{variant.name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-cardon-gray">{t('checkout.qtyLabel')}:</span>
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
            <h2 className="font-semibold text-cardon-navy">{t('checkout.guest')}</h2>
            <p className="mt-1 text-sm text-cardon-gray">{t('checkout.guestHint')}</p>
            <Input
              className="mt-3"
              type="email"
              placeholder="email@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
            {captchaRequired && (
              <TurnstileField
                ref={captchaRef}
                className="mt-4"
                action="guest-order"
                onTokenChange={setCaptchaToken}
              />
            )}
            <p className="mt-3 text-sm text-cardon-gray">
              {t('checkout.hasAccount')}{' '}
              <a href={withLocalePrefix('/login', locale)} className="font-semibold text-cardon-blue hover:underline">
                {t('nav.login')}
              </a>
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-6 shadow-card">
          <h2 className="font-semibold text-cardon-navy">{t('checkout.method')}</h2>
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
          {vnOnlyBlocked ? (
            <div className="mt-6">
              <VnOnlyMarketNotice />
            </div>
          ) : (
            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={
                loading ||
                !hasPaymentMethods ||
                !paymentMethodCode ||
                (captchaRequired && !captchaToken)
              }
              onClick={handleCheckout}
            >
              {loading ? t('checkout.processing') : `${t('checkout.createPay')}${pricing ? ` ${money(pricing.totalPayment)}` : ''}`}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs text-cardon-gray">{label}</dt>
      <dd className="font-semibold leading-snug text-cardon-navy">{value || '—'}</dd>
    </div>
  );
}
