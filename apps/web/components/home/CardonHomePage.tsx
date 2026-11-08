'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import { StorefrontHero } from '@/components/layout/StorefrontHero';
import { CustomerProductLogo } from '@/components/product/CustomerProductLogo';
import { FaqSection } from '@/components/faq/FaqSection';
import { NewsSection } from '@/components/home/NewsSection';
import { useProducts } from '@/hooks/useProducts';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import type { PublicBlogPost, PublicFaqItem } from '@/lib/cms-api';
import { backgroundLayer } from '@/lib/home-backgrounds';
import type { Product } from '@/types/api';

const SHORTCUTS = [
  { label: 'Thẻ game', href: '/the-game', hint: 'Mua thẻ game' },
  { label: 'Thẻ điện thoại', href: '/the-dien-thoai', hint: 'Mua thẻ điện thoại' },
  { label: 'Nạp cước', href: '/nap-cuoc', hint: 'Nạp tiền điện thoại' },
  { label: 'Nạp data', href: '/nap-data', hint: 'Nạp data' },
  { label: 'eSIM du lịch', href: '/esim', hint: 'Nhật Bản, Hàn Quốc' },
];

const POPULAR_QUERIES = ['Garena', 'Zing', 'Viettel', 'Mobifone', 'Vinaphone', 'eSIM'];

const POPULAR_DESTINATIONS: Array<{ name: MessageKey; href: string; image: string }> = [
  { name: 'home.destSea', href: '/esim', image: '/images/home/dest-sea.jpg' },
  { name: 'home.destJp', href: '/esim/quoc-gia/JP', image: '/images/home/dest-japan.jpg' },
  { name: 'home.destKr', href: '/esim/quoc-gia/KR', image: '/images/home/dest-korea.jpg' },
  { name: 'home.destEu', href: '/esim', image: '/images/home/dest-europe.jpg' },
  { name: 'home.destUs', href: '/esim', image: '/images/home/dest-usa.jpg' },
];

function purchaseHref(product: Product): string {
  if (product.homeService === 'PHONE_CARD') return '/the-dien-thoai';
  if (product.homeService === 'TOPUP') return '/nap-cuoc';
  if (product.homeService === 'DATA') return '/nap-data';
  return '/the-game';
}

export function CardonHomePage({
  newsPosts,
  initialFaqs,
}: {
  newsPosts: PublicBlogPost[];
  initialFaqs?: PublicFaqItem[];
}) {
  const t = useT();
  const { products, loading } = useProducts();
  const { homeBackgrounds } = useThemeSettings();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const gameProducts = products.filter((product) => product.homeService === 'GAME_CARD').slice(0, 8);
  const phoneProducts = products.filter((product) => product.homeService === 'PHONE_CARD').slice(0, 4);
  const topupProducts = products.filter((product) => product.homeService === 'TOPUP').slice(0, 4);
  const matches = useMemo(() => {
    if (!normalized) return [];
    const shortcuts = [
      { label: t('nav.game'), href: '/the-game', hint: t('home.gameHint') },
      { label: t('nav.phone'), href: '/the-dien-thoai', hint: t('home.phoneHint') },
      { label: t('nav.topup'), href: '/nap-cuoc', hint: t('home.topupHint') },
      { label: t('nav.data'), href: '/nap-data', hint: t('home.dataHint') },
      { label: t('nav.esim'), href: '/esim', hint: t('home.esimHint') },
    ].filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(normalized));
    const catalog = products
      .filter((product) => product.name.toLowerCase().includes(normalized))
      .slice(0, 6)
      .map((product) => ({
        label: product.name,
        href: purchaseHref(product),
        hint: t('home.openPage'),
      }));
    return [...shortcuts, ...catalog];
  }, [normalized, products, t]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    if (matches[0]) {
      window.location.assign(matches[0].href);
    }
  }

  return (
    <div className="pb-6 md:pb-8">
      <StorefrontHero
        backgroundUrl={homeBackgrounds.homeHeroBg}
        title={t('home.heroTitle')}
        subtitle={t('home.heroBody')}
        headingLevel="h1"
        search={{
          id: 'home-search',
          value: query,
          placeholder: t('home.searchPh'),
          label: t('home.searchLabel'),
          onChange: setQuery,
          onSubmit: onSearch,
        }}
        belowSearch={
          normalized ? (
            <ul className="mt-3 max-w-xl space-y-1 rounded-2xl border border-cardon-border bg-white p-2 text-cardon-dark">
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-sm">{t('home.noMatch')}</li>
              ) : (
                matches.map((item) => (
                  <li key={`${item.href}-${item.label}`}>
                    <Link href={item.href} className="block rounded-xl px-3 py-2 hover:bg-cardon-light">
                      <span className="font-semibold">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-cardon-gray">{item.hint}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              <span className="mr-1 font-bold text-[#07142b]">{t('home.popularSearch')}</span>
              {POPULAR_QUERIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setQuery(item)}
                  className="rounded-full bg-white/85 px-2.5 py-0.5 font-bold text-cardon-blue shadow-sm hover:bg-white focus-visible:ring-2 focus-visible:ring-cardon-blue"
                >
                  {item}
                </button>
              ))}
            </p>
          )
        }
      />

      <div className="site-container mt-1 space-y-6 lg:-mt-4 lg:space-y-7">
      {/* Mobile: icon quick-nav. sm+: illustrated category cards. */}
      <section className="sm:hidden">
        <div className="grid grid-cols-2 gap-2">
          <CategoryQuickTile
            href="/esim"
            title={t('nav.esim')}
            hint="JP · KR"
            icon={<PlaneIcon />}
            tone="amber"
          />
          <CategoryQuickTile
            href="/the-game"
            title={t('nav.game')}
            hint={t('home.quick')}
            icon={<GamepadIcon />}
            tone="violet"
          />
          <CategoryQuickTile
            href="/the-dien-thoai"
            title={t('nav.phone')}
            hint={t('home.safe')}
            icon={<PhoneIcon />}
            tone="sky"
          />
          <CategoryQuickTile
            href="/nap-cuoc"
            title={t('nav.topup')}
            hint={t('home.allCarriers')}
            icon={<TopupIcon />}
            tone="emerald"
          />
        </div>
      </section>
      <section className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        <CategoryCard
          title={t('nav.esim')}
          text={t('home.esimCard')}
          href="/esim"
          action={t('home.viewPlans')}
          image={homeBackgrounds.homeCategoryEsimBg}
          position="right center"
          size="auto 100%"
          wash="#fff4ea"
          note={t('home.esimHint')}
        />
        <CategoryCard
          title={t('nav.game')}
          text={t('home.gameCard')}
          href="/the-game"
          action={t('product.buy')}
          image={homeBackgrounds.homeCategoryGameBg}
          position="right center"
          size="auto 100%"
          wash="#f6ecff"
        />
        <CategoryCard
          title={t('nav.phone')}
          text={t('home.phoneCard')}
          href="/the-dien-thoai"
          action={t('product.buy')}
          image={homeBackgrounds.homeCategoryPhoneCardBg}
          position="right center"
          size="auto 100%"
          wash="#e7f3ff"
        />
        <CategoryCard
          title={t('nav.topup')}
          text={t('home.topupCard')}
          href="/nap-cuoc"
          action={t('home.topupNow')}
          image={homeBackgrounds.homeCategoryTopupBg}
          position="right center"
          size="auto 100%"
          wash="#e5f8f0"
          tone="green"
        />
      </section>

      <section>
        <SectionHeading
          icon={<PlaneIcon />}
          title={t('home.destTitle')}
          href="/esim"
          action={t('common.viewAll')}
          text={t('home.destBody')}
        />
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {POPULAR_DESTINATIONS.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="group relative h-40 w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-transparent shadow-card transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-cardon-blue sm:w-[46%] lg:w-auto"
            >
              <Image
                src={item.image}
                alt=""
                fill
                sizes="(max-width: 1024px) 78vw, 220px"
                className="object-cover object-center transition duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-10 pb-3 text-white">
                <span className="flex items-center justify-between gap-2 text-sm font-bold leading-tight">
                  {t(item.name)}
                  <span aria-hidden>→</span>
                </span>
                <span className="mt-0.5 block text-[11px] text-white/85">{t('home.viewEsim')}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <LogoSection
        id="mua-the"
        href="/the-game"
        title={t('home.gameTitle')}
        icon={<GamepadIcon />}
        loading={loading}
        products={gameProducts}
        empty={t('home.emptyGame')}
        columns="grid-cols-4 gap-2 sm:grid-cols-4 xl:grid-cols-8"
      />
      <section className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <LogoSection
          href="/the-dien-thoai"
          title={t('home.phoneTitle')}
          icon={<PhoneIcon />}
          loading={loading}
          products={phoneProducts}
          empty={t('home.emptyPhone')}
          columns="grid-cols-4 gap-2"
        />
        <LogoSection
          href="/nap-cuoc"
          title={t('home.topupTitle')}
          icon={<TopupIcon />}
          loading={loading}
          products={topupProducts}
          empty={t('home.emptyTopup')}
          columns="grid-cols-4 gap-2"
          badge="Nạp"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Benefit
          tone="bg-cardon-blue/10 text-cardon-blue"
          icon="bolt"
          title={t('trust.instant')}
          text={t('trust.instantBody')}
        />
        <Benefit
          tone="bg-cardon-green/10 text-cardon-green"
          icon="shield"
          title={t('trust.pay')}
          text={t('trust.payBody')}
        />
        <Benefit
          tone="bg-cardon-blue/10 text-cardon-blue"
          icon="headset"
          title={t('trust.support')}
          text={t('trust.supportBody')}
        />
        <Benefit
          tone="bg-cardon-orange/10 text-cardon-orange"
          icon="star"
          title={t('home.trustTitle')}
          text={t('trust.brandBody')}
        />
      </section>

      <NewsSection posts={newsPosts.slice(0, 4)} icon={<NewsIcon />} />
      <FaqSection
        featured
        limit={6}
        showViewAll
        viewAllPlacement="header"
        layout="split"
        icon={<HelpIcon />}
        emptyText={t('home.faqEmpty')}
        initialItems={initialFaqs}
      />
      </div>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  text,
  href,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2.5 text-xl font-bold text-cardon-navy md:text-2xl">
          {icon ? <span className="inline-flex shrink-0 text-cardon-blue">{icon}</span> : null}
          {title}
        </h2>
        {href && action ? (
          <Link href={href} className="shrink-0 text-sm font-semibold text-cardon-blue hover:underline">
            {action} →
          </Link>
        ) : null}
      </div>
      {text ? <p className="mt-1 max-w-2xl text-sm text-cardon-gray">{text}</p> : null}
    </div>
  );
}

const CATEGORY_TONE = {
  violet: 'bg-[#f0e8ff] text-[#7c3aed]',
  sky: 'bg-[#e7f3ff] text-cardon-blue',
  emerald: 'bg-[#e5f8f0] text-cardon-green',
  amber: 'bg-[#fff4ea] text-[#d97706]',
} as const;

/** Mobile-only service shortcut — denser than illustrated CategoryCard. */
function CategoryQuickTile({
  href,
  title,
  hint,
  icon,
  tone,
}: {
  href: string;
  title: string;
  hint: string;
  icon: ReactNode;
  tone: keyof typeof CATEGORY_TONE;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-xl border border-cardon-border/80 bg-white px-2.5 py-2.5 shadow-[0_1px_2px_rgba(16,36,72,0.04)] transition-all duration-200 active:scale-[0.98] hover:border-cardon-blue/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-cardon-blue"
    >
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${CATEGORY_TONE[tone]} [&_svg]:h-[18px] [&_svg]:w-[18px]`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold leading-tight text-cardon-navy">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-cardon-gray">
          {hint}
        </span>
      </span>
      <span
        aria-hidden
        className="shrink-0 text-base font-light leading-none text-cardon-gray/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-cardon-blue"
      >
        ›
      </span>
    </Link>
  );
}

function CategoryCard({
  title,
  text,
  href,
  action,
  image,
  position,
  size,
  wash,
  note,
  locked = false,
  tone = 'blue',
}: {
  title: string;
  text: string;
  href: string;
  action: string;
  image: string;
  position: string;
  size: string;
  wash: string;
  note?: string;
  locked?: boolean;
  tone?: 'blue' | 'green';
}) {
  const art = backgroundLayer(image, position, size);
  return (
    <Link
      href={href}
      className="group relative block h-[168px] overflow-hidden rounded-2xl border border-white/80 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-cardon-blue xl:h-[172px]"
      style={{ ...art, backgroundColor: wash }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[52%] bg-gradient-to-r from-white/85 via-white/40 to-transparent" />
      <div className="relative z-10 flex h-full w-[54%] min-w-0 flex-col p-3 xl:p-2.5">
        <h2 className="whitespace-nowrap text-base font-extrabold leading-tight tracking-tight text-cardon-navy sm:text-lg">
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-cardon-gray">{text}</p>
        {note ? <p className="mt-1 text-[11px] font-semibold leading-tight text-cardon-orange">{note}</p> : null}
        <div className="mt-auto pt-2">
          <span
            className={`inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors duration-200 xl:h-9 ${
              locked
                ? 'border border-cardon-border bg-white/90 text-cardon-gray'
                : tone === 'green'
                  ? 'bg-cardon-green text-white group-hover:bg-emerald-600'
                  : 'bg-cardon-blue text-white group-hover:bg-cardon-navy'
            }`}
          >
            {action} →
          </span>
        </div>
      </div>
    </Link>
  );
}

function LogoSection({
  id,
  href,
  title,
  icon,
  products,
  loading,
  empty,
  columns,
  badge,
}: {
  id?: string;
  href: string;
  title: string;
  icon: ReactNode;
  products: Product[];
  loading: boolean;
  empty: string;
  columns: string;
  /** Small corner label — used on top-up tiles to distinguish from phone cards. */
  badge?: string;
}) {
  const t = useT();
  return (
    <section id={id}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-cardon-navy md:text-2xl">
          <span className="inline-flex shrink-0 text-cardon-blue">{icon}</span>
          {title}
        </h2>
        <Link href={href} className="shrink-0 text-sm font-semibold text-cardon-blue hover:underline">
          {t('common.viewAll')} →
        </Link>
      </div>
      {loading ? (
        <div className={`grid ${columns}`}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[72px] animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cardon-border bg-white p-3 text-sm text-cardon-gray">{empty}</p>
      ) : (
        <div className={`grid ${columns}`}>
          {products.map((product) => (
            <Link
              key={product.id}
              href={href}
              aria-label={badge ? `${badge} ${product.name}` : product.name}
              className="relative flex h-[72px] items-center justify-center rounded-xl border border-cardon-border bg-white px-2 transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-cardon-blue"
            >
              {badge ? (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-cardon-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-cardon-green">
                  {badge}
                </span>
              ) : null}
              <div className="flex h-11 w-full items-center justify-center">
                <CustomerProductLogo name={product.name} slug={product.slug} logoUrl={product.logoUrl} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] md:h-[22px] md:w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function GamepadIcon() {
  return (
    <SectionGlyph>
      <path d="M6 12h4" />
      <path d="M8 10v4" />
      <path d="M15 13h.01" />
      <path d="M18 11h.01" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258a1 1 0 0 0-.01-.152A4 4 0 0 0 17.32 5z" />
    </SectionGlyph>
  );
}

function PhoneIcon() {
  return (
    <SectionGlyph>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </SectionGlyph>
  );
}

function TopupIcon() {
  return (
    <SectionGlyph>
      <rect width="10" height="16" x="3" y="4" rx="2" />
      <path d="M8 16h.01" />
      <path d="M16 8h6" />
      <path d="M19 5v6" />
    </SectionGlyph>
  );
}

function PlaneIcon() {
  return (
    <SectionGlyph>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </SectionGlyph>
  );
}

function NewsIcon() {
  return (
    <SectionGlyph>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </SectionGlyph>
  );
}

function HelpIcon() {
  return (
    <SectionGlyph>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </SectionGlyph>
  );
}

function Benefit({
  tone,
  icon,
  title,
  text,
}: {
  tone: string;
  icon: 'bolt' | 'shield' | 'headset' | 'star';
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-cardon-border bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md sm:p-4">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <BenefitIcon name={icon} />
      </span>
      <div>
        <h3 className="font-bold text-cardon-navy">{title}</h3>
        <p className="text-sm text-cardon-gray">{text}</p>
      </div>
    </div>
  );
}

function BenefitIcon({ name }: { name: 'bolt' | 'shield' | 'headset' | 'star' }) {
  if (name === 'bolt') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
        <path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'headset') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
        <path d="M4 13a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="17" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="m12 3 2.2 6.4H21l-5.4 4 2 6.6L12 16.8 6.4 20l2-6.6L3 9.4h6.8L12 3Z" />
    </svg>
  );
}

