import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ListBlogQueryDto } from '../dto/cms.dto';
import { CmsService } from '../services/cms.service';

/** Public read-only CMS routes — content sanitized at response boundary. */
@Controller('cms')
export class CmsPublicController {
  constructor(private readonly cmsService: CmsService) {}

  @Get('pages/nav')
  listNavPages() {
    return this.cmsService.listNavPagesForPublic();
  }

  @Get('pages/:slug')
  async getPublishedPage(@Param('slug') slug: string) {
    const page = await this.cmsService.getPublishedPageForPublic(slug);
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  @Get('blog/posts')
  listBlogPosts(@Query() query: ListBlogQueryDto) {
    return this.cmsService.listBlogPosts(query);
  }

  @Get('blog/posts/:slug')
  async getBlogPost(@Param('slug') slug: string) {
    const result = await this.cmsService.getBlogPost(slug);
    if (!result) throw new NotFoundException('Blog post not found');
    return result;
  }

  @Get('blog/categories')
  listBlogCategories() {
    return this.cmsService.listCategories();
  }

  @Get('blog/categories/:slug')
  async getBlogCategory(@Param('slug') slug: string) {
    const category = await this.cmsService.getCategoryForPublic(slug);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  @Get('seo-settings')
  @Header('Cache-Control', 'no-store')
  getSeoSettings() {
    return this.cmsService.getPublicSeoSettings();
  }

  @Get('theme')
  @Header('Cache-Control', 'no-store')
  getThemeSettings() {
    return this.cmsService.getThemeSettings();
  }

  @Get('site-config')
  getSiteConfig() {
    return this.cmsService.getSiteConfig();
  }

  @Get('platform-status')
  @Header('Cache-Control', 'no-store')
  getPlatformStatus() {
    return this.cmsService.getPlatformStatus();
  }

  @Get('banners')
  listBanners(@Query('position') position?: string) {
    return this.cmsService.listActiveBanners(position);
  }
}
