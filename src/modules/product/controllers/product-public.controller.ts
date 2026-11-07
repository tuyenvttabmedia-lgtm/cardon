import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { extractClientCountryCode } from '../../../common/utils/request-client.util';
import { resolveRetailMarket } from '../entities/retail-market';
import { CategoryService } from '../services/category.service';
import { ProductService } from '../services/product.service';

@Controller('products')
export class ProductPublicController {
  constructor(
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
  ) {}

  @Public()
  @Get('categories')
  listCategories() {
    return this.categoryService.listActiveCategories();
  }

  @Public()
  @Get('market')
  retailMarket(@Req() req: Request) {
    const market = resolveRetailMarket(extractClientCountryCode(req));
    return { market };
  }

  @Public()
  @Get()
  listProducts(@Req() req: Request) {
    return this.productService.listActiveProducts(resolveRetailMarket(extractClientCountryCode(req)));
  }

  @Public()
  @Get('by-slug/:slug')
  getProductBySlug(@Param('slug') slug: string, @Req() req: Request) {
    return this.productService.getActiveProductBySlug(
      slug,
      resolveRetailMarket(extractClientCountryCode(req)),
    );
  }

  @Public()
  @Get(':id')
  getProduct(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.productService.getActiveProduct(id, resolveRetailMarket(extractClientCountryCode(req)));
  }
}
