import { translate } from './i18n/messages';
import type { Locale } from './i18n/locale';

export type FooterLink = {
  label: string;
  href: string;
  labelEn?: string;
  navKey?: string;
  /** Chrome label for a raw company value. The value itself stays in `label` / `valueEn`. */
  valueLabelKey?: string;
  /** Optional English chrome label. Empty keeps the catalog label. */
  valueLabelEn?: string;
  /** Optional English value for bilingual company facts (e.g. address). */
  valueEn?: string;
};

export type FooterColumn = {
  title: string;
  titleEn?: string;
  titleKey?: string;
  description?: string;
  descriptionEn?: string;
  links: FooterLink[];
};

export type CompanyInfo = {
  companyName?: string;
  taxCode?: string;
  address?: string;
  /** Shown with the catalog email label. The address value is not translated. */
  email?: string;
  /** Shown with the catalog hours label. The hours value is not translated. */
  workingHours?: string;
  /** Shown with the catalog hotline label. The number is not translated. */
  hotline?: string;
  /** Optional English labels for footer column 1 chrome (MST / Address / …). */
  taxLabelEn?: string;
  addressLabelEn?: string;
  emailLabelEn?: string;
  hotlineLabelEn?: string;
  hoursLabelEn?: string;
  /** Optional English address value. Empty keeps the Vietnamese address on /en. */
  addressEn?: string;
  /** Optional company blurb. `description` is Vietnamese, `descriptionEn` is English. */
  description?: string;
  descriptionEn?: string;
  /** Bộ Công Thương notification badge under footer column 4. */
  boCongThuongEnabled?: boolean;
  boCongThuongImageUrl?: string;
  boCongThuongLinkUrl?: string;
  /** Google Maps embed on /lien-he (iframe src or pasted embed HTML). */
  googleMapEnabled?: boolean;
  googleMapEmbedUrl?: string;
};

/** Default link columns (2–4). Column 1 is always built from companyInfo. */
export const DEFAULT_FOOTER_LINK_COLUMNS: FooterColumn[] = [
  {
    title: 'Dịch vụ',
    titleKey: 'footer.services',
    links: [
      { label: 'Mua thẻ game', href: '/the-game', navKey: 'home.gameHint' },
      { label: 'Mua thẻ điện thoại', href: '/the-dien-thoai', navKey: 'home.phoneHint' },
      { label: 'Nạp cước', href: '/nap-cuoc', navKey: 'nav.topup' },
    ],
  },
  {
    title: 'Chính sách',
    titleKey: 'footer.policies',
    links: [
      { label: 'Điều khoản sử dụng', href: '/dieu-khoan-su-dung', navKey: 'auth.terms' },
      { label: 'Chính sách bảo mật', href: '/chinh-sach-bao-mat', navKey: 'auth.privacy' },
      { label: 'Hoàn tiền', href: '/chinh-sach-hoan-tien', navKey: 'footer.refundShort' },
    ],
  },
  {
    title: 'Hỗ trợ',
    titleKey: 'footer.support',
    links: [
      { label: 'Trung tâm trợ giúp', href: '/tro-giup', navKey: 'footer.helpCenter' },
      { label: 'Hướng dẫn', href: '/tin-tuc/huong-dan', navKey: 'footer.guide' },
      { label: 'Liên hệ', href: '/lien-he', navKey: 'nav.contact' },
      { label: 'Ticket', href: '/account/support' },
    ],
  },
];

export function buildCompanyFooterColumn(company: CompanyInfo): FooterColumn {
  const links: FooterLink[] = [];
  if (company.companyName?.trim()) {
    links.push({ label: company.companyName.trim(), href: '/gioi-thieu' });
  }
  if (company.taxCode?.trim()) {
    links.push({
      label: company.taxCode.trim(),
      href: '/gioi-thieu',
      valueLabelKey: 'footer.tax',
      valueLabelEn: optionalLabel(company.taxLabelEn),
    });
  }
  if (company.address?.trim() || company.addressEn?.trim()) {
    links.push({
      label: company.address?.trim() || company.addressEn!.trim(),
      valueEn: optionalLabel(company.addressEn),
      href: '/lien-he',
      valueLabelKey: 'contact.address',
      valueLabelEn: optionalLabel(company.addressLabelEn),
    });
  }
  if (company.email?.trim()) {
    links.push({
      label: company.email.trim(),
      href: `mailto:${company.email.trim()}`,
      valueLabelKey: 'footer.email',
      valueLabelEn: optionalLabel(company.emailLabelEn),
    });
  }
  if (company.hotline?.trim()) {
    links.push({
      label: company.hotline.trim(),
      href: `tel:${company.hotline.replace(/\s/g, '')}`,
      valueLabelKey: 'footer.hotline',
      valueLabelEn: optionalLabel(company.hotlineLabelEn),
    });
  }
  if (company.workingHours?.trim()) {
    links.push({
      label: company.workingHours.trim(),
      href: '/lien-he',
      valueLabelKey: 'contact.hours',
      valueLabelEn: optionalLabel(company.hoursLabelEn),
    });
  }
  if (links.length === 0 && !company.description?.trim() && !company.descriptionEn?.trim()) {
    links.push({ label: 'CardOn.vn', href: '/' });
  }
  return {
    title: 'CardOn',
    description: company.description?.trim() || undefined,
    descriptionEn: company.descriptionEn?.trim() || undefined,
    links,
  };
}

function optionalLabel(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/** Strip legacy company column from saved CMS footer config. */
export function normalizeLinkFooterColumns(
  columns: FooterColumn[] | undefined | null,
): FooterColumn[] {
  const filtered = (columns ?? []).filter((col) => {
    const t = (col.title ?? '').toLowerCase();
    return !t.includes('thông tin công ty') && t !== 'cardon.vn';
  });
  return filtered.length > 0 ? filtered : DEFAULT_FOOTER_LINK_COLUMNS;
}

export function buildFooterColumns(
  savedLinkColumns: FooterColumn[] | undefined | null,
  company: CompanyInfo,
): FooterColumn[] {
  const linkCols = normalizeLinkFooterColumns(savedLinkColumns);
  return [buildCompanyFooterColumn(company), ...linkCols];
}

export function resolveBoCongThuongBadge(
  company: CompanyInfo,
  locale: Locale = 'vi',
): {
  imageUrl: string;
  linkUrl: string;
  alt: string;
} | null {
  if (!company.boCongThuongEnabled) return null;
  const imageUrl = company.boCongThuongImageUrl?.trim();
  if (!imageUrl) return null;
  return {
    imageUrl,
    linkUrl: company.boCongThuongLinkUrl?.trim() || 'https://www.moc.gov.vn/',
    alt: translate(locale, 'footer.bctAlt'),
  };
}
