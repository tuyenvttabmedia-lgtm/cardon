'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { EsimFlag } from '@/components/esim/EsimFlag';
import { EsimInstallGuide } from '@/components/esim/EsimInstallGuide';
import { EsimSalesOffNotice } from '@/components/esim/EsimSalesOffNotice';
import type { EsimPreviewOffer } from '@/lib/esim-offers';
import {
  PLAN_GROUPS,
  countriesFromOffers,
  dataAmountMb,
  directoryHref,
  durationDays,
} from '@/lib/esim-browse';
import { formatVnd } from '@/lib/utils';

export function EsimCountryPlans({
  iso,
  offers,
  salesOpen = false,
}: {
  iso: string;
  offers: EsimPreviewOffer[];
  salesOpen?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const country = countriesFromOffers(offers).find((item) => item.iso === iso.toUpperCase()) ?? null;
  const plans = offers.filter((offer) => offer.countryIso.toUpperCase() === iso.toUpperCase());
  const data = searchParams.get('data') ?? '';
  const days = searchParams.get('days') ?? '';
  const span = searchParams.get('span') ?? '';
  const type = searchParams.get('type') ?? '';
  const net = searchParams.get('net') ?? '';
  const speed = searchParams.get('speed') ?? '';
  const sort = searchParams.get('sort') ?? 'price';
  const from = searchParams.get('from') ?? '';
  const listHref = directoryHref(from);

  const dataOptions = unique(plans.map((offer) => offer.dataLabel)).sort((a, b) => dataAmountMb(a) - dataAmountMb(b));
  const dayOptions = unique(plans.map((offer) => offer.durationLabel)).sort((a, b) => durationDays(a) - durationDays(b));
  const typeOptions = PLAN_GROUPS.filter((group) => plans.some((offer) => offer.groupLabel === group.id));

  const shown = useMemo(() => {
    const rows = plans.filter((offer) => {
      if (data && offer.dataLabel !== data) return false;
      if (days && offer.durationLabel !== days) return false;
      if (span && !matchesSpan(offer, span)) return false;
      if (type && offer.groupLabel !== type) return false;
      if (net && !offer.operators.includes(net)) return false;
      if (speed && offer.speedLabel !== speed) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === 'data') return dataAmountMb(a.dataLabel) - dataAmountMb(b.dataLabel);
      if (sort === 'days') return durationDays(a.durationLabel) - durationDays(b.durationLabel);
      return a.sellPriceVnd - b.sellPriceVnd;
    });
    return rows;
  }, [data, days, net, plans, sort, span, speed, type]);

  const activeGroup = PLAN_GROUPS.find((group) => group.id === type);
  const plansPath = `${windowPath(iso, searchParams.toString())}`;

  function replaceParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const next = params.toString();
    router.replace(next ? `/esim/quoc-gia/${iso}?${next}` : `/esim/quoc-gia/${iso}`);
  }

  if (!country) {
    return (
      <div className="site-container py-8">
        <p className="text-sm text-cardon-gray">Chưa có gói cho quốc gia này.</p>
        <Link href={listHref} className="mt-3 inline-flex font-semibold text-cardon-blue">Quay lại danh sách</Link>
      </div>
    );
  }

  const speedChip = country.speedLabel ? `Tốc độ ${country.speedLabel}` : 'Tốc độ theo gói';
  const networkText = country.operators.join(', ') || 'Theo gói';

  return (
    <div className="pb-10">
      <div className="site-container pt-4">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-cardon-gray">
          <Link href="/" className="hover:text-cardon-blue">Trang chủ</Link>
          <span aria-hidden>›</span>
          <Link href="/esim" className="hover:text-cardon-blue">eSIM du lịch</Link>
          <span aria-hidden>›</span>
          <span className="font-semibold text-cardon-navy">{country.name}</span>
        </nav>
        {salesOpen ? null : <div className="mt-3"><EsimSalesOffNotice compact /></div>}

        <section className="relative mt-3 min-h-[180px] overflow-hidden rounded-2xl bg-[#12345c] text-white sm:rounded-3xl md:min-h-[250px]">
          {country.photo ? (
            <Image src={country.photo} alt={`eSIM ${country.name}`} fill priority className="object-cover object-[center_30%]" sizes="1200px" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-[#071426]/80 via-[#071426]/45 to-[#071426]/10" />
          <div className="relative z-10 flex min-h-[180px] flex-col justify-center px-4 py-5 md:min-h-[250px] md:px-8 md:py-6">
            <div className="flex items-center gap-3 md:gap-4">
              <span className="rounded-xl bg-white p-1 shadow-lg sm:rounded-2xl sm:p-1.5">
                <EsimFlag iso={country.iso} className="h-11 w-11 !ring-0 sm:h-14 sm:w-14 md:h-16 md:w-16" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">eSIM {country.name}</h1>
                <p className="mt-1 text-xs text-white/90 sm:text-sm md:text-base">Kết nối nhanh, ổn định trong suốt chuyến đi.</p>
              </div>
            </div>
            <ul className="esim-chip-rail mt-4 md:mt-5 md:flex-wrap md:overflow-visible">
              <HeroChip icon={<SignalIcon />} label="Phủ sóng toàn quốc" />
              <HeroChip icon={<BoltIcon />} label={speedChip} />
              <HeroChip icon={<QrIcon />} label="Kích hoạt nhanh" />
              <HeroChip icon={<ChatIcon />} label="Hỗ trợ 24/7" />
            </ul>
          </div>
        </section>

        <div className="esim-chip-rail mt-4">
          <Tab href="#goi" active>Gói dữ liệu</Tab>
          <Tab href="#thong-tin">Thông tin điểm đến</Tab>
          <Tab href="#huong-dan">Hướng dẫn sử dụng</Tab>
          <Tab href="#faq">Câu hỏi thường gặp</Tab>
        </div>

        <div className="mt-3 hidden items-end gap-3 rounded-2xl border border-[#e6edf5] bg-white p-3 shadow-sm md:grid md:grid-cols-4">
          <Select label="Dung lượng" value={data} onChange={(value) => replaceParams({ data: value })} options={dataOptions} />
          <Select label="Thời hạn" value={days} onChange={(value) => replaceParams({ days: value, span: '' })} options={dayOptions} />
          <Select label="Loại gói" value={type} onChange={(value) => replaceParams({ type: value })} options={typeOptions.map((item) => item.label)} values={typeOptions.map((item) => item.id)} />
          <Select label="Nhà mạng" value={net} onChange={(value) => replaceParams({ net: value })} options={country.operators} />
        </div>
        <button type="button" onClick={() => setFiltersOpen(true)} className="mt-3 h-11 rounded-full border border-cardon-border bg-white px-4 text-sm font-semibold md:hidden">
          Bộ lọc
        </button>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="esim-chip-rail min-w-0 flex-1">
            {DAY_SPANS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => replaceParams({ span: span === item.id ? '' : item.id, days: '' })}
                className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-all duration-200 ${span === item.id ? 'bg-cardon-blue text-white' : 'border border-gray-100 bg-white text-cardon-navy hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="hidden min-w-[180px] md:block">
            <Select label="Sắp xếp" value={sort} onChange={(value) => replaceParams({ sort: value === 'price' ? '' : value })} options={['Giá tăng dần', 'Dung lượng', 'Thời hạn']} values={['price', 'data', 'days']} allLabel="" />
          </div>
        </div>
        {activeGroup ? <p className="mt-3 text-sm text-cardon-gray">{activeGroup.note}</p> : null}

        <h2 id="goi" className="mt-5 scroll-mt-24 text-xl font-bold text-cardon-navy md:text-2xl">{shown.length} gói eSIM {country.name}</h2>
        {shown.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-cardon-border bg-white p-4 text-sm text-cardon-gray">Không có gói khớp bộ lọc.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
            {shown.map((offer) => (
              <li key={offer.id} className="flex flex-col rounded-xl border-2 border-gray-100 bg-white p-3 transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md sm:p-4">
                <span className="w-fit rounded-full bg-[#e7f0ff] px-2 py-0.5 text-[11px] font-semibold text-cardon-blue">eSIM</span>
                <p className="mt-2 text-sm font-bold leading-tight text-cardon-navy sm:mt-3 sm:text-base md:text-lg">{offer.dataLabel} / {offer.durationLabel}</p>
                <p className="mt-2 flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-500 sm:gap-1.5 sm:text-xs">
                  <span className="text-cardon-blue"><SignalIcon /></span>
                  <span className="truncate">{offer.speedLabel || 'Theo gói'}</span>
                </p>
                <p className="mt-2 text-sm font-bold leading-tight text-cardon-blue sm:mt-3 sm:text-base md:text-lg">{formatVnd(offer.sellPriceVnd)}</p>
                <Link
                  href={`/esim/${offer.id}?back=${encodeURIComponent(plansPath)}`}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-cardon-blue text-xs font-semibold text-white transition-colors duration-200 hover:bg-cardon-navy sm:mt-4 sm:h-11 sm:text-sm"
                >
                  {salesOpen ? 'Chọn gói' : 'Xem gói'}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <section id="thong-tin" className="mt-8 scroll-mt-24 rounded-2xl border border-[#e6edf5] bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Thông tin về eSIM {country.name}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
            <Info icon={<SignalIcon />} title="Vùng phủ sóng" text={country.iso === 'ASIA' || country.iso === 'EUROPE' ? 'Nhiều quốc gia trong khu vực' : 'Toàn quốc'} />
            <Info icon={<AntennaIcon />} title="Nhà mạng" text={networkText} />
            <Info icon={<BoltIcon />} title="Loại mạng" text={country.speedLabel || 'Theo gói'} />
            <Info icon={<QrIcon />} title="Kích hoạt" text={plans[0]?.activationLabel || 'Nhận mã cài'} />
            <Info icon={<ChatIcon />} title="Hỗ trợ" text="08:00–22:00" />
          </div>
        </section>
        <section id="huong-dan" className="mt-4 scroll-mt-24">
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Hướng dẫn sử dụng</h2>
          <p className="mt-1 text-sm text-cardon-gray">
            Cài trên iPhone hoặc Android. Thông tin APN, kích hoạt và nhà mạng đi kèm từng gói Keyon.
          </p>
          <div className="mt-4">
            <EsimInstallGuide offer={plans[0]} country={country.name} />
          </div>
          <Link href={listHref} className="mt-3 inline-flex font-semibold text-cardon-blue">Quay lại danh sách điểm đến</Link>
        </section>
        <section id="faq" className="mt-4 scroll-mt-24 rounded-2xl border border-[#e6edf5] bg-white p-5 text-sm leading-relaxed text-cardon-gray">
          <h2 className="text-xl font-bold text-cardon-navy md:text-2xl">Câu hỏi thường gặp</h2>
          <p className="mt-3">Máy cần hỗ trợ eSIM. Nên cài khi còn WiFi, trước giờ bay. Mã cài nằm trong tài khoản sau khi thanh toán.</p>
          <Link href="/tro-giup" className="mt-3 inline-flex font-semibold text-cardon-blue">Xem thêm câu hỏi</Link>
        </section>
      </div>

      {filtersOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={() => setFiltersOpen(false)}>
          <div className="max-h-[85vh] w-full overflow-auto rounded-t-3xl bg-white p-4 pb-28" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-cardon-navy">Bộ lọc</h2>
            <div className="mt-3 space-y-3">
              <Select label="Dung lượng" value={data} onChange={(value) => replaceParams({ data: value })} options={dataOptions} />
              <Select label="Thời hạn" value={days} onChange={(value) => replaceParams({ days: value, span: '' })} options={dayOptions} />
              <Select label="Loại gói" value={type} onChange={(value) => replaceParams({ type: value })} options={typeOptions.map((item) => item.label)} values={typeOptions.map((item) => item.id)} />
              <Select label="Nhà mạng" value={net} onChange={(value) => replaceParams({ net: value })} options={country.operators} />
              <Select label="Sắp xếp" value={sort} onChange={(value) => replaceParams({ sort: value === 'price' ? '' : value })} options={['Giá tăng dần', 'Dung lượng', 'Thời hạn']} values={['price', 'data', 'days']} allLabel="" />
            </div>
            <button type="button" onClick={() => setFiltersOpen(false)} className="mt-5 h-12 w-full rounded-xl bg-cardon-blue text-sm font-semibold text-white">Áp dụng</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function windowPath(iso: string, query: string): string {
  return query ? `/esim/quoc-gia/${iso}?${query}` : `/esim/quoc-gia/${iso}`;
}

const DAY_SPANS = [
  { id: '1-3', label: '1 – 3 ngày' },
  { id: '5-7', label: '5 – 7 ngày' },
  { id: '10-15', label: '10 – 15 ngày' },
  { id: 'unlimited', label: 'Không giới hạn' },
] as const;

function matchesSpan(offer: EsimPreviewOffer, span: string): boolean {
  if (span === 'unlimited') return offer.dataLabel.startsWith('Không');
  const days = durationDays(offer.durationLabel);
  if (span === '1-3') return days >= 1 && days <= 3;
  if (span === '5-7') return days >= 5 && days <= 7;
  if (span === '10-15') return days >= 10 && days <= 15;
  return true;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function Tab({ href, active = false, children }: { href: string; active?: boolean; children: string }) {
  return (
    <a
      href={href}
      className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${active ? 'bg-cardon-blue text-white' : 'border border-gray-100 bg-white text-cardon-navy hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md'}`}
    >
      {children}
    </a>
  );
}

function HeroChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
      <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      {label}
    </li>
  );
}

function Info({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7f0ff] text-cardon-blue [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-cardon-gray">{title}</p>
        <p className="mt-0.5 font-bold text-cardon-navy">{text}</p>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  values,
  allLabel = 'Tất cả',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  values?: string[];
  allLabel?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-cardon-gray">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-cardon-border bg-white px-3 text-sm font-semibold text-cardon-navy"
      >
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((option, index) => (
          <option key={option} value={values?.[index] ?? option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 18v-2M9 18v-5M14 18V9M19 18V5" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M13 3L5 14h7l-1 7 8-11h-7l1-7z" strokeLinejoin="round" />
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
      <path d="M5 16.5A7.5 7.5 0 1 1 8 18l-3.5 1.5L5 16.5z" strokeLinejoin="round" />
    </svg>
  );
}

function AntennaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 20v-7M8 9a4 4 0 0 1 8 0M5 6a7 7 0 0 1 14 0" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}

