import { Injectable } from '@nestjs/common';
import { CmsService } from '../../cms/services/cms.service';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import type { BrandContext } from '../entities/brand-context.types';

@Injectable()
export class BrandContextService {
  constructor(
    private readonly cmsService: CmsService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  async getBrandContext(): Promise<BrandContext> {
    const [theme, seo, system] = await Promise.all([
      this.cmsService.getThemeSettings(),
      this.cmsService.getSeoSettings(),
      this.settingsStore.resolveSystemConfig(),
    ]);

    const company = theme.companyInfo;

    return {
      siteName: system.siteName ?? 'CardOn.vn',
      publicUrl: system.publicUrl ?? '',
      siteTitle: seo.siteTitle ?? null,
      metaDescription: seo.metaDescription ?? null,
      companyName: company?.companyName ?? null,
      hotline: company?.hotline ?? null,
      email: company?.email ?? null,
      address: company?.address ?? null,
      source: 'CMS_THEME',
    };
  }
}
