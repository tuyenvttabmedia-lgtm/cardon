'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LoginRequiredModal } from '@/components/checkout/LoginRequiredModal';
import { FaqAccordion, type FaqItem } from '@/components/faq/FaqAccordion';
import { useAuth } from '@/hooks/useAuth';
import { EsimInstallGuide } from '@/components/esim/EsimInstallGuide';
import { EsimProductGallery } from '@/components/esim/EsimProductGallery';
import { dataAmountMb, destPhotoFor, durationDays, offerGallery } from '@/lib/esim-browse';
import type { EsimPreviewOffer } from '@/lib/esim-offers';
import { EsimSalesOffNotice } from '@/components/esim/EsimSalesOffNotice';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { EsimShelfPrice } from '@/components/esim/EsimShelfPrice';
import { customerFacingError } from '@/lib/i18n/customer-error';
import type { MessageKey } from '@/lib/i18n/messages';
import { withLocalePrefix } from '@/lib/i18n/locale';

const REGION_KEY: Record<string, MessageKey> = {
  JP: 'esim.region.asia',
  KR: 'esim.region.asia',
  TH: 'esim.region.asia',
  CN: 'esim.region.asia',
  TW: 'esim.region.asia',
  SG: 'esim.region.asia',
  MY: 'esim.region.asia',
  ID: 'esim.region.asia',
  PH: 'esim.region.asia',
  HK: 'esim.region.asia',
  IN: 'esim.region.asia',
  KH: 'esim.region.asia',
  ASIA: 'esim.region.asia',
  GB: 'esim.region.europe',
  FR: 'esim.region.europe',
  DE: 'esim.region.europe',
  IT: 'esim.region.europe',
  ES: 'esim.region.europe',
  EUROPE: 'esim.region.europe',
  US: 'esim.region.america',
  CA: 'esim.region.america',
  AU: 'esim.region.oceania',
  NZ: 'esim.region.oceania',
  AE: 'esim.region.asia',
  TR: 'esim.region.asia',
  LA: 'esim.region.asia',
  MO: 'esim.region.asia',
  MV: 'esim.region.asia',
  QA: 'esim.region.asia',
  NL: 'esim.region.europe',
  CH: 'esim.region.europe',
  AT: 'esim.region.europe',
  PT: 'esim.region.europe',
  GR: 'esim.region.europe',
  BE: 'esim.region.europe',
  IE: 'esim.region.europe',
  CZ: 'esim.region.europe',
  EG: 'esim.region.africa',
};

const DAY_SPANS = [
  { id: '1-7', labelKey: 'esim.days17' as const, min: 1, max: 7 },
  { id: '8-15', labelKey: 'esim.days815' as const, min: 8, max: 15 },
  { id: '16-30', labelKey: 'esim.days1630' as const, min: 16, max: 30 },
  { id: '31+', labelKey: 'esim.days31' as const, min: 31, max: 999 },
] as const;

type SortKey = 'price' | 'data' | 'days';

function buildFaq(t: (key: MessageKey) => string): FaqItem[] {
  return [
    { id: 'what', question: t('esim.faqWhat'), answer: `<p>${t('esim.faqWhatA')}</p>` },
    { id: 'qr', question: t('esim.faqQr'), answer: `<p>${t('esim.faqQrA')}</p>` },
    { id: 'devices', question: t('esim.faqDevice'), answer: `<p>${t('esim.faqDeviceA')}</p>` },
    { id: 'hotspot', question: t('esim.faqHotspot'), answer: `<p>${t('esim.faqHotspotA')}</p>` },
    { id: 'duration', question: t('esim.faqDuration'), answer: `<p>${t('esim.faqDurationA')}</p>` },
    { id: 'cancel', question: t('esim.faqRefund'), answer: `<p>${t('esim.faqRefundA')}</p>` },
    { id: 'support', question: t('esim.faqError'), answer: `<p>${t('esim.faqErrorA')}</p>` },
  ];
}

export function EsimDetailClient({
  offer,
  offers,
  plansHref = null,
  salesOpen = false,
}: {
  offer: EsimPreviewOffer;
  offers: EsimPreviewOffer[];
  plansHref?: string | null;
  salesOpen?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const country = offer.countryName || offer.countryIso || t('order.destination');
  const photo = destPhotoFor(offer.countryIso, offer.countryImageUrl || offer.photo);
  const gallery = useMemo(
    () => offerGallery(offer, offers.filter((item) => item.countryIso === offer.countryIso)),
    [offer, offers],
  );
  const regionKey = REGION_KEY[offer.countryIso] ?? 'esim.intl';
  const region = t(regionKey);
  const network =
    (offer.networks && offer.networks.length > 0 ? offer.networks : offer.operators).join(', ') ||
    t('esim.speedFallback');
  const countryOffers = offers.filter((item) => item.countryIso === offer.countryIso);
  const router = useRouter();
  const [section, setSection] = useState('tong-quan');
  const [loginOpen, setLoginOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [span, setSpan] = useState('');
  const [dataFilter, setDataFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('price');
  const { isAuthenticated, loading: authLoading } = useAuth();
  const detailHref = withLocalePrefix(`/esim/${offer.id}`, locale);
  const faq = useMemo(() => buildFaq(t), [t]);

  const dataOptions = useMemo(
    () =>
      [...new Set(countryOffers.map((item) => item.dataLabel))].sort(
        (a, b) => dataAmountMb(a) - dataAmountMb(b),
      ),
    [countryOffers],
  );

  const shownOffers = useMemo(() => {
    const rows = countryOffers.filter((item) => {
      if (dataFilter && item.dataLabel !== dataFilter) return false;
      if (span) {
        const days = durationDays(item.durationLabel);
        const match = DAY_SPANS.find((entry) => entry.id === span);
        if (!match || days < match.min || days > match.max) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (sort === 'data') return dataAmountMb(a.dataLabel) - dataAmountMb(b.dataLabel);
      if (sort === 'days') return durationDays(a.durationLabel) - durationDays(b.durationLabel);
      return a.sellPriceVnd - b.sellPriceVnd;
    });
    return rows;
  }, [countryOffers, dataFilter, sort, span]);

  const benefits = [
    {
      title: t('esim.benefitConnect'),
      text: t('esim.benefitConnectBody'),
      icon: <SignalIcon />,
    },
    {
      title: t('esim.benefitCode'),
      text: t('esim.benefitCodeBody'),
      icon: <QrIcon />,
    },
    {
      title: t('esim.benefitDevice'),
      text: t('esim.benefitDeviceBody'),
      icon: <DeviceIcon />,
    },
    {
      title: t('esim.benefitClear'),
      text: t('esim.benefitClearBody'),
      icon: <ShieldIcon />,
    },
  ];

  const attributes = [
    { label: t('esim.dest'), value: country, icon: <PinIcon size="sm" /> },
    { label: t('esim.region'), value: region, icon: <GlobeIcon size="sm" /> },
    { label: t('esim.network'), value: network, icon: <SignalIcon size="sm" /> },
    { label: t('esim.activate'), value: offer.activationLabel || t('esim.activateQr'), icon: <QrIcon size="sm" /> },
  ];

  const introPoints = [t('esim.intro1'), t('esim.intro2'), t('esim.intro3'), t('esim.intro4')];

  const sections = [
    { id: 'tong-quan', label: t('esim.overview') },
    { id: 'goi-xem-truoc', label: t('esim.plansNav') },
    { id: 'huong-dan', label: t('esim.guideNav') },
    { id: 'cau-hoi', label: t('esim.faqNav') },
  ];

  function payEsim() {
    if (!salesOpen) {
      setPayError(t('error.salesOff'));
      return;
    }
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoginOpen(true);
      return;
    }
    setPayError(null);
    router.push(`${withLocalePrefix('/checkout', locale)}?variantId=${encodeURIComponent(offer.variantId)}`);
  }

  useEffect(() => {
    const nodes = sections
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setSection(visible.target.id);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0.2, 0.45] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- section ids are stable
  }, []);

  return (
    <div className="space-y-6 pb-8 md:space-y-8">
      <p className="text-sm text-cardon-gray">
        <Link href="/" className="transition-colors hover:text-cardon-blue">
          {t('nav.home')}
        </Link>
        <span aria-hidden> / </span>
        <Link href="/esim" className="transition-colors hover:text-cardon-blue">
          {t('nav.esim')}
        </Link>
        {plansHref ? (
          <>
            <span aria-hidden> / </span>
            <Link href={plansHref} className="transition-colors hover:text-cardon-blue">
              {country}
            </Link>
          </>
        ) : null}
        <span aria-hidden> / </span>
        <span className="text-cardon-navy">{offer.title || offer.productName}</span>
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="min-w-0">
          <EsimProductGallery
            key={offer.countryIso}
            images={gallery.length > 0 ? gallery : [photo]}
            country={country}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-cardon-navy md:text-4xl">
              {offer.productName}
            </h1>
            <p className="mt-2 text-base font-semibold text-cardon-dark">
              {t('esim.tagline')}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-cardon-gray">
              {offer.shortInfo || offer.summary || t('esim.fallbackSummary')}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {benefits.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-2.5 rounded-2xl border border-cardon-border bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7f0ff] text-cardon-blue">
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-cardon-navy">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-cardon-gray">
                    {item.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <section className="rounded-2xl bg-[#e7f0ff] p-4 md:p-5">
            <p className="text-xs font-semibold text-cardon-blue">{offer.groupLabel}</p>
            <h2 className="mt-2 text-base font-bold leading-tight text-cardon-navy md:text-lg">
              {offer.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-cardon-dark">
              {offer.dataLabel} · {offer.durationLabel}
              {offer.speedLabel ? ` · ${offer.speedLabel}` : ''}
              {network !== t('esim.speedFallback') ? ` · ${network}` : ''}
            </p>
            <p className="mt-3 text-base font-bold leading-tight text-cardon-blue md:text-lg">
              <EsimShelfPrice sellPriceVnd={offer.sellPriceVnd} chargeCurrency={offer.chargeCurrency} chargeAmount={offer.chargeAmount} />
            </p>
            {salesOpen ? (
              <button
                type="button"
                disabled={authLoading}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-cardon-blue px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-cardon-navy disabled:cursor-not-allowed disabled:opacity-60"
                onClick={payEsim}
              >
                {t('checkout.payTitle')}
              </button>
            ) : (
              <div className="mt-4">
                <EsimSalesOffNotice compact />
              </div>
            )}
            {payError ? <p className="mt-2 text-sm text-red-600">{payError}</p> : null}
          </section>
        </div>
      </div>

      <ul className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        {attributes.map((item) => (
          <li
            key={item.label}
            className="flex h-full items-center gap-3 rounded-2xl border border-cardon-border bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f0ff] text-cardon-blue">
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-cardon-gray">{item.label}</span>
              <span className="block truncate text-sm font-bold text-cardon-dark">{item.value}</span>
            </span>
          </li>
        ))}
      </ul>

      <nav
        aria-label={t('esim.contents')}
        className="esim-chip-rail max-w-full rounded-2xl border border-cardon-border bg-white p-2 shadow-card sm:flex-wrap sm:overflow-visible"
      >
        {sections.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={section === item.id ? 'true' : undefined}
            onClick={() => setSection(item.id)}
            className={`inline-flex h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition-colors duration-200 sm:h-11 sm:px-4 ${
              section === item.id
                ? 'bg-cardon-blue text-white'
                : 'text-cardon-navy hover:bg-cardon-light'
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section id="tong-quan" className="scroll-mt-24 grid items-stretch gap-4 lg:grid-cols-2">
        <div className="h-full rounded-2xl border border-cardon-border bg-white p-5 shadow-card">
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">
            {t('esim.introTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-cardon-gray">
            {offer.shortInfo || t('esim.introFallback')} {offer.activationLabel}
          </p>
          {offer.operatorInfo && offer.operatorInfo.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-cardon-dark">
              {offer.operatorInfo.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-4 space-y-2">
            {introPoints.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-cardon-dark">
                <CheckIcon />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative h-full min-h-56 overflow-hidden rounded-2xl shadow-card">
          <Image
            src={photo}
            alt={country}
            fill
            sizes="(max-width: 1024px) 100vw, 560px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-[#0f172a]/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h3 className="text-xl font-bold">{country}</h3>
            <p className="mt-1 text-sm leading-relaxed text-white/90">{t('esim.travelBody')}</p>
          </div>
        </div>
      </section>

      <section id="goi-xem-truoc" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">
              {t('esim.plansFor')} {country}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-cardon-gray">
              {t('esim.filterHint')}{' '}
              <span className="font-semibold text-cardon-navy">{offer.dataLabel} / {offer.durationLabel}</span>
            </p>
          </div>
          {plansHref ? (
            <Link
              href={plansHref}
              className="text-sm font-semibold text-cardon-blue transition-colors hover:text-cardon-navy hover:underline"
            >
              {t('esim.viewAllPlans')} →
            </Link>
          ) : null}
        </div>

        <div className="esim-chip-rail mt-4">
          {DAY_SPANS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSpan((current) => (current === item.id ? '' : item.id))}
              className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-all duration-200 ${
                span === item.id
                  ? 'bg-cardon-blue text-white'
                  : 'border border-gray-100 bg-white text-cardon-navy hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md'
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-cardon-gray sm:flex-none">
            <span className="shrink-0 font-semibold text-cardon-navy">{t('esim.data')}</span>
            <select
              value={dataFilter}
              onChange={(event) => setDataFilter(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-xl border border-cardon-border bg-white px-2 text-sm font-semibold text-cardon-navy outline-none transition-colors hover:border-cardon-blue/40 focus:border-cardon-blue sm:px-3"
            >
              <option value="">{t('common.all')}</option>
              {dataOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-cardon-gray sm:flex-none">
            <span className="shrink-0 font-semibold text-cardon-navy">{t('esim.sort')}</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-9 min-w-0 flex-1 rounded-xl border border-cardon-border bg-white px-2 text-sm font-semibold text-cardon-navy outline-none transition-colors hover:border-cardon-blue/40 focus:border-cardon-blue sm:px-3"
            >
              <option value="price">{t('esim.priceAsc')}</option>
              <option value="data">{t('esim.data')}</option>
              <option value="days">{t('esim.duration')}</option>
            </select>
          </label>
          <p className="w-full text-sm text-cardon-gray sm:ml-auto sm:w-auto">
            {shownOffers.length} {t('esim.planCount')}
          </p>
        </div>

        {shownOffers.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-cardon-border bg-white p-4 text-sm text-cardon-gray">
            {t('esim.noPlanMatch')}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 items-stretch gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {shownOffers.map((card) => {
              const active = card.id === offer.id;
              return (
                <li key={card.id}>
                  <Link
                    href={
                      plansHref
                        ? `/esim/${card.id}?back=${encodeURIComponent(plansHref)}`
                        : `/esim/${card.id}`
                    }
                    className={`flex h-full flex-col rounded-xl border-2 bg-white p-3 transition-all duration-200 sm:p-4 ${
                      active
                        ? 'scale-[1.01] border-cardon-blue bg-blue-50 shadow-sm'
                        : 'border-gray-100 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md'
                    }`}
                  >
                    <span className="w-fit rounded-full bg-[#e7f0ff] px-2 py-0.5 text-[11px] font-semibold text-cardon-blue">
                      eSIM
                    </span>
                    <p className="mt-2 text-sm font-bold leading-tight text-cardon-navy sm:mt-3 sm:text-base md:text-lg">
                      {card.dataLabel} / {card.durationLabel}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-slate-500 sm:text-xs">
                      {card.speedLabel || t('esim.speedFallback')}
                      {card.operators[0] ? ` · ${card.operators[0]}` : ''}
                    </p>
                    <p className="mt-2 text-sm font-bold leading-tight text-cardon-blue sm:mt-3 sm:text-base md:text-lg">
                      <EsimShelfPrice sellPriceVnd={card.sellPriceVnd} chargeCurrency={card.chargeCurrency} chargeAmount={card.chargeAmount} />
                    </p>
                    <span
                      className={`mt-3 inline-flex h-10 items-center justify-center rounded-xl text-xs font-semibold transition-colors duration-200 sm:mt-4 sm:h-11 sm:text-sm ${
                        active
                          ? 'bg-cardon-navy text-white'
                          : 'bg-cardon-blue text-white group-hover:bg-cardon-navy'
                      }`}
                    >
                      {active ? t('esim.viewing') : t('esim.choose')}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="huong-dan" className="scroll-mt-24">
        <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">{t('esim.guide')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-cardon-gray">{t('esim.guideLead')}</p>
        <div className="mt-4">
          <EsimInstallGuide offer={offer} country={country} />
        </div>
      </section>

      <section id="cau-hoi" className="scroll-mt-24">
        <h2 className="mb-3 text-xl font-bold text-cardon-navy md:text-2xl">{t('home.faqTitle')}</h2>
        <FaqAccordion items={faq} title="" layout="split" />
      </section>
      <LoginRequiredModal open={loginOpen} onClose={() => setLoginOpen(false)} redirectPath={detailHref} />
    </div>
  );
}

function Icon({ children, size = 'md' }: { children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function SignalIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Icon size={size}>
      <path d="M4.5 18.5v-3.2M9.2 18.5V10M13.8 18.5V6.2M18.5 18.5V9.2" />
    </Icon>
  );
}

function QrIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Icon size={size}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <path
        fill="currentColor"
        stroke="none"
        d="M6.15 6.15h1.7v1.7h-1.7zM16.15 6.15h1.7v1.7h-1.7zM6.15 16.15h1.7v1.7h-1.7z"
      />
    </Icon>
  );
}

function DeviceIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Icon size={size}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17.5h2" />
    </Icon>
  );
}

function ShieldIcon() {
  return (
    <Icon>
      <path d="M12 3.5 5.5 6.2v5.6c0 3.6 2.7 6 6.5 7.7 3.8-1.7 6.5-4.1 6.5-7.7V6.2L12 3.5z" />
      <path d="m9.1 12.1 1.9 1.9 3.9-4" />
    </Icon>
  );
}

function PinIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Icon size={size}>
      <path d="M12 20.5s6.2-5.1 6.2-9.7a6.2 6.2 0 1 0-12.4 0c0 4.6 6.2 9.7 6.2 9.7z" />
      <circle cx="12" cy="10.8" r="2.1" />
    </Icon>
  );
}

function GlobeIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.4 2.2 14.6 0 17M12 3.5c-2.2 2.4-2.2 14.6 0 17" />
    </Icon>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 shrink-0 text-cardon-blue"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EsimDetailSkeleton() {
  return <div className="h-80 animate-pulse rounded-3xl bg-white" />;
}

function EsimLoadErrorBody({ message }: { message: string }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <>
      <h1 className="text-2xl font-bold text-cardon-navy">{t('esim.installFail')}</h1>
      <p className="mt-2 text-sm text-red-600">{customerFacingError(locale, new Error(message))}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 h-11 rounded-xl bg-cardon-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-cardon-navy"
      >
        {t('esim.retry')}
      </button>
    </>
  );
}

export function EsimLoadError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-card">
      <EsimLoadErrorBody message={message} />
    </div>
  );
}
