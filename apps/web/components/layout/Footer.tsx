'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { WEB_BUILD_VERSION } from '@/lib/build-version';
import {
  resolveBoCongThuongBadge,
  type CompanyInfo,
  type FooterColumn,
} from '@/lib/footer-config';
import { resolveAssetUrl } from '@/lib/assets';
import { backgroundLayer } from '@/lib/home-backgrounds';
import { SITE_NAME } from '@/lib/utils';
import { stripLocalePrefix } from '@/lib/i18n/locale';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import {
  presentFooterLink,
  resolveThemeDescription,
  resolveThemeTitle,
} from '@/lib/i18n/theme-labels';

const TRUST_ITEMS: Array<{ icon: string; title: MessageKey; desc: MessageKey }> = [
  { icon: '⚡', title: 'trust.instant', desc: 'trust.instantBody' },
  { icon: '🔒', title: 'trust.pay', desc: 'trust.payBody' },
  { icon: '🎧', title: 'trust.support', desc: 'trust.supportBody' },
  { icon: '✓', title: 'trust.brand', desc: 'trust.brandBody' },
];

function FooterColumnLinks({ col }: { col: FooterColumn }) {
  const { locale } = useLocale();
  const title = resolveThemeTitle(locale, col);
  const description = resolveThemeDescription(locale, col.description, col.descriptionEn);
  return (
    <div className="min-w-0">
      <p className="font-semibold text-white">{title}</p>
      {description ? <p className="mt-2 text-sm text-white/70">{description}</p> : null}
      <ul className="mt-3 space-y-2 text-sm text-white/75">
        {col.links.map((link) => {
          const label = presentFooterLink(locale, link);
          return (
          <li key={`${col.title}-${link.href}-${link.label}`}>
            {link.href.startsWith('mailto:') || link.href.startsWith('tel:') ? (
              <a href={link.href} className="hover:text-cardon-orange">
                {label}
              </a>
            ) : (
              <Link href={link.href} className="hover:text-cardon-orange">
                {label}
              </Link>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function BoCongThuongBadge({ company }: { company: CompanyInfo }) {
  const { locale } = useLocale();
  const badge = resolveBoCongThuongBadge(company, locale);
  if (!badge) return null;

  return (
    <a
      href={badge.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-block max-w-[148px] opacity-90 transition hover:opacity-100"
      aria-label={badge.alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- CMS-uploaded badge URL */}
      <img
        src={badge.imageUrl}
        alt={badge.alt}
        className="mt-1 h-auto w-full object-contain object-left"
      />
    </a>
  );
}

function FooterLinkGrid({
  columns,
  companyInfo,
  className,
  logoSrc,
}: {
  columns: FooterColumn[];
  companyInfo: CompanyInfo;
  className: string;
  logoSrc?: string | null;
}) {
  return (
    <div className={className}>
      {columns.map((col, index) => (
        <div key={`${className}-${col.title}-${index}`} className="min-w-0">
          {logoSrc && index === 0 ? (
            <Link href="/" className="mb-4 inline-flex max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- same CMS logo as the header */}
              <img src={logoSrc} alt="CardOn.vn" className="h-10 max-h-10 w-auto max-w-[200px] object-contain object-left" />
            </Link>
          ) : null}
          <FooterColumnLinks col={col} />
          {index === columns.length - 1 ? <BoCongThuongBadge company={companyInfo} /> : null}
        </div>
      ))}
    </div>
  );
}

export function Footer() {
  const pathname = usePathname();
  const t = useT();
  const { footerColumns, companyInfo, logoDesktop, homeBackgrounds } = useThemeSettings();
  const home = stripLocalePrefix(pathname || '/').pathname === '/';
  const homeLogo = home ? resolveAssetUrl(logoDesktop) : null;
  const footerArt = home ? backgroundLayer(homeBackgrounds.siteFooterBg, 'center bottom', '100% auto') : undefined;

  useEffect(() => {
    console.log(`WEB_BUILD_VERSION=${WEB_BUILD_VERSION}`);
  }, []);

  return (
    <footer
      className={`mt-auto border-t border-cardon-border pb-20 text-white md:pb-0 ${home ? 'bg-[#021a4a]' : 'bg-cardon-navy'}`}
      style={footerArt}
    >
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

      <div className={`border-t border-white/10 ${home ? 'bg-transparent' : 'bg-[#152d6b]'}`}>
        <div className="site-container py-10">
          <FooterLinkGrid
            columns={footerColumns}
            companyInfo={companyInfo}
            logoSrc={homeLogo}
            className="footer-links grid grid-cols-2 items-start gap-x-8 gap-y-8 md:hidden"
          />
          <FooterLinkGrid
            columns={footerColumns}
            companyInfo={companyInfo}
            logoSrc={homeLogo}
            className="footer-links hidden grid-cols-2 items-start gap-x-10 gap-y-8 md:grid lg:grid-cols-4"
          />
        </div>

        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
          © {new Date().getFullYear()} {companyInfo.companyName || SITE_NAME}. {t('footer.rights')}
        </div>
      </div>
    </footer>
  );
}
