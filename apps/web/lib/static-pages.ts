/** Fallback labels when CMS page is missing — sidebar nav is loaded from API. */
export const STATIC_CMS_PAGES = [
  { slug: 'gioi-thieu', label: 'Giới thiệu' },
  { slug: 'chinh-sach-bao-mat', label: 'Chính sách bảo mật' },
  { slug: 'dieu-khoan-su-dung', label: 'Điều khoản sử dụng' },
  { slug: 'chinh-sach-hoan-tien', label: 'Chính sách hoàn tiền' },
  { slug: 'chinh-sach-thanh-toan', label: 'Chính sách thanh toán' },
  { slug: 'lien-he', label: 'Liên hệ' },
] as const;

export function staticPageLabel(slug: string): string {
  return STATIC_CMS_PAGES.find((p) => p.slug === slug)?.label ?? slug;
}
