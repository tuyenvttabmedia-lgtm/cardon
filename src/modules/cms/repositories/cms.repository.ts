import { Injectable } from '@nestjs/common';
import {
  CmsBannerStatus,
  CmsPageStatus,
  CmsPageType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  CMS_SEO_SETTING_KEYS,
  CMS_THEME_SETTING_KEYS,
  type CmsHomeBackgrounds,
} from '../entities/cms.constants';
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

const ADMIN_PAGE_INCLUDE = {
  ...PAGE_INCLUDE,
  translations: true,
  seoTranslations: true,
};

const PUBLIC_PAGE_INCLUDE = {
  seo: true,
  translations: true,
  seoTranslations: true,
  author: { select: { id: true, email: true } },
  categoryRel: { include: { translations: true } },
  pageTags: { include: { tag: { include: { translations: true } } } },
};

const BLOG_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  featuredImage: true,
  publishedAt: true,
  pageLayout: true,
  showInNav: true,
  category: true,
  seo: {
    select: {
      metaTitle: true,
      metaDescription: true,
      ogTitle: true,
      ogDescription: true,
      ogImage: true,
    },
  },
  categoryRel: { select: { name: true, slug: true } },
  pageTags: { select: { tag: { select: { name: true, slug: true } } } },
} as const;

const BLOG_LIST_LOCALE_SELECT = {
  ...BLOG_LIST_SELECT,
  translations: {
    select: { locale: true, title: true, excerpt: true, content: true, status: true },
  },
  seoTranslations: {
    select: {
      locale: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      focusKeyword: true,
      ogTitle: true,
      ogDescription: true,
      canonicalUrl: true,
    },
  },
  categoryRel: {
    select: {
      name: true,
      slug: true,
      translations: { select: { locale: true, name: true } },
    },
  },
  pageTags: {
    select: {
      tag: {
        select: {
          name: true,
          slug: true,
          translations: { select: { locale: true, name: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class CmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPages(filters: { type?: CmsPageType; status?: CmsPageStatus }) {
    return this.prisma.cmsPage.findMany({
      where: {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: ADMIN_PAGE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findPageById(id: string) {
    return this.prisma.cmsPage.findUnique({
      where: { id },
      include: ADMIN_PAGE_INCLUDE,
    });
  }

  findPageBySlug(slug: string) {
    return this.prisma.cmsPage.findUnique({ where: { slug } });
  }

  findDueScheduledPages(now = new Date()) {
    return this.prisma.cmsPage.findMany({
      where: {
        status: CmsPageStatus.DRAFT,
        scheduledPublishAt: { lte: now, not: null },
      },
      select: {
        id: true,
        type: true,
        publishedAt: true,
        title: true,
        slug: true,
        categoryRel: { select: { slug: true } },
      },
      take: 50,
    });
  }

  findPublishedPageBySlug(slug: string, withTranslations = false) {
    return this.prisma.cmsPage.findFirst({
      where: { slug, status: CmsPageStatus.PUBLISHED },
      include: withTranslations ? PUBLIC_PAGE_INCLUDE : PAGE_INCLUDE,
    });
  }

  findNavPagesForPublic(withTranslations = false) {
    return this.prisma.cmsPage.findMany({
      where: {
        type: CmsPageType.PAGE,
        status: CmsPageStatus.PUBLISHED,
        showInNav: true,
      },
      select: withTranslations
        ? {
            slug: true,
            title: true,
            navSortOrder: true,
            excerpt: true,
            translations: {
              select: { locale: true, title: true, excerpt: true, content: true, status: true },
            },
          }
        : { slug: true, title: true, navSortOrder: true },
      orderBy: [{ navSortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  findPublishedEnglishSitemap() {
    return this.prisma.cmsPage.findMany({
      where: {
        status: CmsPageStatus.PUBLISHED,
        translations: { some: { locale: 'en', status: CmsPageStatus.PUBLISHED } },
      },
      select: {
        slug: true,
        type: true,
        updatedAt: true,
        categoryRel: { select: { slug: true } },
        translations: {
          where: { locale: 'en' },
          select: { locale: true, status: true },
        },
      },
      orderBy: { slug: 'asc' },
    });
  }

  findCategoriesWithEnglishCopy() {
    return this.prisma.cmsCategory.findMany({
      where: { translations: { some: { locale: 'en' } } },
      select: {
        slug: true,
        updatedAt: true,
        translations: {
          where: { locale: 'en' },
          select: { locale: true, name: true },
        },
      },
      orderBy: { slug: 'asc' },
    });
  }

  async nextNavSortOrder(): Promise<number> {
    const agg = await this.prisma.cmsPage.aggregate({
      where: { type: CmsPageType.PAGE, showInNav: true },
      _max: { navSortOrder: true },
    });
    return (agg._max.navSortOrder ?? 0) + 1;
  }

  createPage(data: Prisma.CmsPageCreateInput, seo?: Prisma.CmsSeoCreateWithoutPageInput) {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.cmsPage.create({ data });
      if (seo) await this.upsertSeoTx(tx, page.id, seo);
      await this.mirrorVietnamesePage(tx, page, seo ?? null);
      return tx.cmsPage.findUniqueOrThrow({ where: { id: page.id }, include: ADMIN_PAGE_INCLUDE });
    });
  }

  updatePage(id: string, data: Prisma.CmsPageUpdateInput, seo?: Prisma.CmsSeoCreateWithoutPageInput) {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.cmsPage.update({ where: { id }, data });
      if (seo) await this.upsertSeoTx(tx, id, seo);
      await this.mirrorVietnamesePage(tx, page, seo ?? null);
      return tx.cmsPage.findUniqueOrThrow({ where: { id }, include: ADMIN_PAGE_INCLUDE });
    });
  }

  upsertEnglishPageTranslation(
    pageId: string,
    input: {
      title: string;
      excerpt?: string | null;
      content: string;
      status?: CmsPageStatus;
      seo?: Prisma.CmsSeoCreateWithoutPageInput | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.cmsPage.findUnique({ where: { id: pageId }, select: { id: true } });
      if (!page) return null;
      const existing = await tx.cmsPageTranslation.findUnique({
        where: { pageId_locale: { pageId, locale: 'en' } },
        select: { status: true },
      });
      const status = input.status ?? existing?.status ?? CmsPageStatus.DRAFT;
      await tx.cmsPageTranslation.upsert({
        where: { pageId_locale: { pageId, locale: 'en' } },
        create: {
          pageId,
          locale: 'en',
          title: input.title,
          excerpt: input.excerpt,
          content: input.content,
          status,
        },
        update: {
          title: input.title,
          excerpt: input.excerpt,
          content: input.content,
          status,
        },
      });
      if (input.seo) {
        await tx.cmsSeoTranslation.upsert({
          where: { pageId_locale: { pageId, locale: 'en' } },
          create: { pageId, locale: 'en', ...this.seoText(input.seo) },
          update: this.seoText(input.seo),
        });
      }
      return tx.cmsPage.findUniqueOrThrow({ where: { id: pageId }, include: ADMIN_PAGE_INCLUDE });
    });
  }

  /** Atomic view increment without touching updated_at (keeps admin sort stable). */
  async incrementPageViewCount(id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; view_count: number }>>`
      UPDATE "cms_pages"
      SET "view_count" = "view_count" + 1
      WHERE "id" = ${id}::uuid
      RETURNING "id", "view_count"
    `;
    const row = rows[0];
    if (!row) {
      throw new Error(`CmsPage ${id} not found for view increment`);
    }
    return { id: row.id, viewCount: row.view_count };
  }

  findPublishedBlogPostIdBySlug(slug: string) {
    return this.prisma.cmsPage.findFirst({
      where: {
        slug,
        type: CmsPageType.BLOG_POST,
        status: CmsPageStatus.PUBLISHED,
      },
      select: { id: true, viewCount: true },
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
      headerMenu: coerceSettingJson<
        Array<{ label: string; href: string; sortOrder?: number; labelEn?: string; navKey?: string }>
      >(
        map[CMS_THEME_SETTING_KEYS.HEADER_MENU],
        [],
      ),
      footerColumns: coerceSettingJson<
        Array<{
          title: string;
          titleEn?: string;
          description?: string;
          descriptionEn?: string;
          links: Array<{ label: string; href: string; labelEn?: string; navKey?: string }>;
        }>
      >(map[CMS_THEME_SETTING_KEYS.FOOTER_COLUMNS], []),
      companyInfo: coerceSettingJson<{
        companyName?: string;
        companyNameEn?: string;
        taxCode?: string;
        address?: string;
        addressEn?: string;
        hotline?: string;
        email?: string;
        workingHours?: string;
        workingHoursEn?: string;
        description?: string;
        descriptionEn?: string;
        taxLabelEn?: string;
        addressLabelEn?: string;
        emailLabelEn?: string;
        hotlineLabelEn?: string;
        hoursLabelEn?: string;
        boCongThuongEnabled?: boolean;
        boCongThuongImageUrl?: string;
        boCongThuongLinkUrl?: string;
        googleMapEnabled?: boolean;
        googleMapEmbedUrl?: string;
      }>(map[CMS_THEME_SETTING_KEYS.COMPANY_INFO], {}),
      contactChannels: coerceSettingJson<ContactChannel[]>(
        map[CMS_THEME_SETTING_KEYS.CONTACT_CHANNELS],
        DEFAULT_CONTACT_CHANNELS,
      ),
      mobileNav: coerceSettingJson<CmsMobileNavItem[]>(
        map[CMS_THEME_SETTING_KEYS.MOBILE_NAV],
        [],
      ),
      homeBackgrounds: coerceSettingJson<CmsHomeBackgrounds>(
        map[CMS_THEME_SETTING_KEYS.HOME_BACKGROUNDS],
        {},
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
    withTranslations?: boolean;
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
      select: filters.withTranslations ? BLOG_LIST_LOCALE_SELECT : BLOG_LIST_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      skip: filters.skip ?? 0,
      take: filters.take ?? 20,
    });
  }

  findRelatedBlogPosts(pageId: string, categoryId: string | null, take = 4, withTranslations = false) {
    return this.prisma.cmsPage.findMany({
      where: {
        id: { not: pageId },
        type: CmsPageType.BLOG_POST,
        status: CmsPageStatus.PUBLISHED,
        ...(categoryId ? { categoryId } : {}),
      },
      select: withTranslations ? BLOG_LIST_LOCALE_SELECT : BLOG_LIST_SELECT,
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }

  listCategories(withTranslations = false) {
    return this.prisma.cmsCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      ...(withTranslations ? { include: { translations: true } } : {}),
    });
  }

  createCategory(data: Prisma.CmsCategoryCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.cmsCategory.create({ data });
      await this.mirrorVietnameseCategory(tx, category);
      return tx.cmsCategory.findUniqueOrThrow({
        where: { id: category.id },
        include: { translations: true },
      });
    });
  }

  updateCategory(id: string, data: Prisma.CmsCategoryUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.cmsCategory.update({ where: { id }, data });
      await this.mirrorVietnameseCategory(tx, category);
      return tx.cmsCategory.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });
  }

  upsertEnglishCategoryTranslation(
    categoryId: string,
    input: { name: string; description?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.cmsCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
      if (!category) return null;
      await tx.cmsCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale: 'en' } },
        create: {
          categoryId,
          locale: 'en',
          name: input.name,
          description: input.description,
        },
        update: { name: input.name, description: input.description },
      });
      return tx.cmsCategory.findUniqueOrThrow({
        where: { id: categoryId },
        include: { translations: true },
      });
    });
  }

  deleteCategory(id: string) {
    return this.prisma.cmsCategory.delete({ where: { id } });
  }

  findCategoryById(id: string) {
    return this.prisma.cmsCategory.findUnique({ where: { id } });
  }

  findTagById(id: string) {
    return this.prisma.cmsTag.findUnique({ where: { id } });
  }

  findCategoryBySlug(slug: string, withTranslations = false) {
    return this.prisma.cmsCategory.findUnique({
      where: { slug },
      ...(withTranslations ? { include: { translations: true } } : {}),
    });
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
      include: { _count: { select: { pageTags: true } }, translations: true },
    }).then((rows) =>
      rows.map(({ _count, ...tag }) => ({
        ...tag,
        usageCount: _count.pageTags,
      })),
    );
  }

  createTag(data: Prisma.CmsTagCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const tag = await tx.cmsTag.create({ data });
      await this.mirrorVietnameseTag(tx, tag);
      return tx.cmsTag.findUniqueOrThrow({ where: { id: tag.id }, include: { translations: true } });
    });
  }

  updateTag(id: string, data: Prisma.CmsTagUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const tag = await tx.cmsTag.update({ where: { id }, data });
      await this.mirrorVietnameseTag(tx, tag);
      return tx.cmsTag.findUniqueOrThrow({ where: { id }, include: { translations: true } });
    });
  }

  upsertEnglishTagTranslation(
    tagId: string,
    input: { name: string; metaTitle?: string | null; metaDescription?: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tag = await tx.cmsTag.findUnique({ where: { id: tagId }, select: { id: true } });
      if (!tag) return null;
      await tx.cmsTagTranslation.upsert({
        where: { tagId_locale: { tagId, locale: 'en' } },
        create: {
          tagId,
          locale: 'en',
          name: input.name,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
        },
        update: {
          name: input.name,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
        },
      });
      return tx.cmsTag.findUniqueOrThrow({ where: { id: tagId }, include: { translations: true } });
    });
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

  updateMedia(
    id: string,
    data: { alt?: string | null; title?: string | null; folder?: string },
  ) {
    return this.prisma.cmsMedia.update({
      where: { id },
      data: {
        ...(data.alt !== undefined ? { alt: data.alt } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.folder !== undefined ? { folder: data.folder } : {}),
      },
    });
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

  private upsertSeoTx(tx: Prisma.TransactionClient, pageId: string, seo: Prisma.CmsSeoCreateWithoutPageInput) {
    return tx.cmsSeo.upsert({
      where: { pageId },
      create: { pageId, ...seo },
      update: seo,
    });
  }

  private seoText(seo: Prisma.CmsSeoCreateWithoutPageInput) {
    return {
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      metaKeywords: seo.metaKeywords,
      focusKeyword: seo.focusKeyword,
      ogTitle: seo.ogTitle,
      ogDescription: seo.ogDescription,
      canonicalUrl: seo.canonicalUrl,
    };
  }

  private async mirrorVietnamesePage(
    tx: Prisma.TransactionClient,
    page: { id: string; title: string; excerpt: string | null; content: string; status: CmsPageStatus },
    seo: Prisma.CmsSeoCreateWithoutPageInput | null,
  ) {
    await tx.cmsPageTranslation.upsert({
      where: { pageId_locale: { pageId: page.id, locale: 'vi' } },
      create: {
        pageId: page.id,
        locale: 'vi',
        title: page.title,
        excerpt: page.excerpt,
        content: page.content,
        status: page.status,
      },
      update: {
        title: page.title,
        excerpt: page.excerpt,
        content: page.content,
        status: page.status,
      },
    });
    if (!seo) return;
    await tx.cmsSeoTranslation.upsert({
      where: { pageId_locale: { pageId: page.id, locale: 'vi' } },
      create: { pageId: page.id, locale: 'vi', ...this.seoText(seo) },
      update: this.seoText(seo),
    });
  }

  private mirrorVietnameseCategory(
    tx: Prisma.TransactionClient,
    category: {
      id: string;
      name: string;
      description: string | null;
      intro: string | null;
      metaTitle: string | null;
      metaDescription: string | null;
      canonicalUrl: string | null;
    },
  ) {
    const text = {
      name: category.name,
      description: category.description,
      intro: category.intro,
      metaTitle: category.metaTitle,
      metaDescription: category.metaDescription,
      canonicalUrl: category.canonicalUrl,
    };
    return tx.cmsCategoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: category.id, locale: 'vi' } },
      create: { categoryId: category.id, locale: 'vi', ...text },
      update: text,
    });
  }

  private mirrorVietnameseTag(
    tx: Prisma.TransactionClient,
    tag: { id: string; name: string; metaTitle: string | null; metaDescription: string | null },
  ) {
    const text = {
      name: tag.name,
      metaTitle: tag.metaTitle,
      metaDescription: tag.metaDescription,
    };
    return tx.cmsTagTranslation.upsert({
      where: { tagId_locale: { tagId: tag.id, locale: 'vi' } },
      create: { tagId: tag.id, locale: 'vi', ...text },
      update: text,
    });
  }
}
