import { CARD_GAME_PATH, CARD_PHONE_PATH } from '@/lib/checkout-services';
import { blogPostPath } from '@/lib/routes';

export type GuideLink = { href: string; label: string };

/** Evergreen pillars prioritized for home + hub internal links (GSC crawled-not-indexed batch). */
export const SEO_PILLAR_SLUGS = [
  'nap-game-bang-ma-the-hay-nap-truc-tiep',
  'mua-the-garena-online-nhanh-tien-va-an-toan',
  'mua-the-zing-online-nhanh-tien-va-de-kiem-tra',
  'chon-menh-gia-the-game-bao-nhieu-la-vua-du',
  'cach-tranh-lua-dao-khi-mua-the-game-online',
  'mua-the-viettel-khong-can-ra-cua-hang',
  'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao',
  'nap-tien-dien-thoai-online-co-an-toan-khong',
  'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut',
  'ma-the-va-so-serial-khac-nhau-the-nao',
] as const;

export const HUB_GUIDE_LINKS: Record<string, GuideLink[]> = {
  [CARD_GAME_PATH]: [
    {
      href: blogPostPath('the-game', 'nap-game-bang-ma-the-hay-nap-truc-tiep'),
      label: 'Nạp game bằng mã thẻ hay nạp trực tiếp?',
    },
    {
      href: blogPostPath('the-game', 'mua-the-garena-online-nhanh-tien-va-an-toan'),
      label: 'Mua thẻ Garena online và cách nhận mã',
    },
    {
      href: blogPostPath('the-game', 'mua-the-zing-online-nhanh-tien-va-de-kiem-tra'),
      label: 'Mua thẻ Zing online nhanh, dễ kiểm tra',
    },
    {
      href: blogPostPath('huong-dan', 'cach-tranh-lua-dao-khi-mua-the-game-online'),
      label: 'Cách tránh lừa đảo khi mua thẻ game',
    },
  ],
  [CARD_PHONE_PATH]: [
    {
      href: blogPostPath('the-dien-thoai', 'mua-the-viettel-khong-can-ra-cua-hang'),
      label: 'Mua thẻ Viettel không cần ra cửa hàng',
    },
    {
      href: blogPostPath('the-dien-thoai', 'cach-kiem-tra-so-dien-thoai-thuoc-nha-mang-nao'),
      label: 'Cách kiểm tra số điện thoại thuộc nhà mạng nào',
    },
    {
      href: blogPostPath('huong-dan', 'ma-the-va-so-serial-khac-nhau-the-nao'),
      label: 'Mã thẻ và số serial khác nhau thế nào?',
    },
    {
      href: blogPostPath('the-dien-thoai', 'nen-mua-the-dien-thoai-menh-gia-lon-hay-nho'),
      label: 'Nên mua thẻ điện thoại mệnh giá lớn hay nhỏ?',
    },
  ],
  '/nap-cuoc': [
    {
      href: blogPostPath('nap-cuoc-dien-thoai', 'nap-tien-dien-thoai-online-co-an-toan-khong'),
      label: 'Nạp tiền điện thoại online có an toàn không?',
    },
    {
      href: blogPostPath('nap-cuoc-dien-thoai', 'nap-tien-cho-thue-bao-vinaphone-trong-vai-phut'),
      label: 'Nạp tiền Vinaphone trong vài phút',
    },
    {
      href: blogPostPath('nap-cuoc-dien-thoai', 'nap-tien-viettel-moi-luc-moi-noi-cardonvn'),
      label: 'Nạp tiền Viettel mọi lúc mọi nơi',
    },
    {
      href: blogPostPath('nap-cuoc-dien-thoai', 'nap-tien-dien-thoai-cho-nguoi-khac-can-luu-y-gi'),
      label: 'Nạp tiền cho người khác cần lưu ý gì?',
    },
  ],
  '/': [
    {
      href: blogPostPath('the-game', 'nap-game-bang-ma-the-hay-nap-truc-tiep'),
      label: 'Nạp game: mã thẻ hay nạp trực tiếp?',
    },
    {
      href: blogPostPath('the-dien-thoai', 'mua-the-viettel-khong-can-ra-cua-hang'),
      label: 'Mua thẻ Viettel online',
    },
    {
      href: blogPostPath('nap-cuoc-dien-thoai', 'nap-tien-dien-thoai-online-co-an-toan-khong'),
      label: 'Nạp tiền online có an toàn không?',
    },
    {
      href: blogPostPath('huong-dan', 'cach-tranh-lua-dao-khi-mua-the-game-online'),
      label: 'Tránh lừa đảo khi mua thẻ game',
    },
  ],
};

export type ArticleHubCta = {
  hubHref: string;
  hubLabel: string;
  related: GuideLink[];
};

export function articleHubCtaForCategory(categorySlug: string | null | undefined): ArticleHubCta {
  const cat = (categorySlug ?? '').toLowerCase();
  if (cat === 'the-game' || cat === 'huong-dan') {
    return {
      hubHref: CARD_GAME_PATH,
      hubLabel: 'Mua thẻ game trên CardOn',
      related: HUB_GUIDE_LINKS[CARD_GAME_PATH]!.slice(0, 3),
    };
  }
  if (cat === 'the-dien-thoai') {
    return {
      hubHref: CARD_PHONE_PATH,
      hubLabel: 'Mua thẻ điện thoại trên CardOn',
      related: HUB_GUIDE_LINKS[CARD_PHONE_PATH]!.slice(0, 3),
    };
  }
  if (cat.includes('nap-cuoc') || cat === 'nap-data') {
    return {
      hubHref: '/nap-cuoc',
      hubLabel: 'Nạp cước trên CardOn',
      related: HUB_GUIDE_LINKS['/nap-cuoc']!.slice(0, 3),
    };
  }
  return {
    hubHref: CARD_GAME_PATH,
    hubLabel: 'Mua thẻ trên CardOn',
    related: HUB_GUIDE_LINKS['/']!.slice(0, 3),
  };
}

/** Prefer evergreen pillars, then fill with latest (skip promo-heavy when possible). */
export function mixHomeNewsPosts<T extends { slug: string; categorySlug?: string | null }>(
  latest: T[],
  pillars: T[],
  limit = 8,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of pillars) {
    if (out.length >= Math.min(4, limit)) break;
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    out.push(p);
  }
  const nonPromo = latest.filter((p) => (p.categorySlug ?? '') !== 'khuyen-mai');
  for (const pool of [nonPromo, latest]) {
    for (const p of pool) {
      if (out.length >= limit) break;
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      out.push(p);
    }
  }
  return out.slice(0, limit);
}
