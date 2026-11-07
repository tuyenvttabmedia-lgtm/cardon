'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EsimFlag } from '@/components/esim/EsimFlag';
import { StorefrontHero } from '@/components/layout/StorefrontHero';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { EsimSalesOffNotice } from '@/components/esim/EsimSalesOffNotice';
import type { EsimOfferResult } from '@/lib/esim-offers';
import {
  ESIM_REGIONS,
  EXPLORE_POPULAR_LIMIT,
  PLAN_GROUPS,
  POPULAR_ISO,
  type EsimRegion,
  countriesFromOffers,
  countryPlansHref,
  destPhotoFor,
  featuredOffers,
  foldEsimText,
} from '@/lib/esim-browse';
import type { EsimPreviewOffer } from '@/lib/esim-offers';
import { formatVnd } from '@/lib/utils';

const FEATURE_TABS = [
  { id: 'popular', label: 'Phổ biến' },
  { id: 'price', label: 'Giá tốt' },
  { id: 'data', label: 'Dung lượng' },
  { id: 'duration', label: 'Thời gian dài' },
] as const;

const HERO_POINTS = [
  { title: 'Nhiều điểm đến', text: 'Chọn quốc gia cho chuyến đi', icon: <GlobeIcon /> },
  { title: 'Dữ liệu khi đi nước ngoài', text: 'Kết nối ngay khi đến nơi', icon: <SignalIcon /> },
  { title: 'Kích hoạt dễ dàng', text: 'Cài eSIM bằng mã QR', icon: <QrIcon /> },
  { title: 'Hỗ trợ tiếng Việt', text: 'CardOn hỗ trợ bằng tiếng Việt', icon: <ChatIcon /> },
] as const;

const REASONS = [
  { title: 'Kích hoạt dễ dàng', text: 'Thanh toán xong, mã cài nằm trong tài khoản. Quét mã là dùng, không cần ra quầy đổi SIM.', icon: <QrIcon /> },
  { title: 'Giữ số Việt Nam', text: 'SIM chính vẫn nhận cuộc gọi và OTP. Gói eSIM chỉ dùng cho dữ liệu ở nước đến.', icon: <PhoneIcon /> },
  { title: 'Chọn đúng chuyến đi', text: 'So sánh dung lượng, số ngày và giá trên cùng một màn trước khi thanh toán.', icon: <SignalIcon /> },
  { title: 'Hỗ trợ tiếng Việt', text: 'Gọi hotline, gửi email hoặc mở ticket. CardOn làm việc 08:00–22:00, thứ Hai đến Chủ nhật.', icon: <ChatIcon /> },
] as const;

export function EsimCatalogClient({ result }: { result: EsimOfferResult }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { homeBackgrounds } = useThemeSettings();
  const [query, setQuery] = useState('');
  const [feature, setFeature] = useState<(typeof FEATURE_TABS)[number]['id']>('popular');
  const offers = result.ok ? result.offers : [];
  const countries = useMemo(() => countriesFromOffers(offers), [offers]);
  const highlights = useMemo(() => featuredOffers(offers, feature), [offers, feature]);
  const popularDestinations = useMemo(() => {
    const fromOffers = countries.filter((country) => (POPULAR_ISO as readonly string[]).includes(country.iso));
    const ordered = POPULAR_ISO
      .map((iso) => fromOffers.find((country) => country.iso === iso))
      .filter((country): country is NonNullable<typeof country> => Boolean(country));
    return (ordered.length >= 5 ? ordered : countries).slice(0, 10);
  }, [countries]);

  useEffect(() => {
    const iso = (searchParams.get('country') ?? '').toUpperCase();
    const hash = window.location.hash;
    if (hash === '#diem-den') {
      router.replace('/esim/diem-den');
      return;
    }
    const legacy = hash === '#goi-nhat-ban' ? 'JP' : hash === '#goi-han-quoc' ? 'KR' : '';
    const next = iso || legacy;
    if (next) router.replace(countryPlansHref(next));
  }, [router, searchParams]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/esim/diem-den?q=${encodeURIComponent(q)}` : '/esim/diem-den');
  }

  return (
    <div className="pb-8">
      <StorefrontHero
        variant="hub"
        backgroundUrl={homeBackgrounds.hubHeroEsimBg}
        title="eSIM du lịch quốc tế"
        subtitle="Kết nối mọi hành trình. Chọn quốc gia, rồi chọn gói dữ liệu."
        headingLevel="h1"
        search={{
          id: 'esim-hero-search',
          value: query,
          placeholder: 'Bạn sắp đi đâu? Tìm quốc gia hoặc khu vực',
          label: 'Tìm quốc gia hoặc khu vực',
          onChange: setQuery,
          onSubmit: onSearch,
        }}
        belowSearch={
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="shrink-0 font-bold text-[#07142b]">Phổ biến:</span>
            <div className="esim-chip-rail min-w-0 flex-1">
              {countries.map((country) => (
                <Link
                  key={country.iso}
                  href={`/esim/diem-den?q=${encodeURIComponent(country.name)}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/90 px-3 font-semibold text-cardon-blue shadow-sm hover:bg-white"
                >
                  <EsimFlag iso={country.iso} className="h-5 w-5" />
                  {country.name}
                </Link>
              ))}
            </div>
          </div>
        }
      >
        <ul className="mt-4 grid max-w-md grid-cols-2 gap-2">
          {HERO_POINTS.map((item) => (
            <li
              key={item.title}
              className="inline-flex w-full items-center gap-2 rounded-full border border-white bg-white px-3.5 py-2 text-sm font-semibold leading-none text-cardon-navy shadow-sm"
            >
              <span className="text-cardon-blue [&_svg]:h-[18px] [&_svg]:w-[18px]">{item.icon}</span>
              {item.title}
            </li>
          ))}
        </ul>
      </StorefrontHero>

      <div className="relative z-10 site-container mt-1 space-y-6 sm:space-y-8 lg:-mt-4">
        {!result.ok ? <ErrorBox message={result.error} /> : null}
        {result.ok && !result.salesOpen ? <EsimSalesOffNotice /> : null}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Điểm đến phổ biến</h2>
            <Link href="/esim/diem-den" className="text-sm font-semibold text-cardon-blue hover:underline">Xem tất cả →</Link>
          </div>
          {/* Mobile: 2-col horizontal slide; desktop: full grid */}
          <div className="esim-slide esim-slide-2col mt-4 max-sm:flex sm:grid sm:grid-cols-3 sm:gap-2.5 sm:overflow-visible lg:grid-cols-5">
            {popularDestinations.map((spot) => (
              <Link
                key={spot.iso}
                href={countryPlansHref(spot.iso)}
                className="block overflow-hidden rounded-2xl border border-[#e6edf5] bg-white shadow-[0_6px_16px_rgba(16,36,72,0.06)] transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md"
              >
                <span className="relative block h-28 overflow-hidden sm:h-[92px]">
                  <Image
                    src={destPhotoFor(spot.iso, spot.photo)}
                    alt={spot.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 180px"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2.5 pb-2 pt-8 sm:hidden">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold leading-none text-white">
                      <EsimFlag iso={spot.iso} className="h-5 w-5 !ring-0" />
                      <span className="truncate">{spot.name}</span>
                    </span>
                  </span>
                </span>
                <span className="relative z-10 -mt-[9px] hidden items-center gap-2 px-2.5 pb-2 sm:flex">
                  <span className="inline-flex shrink-0 rounded-full border-2 border-white bg-white shadow-sm">
                    <EsimFlag iso={spot.iso} className="h-8 w-8 !ring-0" />
                  </span>
                  <span className="min-w-0 translate-y-[3px] truncate text-[13px] font-bold leading-none text-cardon-navy">
                    {spot.name}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <ExploreDestinations countries={countries} offers={offers} />

        <section>
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Gói eSIM nổi bật</h2>
          <div className="esim-chip-rail mt-3">
            {FEATURE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFeature(item.id)}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition-all duration-200 ${feature === item.id ? 'bg-cardon-blue text-white' : 'border border-gray-100 bg-white text-cardon-navy hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="esim-slide esim-slide-2col mt-4 max-sm:flex sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible lg:grid-cols-5">
            {highlights.map((offer) => (
              <article
                key={offer.id}
                className="flex flex-col rounded-xl border-2 border-gray-100 bg-white p-3 transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#e7f0ff] px-2 py-0.5 text-[11px] font-semibold text-cardon-blue">eSIM</span>
                  <Link href={countryPlansHref(offer.countryIso)} className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-cardon-blue">
                    <span className="[&_svg]:h-3.5 [&_svg]:w-3.5"><SignalIcon /></span>
                    <span className="truncate">Phủ sóng</span>
                  </Link>
                </div>
                <h3 className="mt-3 text-sm font-bold leading-tight text-cardon-navy sm:text-base md:text-lg">
                  {offer.dataLabel} / {offer.durationLabel}
                </h3>
                <dl className="mt-3 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3">
                  <Spec label="Dung lượng" value={offer.dataLabel} />
                  <Spec label="Thời hạn" value={offer.durationLabel} />
                  <Spec label="Tốc độ" value={offer.speedLabel || 'Theo gói'} />
                </dl>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-base font-bold leading-tight text-cardon-blue md:text-lg">{formatVnd(offer.sellPriceVnd)}</p>
                  <Link href={`/esim/${offer.id}`} className="inline-flex h-9 items-center justify-center rounded-lg bg-cardon-blue px-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-cardon-navy">
                    {result.ok && result.salesOpen ? 'Chọn gói' : 'Xem gói'}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Vì sao chọn eSIM tại CardOn?</h2>
          <ul className="esim-slide esim-slide-2col mt-4 max-sm:flex sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible lg:grid-cols-4">
            {REASONS.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-cardon-border bg-white p-3.5 shadow-card sm:p-4"
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f0ff] text-cardon-blue sm:h-10 sm:w-10">{item.icon}</span>
                  <h3 className="text-sm font-bold leading-snug text-cardon-navy sm:text-base">{item.title}</h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-cardon-gray sm:text-sm">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">eSIM là gì?</h2>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-cardon-gray">
            <p>
              eSIM là SIM điện tử gắn sẵn trong điện thoại. Bạn không nhận thẻ nhựa và không cần tháo SIM đang dùng. Sau khi mua gói, máy nhận một mã cài, thường là mã QR. Quét mã, đặt tên cho đường truyền rồi bật dữ liệu di động là có Internet ở nước đến.
            </p>
            <p>
              Khi đi du lịch quốc tế, eSIM giúp dùng bản đồ, mạng xã hội và ứng dụng gọi ngay khi hạ cánh. SIM Việt Nam vẫn có thể mở để nhận cuộc gọi và mã OTP ngân hàng.
            </p>
            <h3 className="pt-1 text-base font-bold text-cardon-navy">Cách mua eSIM du lịch trên CardOn</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Tìm quốc gia hoặc chọn một điểm đến.</li>
              <li>So sánh dung lượng, số ngày và giá, rồi chọn một gói.</li>
              <li>Đăng nhập và thanh toán.</li>
              <li>Vào tài khoản để lấy mã cài và làm theo hướng dẫn trên máy.</li>
            </ol>
            <p>Máy cần hỗ trợ eSIM. Nên cài khi còn WiFi, trước giờ bay.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function limitPopularExplore<T extends { iso: string; name: string }>(countries: T[]): T[] {
  const ordered = POPULAR_ISO
    .map((iso) => countries.find((country) => country.iso === iso))
    .filter((country): country is T => Boolean(country));
  const rest = countries
    .filter((country) => !(POPULAR_ISO as readonly string[]).includes(country.iso))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return [...ordered, ...rest].slice(0, EXPLORE_POPULAR_LIMIT);
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-cardon-gray">{label}</dt>
      <dd className="mt-0.5 font-semibold leading-tight text-cardon-navy">{value}</dd>
    </div>
  );
}

function ExploreDestinations({
  countries,
  offers,
}: {
  countries: ReturnType<typeof countriesFromOffers>;
  offers: EsimPreviewOffer[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'popular' | EsimRegion>('popular');
  const [data, setData] = useState('');
  const [days, setDays] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const dataOptions = [...new Set(offers.map((offer) => offer.dataLabel))];
  const dayOptions = [...new Set(offers.map((offer) => offer.durationLabel))];
  const folded = foldEsimText(q.trim());
  const matched = countries.flatMap((country) => {
    if (tab !== 'popular' && country.region !== tab) return [];
    const rows = offers.filter((offer) => {
      if (offer.countryIso !== country.iso) return false;
      if (data && offer.dataLabel !== data) return false;
      if (days && offer.durationLabel !== days) return false;
      if (type && offer.groupLabel !== type) return false;
      return true;
    });
    if (rows.length === 0) return [];
    if (folded && !foldEsimText(`${country.name} ${country.iso}`).includes(folded)) return [];
    const fromPrice = Math.min(...rows.map((offer) => offer.sellPriceVnd));
    return [{ ...country, fromPrice }];
  });
  const shown = tab === 'popular' && !folded && !data && !days && !type
    ? limitPopularExplore(matched)
    : matched.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const hiddenCount = matched.length - shown.length;

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Khám phá điểm đến</h2>
        <div className="esim-chip-rail sm:grid sm:grid-cols-3 sm:gap-2 sm:overflow-visible">
          <FilterSelect label="Dung lượng" value={data} onChange={setData} options={dataOptions} />
          <FilterSelect label="Thời hạn" value={days} onChange={setDays} options={dayOptions} />
          <FilterSelect label="Loại gói" value={type} onChange={setType} options={PLAN_GROUPS.map((item) => item.label)} values={PLAN_GROUPS.map((item) => item.id)} />
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <div className="esim-chip-rail">
          <FilterChip active={tab === 'popular'} onClick={() => setTab('popular')} label="Phổ biến" />
          {ESIM_REGIONS.map((item) => (
            <FilterChip key={item.id} active={tab === item.id} onClick={() => setTab(item.id)} label={item.label} />
          ))}
        </div>
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = q.trim();
            router.push(next ? `/esim/diem-den?q=${encodeURIComponent(next)}` : '/esim/diem-den');
          }}
        >
          <label className="sr-only" htmlFor="esim-explore-search">Tìm quốc gia</label>
          <input
            id="esim-explore-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Tìm quốc gia..."
            className="h-10 min-w-0 flex-1 rounded-xl border border-cardon-border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cardon-blue"
          />
          <button type="button" onClick={() => router.push('/esim/diem-den')} className="h-10 shrink-0 rounded-xl border border-cardon-border bg-white px-3 text-xs font-bold text-cardon-navy">
            A–Z
          </button>
        </form>
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-cardon-border bg-white p-4 text-sm text-cardon-gray">
          Chưa có điểm đến khớp bộ lọc.
        </p>
      ) : (
        <>
          <ul className="esim-slide esim-slide-2col mt-4 max-sm:flex sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible lg:grid-cols-5">
            {shown.map((country) => (
              <li key={country.iso}>
                <Link
                  href={countryPlansHref(country.iso)}
                  className="flex h-full items-center gap-2 rounded-xl border-2 border-gray-100 bg-white px-2.5 py-2.5 transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md sm:gap-2.5 sm:px-3"
                >
                  <EsimFlag iso={country.iso} className="h-8 w-8 sm:h-9 sm:w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold leading-tight text-cardon-navy sm:text-base md:text-lg">{country.name}</span>
                    <span className="mt-0.5 block truncate text-xs font-bold leading-tight text-cardon-blue sm:text-sm">Từ {formatVnd(country.fromPrice)}</span>
                  </span>
                  <span aria-hidden className="hidden text-cardon-gray sm:inline">›</span>
                </Link>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <div className="mt-3 text-right">
              <Link href="/esim/diem-den" className="text-sm font-semibold text-cardon-blue hover:underline">
                Xem tất cả {matched.length} điểm đến →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  values,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  values?: string[];
}) {
  return (
    <label className="block w-[7.5rem] shrink-0 text-[11px] font-semibold text-cardon-gray sm:min-w-[7.5rem] sm:w-auto">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-xl border border-cardon-border bg-white px-2 text-xs font-semibold text-cardon-navy"
      >
        <option value="">Tất cả</option>
        {options.map((option, index) => (
          <option key={option} value={values?.[index] ?? option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`h-9 rounded-full px-3 text-sm font-semibold transition-all duration-200 ${active ? 'bg-cardon-blue text-white' : 'border border-gray-100 bg-white text-cardon-navy hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md'}`}>
      {label}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-4">
      <p className="text-sm text-red-600">{message}</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-3 h-11 rounded-xl bg-cardon-blue px-4 text-sm font-semibold text-white">
        Thử lại
      </button>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 18v-2M9 18v-5M14 18V9M19 18V5" strokeLinecap="round" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14v2M14 18h2M18 18h2" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 16.5 4 20l3.5-1A8 8 0 1 0 5 16.5z" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  );
}

export function EsimPageSkeleton() {
  return (
    <div className="site-container space-y-4 py-6">
      <div className="h-64 animate-pulse rounded-3xl bg-white" />
      <div className="h-24 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
