import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ListFaqPublicQueryDto } from '../dto/faq.dto';
import { FaqService } from '../services/faq.service';

@Controller('cms')
export class FaqPublicController {
  constructor(private readonly faqService: FaqService) {}

  @Get('faq/categories')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  listCategories() {
    return this.faqService.listCategoriesPublic();
  }

  @Get('faqs/sitemap')
  @Header('Cache-Control', 'public, s-maxage=300')
  sitemapFaqs() {
    return this.faqService.listSitemapFaqs();
  }

  @Get('faqs/:categorySlug/:slug')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  getFaqDetail(@Param('categorySlug') categorySlug: string, @Param('slug') slug: string) {
    return this.faqService.getPublicFaqDetail(categorySlug, slug);
  }

  @Get(['faqs', 'faq'])
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  listFaqs(@Query() query: ListFaqPublicQueryDto & { category?: string }) {
    return this.faqService.listFaqsPublic({
      ...query,
      legacyCategory: query.category,
    });
  }
}
