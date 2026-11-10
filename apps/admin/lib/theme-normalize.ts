import type { CmsThemeSettings } from '@/types/api';
import {
  resolveWorkingHoursEn,
  sanitizeCompanyChromeLabel,
} from '@/lib/company-chrome';
import { normalizeContactChannels } from '@/lib/contact-channels';

type MenuItem = {
  label: string;
  href: string;
  sortOrder?: number;
  labelEn?: string;
  navKey?: string;
};
type FooterLink = { label: string; href: string; labelEn?: string; navKey?: string };
type FooterColumn = {
  title: string;
  titleEn?: string;
  description?: string;
  descriptionEn?: string;
  links: FooterLink[];
};
type MobileNavItem = NonNullable<CmsThemeSettings['mobileNav']>[number];

const DEFAULT_MOBILE_NAV: MobileNavItem[] = [
  { label: 'Trang chủ', icon: '🏠', url: '/', sortOrder: 0, active: true },
  { label: 'Mua thẻ', icon: '🛒', url: '/', sortOrder: 1, active: true },
  { label: 'Nạp cước', icon: '⚡', url: '/nap-cuoc', sortOrder: 2, active: true },
  { label: 'Data', icon: '📶', url: '/nap-cuoc?type=data', sortOrder: 3, active: true },
  { label: 'Tài khoản', icon: '👤', url: '/account', sortOrder: 4, requireLogin: true, active: true },
];

const DEFAULT_LINK_COLUMNS: FooterColumn[] = [
  {
    title: 'Dịch vụ',
    links: [
      { label: 'Mua thẻ game', href: '/cards' },
      { label: 'Mua thẻ điện thoại', href: '/cards' },
      { label: 'Nạp cước', href: '/nap-cuoc' },
    ],
  },
  {
    title: 'Chính sách',
    links: [
      { label: 'Điều khoản sử dụng', href: '/dieu-khoan-su-dung' },
      { label: 'Chính sách bảo mật', href: '/chinh-sach-bao-mat' },
      { label: 'Hoàn tiền', href: '/chinh-sach-hoan-tien' },
    ],
  },
  {
    title: 'Hỗ trợ',
    links: [
      { label: 'Hướng dẫn', href: '/tin-tuc/huong-dan' },
      { label: 'Liên hệ', href: '/lien-he' },
      { label: 'Ticket', href: '/account/support' },
    ],
  },
];

function stripCompanyColumn(columns: FooterColumn[]): FooterColumn[] {
  return columns.filter((col) => {
    const t = (col.title ?? '').toLowerCase();
    return !t.includes('thông tin công ty') && t !== 'cardon.vn';
  });
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeMenuItem(item: Partial<MenuItem>, index: number): MenuItem {
  const href = (item.href ?? '/').trim() || '/';
  const label = (item.label ?? '').trim() || href || `Mục ${index + 1}`;
  const next: MenuItem = { ...item, label, href, sortOrder: item.sortOrder ?? index };
  const labelEn = optionalText(item.labelEn);
  const navKey = optionalText(item.navKey);
  if (labelEn) next.labelEn = labelEn;
  else delete next.labelEn;
  if (navKey) next.navKey = navKey;
  else delete next.navKey;
  return next;
}

export function normalizeFooterColumn(col: Partial<FooterColumn>, index: number): FooterColumn {
  const title = (col.title ?? '').trim() || `Cột ${index + 1}`;
  const links = (col.links ?? []).map((link, li) => {
    const href = (link.href ?? '/').trim() || '/';
    const next: FooterLink = {
      ...link,
      label: (link.label ?? '').trim() || href || `Liên kết ${li + 1}`,
      href,
    };
    const labelEn = optionalText(link.labelEn);
    const navKey = optionalText(link.navKey);
    if (labelEn) next.labelEn = labelEn;
    else delete next.labelEn;
    if (navKey) next.navKey = navKey;
    else delete next.navKey;
    return next;
  });
  const next: FooterColumn = {
    ...col,
    title,
    links: links.length ? links : [{ label: 'Liên kết', href: '/' }],
  };
  const titleEn = optionalText(col.titleEn);
  const description = optionalText(col.description);
  const descriptionEn = optionalText(col.descriptionEn);
  if (titleEn) next.titleEn = titleEn;
  else delete next.titleEn;
  if (description) next.description = description;
  else delete next.description;
  if (descriptionEn) next.descriptionEn = descriptionEn;
  else delete next.descriptionEn;
  return next;
}

export function normalizeMobileNavItem(item: Partial<MobileNavItem>, index: number): MobileNavItem {
  const next: MobileNavItem = {
    ...item,
    label: (item.label ?? '').trim() || `Mục ${index + 1}`,
    icon: (item.icon ?? '📱').trim() || '📱',
    url: (item.url ?? '/').trim() || '/',
    sortOrder: item.sortOrder ?? index,
    requireLogin: item.requireLogin === true,
    active: item.active !== false,
  };
  const labelEn = optionalText(item.labelEn);
  const navKey = optionalText(item.navKey);
  if (labelEn) next.labelEn = labelEn;
  else delete next.labelEn;
  if (navKey) next.navKey = navKey;
  else delete next.navKey;
  return next;
}

export function normalizeThemeSettings(theme: CmsThemeSettings): CmsThemeSettings {
  const linkColumns = stripCompanyColumn(theme.footerColumns ?? []);
  const footerColumns =
    linkColumns.length > 0
      ? linkColumns.map(normalizeFooterColumn)
      : DEFAULT_LINK_COLUMNS.map(normalizeFooterColumn);

  return {
    ...theme,
    headerMenu: (theme.headerMenu ?? []).map(normalizeMenuItem),
    footerColumns,
    mobileNav: (theme.mobileNav && theme.mobileNav.length > 0
      ? theme.mobileNav
      : DEFAULT_MOBILE_NAV
    ).map(normalizeMobileNavItem),
    companyInfo: (() => {
      const taxCode = theme.companyInfo?.taxCode ?? '';
      const address = theme.companyInfo?.address ?? '';
      const hotline = theme.companyInfo?.hotline ?? '';
      const email = theme.companyInfo?.email ?? '';
      const workingHours = theme.companyInfo?.workingHours ?? '';
      const workingHoursEn = resolveWorkingHoursEn(
        theme.companyInfo?.workingHoursEn,
        theme.companyInfo?.hoursLabelEn,
      );
      return {
        ...theme.companyInfo,
        companyName: theme.companyInfo?.companyName ?? '',
        taxCode,
        address,
        hotline,
        email,
        workingHours,
        workingHoursEn,
        description: theme.companyInfo?.description ?? '',
        descriptionEn: theme.companyInfo?.descriptionEn ?? '',
        addressEn: theme.companyInfo?.addressEn ?? '',
        taxLabelEn: sanitizeCompanyChromeLabel(theme.companyInfo?.taxLabelEn, taxCode),
        addressLabelEn: sanitizeCompanyChromeLabel(theme.companyInfo?.addressLabelEn, address),
        emailLabelEn: sanitizeCompanyChromeLabel(theme.companyInfo?.emailLabelEn, email),
        hotlineLabelEn: sanitizeCompanyChromeLabel(theme.companyInfo?.hotlineLabelEn, hotline),
        hoursLabelEn: sanitizeCompanyChromeLabel(theme.companyInfo?.hoursLabelEn, workingHours),
        boCongThuongEnabled: theme.companyInfo?.boCongThuongEnabled === true,
        boCongThuongImageUrl: theme.companyInfo?.boCongThuongImageUrl ?? '',
        boCongThuongLinkUrl: theme.companyInfo?.boCongThuongLinkUrl ?? '',
        googleMapEnabled: theme.companyInfo?.googleMapEnabled === true,
        googleMapEmbedUrl: theme.companyInfo?.googleMapEmbedUrl ?? '',
      };
    })(),
    contactChannels: normalizeContactChannels(theme.contactChannels),
    homeBackgrounds: {
      homeHeroBg: theme.homeBackgrounds?.homeHeroBg ?? '',
      homeCategoryGameBg: theme.homeBackgrounds?.homeCategoryGameBg ?? '',
      homeCategoryPhoneCardBg: theme.homeBackgrounds?.homeCategoryPhoneCardBg ?? '',
      homeCategoryTopupBg: theme.homeBackgrounds?.homeCategoryTopupBg ?? '',
      homeCategoryEsimBg: theme.homeBackgrounds?.homeCategoryEsimBg ?? '',
      hubHeroGameBg: theme.homeBackgrounds?.hubHeroGameBg ?? '',
      hubHeroPhoneBg: theme.homeBackgrounds?.hubHeroPhoneBg ?? '',
      hubHeroTopupBg: theme.homeBackgrounds?.hubHeroTopupBg ?? '',
      hubHeroEsimBg: theme.homeBackgrounds?.hubHeroEsimBg ?? '',
      siteFooterBg: theme.homeBackgrounds?.siteFooterBg ?? '',
    },
  };
}
