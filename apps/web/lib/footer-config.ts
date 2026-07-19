export type FooterLink = { label: string; href: string };
export type FooterColumn = { title: string; links: FooterLink[] };

export type CompanyInfo = {
  companyName?: string;
  taxCode?: string;
  address?: string;
  hotline?: string;
  email?: string;
};

/** Default link columns (2–4). Column 1 is always built from companyInfo. */
export const DEFAULT_FOOTER_LINK_COLUMNS: FooterColumn[] = [
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
      { label: 'Trung tâm trợ giúp', href: '/tro-giup' },
      { label: 'Hướng dẫn', href: '/tin-tuc/huong-dan' },
      { label: 'Liên hệ', href: '/lien-he' },
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
    links.push({ label: `MST: ${company.taxCode.trim()}`, href: '/gioi-thieu' });
  }
  if (company.address?.trim()) {
    links.push({ label: company.address.trim(), href: '/lien-he' });
  }
  if (links.length === 0) {
    links.push({ label: 'CardOn.vn', href: '/' });
  }
  return { title: 'CardOn', links };
}

function supportContactLinks(company: CompanyInfo): FooterLink[] {
  const links: FooterLink[] = [];
  if (company.hotline?.trim()) {
    links.push({
      label: `Hotline: ${company.hotline.trim()}`,
      href: `tel:${company.hotline.replace(/\s/g, '')}`,
    });
  }
  if (company.email?.trim()) {
    links.push({ label: company.email.trim(), href: `mailto:${company.email.trim()}` });
  }
  return links;
}

function mergeSupportLinks(columns: FooterColumn[], company: CompanyInfo): FooterColumn[] {
  const contactLinks = supportContactLinks(company);
  if (contactLinks.length === 0) return columns;

  return columns.map((col) => {
    const isSupport = (col.title ?? '').toLowerCase().includes('hỗ trợ');
    if (!isSupport) return col;

    const existing = new Set(col.links.map((l) => l.label.toLowerCase()));
    const merged = [...col.links];
    for (const link of contactLinks) {
      if (!existing.has(link.label.toLowerCase())) {
        merged.push(link);
      }
    }
    return { ...col, links: merged };
  });
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
  const linkCols = mergeSupportLinks(normalizeLinkFooterColumns(savedLinkColumns), company);
  return [buildCompanyFooterColumn(company), ...linkCols];
}
