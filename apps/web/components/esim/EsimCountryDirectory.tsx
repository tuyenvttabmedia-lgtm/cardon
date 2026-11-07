'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EsimFlag } from '@/components/esim/EsimFlag';
import { EsimSalesOffNotice } from '@/components/esim/EsimSalesOffNotice';
import { useT } from '@/components/i18n/LocaleProvider';
import { EsimShelfPrice } from '@/components/esim/EsimShelfPrice';
import type { EsimOfferResult } from '@/lib/esim-offers';
import {
  DIRECTORY_PAGE_SIZE,
  ESIM_REGIONS,
  type EsimRegion,
  countriesFromOffers,
  countryPlansHref,
  foldEsimText,
} from '@/lib/esim-browse';
import type { MessageKey } from '@/lib/i18n/messages';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function EsimCountryDirectory({ result }: { result: EsimOfferResult }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const region = (searchParams.get('region') ?? '') as EsimRegion | '';
  const letter = (searchParams.get('letter') ?? '').toUpperCase();
  const sort = searchParams.get('sort') ?? 'name';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [draft, setDraft] = useState(q);
  useEffect(() => {
    setDraft(q);
  }, [q]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const countries = useMemo(() => (result.ok ? countriesFromOffers(result.offers) : []), [result]);

  const filtered = useMemo(() => {
    const folded = foldEsimText(q.trim());
    const rows = countries.filter((country) => {
      if (region && country.region !== region) return false;
      if (letter && foldEsimText(country.name).charAt(0).toUpperCase() !== letter) return false;
      if (!folded) return true;
      return foldEsimText(`${country.name} ${country.iso}`).includes(folded);
    });
    rows.sort((a, b) => {
      if (sort === 'price-asc') return a.fromPrice - b.fromPrice;
      if (sort === 'price-desc') return b.fromPrice - a.fromPrice;
      return a.name.localeCompare(b.name, 'vi');
    });
    return rows;
  }, [countries, letter, q, region, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * DIRECTORY_PAGE_SIZE, currentPage * DIRECTORY_PAGE_SIZE);
  const listQuery = searchParams.toString();

  function replaceParams(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!('page' in patch)) params.delete('page');
    const next = params.toString();
    router.replace(next ? `/esim/diem-den?${next}` : '/esim/diem-den');
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    replaceParams({ q: draft.trim() });
  }

  return (
    <div className="site-container py-6 md:py-8">
      <p className="text-sm text-cardon-gray">
        <Link href="/esim" className="hover:text-cardon-blue">{t('nav.esim')}</Link>
        <span aria-hidden> / </span>
        <span className="text-cardon-navy">{t('esim.dest')}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-cardon-navy md:text-2xl">{t('esim.directory')}</h1>
          <p className="mt-1 text-sm text-cardon-gray">{t('esim.directoryBody')}</p>
        </div>
        <p className="text-sm font-semibold text-cardon-navy">{filtered.length} {t('esim.destinations')}</p>
      </div>
      {result.ok && !result.salesOpen ? <div className="mt-4"><EsimSalesOffNotice /></div> : null}

      <form onSubmit={onSearch} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="esim-country-search">{t('esim.findCountry')}</label>
        <input
          id="esim-country-search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('esim.findCountryPh')}
          className="h-11 min-w-0 flex-1 rounded-full border border-cardon-border bg-white px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cardon-blue sm:h-12 sm:text-base"
        />
        <button type="submit" className="h-11 shrink-0 rounded-full bg-cardon-blue px-4 text-sm font-semibold text-white sm:h-12 sm:px-5">
          {t('nav.search')}
        </button>
      </form>

      <div className="mt-4 hidden flex-wrap gap-2 md:flex">
        <FilterChip active={!region} onClick={() => replaceParams({ region: '' })} label={t('common.all')} />
        {ESIM_REGIONS.map((item) => (
          <FilterChip key={item.id} active={region === item.id} onClick={() => replaceParams({ region: item.id })} label={t(`esim.region.${item.id}` as MessageKey)} />
        ))}
      </div>

      <div className="mt-3 hidden flex-wrap gap-1 md:flex">
        <button type="button" onClick={() => replaceParams({ letter: '' })} className={`h-9 min-w-9 rounded-lg px-2 text-xs font-bold ${!letter ? 'bg-cardon-blue text-white' : 'text-cardon-navy hover:bg-[#e7f0ff]'}`}>{t('common.all')}</button>
        {LETTERS.map((item) => (
          <button key={item} type="button" onClick={() => replaceParams({ letter: item === letter ? '' : item })} className={`h-9 w-8 rounded-lg text-xs font-semibold ${letter === item ? 'bg-cardon-blue text-white' : 'text-cardon-gray hover:bg-[#e7f0ff]'}`}>
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setFiltersOpen(true)} className="h-11 rounded-full border border-cardon-border bg-white px-4 text-sm font-semibold text-cardon-navy md:hidden">
          {t('esim.filters')}
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-cardon-gray">
          {t('esim.sort')}
          <select
            value={sort}
            onChange={(event) => replaceParams({ sort: event.target.value === 'name' ? '' : event.target.value })}
            className="h-11 rounded-xl border border-cardon-border bg-white px-3 text-sm font-semibold text-cardon-navy"
          >
            <option value="name">{t('esim.nameAz')}</option>
            <option value="price-asc">{t('esim.priceLow')}</option>
            <option value="price-desc">{t('esim.priceHigh')}</option>
          </select>
        </label>
      </div>

      {!result.ok ? (
        <p className="mt-4 text-sm text-red-600">{result.error}</p>
      ) : visible.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-cardon-border bg-white p-4 text-sm text-cardon-gray">
          {t('esim.noFilter')}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {visible.map((country) => (
            <li key={country.iso}>
              <Link
                href={countryPlansHref(country.iso, listQuery)}
                className="flex h-full flex-col items-center gap-1.5 rounded-xl border-2 border-gray-100 bg-white px-1.5 py-2.5 text-center transition-all duration-200 hover:-translate-y-px hover:border-cardon-blue/40 hover:shadow-md sm:px-2 sm:py-3"
              >
                <EsimFlag iso={country.iso} className="h-11 w-11 text-xs sm:h-14 sm:w-14" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold leading-tight text-cardon-navy sm:text-xs">{country.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold leading-tight text-cardon-blue sm:text-[11px]">{t('esim.fromPrice')} <EsimShelfPrice sellPriceVnd={country.fromPrice} chargeCurrency={country.fromChargeCurrency} chargeAmount={country.fromChargeAmount} /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button type="button" disabled={currentPage <= 1} onClick={() => replaceParams({ page: String(currentPage - 1) })} className="h-10 rounded-lg border border-cardon-border px-3 text-sm disabled:opacity-40">{t('esim.prev')}</button>
          <span className="text-sm text-cardon-gray">{currentPage} / {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => replaceParams({ page: String(currentPage + 1) })} className="h-10 rounded-lg border border-cardon-border px-3 text-sm disabled:opacity-40">{t('esim.next')}</button>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:hidden" onClick={() => setFiltersOpen(false)}>
          <div className="max-h-[80vh] w-full overflow-auto rounded-t-3xl bg-white p-4 pb-28" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-cardon-navy">{t('esim.filters')}</h2>
            <p className="mt-3 text-sm font-semibold text-cardon-navy">{t('esim.region')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <FilterChip active={!region} onClick={() => replaceParams({ region: '' })} label={t('common.all')} />
              {ESIM_REGIONS.map((item) => (
                <FilterChip key={item.id} active={region === item.id} onClick={() => replaceParams({ region: item.id })} label={t(`esim.region.${item.id}` as MessageKey)} />
              ))}
            </div>
            <p className="mt-4 text-sm font-semibold text-cardon-navy">{t('esim.letter')}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {LETTERS.map((item) => (
                <button key={item} type="button" onClick={() => replaceParams({ letter: item === letter ? '' : item })} className={`h-9 w-8 rounded-lg text-xs font-semibold ${letter === item ? 'bg-cardon-blue text-white' : 'bg-[#f4f7fb] text-cardon-navy'}`}>
                  {item}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setFiltersOpen(false)} className="mt-5 h-12 w-full rounded-xl bg-cardon-blue text-sm font-semibold text-white">{t('esim.apply')}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`h-10 rounded-full px-4 text-sm font-semibold ${active ? 'bg-cardon-blue text-white' : 'border border-cardon-border bg-white text-cardon-navy'}`}>
      {label}
    </button>
  );
}
