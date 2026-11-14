'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { WEB_BUILD_VERSION } from '@/lib/build-version';
import {
  resolveBoCongThuongBadge,
  type CompanyInfo,
  type FooterColumn,
} from '@/lib/footer-config';
import { isOptimizableImageSrc, optimizerImageSrc, resolveAssetUrl } from '@/lib/assets';
import { SITE_NAME, cn } from '@/lib/utils';
import { stripLocalePrefix } from '@/lib/i18n/locale';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import {
  presentFooterLink,
  resolveThemeDescription,
  resolveThemeTitle,
} from '@/lib/i18n/theme-labels';
import type { ContactChannel } from '@/lib/contact-channels';

const TRUST_ITEMS: Array<{ icon: string; title: MessageKey; desc: MessageKey }> = [
  { icon: '⚡', title: 'trust.instant', desc: 'trust.instantBody' },
  { icon: '🔒', title: 'trust.pay', desc: 'trust.payBody' },
  { icon: '🎧', title: 'trust.support', desc: 'trust.supportBody' },
  { icon: '✓', title: 'trust.brand', desc: 'trust.brandBody' },
];

const footerLinkClass =
  'inline-block text-white/70 transition hover:text-cardon-orange hover:underline hover:underline-offset-4';
const barLinkClass =
  'text-white/50 transition hover:text-white hover:underline hover:underline-offset-4';

function isExternalHref(href: string) {
  return /^(mailto:|tel:|https?:\/\/)/i.test(href);
}

function FooterHref({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function isAboutCardonColumn(col: FooterColumn): boolean {
  const title = `${col.title ?? ''} ${col.titleEn ?? ''}`.toLowerCase();
  return title.includes('về cardon') || title.includes('ve cardon') || title.includes('about cardon');
}

function FooterColumnLinks({
  col,
  companyInfo,
  showBoCongThuong,
}: {
  col: FooterColumn;
  companyInfo?: CompanyInfo;
  showBoCongThuong?: boolean;
}) {
  const { locale } = useLocale();
  const title = resolveThemeTitle(locale, col);
  const description = resolveThemeDescription(locale, col.description, col.descriptionEn);
  return (
    <div className="min-w-0">
      <p className="mb-3 text-sm font-semibold text-white">{title}</p>
      {description ? <p className="mb-3 text-sm leading-relaxed text-white/70">{description}</p> : null}
      <ul className="space-y-2.5 text-sm">
        {col.links.map((link) => {
          const label = presentFooterLink(locale, link);
          return (
            <li key={`${col.title}-${link.href}-${link.label}`} className="min-w-0">
              <FooterHref href={link.href} className={cn(footerLinkClass, 'break-words')}>
                {label}
              </FooterHref>
            </li>
          );
        })}
      </ul>
      {showBoCongThuong && companyInfo ? (
        <BoCongThuongBadge company={companyInfo} className="mt-5" />
      ) : null}
    </div>
  );
}

function BrandColumn({
  col,
  logoSrc,
}: {
  col: FooterColumn;
  logoSrc?: string | null;
}) {
  const { locale } = useLocale();
  const description = resolveThemeDescription(locale, col.description, col.descriptionEn);
  return (
    <div className="min-w-0">
      {logoSrc ? (
        <Link
          href="/"
          className="relative mb-4 inline-block h-8 w-[min(180px,48vw)] sm:h-9 sm:w-[200px]"
        >
          {(() => {
            const optimized = optimizerImageSrc(logoSrc) ?? logoSrc;
            if (isOptimizableImageSrc(optimized)) {
              return (
                <Image
                  src={optimized}
                  alt="CardOn.vn"
                  fill
                  sizes="(max-width: 640px) 180px, 200px"
                  quality={60}
                  className="object-contain object-left"
                />
              );
            }
            return (
              // eslint-disable-next-line @next/next/no-img-element -- remote non-optimizer logo
              <img
                src={logoSrc}
                alt="CardOn.vn"
                width={200}
                height={36}
                className="h-full w-full object-contain object-left"
              />
            );
          })()}
        </Link>
      ) : (
        <p className="mb-3 text-lg font-semibold text-white">{SITE_NAME}</p>
      )}
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-white/70">{description}</p>
      ) : null}
      <ul className="mt-4 max-w-md space-y-2.5 text-sm leading-relaxed text-white/70">
        {col.links.map((link) => {
          const label = presentFooterLink(locale, link);
          return (
            <li key={`${col.title}-${link.href}-${link.label}`} className="min-w-0">
              <FooterHref href={link.href} className={cn(footerLinkClass, 'break-words')}>
                {label}
              </FooterHref>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BoCongThuongBadge({
  company,
  className,
}: {
  company: CompanyInfo;
  className?: string;
}) {
  const { locale } = useLocale();
  const badge = resolveBoCongThuongBadge(company, locale);
  if (!badge) return null;

  return (
    <a
      href={badge.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('block w-fit max-w-full', className)}
      aria-label={badge.alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- CMS PNG; keep native pixels (no CSS scale/crop blur) */}
      <img
        src={badge.imageUrl}
        alt={badge.alt}
        width={230}
        height={86}
        decoding="async"
        className="block h-auto w-auto max-w-full"
      />
    </a>
  );
}

function FooterAccordions({
  columns,
  companyInfo,
}: {
  columns: FooterColumn[];
  companyInfo: CompanyInfo;
}) {
  const { locale } = useLocale();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="border-t border-white/10 lg:hidden">
      {columns.map((col) => {
        const title = resolveThemeTitle(locale, col);
        const key = `${col.title}-${title}`;
        const isOpen = open === key;
        const showBadge = isAboutCardonColumn(col);
        return (
          <div key={key} className="border-b border-white/10">
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-sm font-semibold text-white"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : key)}
            >
              {title}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={cn(
                  'shrink-0 text-white/50 transition-transform duration-200',
                  isOpen ? 'rotate-180' : '',
                )}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen ? (
              <div className="pb-4">
                <ul className="space-y-2.5 text-sm">
                  {col.links.map((link) => {
                    const label = presentFooterLink(locale, link);
                    return (
                      <li key={`${col.title}-${link.href}-${link.label}`}>
                        <FooterHref href={link.href} className={footerLinkClass}>
                          {label}
                        </FooterHref>
                      </li>
                    );
                  })}
                </ul>
                {showBadge ? <BoCongThuongBadge company={companyInfo} className="mt-5" /> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FooterBottomBar({
  copyrightName,
  companyInfo,
  contactChannels,
}: {
  copyrightName: string;
  companyInfo: CompanyInfo;
  contactChannels: ContactChannel[];
}) {
  const t = useT();
  const email =
    companyInfo.email?.trim() ||
    contactChannels.find((c) => c.key === 'email' && c.enabled)?.value?.trim() ||
    '';
  const fanpage = contactChannels.find((c) => c.key === 'fanpage' && c.enabled);
  const zalo = contactChannels.find((c) => c.key === 'zalo' && c.enabled);

  return (
    <div className="border-t border-white/10">
      <div className="site-container flex flex-col gap-3 py-3.5 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-6">
        <span className="shrink-0 text-xs leading-none text-white/50">
          © {new Date().getFullYear()} {copyrightName}. {t('footer.rights')}
        </span>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:justify-end">
          <nav
            aria-label="Liên hệ nhanh"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5"
          >
            {email ? (
              <a href={`mailto:${email}`} className={barLinkClass}>
                {email}
              </a>
            ) : null}
            {email ? (
              <span className="text-white/25" aria-hidden>
                ·
              </span>
            ) : null}
            <Link href="/tro-giup" className={barLinkClass}>
              {t('footer.support')}
            </Link>
            <span className="text-white/25" aria-hidden>
              ·
            </span>
            <Link href="/lien-he" className={barLinkClass}>
              {t('nav.contact')}
            </Link>
          </nav>

          {(fanpage?.href || zalo?.href) && (
            <div className="flex items-center gap-2" aria-label="Mạng xã hội">
              {fanpage?.href ? (
                <a
                  href={fanpage.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-cardon-orange hover:bg-cardon-orange/15 hover:text-cardon-orange"
                  aria-label="Facebook"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z" />
                  </svg>
                </a>
              ) : null}
              {zalo?.href ? (
                <a
                  href={zalo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-[10px] font-bold text-white transition hover:border-cardon-orange hover:bg-cardon-orange/15 hover:text-cardon-orange"
                  aria-label="Zalo"
                >
                  Zalo
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Footer() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useLocale();
  const { footerColumns, companyInfo, logoDesktop, contactChannels } = useThemeSettings();
  const home = stripLocalePrefix(pathname || '/').pathname === '/';
  const homeLogo = home ? resolveAssetUrl(logoDesktop) : null;
  const copyrightName =
    locale === 'en' && companyInfo.companyNameEn?.trim()
      ? companyInfo.companyNameEn.trim()
      : companyInfo.companyName?.trim() || SITE_NAME;

  const brandColumn = footerColumns[0];
  const linkColumns = footerColumns.slice(1);
  const aboutLinkIndex = linkColumns.findIndex(isAboutCardonColumn);
  const boCongThuongColumnIndex = aboutLinkIndex >= 0 ? aboutLinkIndex : 0;

  useEffect(() => {
    console.log(`WEB_BUILD_VERSION=${WEB_BUILD_VERSION}`);
  }, []);

  return (
    <footer className="mt-auto border-t border-cardon-border bg-cardon-navy pb-20 text-white md:pb-0">
      {home ? null : (
        <div className="site-container grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
                {item.icon}
              </span>
              <div>
                <p className="font-semibold">{t(item.title)}</p>
                <p className="mt-0.5 text-sm text-white/70">{t(item.desc)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-white/10 bg-[#152d6b]">
        <div className="site-container py-10 lg:py-12">
          {/* Mobile: brand + Keyon-style accordion */}
          <div className="lg:hidden">
            {brandColumn ? (
              <div className="mb-8">
                <BrandColumn col={brandColumn} logoSrc={homeLogo} />
              </div>
            ) : null}
            <FooterAccordions columns={linkColumns} companyInfo={companyInfo} />
          </div>

          {/* Desktop: multi-column grid */}
          <div
            className={cn(
              'footer-links hidden items-start gap-x-10 gap-y-8 lg:grid',
              linkColumns.length >= 3
                ? 'lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.8fr)_minmax(0,1.05fr)_minmax(0,0.9fr)]'
                : linkColumns.length === 2
                  ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]'
                  : 'lg:grid-cols-2',
            )}
          >
            {brandColumn ? <BrandColumn col={brandColumn} logoSrc={homeLogo} /> : null}
            {linkColumns.map((col, index) => (
              <div key={`${col.title}-${index}`} className="min-w-0">
                <FooterColumnLinks
                  col={col}
                  companyInfo={companyInfo}
                  showBoCongThuong={index === boCongThuongColumnIndex}
                />
              </div>
            ))}
          </div>
        </div>

        <FooterBottomBar
          copyrightName={copyrightName}
          companyInfo={companyInfo}
          contactChannels={contactChannels}
        />
      </div>
    </footer>
  );
}
