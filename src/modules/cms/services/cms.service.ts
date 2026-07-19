import {
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
import { CMS_SEO_SETTING_KEYS, CMS_THEME_SETTING_KEYS } from '../entities/cms.constants';
import {
  DEFAULT_MOBILE_NAV,
  type CmsMobileNavItem,
} from '../entities/cms-theme.defaults';
import { normalizeContactChannels, type ContactChannel } from '../entities/contact-channels';
import { SETTINGS_KEYS } from '../../settings/entities/settings.constants';
import { normalizeSearchConsoleVerification } from '../utils/seo-settings.util';
import { defaultPageLayoutForSlug, resolveEffectivePageLayout } from '../entities/cms-page-layout';
import { mapCmsPageForPublic, mapCmsBlogPostForPublic } from '../entities/cms-public.mapper';
import { CmsRepository } from '../repositories/cms.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { MaintenanceAvailabilityService } from '../../maintenance-center/services/maintenance-availability.service';

@Injectable()
export class CmsService {
  constructor(
    private readonly repository: CmsRepository,
    private readonly settingsStore: SettingsStoreService,
    private readonly maintenanceAvailability: MaintenanceAvailabilityService,
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

  async getPublishedPageForPublic(slug: string) {
    const page = await this.repository.findPublishedPageBySlug(slug);
    if (!page) return null;
    return mapCmsPageForPublic(page);
  }

  listNavPagesForPublic() {
    return this.repository.findNavPagesForPublic();
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

    const page = await this.repository.createPage({
      type: dto.type,
      slug: dto.slug,
      title: dto.title,
      content: dto.content,
      excerpt: dto.excerpt,
      category: dto.category,
      tags: dto.tags ?? [],
      featuredImage: dto.featuredImage,
      status: dto.status ?? CmsPageStatus.DRAFT,
      pageLayout,
      showInNav,
      navSortOrder,
      publishedAt:
        dto.status === CmsPageStatus.PUBLISHED ? new Date() : undefined,
      author: { connect: { id: authorId } },
      ...(dto.categoryId ? { categoryRel: { connect: { id: dto.categoryId } } } : {}),
    });

    if (dto.tagIds?.length) {
      await this.repository.syncPageTags(page.id, dto.tagIds);
    }

    if (dto.seo) {
      await this.repository.upsertPageSeo(page.id, {
        metaTitle: dto.seo.metaTitle,
        metaDescription: dto.seo.metaDescription,
        metaKeywords: dto.seo.metaKeywords,
        focusKeyword: dto.seo.focusKeyword,
        ogTitle: dto.seo.ogTitle,
        ogDescription: dto.seo.ogDescription,
        ogImage: dto.seo.ogImage,
        canonicalUrl: dto.seo.canonicalUrl,
        robots: dto.seo.robots ?? 'index,follow',
      });
    }

    return this.getPage(page.id);
  }

  async updatePage(id: string, dto: UpdateCmsPageDto) {
    const existing = await this.getPage(id);

    let publishedAt: Date | null | undefined = undefined;
    if (dto.status === CmsPageStatus.PUBLISHED) {
      publishedAt = existing.publishedAt ?? new Date();
    } else if (dto.status === CmsPageStatus.DRAFT || dto.status === CmsPageStatus.ARCHIVED) {
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

    const page = await this.repository.updatePage(id, {
      slug: dto.slug,
      title: dto.title,
      content: dto.content,
      excerpt: dto.excerpt,
      category: dto.category,
      tags: dto.tags,
      featuredImage: dto.featuredImage,
      status: dto.status,
      pageLayout,
      ...(dto.showInNav !== undefined ? { showInNav } : {}),
      ...(dto.showInNav !== undefined || dto.navSortOrder !== undefined ? { navSortOrder } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(dto.categoryId !== undefined
        ? dto.categoryId
          ? { categoryRel: { connect: { id: dto.categoryId } } }
          : { categoryRel: { disconnect: true } }
        : {}),
    });

    if (dto.tagIds) {
      await this.repository.syncPageTags(id, dto.tagIds);
    }

    if (dto.seo) {
      await this.repository.upsertPageSeo(id, {
        metaTitle: dto.seo.metaTitle,
        metaDescription: dto.seo.metaDescription,
        metaKeywords: dto.seo.metaKeywords,
        focusKeyword: dto.seo.focusKeyword,
        ogTitle: dto.seo.ogTitle,
        ogDescription: dto.seo.ogDescription,
        ogImage: dto.seo.ogImage,
        canonicalUrl: dto.seo.canonicalUrl,
        robots: dto.seo.robots ?? 'index,follow',
      });
    }

    return this.getPage(page.id);
  }

  async publishPage(id: string) {
    await this.repository.updatePage(id, {
      status: CmsPageStatus.PUBLISHED,
      publishedAt: new Date(),
    });
    return this.getPage(id);
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
    });
  }

  async updateBanner(id: string, dto: UpdateCmsBannerDto) {
    const banner = await this.repository.findBannerById(id);
    if (!banner) throw new NotFoundException('Banner not found');
    return this.repository.updateBanner(id, {
      title: dto.title,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl,
      position: dto.position as never,
      sortOrder: dto.sortOrder,
      status: dto.status as never,
      startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    });
  }

  async disableBanner(id: string) {
    const banner = await this.repository.findBannerById(id);
    if (!banner) throw new NotFoundException('Banner not found');
    return this.repository.disableBanner(id);
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

    return this.getSeoSettings();
  }

  listBlogPosts(query: ListBlogQueryDto) {
    return this.repository
      .findPublishedBlogPosts({
        categorySlug: query.category,
        tagSlug: query.tag,
        skip: query.skip,
        take: query.take,
      })
      .then((rows) => rows.map(mapCmsBlogPostForPublic));
  }

  async getBlogPost(slug: string) {
    const page = await this.repository.findPublishedPageBySlug(slug);
    if (!page || page.type !== CmsPageType.BLOG_POST) return null;
    const related = await this.repository.findRelatedBlogPosts(
      page.id,
      page.categoryId,
    );
    return {
      post: mapCmsBlogPostForPublic(page),
      related: related.map(mapCmsBlogPostForPublic),
    };
  }

  getThemeSettings() {
    return this.repository.getThemeSettings().then((theme) => this.normalizeTheme(theme));
  }

  private normalizeTheme<T extends {
    headerMenu?: Array<{ label?: string; href?: string; sortOrder?: number }>;
    footerColumns?: Array<{ title?: string; links?: Array<{ label?: string; href?: string }> }>;
    mobileNav?: Array<Partial<CmsMobileNavItem>>;
    contactChannels?: Array<Partial<ContactChannel>>;
  }>(theme: T): T {
    const mobileNav = this.normalizeMobileNav(theme.mobileNav);
    return {
      ...theme,
      headerMenu: (theme.headerMenu ?? []).map((item, i) => ({
        label: (item.label ?? '').trim() || (item.href ?? '').trim() || `Mục ${i + 1}`,
        href: (item.href ?? '/').trim() || '/',
        sortOrder: item.sortOrder ?? i,
      })),
      footerColumns: (theme.footerColumns ?? []).map((col, ci) => ({
        title: (col.title ?? '').trim() || `Cột ${ci + 1}`,
        links: (col.links ?? []).map((link, li) => ({
          label: (link.label ?? '').trim() || (link.href ?? '').trim() || `Liên kết ${li + 1}`,
          href: (link.href ?? '/').trim() || '/',
        })),
      })),
      mobileNav,
      contactChannels: normalizeContactChannels(theme.contactChannels),
    };
  }

  private normalizeMobileNav(items?: Array<Partial<CmsMobileNavItem>>): CmsMobileNavItem[] {
    const source = items && items.length > 0 ? items : DEFAULT_MOBILE_NAV;
    return source
      .map((item, i) => ({
        label: (item.label ?? '').trim() || `Mục ${i + 1}`,
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
    for (const [key, value] of entries) {
      await this.repository.upsertThemeSetting(key, value, 'CMS theme settings');
    }
    return this.getThemeSettings();
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

  listCategories() {
    return this.repository.listCategories();
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

  async getCategoryForPublic(slug: string) {
    const category = await this.repository.findCategoryBySlug(slug);
    if (!category) return null;
    return category;
  }

  listTags() {
    return this.repository.listTags();
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
