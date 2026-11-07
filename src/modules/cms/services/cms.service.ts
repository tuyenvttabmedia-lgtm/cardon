import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CmsPageStatus, CmsPageType } from '@prisma/client';
import {
  CreateCmsBannerDto,
  CreateCmsPageDto,
  ListBlogQueryDto,
  ListCmsPagesQueryDto,
  UpdateCmsBannerDto,
  UpdateCmsPageDto,
  UpdateCmsSeoSettingsDto,
  UpdateCmsThemeDto,
  UpsertCmsCategoryDto,
  UpsertCmsTagDto,
} from '../dto/cms.dto';
import {
  CMS_BLOG_LIST_DEFAULT_TAKE,
  CMS_BLOG_LIST_MAX_TAKE,
  CMS_SEO_SETTING_KEYS,
  CMS_THEME_SETTING_KEYS,
  sanitizeHomeBackgrounds,
} from '../entities/cms.constants';
import {
  DEFAULT_MOBILE_NAV,
  type CmsMobileNavItem,
} from '../entities/cms-theme.defaults';
import { normalizeFooterColumn, normalizeHeaderMenuItem, normalizeMobileNavLabel } from '../entities/theme-locale';
import { normalizeContactChannels, type ContactChannel } from '../entities/contact-channels';
import { SETTINGS_KEYS } from '../../settings/entities/settings.constants';
import { normalizeSearchConsoleVerification } from '../utils/seo-settings.util';
import { defaultPageLayoutForSlug, resolveEffectivePageLayout } from '../entities/cms-page-layout';
import {
  mapCmsPageForPublic,
  mapCmsBlogPostForPublic,
  mapCmsBlogPostListItem,
} from '../entities/cms-public.mapper';
import {
  hasEnglishCategoryName,
  hasPublishedEnglishTranslation,
  resolvePublicCategoryLocale,
  resolvePublicPageLocale,
  type CmsContentLocale,
} from '../entities/cms-locale';
import { CmsRepository } from '../repositories/cms.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { MaintenanceAvailabilityService } from '../../maintenance-center/services/maintenance-availability.service';
import { CmsWebRevalidateService } from './cms-web-revalidate.service';

@Injectable()
export class CmsService {
  constructor(
    private readonly repository: CmsRepository,
    private readonly settingsStore: SettingsStoreService,
    private readonly maintenanceAvailability: MaintenanceAvailabilityService,
    private readonly webRevalidate: CmsWebRevalidateService,
  ) {}

  listPages(query: ListCmsPagesQueryDto) {
    return this.repository.findPages({
      type: query.type,
      status: query.status,
    });
  }

  async getPage(id: string) {
    const page = await this.repository.findPageById(id);
    if (!page) throw new NotFoundException('CMS page not found');
    return page;
  }

  /** Lightweight slug lookup (any status) — used by content-automation draft attach. */
  findPageBySlug(slug: string) {
    return this.repository.findPageBySlug(slug);
  }

  async getPublishedPageForPublic(slug: string, locale?: CmsContentLocale) {
    const page = await this.repository.findPublishedPageBySlug(slug, Boolean(locale));
    if (!page) return null;
    return this.presentPage(page, locale, mapCmsPageForPublic);
  }

  async listEnglishSitemap() {
    const [pages, categories] = await Promise.all([
      this.repository.findPublishedEnglishSitemap(),
      this.repository.findCategoriesWithEnglishCopy(),
    ]);
    return {
      pages: pages
        .filter((page) => hasPublishedEnglishTranslation(page.translations))
        .map((page) => ({
          slug: page.slug,
          type: page.type,
          categorySlug: page.categoryRel?.slug ?? null,
          updatedAt: page.updatedAt.toISOString(),
        })),
      categories: categories
        .filter((category) => hasEnglishCategoryName(category.translations))
        .map((category) => ({
          slug: category.slug,
          updatedAt: category.updatedAt.toISOString(),
        })),
    };
  }

  listNavPagesForPublic(locale?: CmsContentLocale) {
    return this.repository.findNavPagesForPublic(Boolean(locale)).then((rows) =>
      rows.map((row) => {
        const resolved = resolvePublicPageLocale(row, locale);
        const item = {
          slug: row.slug,
          title: resolved.page.title,
          navSortOrder: row.navSortOrder,
        };
        return resolved.meta ? { ...item, ...resolved.meta } : item;
      }),
    );
  }

  async createPage(authorId: string, dto: CreateCmsPageDto) {
    const slugTaken = await this.repository.findPageBySlug(dto.slug);
    if (slugTaken) {
      throw new ConflictException('Slug already exists');
    }

    const showInNav = dto.showInNav ?? false;
    const navSortOrder =
      showInNav && dto.navSortOrder == null
        ? await this.repository.nextNavSortOrder()
        : (dto.navSortOrder ?? 0);
    const pageLayout = resolveEffectivePageLayout(
      dto.slug,
      dto.pageLayout ?? defaultPageLayoutForSlug(dto.slug),
      { inNav: showInNav, content: dto.content ?? '' },
    );

    const schedule = this.resolveScheduledPublishAt(dto.scheduledPublishAt);
    let status = dto.status ?? CmsPageStatus.DRAFT;
    if (schedule && schedule.getTime() > Date.now() && status !== CmsPageStatus.PUBLISHED) {
      status = CmsPageStatus.DRAFT;
    }

    const page = await this.repository.createPage(
      {
        type: dto.type,
        slug: dto.slug,
        title: dto.title,
        content: dto.content,
        excerpt: dto.excerpt,
        category: dto.category,
        tags: dto.tags ?? [],
        featuredImage: dto.featuredImage,
        status,
        pageLayout,
        showInNav,
        navSortOrder,
        publishedAt: status === CmsPageStatus.PUBLISHED ? new Date() : undefined,
        scheduledPublishAt: status === CmsPageStatus.PUBLISHED ? null : schedule,
        author: { connect: { id: authorId } },
        ...(dto.categoryId ? { categoryRel: { connect: { id: dto.categoryId } } } : {}),
      },
      dto.seo ? this.pageSeoInput(dto.seo) : undefined,
    );

    if (dto.tagIds?.length) {
      await this.repository.syncPageTags(page.id, dto.tagIds);
    }

    const created = await this.getPage(page.id);
    if (created.status === CmsPageStatus.PUBLISHED) {
      await this.webRevalidate.notifyPublish(created);
    }
    return created;
  }

  async updatePage(id: string, dto: UpdateCmsPageDto) {
    const existing = await this.getPage(id);

    let status = dto.status;
    let publishedAt: Date | null | undefined = undefined;
    let scheduledPublishAt: Date | null | undefined = undefined;

    if (dto.scheduledPublishAt !== undefined) {
      scheduledPublishAt = this.resolveScheduledPublishAt(dto.scheduledPublishAt);
    }

    if (status === CmsPageStatus.PUBLISHED) {
      publishedAt = existing.publishedAt ?? new Date();
      scheduledPublishAt = null;
    } else if (status === CmsPageStatus.DRAFT || status === CmsPageStatus.ARCHIVED) {
      // Unpublish / archive: clear public date. Keep or update schedule separately.
      publishedAt = null;
    }

    // Future schedule forces draft until cron publishes (unless explicitly publishing now).
    if (
      status !== CmsPageStatus.PUBLISHED &&
      scheduledPublishAt &&
      scheduledPublishAt.getTime() > Date.now()
    ) {
      status = CmsPageStatus.DRAFT;
      publishedAt = null;
    }

    const showInNav = dto.showInNav ?? existing.showInNav;
    let navSortOrder = dto.navSortOrder ?? existing.navSortOrder;
    if (dto.showInNav === true && dto.navSortOrder == null && !existing.showInNav) {
      navSortOrder = await this.repository.nextNavSortOrder();
    }

    const slug = dto.slug ?? existing.slug;
    const content = dto.content ?? existing.content;
    const pageLayout = resolveEffectivePageLayout(
      slug,
      dto.pageLayout ?? existing.pageLayout,
      { inNav: showInNav, content },
    );

    const page = await this.repository.updatePage(
      id,
      {
        slug: dto.slug,
        title: dto.title,
        content: dto.content,
        excerpt: dto.excerpt,
        category: dto.category,
        tags: dto.tags,
        featuredImage: dto.featuredImage,
        ...(status !== undefined ? { status } : {}),
        pageLayout,
        ...(dto.showInNav !== undefined ? { showInNav } : {}),
        ...(dto.showInNav !== undefined || dto.navSortOrder !== undefined ? { navSortOrder } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        ...(scheduledPublishAt !== undefined ? { scheduledPublishAt } : {}),
        ...(dto.categoryId !== undefined
          ? dto.categoryId
            ? { categoryRel: { connect: { id: dto.categoryId } } }
            : { categoryRel: { disconnect: true } }
          : {}),
      },
      dto.seo ? this.pageSeoInput(dto.seo) : undefined,
    );

    if (dto.tagIds) {
      await this.repository.syncPageTags(id, dto.tagIds);
    }

    const updated = await this.getPage(page.id);
    if (
      updated.status === CmsPageStatus.PUBLISHED ||
      existing.status === CmsPageStatus.PUBLISHED
    ) {
      await this.webRevalidate.notifyPublish(updated);
    }
    return updated;
  }

  async publishPage(id: string) {
    const existing = await this.getPage(id);
    // Keep the original publish date on re-publish / content edits.
    // Overwriting with now() wrongly bumps listing order and public date.
    await this.repository.updatePage(id, {
      status: CmsPageStatus.PUBLISHED,
      publishedAt: existing.publishedAt ?? new Date(),
      scheduledPublishAt: null,
    });
    const published = await this.getPage(id);
    await this.webRevalidate.notifyPublish(published);
    return published;
  }

  /** Cron: publish drafts whose scheduledPublishAt has passed. */
  async publishDueScheduledPages() {
    const due = await this.repository.findDueScheduledPages();
    for (const page of due) {
      await this.repository.updatePage(page.id, {
        status: CmsPageStatus.PUBLISHED,
        publishedAt: page.publishedAt ?? new Date(),
        scheduledPublishAt: null,
      });
      await this.webRevalidate.notifyPublish(page);
    }
    return due.length;
  }

  private resolveScheduledPublishAt(raw?: string | null): Date | null {
    if (raw === undefined) return null;
    if (raw === null || raw === '') return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid scheduledPublishAt');
    }
    return date;
  }

  listBanners() {
    return this.repository.listBanners();
  }

  listActiveBanners(position?: string) {
    return this.repository.findActiveBanners(position as never);
  }

  createBanner(dto: CreateCmsBannerDto) {
    return this.repository.createBanner({
      title: dto.title,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl,
      position: dto.position as never,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status as never,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    }).then(async (banner) => {
      await this.webRevalidate.notifyBanners();
      return banner;
    });
  }

  async updateBanner(id: string, dto: UpdateCmsBannerDto) {
    const banner = await this.repository.findBannerById(id);
    if (!banner) throw new NotFoundException('Banner not found');
    const updated = await this.repository.updateBanner(id, {
      title: dto.title,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl,
      position: dto.position as never,
      sortOrder: dto.sortOrder,
      status: dto.status as never,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    });
    await this.webRevalidate.notifyBanners();
    return updated;
  }

  async disableBanner(id: string) {
    const banner = await this.repository.findBannerById(id);
    if (!banner) throw new NotFoundException('Banner not found');
    const updated = await this.repository.disableBanner(id);
    await this.webRevalidate.notifyBanners();
    return updated;
  }

  async deleteBanner(id: string) {
    const banner = await this.repository.findBannerById(id);
    if (!banner) throw new NotFoundException('Banner not found');
    return this.repository.deleteBanner(id);
  }

  getSeoSettings() {
    return this.repository.getSeoSettings();
  }

  async getPublicSeoSettings() {
    const seo = await this.getSeoSettings();
    return {
      siteTitle: seo.siteTitle,
      metaDescription: seo.metaDescription,
      googleAnalyticsId: seo.googleAnalyticsId,
      googleTagManagerId: seo.googleTagManagerId,
      searchConsoleVerification: normalizeSearchConsoleVerification(
        seo.searchConsoleVerification,
      ),
      robotsTxt: seo.robotsTxt,
      sitemapEnabled: seo.sitemapEnabled,
      sitemapBaseUrl: seo.sitemapBaseUrl,
      ogImageUrl: seo.ogImageUrl,
    };
  }

  async updateSeoSettings(dto: UpdateCmsSeoSettingsDto) {
    const entries: Array<[string, unknown]> = [];
    if (dto.siteTitle !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.SITE_TITLE, dto.siteTitle]);
    }
    if (dto.metaDescription !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.META_DESCRIPTION, dto.metaDescription]);
    }
    if (dto.googleAnalyticsId !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.GOOGLE_ANALYTICS_ID, dto.googleAnalyticsId]);
    }
    if (dto.googleTagManagerId !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.GOOGLE_TAG_MANAGER_ID, dto.googleTagManagerId]);
    }
    if (dto.searchConsoleVerification !== undefined) {
      entries.push([
        CMS_SEO_SETTING_KEYS.SEARCH_CONSOLE_VERIFICATION,
        normalizeSearchConsoleVerification(dto.searchConsoleVerification),
      ]);
    }
    if (dto.robotsTxt !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.ROBOTS_TXT, dto.robotsTxt]);
    }
    if (dto.sitemapEnabled !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.SITEMAP_ENABLED, dto.sitemapEnabled]);
    }
    if (dto.sitemapBaseUrl !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.SITEMAP_BASE_URL, dto.sitemapBaseUrl]);
    }
    if (dto.ogImageUrl !== undefined) {
      entries.push([CMS_SEO_SETTING_KEYS.OG_IMAGE_URL, dto.ogImageUrl]);
    }

    for (const [key, value] of entries) {
      await this.repository.upsertSeoSetting(key, value, 'CMS SEO settings');
    }

    const settings = await this.getSeoSettings();
    await this.webRevalidate.notifySeoSettings();
    return settings;
  }

  listBlogPosts(query: ListBlogQueryDto) {
    const take = Math.min(query.take ?? CMS_BLOG_LIST_DEFAULT_TAKE, CMS_BLOG_LIST_MAX_TAKE);
    const locale = query.locale;
    return this.repository
      .findPublishedBlogPosts({
        categorySlug: query.category,
        tagSlug: query.tag,
        skip: query.skip,
        take,
        withTranslations: Boolean(locale),
      })
      .then((rows) => rows.map((row) => this.presentPage(row, locale, mapCmsBlogPostListItem)));
  }

  async getBlogPost(slug: string, locale?: CmsContentLocale) {
    const page = await this.repository.findPublishedPageBySlug(slug, Boolean(locale));
    if (!page || page.type !== CmsPageType.BLOG_POST) return null;
    const related = await this.repository.findRelatedBlogPosts(
      page.id,
      page.categoryId,
      4,
      Boolean(locale),
    );
    return {
      post: this.presentPage(page, locale, mapCmsBlogPostForPublic),
      related: related.map((row) => this.presentPage(row, locale, mapCmsBlogPostListItem)),
    };
  }

  /**
   * Record one public view for a published blog post.
   * Kept off the GET detail path so SSR/ISR/crawlers do not inflate counts.
   */
  async recordBlogPostView(slug: string) {
    const page = await this.repository.findPublishedBlogPostIdBySlug(slug);
    if (!page) throw new NotFoundException('Blog post not found');
    const updated = await this.repository.incrementPageViewCount(page.id);
    return { viewCount: updated.viewCount };
  }

  getThemeSettings() {
    return this.repository.getThemeSettings().then((theme) => this.normalizeTheme(theme));
  }

  private normalizeTheme<T extends {
    headerMenu?: Array<{ label?: string; href?: string; sortOrder?: number; labelEn?: string; navKey?: string }>;
    footerColumns?: Array<{
      title?: string;
      titleEn?: string;
      description?: string;
      descriptionEn?: string;
      links?: Array<{ label?: string; href?: string; labelEn?: string; navKey?: string }>;
    }>;
    mobileNav?: Array<Partial<CmsMobileNavItem>>;
    contactChannels?: Array<Partial<ContactChannel>>;
  }>(theme: T): T {
    const mobileNav = this.normalizeMobileNav(theme.mobileNav);
    return {
      ...theme,
      headerMenu: (theme.headerMenu ?? []).map((item, i) => normalizeHeaderMenuItem(item, i)),
      footerColumns: (theme.footerColumns ?? []).map((col, ci) => normalizeFooterColumn(col, ci)),
      mobileNav,
      contactChannels: normalizeContactChannels(theme.contactChannels),
    };
  }

  private normalizeMobileNav(items?: Array<Partial<CmsMobileNavItem>>): CmsMobileNavItem[] {
    const source = items && items.length > 0 ? items : DEFAULT_MOBILE_NAV;
    return source
      .map((item, i) => normalizeMobileNavLabel({
        label: (item.label ?? '').trim() || `Mục ${i + 1}`,
        labelEn: item.labelEn,
        navKey: item.navKey,
        icon: (item.icon ?? '📱').trim() || '📱',
        url: (item.url ?? '/').trim() || '/',
        sortOrder: item.sortOrder ?? i,
        requireLogin: item.requireLogin === true,
        active: item.active !== false,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async updateThemeSettings(dto: UpdateCmsThemeDto) {
    const normalized = { ...dto };
    if (dto.headerMenu) {
      normalized.headerMenu = this.normalizeTheme({ headerMenu: dto.headerMenu }).headerMenu;
    }
    if (dto.footerColumns) {
      normalized.footerColumns = this.normalizeTheme({ footerColumns: dto.footerColumns }).footerColumns;
    }
    if (dto.mobileNav) {
      normalized.mobileNav = this.normalizeMobileNav(dto.mobileNav);
    }
    if (dto.contactChannels) {
      normalized.contactChannels = normalizeContactChannels(dto.contactChannels);
    }
    const entries: Array<[string, unknown]> = [];
    if (normalized.logoDesktop !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.LOGO_DESKTOP, normalized.logoDesktop]);
    }
    if (normalized.logoMobile !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.LOGO_MOBILE, normalized.logoMobile]);
    }
    if (normalized.favicon !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.FAVICON, normalized.favicon]);
    }
    if (normalized.ogDefaultImage !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.OG_DEFAULT_IMAGE, normalized.ogDefaultImage]);
    }
    if (normalized.headerMenu !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.HEADER_MENU, normalized.headerMenu]);
    }
    if (normalized.footerColumns !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.FOOTER_COLUMNS, normalized.footerColumns]);
    }
    if (normalized.companyInfo !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.COMPANY_INFO, normalized.companyInfo]);
    }
    if (normalized.contactChannels !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.CONTACT_CHANNELS, normalized.contactChannels]);
    }
    if (normalized.mobileNav !== undefined) {
      entries.push([CMS_THEME_SETTING_KEYS.MOBILE_NAV, normalized.mobileNav]);
    }
    if (normalized.homeBackgrounds !== undefined) {
      try {
        entries.push([
          CMS_THEME_SETTING_KEYS.HOME_BACKGROUNDS,
          sanitizeHomeBackgrounds(normalized.homeBackgrounds),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const key = message.startsWith('INVALID_HOME_BACKGROUND:')
          ? message.slice('INVALID_HOME_BACKGROUND:'.length)
          : 'homeBackgrounds';
        throw new BadRequestException(
          `Ảnh nền ${key} không hợp lệ. Chỉ nhận đường dẫn ảnh đã tải lên trong /uploads hoặc /images.`,
        );
      }
    }
    for (const [key, value] of entries) {
      await this.repository.upsertThemeSetting(key, value, 'CMS theme settings');
    }
    const theme = await this.getThemeSettings();
    await this.webRevalidate.notifyBanners();
    return theme;
  }

  async getSiteConfig() {
    const theme = await this.getThemeSettings();
    const system = this.settingsStore.resolveSystemConfig();
    const esaleStored = this.settingsStore.getStored<{ enabled?: boolean; topupApiUrl?: string }>(
      SETTINGS_KEYS.PROVIDER_ESALE,
    );
    let providerTopupConfigured = false;
    try {
      const esale = this.settingsStore.resolveEsaleConfig();
      providerTopupConfigured = Boolean(esale.topupApiUrl?.trim());
    } catch {
      providerTopupConfigured = Boolean(esaleStored?.enabled && esaleStored?.topupApiUrl);
    }

    const adminEnabled = system.customerTopupEnabled === true;
    const fulfillmentReady = true;
    const topupReady = adminEnabled && providerTopupConfigured && fulfillmentReady;

    const dataAdminEnabled = system.customerDataEnabled === true;
    const dataFulfillmentReady = false;
    const dataReady = dataAdminEnabled && dataFulfillmentReady;

    return {
      company: theme.companyInfo ?? {},
      siteName: system.siteName ?? 'CardOn.vn',
      publicUrl: system.publicUrl ?? '',
      platformMaintenance: this.maintenanceAvailability.getPublicStatus(),
      orderLimits: {
        guestMaxOrderAmount: this.settingsStore.resolveOrderConfig().guestMaxOrderAmount ?? 0,
        customerMaxOrderAmount: this.settingsStore.resolveOrderConfig().customerMaxOrderAmount ?? 0,
      },
      topup: {
        adminEnabled,
        providerConfigured: providerTopupConfigured,
        fulfillmentReady,
        ready: topupReady,
        reason: !adminEnabled
          ? 'ADMIN_DISABLED'
          : !providerTopupConfigured
            ? 'PROVIDER_NOT_CONFIGURED'
            : !fulfillmentReady
              ? 'PROVIDER_FULFILLMENT_NOT_IMPLEMENTED'
              : null,
      },
      data: {
        adminEnabled: dataAdminEnabled,
        providerConfigured: false,
        fulfillmentReady: dataFulfillmentReady,
        ready: dataReady,
        reason: !dataAdminEnabled
          ? 'ADMIN_DISABLED'
          : !dataFulfillmentReady
            ? 'PROVIDER_FULFILLMENT_NOT_IMPLEMENTED'
            : null,
      },
    };
  }

  getPlatformStatus() {
    this.maintenanceAvailability.applyScheduledTransitions();
    return this.maintenanceAvailability.getPublicStatus();
  }

  listCategoriesForAdmin() {
    return this.repository.listCategories(true);
  }

  listCategories(locale?: CmsContentLocale) {
    if (!locale) return this.repository.listCategories();
    return this.repository.listCategories(true).then((rows) =>
      rows.map((row) => this.presentCategory(row, locale)),
    );
  }

  createCategory(dto: UpsertCmsCategoryDto) {
    return this.repository.createCategory(dto);
  }

  updateCategory(id: string, dto: UpsertCmsCategoryDto) {
    return this.repository.updateCategory(id, dto);
  }

  deleteCategory(id: string) {
    return this.repository.deleteCategory(id);
  }

  async getCategoryBySlug(slug: string) {
    return this.repository.findCategoryBySlug(slug);
  }

  async getCategoryForPublic(slug: string, locale?: CmsContentLocale) {
    const category = await this.repository.findCategoryBySlug(slug, Boolean(locale));
    if (!category) return null;
    return locale ? this.presentCategory(category, locale) : category;
  }

  private presentPage<T>(
    page: Parameters<typeof resolvePublicPageLocale>[0],
    locale: CmsContentLocale | undefined,
    map: (page: never) => T,
  ): T {
    const resolved = resolvePublicPageLocale(page, locale);
    const view = map(resolved.page as never);
    return resolved.meta ? ({ ...view, ...resolved.meta } as T) : view;
  }

  private presentCategory<T extends Parameters<typeof resolvePublicCategoryLocale>[0]>(
    category: T,
    locale: CmsContentLocale,
  ) {
    const resolved = resolvePublicCategoryLocale(category, locale);
    const { translations: _translations, ...rest } = resolved.category;
    return { ...rest, ...resolved.meta };
  }

  listTags() {
    return this.repository.listTags();
  }

  async savePageTranslation(
    id: string,
    locale: string,
    dto: {
      title: string;
      excerpt?: string;
      content: string;
      status?: CmsPageStatus;
      seo?: {
        metaTitle?: string;
        metaDescription?: string;
        metaKeywords?: string;
        ogTitle?: string;
        ogDescription?: string;
      };
    },
  ) {
    if (locale !== 'vi' && locale !== 'en') {
      throw new BadRequestException('locale must be vi or en');
    }
    if (locale === 'vi') {
      return this.updatePage(id, {
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content,
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.seo?.metaTitle && dto.seo.metaDescription
          ? {
              seo: {
                metaTitle: dto.seo.metaTitle,
                metaDescription: dto.seo.metaDescription,
                metaKeywords: dto.seo.metaKeywords,
                ogTitle: dto.seo.ogTitle,
                ogDescription: dto.seo.ogDescription,
              },
            }
          : {}),
      });
    }
    const saved = await this.repository.upsertEnglishPageTranslation(id, {
      title: dto.title,
      excerpt: dto.excerpt,
      content: dto.content,
      status: dto.status,
      seo: {
        metaTitle: (dto.seo?.metaTitle || dto.title).slice(0, 128),
        metaDescription: (dto.seo?.metaDescription || dto.excerpt || dto.title).slice(0, 256),
        metaKeywords: dto.seo?.metaKeywords,
        ogTitle: dto.seo?.ogTitle,
        ogDescription: dto.seo?.ogDescription,
      },
    });
    if (!saved) throw new NotFoundException('CMS page not found');
    return saved;
  }

  async saveCategoryTranslation(
    id: string,
    locale: string,
    dto: { name: string; description?: string },
  ) {
    if (locale !== 'vi' && locale !== 'en') {
      throw new BadRequestException('locale must be vi or en');
    }
    if (locale === 'vi') {
      const current = await this.repository.findCategoryById(id);
      if (!current) throw new NotFoundException('Category not found');
      return this.updateCategory(id, {
        slug: current.slug,
        name: dto.name,
        description: dto.description ?? current.description ?? undefined,
        intro: current.intro ?? undefined,
        metaTitle: current.metaTitle ?? undefined,
        metaDescription: current.metaDescription ?? undefined,
        canonicalUrl: current.canonicalUrl ?? undefined,
        ogImageUrl: current.ogImageUrl ?? undefined,
        sortOrder: current.sortOrder,
      });
    }
    const saved = await this.repository.upsertEnglishCategoryTranslation(id, dto);
    if (!saved) throw new NotFoundException('Category not found');
    return saved;
  }

  async saveTagTranslation(
    id: string,
    locale: string,
    dto: { name: string; metaTitle?: string; metaDescription?: string },
  ) {
    if (locale !== 'vi' && locale !== 'en') {
      throw new BadRequestException('locale must be vi or en');
    }
    if (locale === 'vi') {
      const current = await this.repository.findTagById(id);
      if (!current) throw new NotFoundException('Tag not found');
      return this.updateTag(id, {
        slug: current.slug,
        name: dto.name,
        metaTitle: dto.metaTitle ?? current.metaTitle ?? undefined,
        metaDescription: dto.metaDescription ?? current.metaDescription ?? undefined,
      });
    }
    const saved = await this.repository.upsertEnglishTagTranslation(id, dto);
    if (!saved) throw new NotFoundException('Tag not found');
    return saved;
  }

  private pageSeoInput(seo: {
    metaTitle: string;
    metaDescription: string;
    metaKeywords?: string;
    focusKeyword?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    canonicalUrl?: string;
    robots?: string;
  }) {
    return {
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      metaKeywords: seo.metaKeywords,
      focusKeyword: seo.focusKeyword,
      ogTitle: seo.ogTitle,
      ogDescription: seo.ogDescription,
      ogImage: seo.ogImage,
      canonicalUrl: seo.canonicalUrl,
      robots: seo.robots ?? 'index,follow',
    };
  }

  async createTag(dto: UpsertCmsTagDto) {
    await this.assertTagUnique(dto.slug, dto.name);
    return this.repository.createTag({
      ...dto,
      isHidden: dto.isHidden ?? false,
    });
  }

  async updateTag(id: string, dto: UpsertCmsTagDto) {
    await this.assertTagUnique(dto.slug, dto.name, id);
    return this.repository.updateTag(id, dto);
  }

  async deleteTag(id: string) {
    const usage = await this.repository.countTagUsage(id);
    if (usage > 0) {
      throw new ConflictException(`Tag đang được sử dụng bởi ${usage} bài viết.`);
    }
    return this.repository.deleteTag(id);
  }

  async toggleTagVisibility(id: string, isHidden: boolean) {
    return this.repository.updateTag(id, { isHidden });
  }

  private async assertTagUnique(slug: string, name: string, excludeId?: string) {
    const slugTaken = await this.repository.findTagBySlug(slug);
    if (slugTaken && slugTaken.id !== excludeId) {
      throw new ConflictException('Slug tag đã tồn tại');
    }
    const nameTaken = await this.repository.findTagByName(name);
    if (nameTaken && nameTaken.id !== excludeId) {
      throw new ConflictException('Tên tag đã tồn tại');
    }
  }
}
