import { Injectable } from '@nestjs/common';
import {
  CmsBannerStatus,
  CmsPageStatus,
  CmsPageType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CMS_SEO_SETTING_KEYS, CMS_THEME_SETTING_KEYS } from '../entities/cms.constants';
import type { CmsMobileNavItem } from '../entities/cms-theme.defaults';
import {
  DEFAULT_CONTACT_CHANNELS,
  type ContactChannel,
} from '../entities/contact-channels';
import {
  coerceSettingBoolean,
  coerceSettingJson,
  coerceSettingString,
} from '../entities/cms-settings-coerce.util';

const PAGE_INCLUDE = {
  seo: true,
  author: { select: { id: true, email: true } },
  categoryRel: true,
  pageTags: { include: { tag: true } },
};

@Injectable()
export class CmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPages(filters: { type?: CmsPageType; status?: CmsPageStatus }) {
    return this.prisma.cmsPage.findMany({
      where: {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: PAGE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findPageById(id: string) {
    return this.prisma.cmsPage.findUnique({
      where: { id },
      include: PAGE_INCLUDE,
    });
  }

  findPageBySlug(slug: string) {
    return this.prisma.cmsPage.findUnique({ where: { slug } });
  }

  findPublishedPageBySlug(slug: string) {
    return this.prisma.cmsPage.findFirst({
      where: { slug, status: CmsPageStatus.PUBLISHED },
      include: PAGE_INCLUDE,
    });
  }

  findNavPagesForPublic() {
    return this.prisma.cmsPage.findMany({
      where: {
        type: CmsPageType.PAGE,
        status: CmsPageStatus.PUBLISHED,
        showInNav: true,
      },
      select: { slug: true, title: true, navSortOrder: true },
      orderBy: [{ navSortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async nextNavSortOrder(): Promise<number> {
    const agg = await this.prisma.cmsPage.aggregate({
      where: { type: CmsPageType.PAGE, showInNav: true },
      _max: { navSortOrder: true },
    });
    return (agg._max.navSortOrder ?? 0) + 1;
  }

  createPage(data: Prisma.CmsPageCreateInput) {
    return this.prisma.cmsPage.create({
      data,
      include: PAGE_INCLUDE,
    });
  }

  updatePage(id: string, data: Prisma.CmsPageUpdateInput) {
    return this.prisma.cmsPage.update({
      where: { id },
      data,
      include: PAGE_INCLUDE,
    });
  }

  upsertPageSeo(pageId: string, data: Prisma.CmsSeoCreateWithoutPageInput) {
    return this.prisma.cmsSeo.upsert({
      where: { pageId },
      create: { pageId, ...data },
      update: data,
    });
  }

  listBanners() {
    return this.prisma.cmsBanner.findMany({
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  findActiveBanners(position?: import('@prisma/client').CmsBannerPosition) {
    const now = new Date();
    return this.prisma.cmsBanner.findMany({
      where: {
        status: CmsBannerStatus.ACTIVE,
        ...(position ? { position } : {}),
        OR: [
          { startAt: null, endAt: null },
          { startAt: { lte: now }, endAt: null },
          { startAt: null, endAt: { gte: now } },
          { startAt: { lte: now }, endAt: { gte: now } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }],
    });
  }

  createBanner(data: Prisma.CmsBannerCreateInput) {
    return this.prisma.cmsBanner.create({ data });
  }

  updateBanner(id: string, data: Prisma.CmsBannerUpdateInput) {
    return this.prisma.cmsBanner.update({ where: { id }, data });
  }

  findBannerById(id: string) {
    return this.prisma.cmsBanner.findUnique({ where: { id } });
  }

  disableBanner(id: string) {
    return this.prisma.cmsBanner.update({
      where: { id },
      data: { status: CmsBannerStatus.INACTIVE },
    });
  }

  deleteBanner(id: string) {
    return this.prisma.cmsBanner.delete({ where: { id } });
  }

  async getSeoSettings() {
    const keys = Object.values(CMS_SEO_SETTING_KEYS);
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      siteTitle: coerceSettingString(map[CMS_SEO_SETTING_KEYS.SITE_TITLE]),
      metaDescription: coerceSettingString(map[CMS_SEO_SETTING_KEYS.META_DESCRIPTION]),
      googleAnalyticsId: coerceSettingString(map[CMS_SEO_SETTING_KEYS.GOOGLE_ANALYTICS_ID]),
      googleTagManagerId: coerceSettingString(map[CMS_SEO_SETTING_KEYS.GOOGLE_TAG_MANAGER_ID]),
      searchConsoleVerification: coerceSettingString(
        map[CMS_SEO_SETTING_KEYS.SEARCH_CONSOLE_VERIFICATION],
      ),
      robotsTxt: coerceSettingString(map[CMS_SEO_SETTING_KEYS.ROBOTS_TXT]),
      sitemapEnabled: coerceSettingBoolean(map[CMS_SEO_SETTING_KEYS.SITEMAP_ENABLED], true),
      sitemapBaseUrl: coerceSettingString(
        map[CMS_SEO_SETTING_KEYS.SITEMAP_BASE_URL],
        'https://cardon.vn',
      ),
      ogImageUrl: coerceSettingString(map[CMS_SEO_SETTING_KEYS.OG_IMAGE_URL]),
    };
  }

  async getThemeSettings() {
    const keys = Object.values(CMS_THEME_SETTING_KEYS);
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      logoDesktop: coerceSettingString(map[CMS_THEME_SETTING_KEYS.LOGO_DESKTOP]),
      logoMobile: coerceSettingString(map[CMS_THEME_SETTING_KEYS.LOGO_MOBILE]),
      favicon: coerceSettingString(map[CMS_THEME_SETTING_KEYS.FAVICON]),
      ogDefaultImage: coerceSettingString(map[CMS_THEME_SETTING_KEYS.OG_DEFAULT_IMAGE]),
      headerMenu: coerceSettingJson<Array<{ label: string; href: string; sortOrder?: number }>>(
        map[CMS_THEME_SETTING_KEYS.HEADER_MENU],
        [],
      ),
      footerColumns: coerceSettingJson<
        Array<{ title: string; links: Array<{ label: string; href: string }> }>
      >(map[CMS_THEME_SETTING_KEYS.FOOTER_COLUMNS], []),
      companyInfo: coerceSettingJson<{
        companyName?: string;
        taxCode?: string;
        address?: string;
        hotline?: string;
        email?: string;
      }>(map[CMS_THEME_SETTING_KEYS.COMPANY_INFO], {}),
      contactChannels: coerceSettingJson<ContactChannel[]>(
        map[CMS_THEME_SETTING_KEYS.CONTACT_CHANNELS],
        DEFAULT_CONTACT_CHANNELS,
      ),
      mobileNav: coerceSettingJson<CmsMobileNavItem[]>(
        map[CMS_THEME_SETTING_KEYS.MOBILE_NAV],
        [],
      ),
    };
  }

  async upsertThemeSetting(key: string, value: unknown, description?: string) {
    return this.upsertSeoSetting(key, value, description);
  }

  findPublishedBlogPosts(filters: {
    categorySlug?: string;
    tagSlug?: string;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.cmsPage.findMany({
      where: {
        type: CmsPageType.BLOG_POST,
        status: CmsPageStatus.PUBLISHED,
        ...(filters.categorySlug
          ? { categoryRel: { slug: filters.categorySlug } }
          : {}),
        ...(filters.tagSlug
          ? { pageTags: { some: { tag: { slug: filters.tagSlug } } } }
          : {}),
      },
      include: PAGE_INCLUDE,
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      skip: filters.skip ?? 0,
      take: filters.take ?? 20,
    });
  }

  findRelatedBlogPosts(pageId: string, categoryId: string | null, take = 4) {
    return this.prisma.cmsPage.findMany({
      where: {
        id: { not: pageId },
        type: CmsPageType.BLOG_POST,
        status: CmsPageStatus.PUBLISHED,
        ...(categoryId ? { categoryId } : {}),
      },
      include: PAGE_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }

  listCategories() {
    return this.prisma.cmsCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  createCategory(data: Prisma.CmsCategoryCreateInput) {
    return this.prisma.cmsCategory.create({ data });
  }

  updateCategory(id: string, data: Prisma.CmsCategoryUpdateInput) {
    return this.prisma.cmsCategory.update({ where: { id }, data });
  }

  deleteCategory(id: string) {
    return this.prisma.cmsCategory.delete({ where: { id } });
  }

  findCategoryBySlug(slug: string) {
    return this.prisma.cmsCategory.findUnique({ where: { slug } });
  }

  countTagUsage(tagId: string) {
    return this.prisma.cmsPageTag.count({ where: { tagId } });
  }

  findTagBySlug(slug: string) {
    return this.prisma.cmsTag.findUnique({ where: { slug } });
  }

  findTagByName(name: string) {
    return this.prisma.cmsTag.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  listTags() {
    return this.prisma.cmsTag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { pageTags: true } } },
    }).then((rows) =>
      rows.map(({ _count, ...tag }) => ({
        ...tag,
        usageCount: _count.pageTags,
      })),
    );
  }

  createTag(data: Prisma.CmsTagCreateInput) {
    return this.prisma.cmsTag.create({ data });
  }

  updateTag(id: string, data: Prisma.CmsTagUpdateInput) {
    return this.prisma.cmsTag.update({ where: { id }, data });
  }

  deleteTag(id: string) {
    return this.prisma.cmsTag.delete({ where: { id } });
  }

  syncPageTags(pageId: string, tagIds: string[]) {
    return this.prisma.$transaction([
      this.prisma.cmsPageTag.deleteMany({ where: { pageId } }),
      ...(tagIds.length
        ? [
            this.prisma.cmsPageTag.createMany({
              data: tagIds.map((tagId) => ({ pageId, tagId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  listMedia(filters?: { folder?: string; search?: string; mimeType?: string }) {
    const where: Prisma.CmsMediaWhereInput = { deletedAt: null };
    if (filters?.folder) {
      where.folder = filters.folder;
    }
    if (filters?.mimeType) {
      where.mimeType = { startsWith: filters.mimeType };
    }
    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { filename: { contains: q, mode: 'insensitive' } },
        { originalName: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { alt: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.cmsMedia.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  createMedia(data: Prisma.CmsMediaCreateInput) {
    return this.prisma.cmsMedia.create({ data });
  }

  findMediaById(id: string) {
    return this.prisma.cmsMedia.findFirst({ where: { id, deletedAt: null } });
  }

  softDeleteMedia(id: string) {
    return this.prisma.cmsMedia.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async upsertSeoSetting(key: string, value: unknown, description?: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, description },
      update: { value: value as Prisma.InputJsonValue, description },
    });
  }
}
