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

export const DEFAULT_HEADER_MENU = [
  { label: 'Trang chủ', href: '/', sortOrder: 0 },
  { label: 'Mua thẻ', href: '/#mua-the', sortOrder: 1 },
  { label: 'Nạp cước', href: '/nap-cuoc', sortOrder: 2 },
  { label: 'Nạp Data', href: '/nap-data', sortOrder: 3 },
  { label: 'Tin tức', href: '/tin-tuc', sortOrder: 4 },
];

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  companyName: 'CardOn.vn',
  taxCode: '',
  address: 'Hà Nội, Việt Nam',
  email: 'support@cardon.vn',
  workingHours: '',
  hotline: '1900 xxxx',
  boCongThuongEnabled: false,
  boCongThuongImageUrl: '',
  boCongThuongLinkUrl: '',
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

  const headerMenu =
    validMenu.length > 0
      ? [...validMenu].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : DEFAULT_HEADER_MENU;

  const companyInfo: CompanyInfo = { ...DEFAULT_COMPANY_INFO, ...theme?.companyInfo };
  const contactChannels = normalizeContactChannels(theme?.contactChannels ?? DEFAULT_CONTACT_CHANNELS);

  const footerColumns: FooterColumn[] = buildFooterColumns(theme?.footerColumns, companyInfo);

  const rawMobileNav = theme?.mobileNav ?? [];
  const mobileNav: MobileNavItem[] =
    rawMobileNav.length > 0
      ? [...rawMobileNav]
          .map((item, i) => ({
            label: (item.label ?? '').trim() || `Mục ${i + 1}`,
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

  return { theme, headerMenu, footerColumns, mobileNav, logoDesktop, logoMobile, favicon, companyInfo, contactChannels };
}
