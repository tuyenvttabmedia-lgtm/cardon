import { describe, expect, it } from 'vitest';
import { englishMessages, translate, type MessageKey } from './messages';
import { localeSwitchTarget } from './locale';
import { customerFacingError } from './customer-error';
import {
  menuLabels,
  presentFooterLink,
  resolveMenuLabel,
  resolveThemeDescription,
  resolveThemeTitle,
  SYSTEM_HEADER_MENU,
} from './theme-labels';
import { buildCompanyFooterColumn, buildFooterColumns, type FooterColumn } from '../footer-config';

const VI_DIACRITIC = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

describe('ui catalogs', () => {
  it('has an English string for every existing key and does not leave Vietnamese copy there', () => {
    const keys = Object.keys(englishMessages);
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) {
      const value = englishMessages[key as MessageKey];
      expect(value.trim().length).toBeGreaterThan(0);
      if (key === 'lang.vi') continue;
      expect(value, key).not.toMatch(VI_DIACRITIC);
    }
  });

  it('falls back to the key when a catalog entry is missing', () => {
    expect(translate('en', 'missing.key' as MessageKey)).toBe('missing.key');
  });

  it('leaves order codes and amounts untouched', () => {
    expect(customerFacingError('en', new Error('ORD-20261105-7D0F2D'))).toBe('ORD-20261105-7D0F2D');
    expect(customerFacingError('en', new Error('103000'))).toBe('103000');
    expect(translate('en', 'checkout.pay')).toBe('Pay');
    expect(translate('vi', 'checkout.createPay')).toContain('thanh toán');
  });
});

describe('menu labels', () => {
  it('shows the system menu in Vietnamese from the stored label', () => {
    expect(menuLabels('vi', SYSTEM_HEADER_MENU)).toEqual([
      'Trang chủ',
      'Mua thẻ',
      'Nạp cước',
      'Nạp Data',
      'Tin tức',
    ]);
  });

  it('shows the system menu in English from the catalog key', () => {
    expect(menuLabels('en', SYSTEM_HEADER_MENU)).toEqual([
      'Home',
      'Buy cards',
      'Top-up',
      'Data',
      'News',
    ]);
    expect(SYSTEM_HEADER_MENU.map((item) => item.href)).toEqual([
      '/',
      '/#mua-the',
      '/nap-cuoc',
      '/nap-data',
      '/tin-tuc',
    ]);
  });

  it('uses labelEn for a custom item', () => {
    const custom = { label: 'Khuyến mãi', labelEn: 'Offers', href: '/the-game' };
    expect(resolveMenuLabel('en', custom)).toBe('Offers');
    expect(resolveMenuLabel('vi', custom)).toBe('Khuyến mãi');
  });

  it('keeps the stored label when a custom item has no English text and does not look at the href', () => {
    const item = { label: 'Khuyến mãi', href: '/the-game' };
    expect(resolveMenuLabel('en', item)).toBe('Khuyến mãi');
    expect(resolveMenuLabel('vi', item)).toBe('Khuyến mãi');
  });

  it('uses the same labels for desktop and mobile', () => {
    const items = [
      ...SYSTEM_HEADER_MENU,
      { label: 'Đối tác', labelEn: 'Partners', href: '/doi-tac' },
      { label: 'Khuyến mãi', href: '/the-game' },
    ];
    expect(menuLabels('en', items)).toEqual(menuLabels('en', items));
    expect(menuLabels('en', items)[0]).toBe('Home');
    expect(menuLabels('en', items).at(-1)).toBe('Khuyến mãi');
    expect(menuLabels('vi', items)[0]).toBe('Trang chủ');
  });
});

describe('footer labels', () => {
  const saved: FooterColumn[] = [
    {
      title: 'Đối tác',
      titleEn: 'Partners',
      links: [
        { label: 'Bài viết', labelEn: 'Articles', href: '/tin-tuc' },
        { label: 'Chỉ tiếng Việt', href: '/doi-tac' },
      ],
    },
  ];

  it('uses titleEn and labelEn when present', () => {
    expect(resolveThemeTitle('en', saved[0])).toBe('Partners');
    expect(resolveThemeTitle('vi', saved[0])).toBe('Đối tác');
    expect(presentFooterLink('en', saved[0].links[0])).toBe('Articles');
    expect(presentFooterLink('en', saved[0].links[1])).toBe('Chỉ tiếng Việt');
  });

  it('keeps an old footer config that has no English fields', () => {
    const legacy: FooterColumn[] = [
      {
        title: 'Dịch vụ',
        links: [{ label: 'Mua thẻ game', href: '/the-game' }],
      },
    ];
    const columns = buildFooterColumns(legacy, {
      companyName: 'Công ty CardOn',
      taxCode: '0101234567',
      address: 'Hà Nội',
      email: 'support@cardon.vn',
      hotline: '0984877066',
      workingHours: '8:00-17:00',
    });
    expect(columns[1].title).toBe('Dịch vụ');
    expect(columns[1].links[0]).toMatchObject({ label: 'Mua thẻ game', href: '/the-game' });
    expect(resolveThemeTitle('en', columns[1])).toBe('Dịch vụ');
    expect(presentFooterLink('en', columns[1].links[0])).toBe('Mua thẻ game');
    expect(columns[0].links.map((link) => link.label)).toEqual([
      'Công ty CardOn',
      '0101234567',
      'Hà Nội',
      'support@cardon.vn',
      '0984877066',
      '8:00-17:00',
    ]);
    expect(presentFooterLink('en', columns[0].links[1])).toBe('Tax ID: 0101234567');
    expect(presentFooterLink('vi', columns[0].links[1])).toBe('MST: 0101234567');
    expect(presentFooterLink('en', columns[0].links[4])).toBe('Hotline: 0984877066');
    const custom = buildCompanyFooterColumn({
      taxCode: '0101234567',
      taxLabelEn: 'Tax code',
      address: 'Hà Nội',
      addressLabelEn: 'Address',
      workingHours: '8:00-17:00',
      hoursLabelEn: 'Hours',
    });
    const tax = custom.links.find((link) => link.label === '0101234567');
    const address = custom.links.find((link) => link.label === 'Hà Nội');
    const hours = custom.links.find((link) => link.label === '8:00-17:00');
    expect(tax && presentFooterLink('vi', tax)).toBe('MST: 0101234567');
    expect(tax && presentFooterLink('en', tax)).toBe('Tax code: 0101234567');
    expect(address && presentFooterLink('vi', address)).toBe('Hà Nội');
    expect(address && presentFooterLink('en', address)).toBe('Address: Hà Nội');
    expect(hours && presentFooterLink('en', hours)).toBe('Hours: 8:00-17:00');
    expect(hours && presentFooterLink('vi', hours)).toBe('Thời gian làm việc: 8:00-17:00');
    expect(columns[0].links[1].label).not.toMatch(/^MST:/);
  });

  it('keeps company facts and shows a separate description per locale', () => {
    const column = buildCompanyFooterColumn({
      companyName: 'Công ty CardOn',
      taxCode: '0101234567',
      address: 'Hà Nội, Việt Nam',
      email: 'support@cardon.vn',
      description: 'Nền tảng thẻ và nạp cước.',
      descriptionEn: 'Cards and top-up.',
    });
    expect(column.links.map((link) => link.label)).toContain('Công ty CardOn');
    expect(column.links.map((link) => link.label)).toContain('0101234567');
    expect(column.links.map((link) => link.label)).toContain('Hà Nội, Việt Nam');
    expect(column.links.map((link) => link.label)).toContain('support@cardon.vn');
    expect(resolveThemeDescription('vi', column.description, column.descriptionEn)).toBe(
      'Nền tảng thẻ và nạp cước.',
    );
    expect(resolveThemeDescription('en', column.description, column.descriptionEn)).toBe(
      'Cards and top-up.',
    );
    expect(resolveThemeDescription('en', column.description, '')).toBe('Nền tảng thẻ và nạp cước.');
  });
});

describe('language switch target', () => {
  it('keeps the path and query when switching languages', () => {
    expect(localeSwitchTarget('/the-game', '?q=1&page=2', 'en')).toBe('/en/the-game?q=1&page=2');
    expect(localeSwitchTarget('/en/the-game', '?q=1', 'vi')).toBe('/the-game?q=1');
    expect(localeSwitchTarget('/en', '', 'vi')).toBe('/');
    expect(localeSwitchTarget('/', '?q=1', 'en')).toBe('/en?q=1');
  });
});
