import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
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
  @Get()
  listProducts() {
    return this.productService.listActiveProducts();
  }

  @Public()
  @Get(':id')
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.getActiveProduct(id);
  }
}
