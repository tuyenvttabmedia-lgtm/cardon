import { ValidationPipe } from '@nestjs/common';
import { UpdateCmsThemeDto } from '../dto/cms.dto';
import { normalizeFooterColumn, normalizeHeaderMenuItem } from './theme-locale';

describe('theme locale fields', () => {
  it('keeps Vietnamese labels and optional English labels without changing href order', () => {
    const menu = normalizeHeaderMenuItem(
      { label: 'Tin tức', href: '/tin-tuc', sortOrder: 2, labelEn: ' News ', extraFlag: true },
      0,
    );
    expect(menu).toMatchObject({ label: 'Tin tức', labelEn: 'News', href: '/tin-tuc', sortOrder: 2, extraFlag: true });

    const blank = normalizeHeaderMenuItem({ label: 'Khuyến mãi', href: '/the-game', labelEn: '  ' }, 1);
    expect(blank.labelEn).toBeUndefined();
    expect(blank.href).toBe('/the-game');

    const column = normalizeFooterColumn(
      {
        title: 'Đối tác',
        titleEn: '',
        links: [{ label: 'Blog', href: '/tin-tuc', labelEn: 'Articles' }],
      },
      0,
    );
    expect(column.title).toBe('Đối tác');
    expect(column.titleEn).toBeUndefined();
    expect(column.links?.[0]).toMatchObject({ label: 'Blog', labelEn: 'Articles', href: '/tin-tuc' });
  });

  it('accepts an old theme payload and a payload that adds English labels', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const legacy = await pipe.transform(
      {
        headerMenu: [{ label: 'Tin tức', href: '/tin-tuc', sortOrder: 1 }],
        companyInfo: { companyName: 'Công ty CardOn', taxCode: '0101234567', hotline: '0984877066' },
      },
      { type: 'body', metatype: UpdateCmsThemeDto },
    );
    expect(legacy.headerMenu[0]).toMatchObject({ label: 'Tin tức', href: '/tin-tuc' });
    expect(legacy.companyInfo.taxCode).toBe('0101234567');
    expect(legacy.companyInfo.hotline).toBe('0984877066');

    const bilingual = await pipe.transform(
      {
        headerMenu: [{ label: 'Tin tức', href: '/tin-tuc', labelEn: 'News' }],
        footerColumns: [{ title: 'Đối tác', titleEn: 'Partners', links: [{ label: 'Blog', href: '/tin-tuc', labelEn: 'Articles' }] }],
        companyInfo: {
          companyName: 'Công ty CardOn',
          taxCode: '010',
          description: 'Mô tả',
          descriptionEn: 'About',
          taxLabelEn: 'Tax code',
          hoursLabelEn: 'Hours',
        },
        contactChannels: [{ key: 'address', value: 'Hà Nội', label: 'Địa chỉ', labelEn: 'Address' }],
      },
      { type: 'body', metatype: UpdateCmsThemeDto },
    );
    expect(bilingual.headerMenu[0].labelEn).toBe('News');
    expect(bilingual.headerMenu[0].label).toBe('Tin tức');
    expect(bilingual.footerColumns[0].titleEn).toBe('Partners');
    expect(bilingual.footerColumns[0].links[0].labelEn).toBe('Articles');
    expect(bilingual.companyInfo).toMatchObject({
      companyName: 'Công ty CardOn',
      taxCode: '010',
      description: 'Mô tả',
      descriptionEn: 'About',
      taxLabelEn: 'Tax code',
      hoursLabelEn: 'Hours',
    });
    expect(bilingual.contactChannels[0]).toMatchObject({
      key: 'address',
      value: 'Hà Nội',
      label: 'Địa chỉ',
      labelEn: 'Address',
    });
  });
});
