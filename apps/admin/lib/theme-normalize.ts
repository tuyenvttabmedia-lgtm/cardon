import type { CmsThemeSettings } from '@/types/api';
import { normalizeContactChannels } from '@/lib/contact-channels';

type MenuItem = { label: string; href: string; sortOrder?: number };
type FooterColumn = { title: string; links: Array<{ label: string; href: string }> };
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

export function normalizeMenuItem(item: Partial<MenuItem>, index: number): MenuItem {
  const href = (item.href ?? '/').trim() || '/';
  const label = (item.label ?? '').trim() || href || `Mục ${index + 1}`;
  return { label, href, sortOrder: item.sortOrder ?? index };
}

export function normalizeFooterColumn(col: Partial<FooterColumn>, index: number): FooterColumn {
  const title = (col.title ?? '').trim() || `Cột ${index + 1}`;
  const links = (col.links ?? []).map((link, li) => ({
    label: (link.label ?? '').trim() || (link.href ?? '').trim() || `Liên kết ${li + 1}`,
    href: (link.href ?? '/').trim() || '/',
  }));
  return { title, links: links.length ? links : [{ label: 'Liên kết', href: '/' }] };
}

export function normalizeMobileNavItem(item: Partial<MobileNavItem>, index: number): MobileNavItem {
  return {
    label: (item.label ?? '').trim() || `Mục ${index + 1}`,
    icon: (item.icon ?? '📱').trim() || '📱',
    url: (item.url ?? '/').trim() || '/',
    sortOrder: item.sortOrder ?? index,
    requireLogin: item.requireLogin === true,
    active: item.active !== false,
  };
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
    companyInfo: {
      companyName: theme.companyInfo?.companyName ?? '',
      taxCode: theme.companyInfo?.taxCode ?? '',
      address: theme.companyInfo?.address ?? '',
      hotline: theme.companyInfo?.hotline ?? '',
      email: theme.companyInfo?.email ?? '',
      workingHours: theme.companyInfo?.workingHours ?? '',
      boCongThuongEnabled: theme.companyInfo?.boCongThuongEnabled === true,
      boCongThuongImageUrl: theme.companyInfo?.boCongThuongImageUrl ?? '',
      boCongThuongLinkUrl: theme.companyInfo?.boCongThuongLinkUrl ?? '',
      googleMapEnabled: theme.companyInfo?.googleMapEnabled === true,
      googleMapEmbedUrl: theme.companyInfo?.googleMapEmbedUrl ?? '',
    },
    contactChannels: normalizeContactChannels(theme.contactChannels),
  };
}
