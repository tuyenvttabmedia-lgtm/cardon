'use client';

import { useEffect, useState } from 'react';
import { fetchThemeSettingsClient, type CmsThemeSettings } from '@/lib/cms-api';
import {
  buildFooterColumns,
  DEFAULT_FOOTER_LINK_COLUMNS,
  type CompanyInfo,
  type FooterColumn,
} from '@/lib/footer-config';
import { DEFAULT_CONTACT_CHANNELS, normalizeContactChannels } from '@/lib/contact-channels';
import { DEFAULT_MOBILE_NAV, type MobileNavItem } from '@/lib/mobile-nav.defaults';
import { resolveHomeBackgrounds } from '@/lib/home-backgrounds';
import { SYSTEM_HEADER_MENU } from '@/lib/i18n/theme-labels';

export const DEFAULT_HEADER_MENU = SYSTEM_HEADER_MENU;

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  companyName: 'CardOn.vn',
  taxCode: '',
  address: 'Hà Nội, Việt Nam',
  email: 'support@cardon.vn',
  workingHours: '',
  hotline: '0984877066',
  boCongThuongEnabled: false,
  boCongThuongImageUrl: '',
  boCongThuongLinkUrl: '',
  googleMapEnabled: false,
  googleMapEmbedUrl: '',
};

export { DEFAULT_FOOTER_LINK_COLUMNS };

export function useThemeSettings() {
  const [theme, setTheme] = useState<CmsThemeSettings | null>(null);

  useEffect(() => {
    void fetchThemeSettingsClient().then((data) => {
      if (data) setTheme(data);
    });
  }, []);

  const rawMenu = theme?.headerMenu ?? [];
  const validMenu = rawMenu
    .filter((item) => (item.label ?? '').trim().length > 0)
    .map((item) => ({
      ...item,
      label: item.label.trim(),
      href: (item.href ?? '/').trim() || '/',
    }));

  const headerMenu: Array<{
    label: string;
    href: string;
    sortOrder?: number;
    labelEn?: string;
    navKey?: string;
  }> =
    validMenu.length > 0
      ? [...validMenu].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : [...DEFAULT_HEADER_MENU];

  const companyInfo: CompanyInfo = { ...DEFAULT_COMPANY_INFO, ...theme?.companyInfo };
  const contactChannels = normalizeContactChannels(theme?.contactChannels ?? DEFAULT_CONTACT_CHANNELS);

  const footerColumns: FooterColumn[] = buildFooterColumns(theme?.footerColumns, companyInfo);

  const rawMobileNav = theme?.mobileNav ?? [];
  const mobileNav: MobileNavItem[] =
    rawMobileNav.length > 0
      ? [...rawMobileNav]
          .map((item, i) => ({
            ...item,
            label: (item.label ?? '').trim() || `Mục ${i + 1}`,
            labelEn: item.labelEn?.trim() || undefined,
            navKey: item.navKey?.trim() || undefined,
            icon: (item.icon ?? '📱').trim() || '📱',
            url: (item.url ?? '/').trim() || '/',
            sortOrder: item.sortOrder ?? i,
            requireLogin: item.requireLogin === true,
            active: item.active !== false,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      : [...DEFAULT_MOBILE_NAV];

  const logoDesktop = theme?.logoDesktop || '/images/cardon-logo-full.png';
  const logoMobile = theme?.logoMobile || '/images/cardon-icon.png';
  const favicon = theme?.favicon || '/images/cardon-icon.png';
  const homeBackgrounds = resolveHomeBackgrounds(theme?.homeBackgrounds);

  return {
    theme,
    headerMenu,
    footerColumns,
    mobileNav,
    logoDesktop,
    logoMobile,
    favicon,
    companyInfo,
    contactChannels,
    homeBackgrounds,
  };
}
