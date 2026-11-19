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

function FooterColumnLinks({ col }: { col: FooterColumn }) {
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
    </div>
  );
}

function FooterBrandLogo({ logoSrc }: { logoSrc?: string | null }) {
  if (!logoSrc) {
    return <p className="text-lg font-semibold text-white">{SITE_NAME}</p>;
  }
  const optimized = optimizerImageSrc(logoSrc) ?? logoSrc;
  return (
    <Link
      href="/"
      className="relative inline-block h-8 w-[min(180px,48vw)] shrink-0 sm:h-9 sm:w-[200px]"
    >
      {isOptimizableImageSrc(optimized) ? (
        <Image
          src={optimized}
          alt="CardOn.vn"
          fill
          sizes="(max-width: 640px) 180px, 200px"
          quality={60}
          className="object-contain object-left"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- remote non-optimizer logo
        <img
          src={logoSrc}
          alt="CardOn.vn"
          width={200}
          height={36}
          className="h-full w-full object-contain object-left"
        />
      )}
    </Link>
  );
}

function BrandColumn({
  col,
  logoSrc,
  logoAccessory,
}: {
  col: FooterColumn;
  logoSrc?: string | null;
  /** Optional node rendered on the same row as the logo (mobile BCT badge). */
  logoAccessory?: ReactNode;
}) {
  const { locale } = useLocale();
  const description = resolveThemeDescription(locale, col.description, col.descriptionEn);
  return (
    <div className="min-w-0">
      <div
        className={cn(
          'mb-4',
          logoAccessory ? 'flex items-center justify-between gap-3' : undefined,
        )}
      >
        <FooterBrandLogo logoSrc={logoSrc} />
        {logoAccessory}
      </div>
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

/** CMS badge PNG is 230×86 with ~10px transparent left padding. */
const BCT_BADGE_NATIVE_W = 230;
const BCT_BADGE_NATIVE_H = 86;
const BCT_BADGE_CROP_LEFT = 10;
const BCT_BADGE_VISIBLE_W = BCT_BADGE_NATIVE_W - BCT_BADGE_CROP_LEFT;

function BoCongThuongBadge({
  company,
  className,
  variant = 'desktop',
}: {
  company: CompanyInfo;
  className?: string;
  /** desktop: fixed max width; mobile: match footer logo height (h-8). */
  variant?: 'desktop' | 'mobile';
}) {
  const { locale } = useLocale();
  const badge = resolveBoCongThuongBadge(company, locale);
  if (!badge) return null;

  return (
    <a
      href={badge.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        // Clip left PNG pad; size by one axis so aspect stays true (no stretch)
        'relative block overflow-hidden',
        variant === 'mobile'
          ? 'h-8 w-auto shrink-0 sm:h-9'
          : 'w-full max-w-[176px]',
        className,
      )}
      style={{ aspectRatio: `${BCT_BADGE_VISIBLE_W} / ${BCT_BADGE_NATIVE_H}` }}
      aria-label={badge.alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- CMS PNG; preserve native aspect */}
      <img
        src={badge.imageUrl}
        alt={badge.alt}
        width={BCT_BADGE_NATIVE_W}
        height={BCT_BADGE_NATIVE_H}
        decoding="async"
        className="absolute top-0 h-full w-auto max-w-none"
        style={{
          left: `${(-BCT_BADGE_CROP_LEFT / BCT_BADGE_VISIBLE_W) * 100}%`,
        }}
      />
    </a>
  );
}

function FooterAccordions({ columns }: { columns: FooterColumn[] }) {
  const { locale } = useLocale();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="border-t border-white/10 lg:hidden">
      {columns.map((col) => {
        const title = resolveThemeTitle(locale, col);
        const key = `${col.title}-${title}`;
        const isOpen = open === key;
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
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FooterSocialIcons({
  fanpageHref,
  zaloHref,
  telegramHref,
  className,
}: {
  fanpageHref?: string;
  zaloHref?: string;
  telegramHref?: string;
  className?: string;
}) {
  if (!fanpageHref && !zaloHref && !telegramHref) return null;
  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border transition';
  return (
    <div className={cn('flex items-center gap-2.5', className)} aria-label="Mạng xã hội">
      {fanpageHref ? (
        <a
          href={fanpageHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            iconBtn,
            'border-[#1877F2]/40 bg-[#1877F2]/15 text-[#1877F2] hover:bg-[#1877F2]/25',
          )}
          aria-label="Facebook"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z" />
          </svg>
        </a>
      ) : null}
      {zaloHref ? (
        <a
          href={zaloHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            iconBtn,
            'border-[#0068FF]/40 bg-[#0068FF]/15 text-[11px] font-bold text-[#0068FF] hover:bg-[#0068FF]/25',
          )}
          aria-label="Zalo"
        >
          Zalo
        </a>
      ) : null}
      {telegramHref ? (
        <a
          href={telegramHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            iconBtn,
            'border-[#229ED9]/40 bg-[#229ED9]/15 text-[#229ED9] hover:bg-[#229ED9]/25',
          )}
          aria-label="Telegram"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M11.9 2C6.4 2 2 6.4 2 11.9c0 5.5 4.4 9.9 9.9 9.9 5.5 0 9.9-4.4 9.9-9.9C21.8 6.4 17.4 2 11.9 2zm4.6 6.8-1.5 7.2c-.1.5-.4.6-.8.4l-2.3-1.7-1.1 1.1c-.1.1-.3.3-.5.3l.2-2.4 4.3-3.9c.2-.2 0-.3-.3-.1l-5.3 3.3-2.3-.7c-.5-.2-.5-.5.1-.7l8.9-3.4c.4-.2.8.1.6.6z" />
          </svg>
        </a>
      ) : null}
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
  const telegram = contactChannels.find((c) => c.key === 'telegram' && c.enabled && c.href?.trim());
  const social = (
    <FooterSocialIcons
      fanpageHref={fanpage?.href}
      zaloHref={zalo?.href}
      telegramHref={telegram?.href}
    />
  );

  return (
    <div className="border-t border-white/10">
      <div className="site-container flex flex-col gap-3 py-3.5 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        {/* Mobile: BCT + social */}
        <div className="flex items-center justify-start gap-3 lg:hidden">
          <BoCongThuongBadge company={companyInfo} variant="mobile" />
          {social}
        </div>

        {/* Desktop: BCT left (trust signal in bar, not under About) */}
        <BoCongThuongBadge
          company={companyInfo}
          variant="desktop"
          className="hidden w-auto max-w-[160px] shrink-0 lg:block"
        />

        <span className="min-w-0 text-xs leading-relaxed text-white/50 lg:justify-self-start">
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

          <div className="hidden lg:block">{social}</div>
        </div>
      </div>
    </div>
  );
}

export function Footer() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useLocale();
  const { footerColumns, companyInfo, contactChannels, logoFooter } = useThemeSettings();
  const home = stripLocalePrefix(pathname || '/').pathname === '/';
  const copyrightName =
    locale === 'en' && companyInfo.companyNameEn?.trim()
      ? companyInfo.companyNameEn.trim()
      : companyInfo.companyName?.trim() || SITE_NAME;

  const brandColumn = footerColumns[0];
  const linkColumns = footerColumns.slice(1);

  useEffect(() => {
    console.log(`WEB_BUILD_VERSION=${WEB_BUILD_VERSION}`);
  }, []);

  return (
    <footer className="mt-auto border-t border-cardon-border bg-[#0B0F0C] pb-20 text-white md:pb-0">
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

      <div className="border-t border-white/10 bg-[#111827]">
        <div className="site-container py-10 lg:py-12">
          {/* Mobile: brand + accordion (BCT + social live in FooterBottomBar) */}
          <div className="lg:hidden">
            {brandColumn ? (
              <div className="mb-8">
                <BrandColumn col={brandColumn} logoSrc={logoFooter} />
              </div>
            ) : null}
            <FooterAccordions columns={linkColumns} />
          </div>

          {/* Desktop: multi-column grid — link columns only (BCT in bottom bar) */}
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
            {brandColumn ? <BrandColumn col={brandColumn} logoSrc={logoFooter} /> : null}
            {linkColumns.map((col, index) => (
              <div key={`${col.title}-${index}`} className="min-w-0">
                <FooterColumnLinks col={col} />
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
