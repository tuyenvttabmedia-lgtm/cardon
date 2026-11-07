import { describe, expect, it } from 'vitest';
import { normalizeThemeSettings } from './theme-normalize';
import type { CmsThemeSettings } from '@/types/api';

describe('theme normalize locale fields', () => {
  it('keeps old theme data and optional English labels', () => {
    const theme = {
      logoDesktop: '/logo.png',
      logoMobile: '',
      favicon: '',
      ogDefaultImage: '',
      headerMenu: [
        { label: 'Tin tức', href: '/tin-tuc', sortOrder: 4, labelEn: 'News' },
        { label: 'Khuyến mãi', href: '/the-game', sortOrder: 5, labelEn: '  ' },
      ],
      footerColumns: [
        {
          title: 'Đối tác',
          titleEn: 'Partners',
          links: [{ label: 'Blog', href: '/tin-tuc', labelEn: '' }],
        },
      ],
      companyInfo: {
        companyName: 'Công ty CardOn',
        taxCode: '0101234567',
        address: 'Hà Nội',
        hotline: '0984877066',
        email: 'support@cardon.vn',
        workingHours: '8:00-17:00',
        description: 'Mô tả',
        descriptionEn: '',
        taxLabelEn: 'Tax code',
        hoursLabelEn: '  ',
      },
      contactChannels: [
        { key: 'address', enabled: true, value: 'Hà Nội', label: ' Địa chỉ ', labelEn: 'Address' },
      ],
      mobileNav: [{ label: 'Trang chủ', labelEn: 'Home', icon: '🏠', url: '/', sortOrder: 0, active: true }],
    } as CmsThemeSettings;

    const normalized = normalizeThemeSettings(theme);
    expect(normalized.headerMenu[0]).toMatchObject({
      label: 'Tin tức',
      labelEn: 'News',
      href: '/tin-tuc',
      sortOrder: 4,
    });
    expect(normalized.headerMenu[1].labelEn).toBeUndefined();
    expect(normalized.headerMenu[1].href).toBe('/the-game');
    expect(normalized.footerColumns[0].title).toBe('Đối tác');
    expect(normalized.footerColumns[0].titleEn).toBe('Partners');
    expect(normalized.footerColumns[0].links[0]).toMatchObject({ label: 'Blog', href: '/tin-tuc' });
    expect(normalized.footerColumns[0].links[0].labelEn).toBeUndefined();
    expect(normalized.companyInfo).toMatchObject({
      companyName: 'Công ty CardOn',
      taxCode: '0101234567',
      address: 'Hà Nội',
      hotline: '0984877066',
      email: 'support@cardon.vn',
      workingHours: '8:00-17:00',
      description: 'Mô tả',
      taxLabelEn: 'Tax code',
    });
    expect(normalized.companyInfo?.hoursLabelEn).toBe('');
    expect(normalized.contactChannels?.find((channel) => channel.key === 'address')).toMatchObject({
      value: 'Hà Nội',
      label: 'Địa chỉ',
      labelEn: 'Address',
    });
    expect(normalized.mobileNav?.[0].labelEn).toBe('Home');
    expect(normalized.logoDesktop).toBe('/logo.png');
  });
});
