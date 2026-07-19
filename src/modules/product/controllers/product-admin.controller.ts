import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import {
  CreateProviderMappingDto,
  UpdateProviderMappingDto,
} from '../dto/provider-mapping.dto';
import { CreateVariantDto, UpdateVariantDto } from '../dto/variant.dto';
import { ListAdminProductsQueryDto } from '../dto/list-admin-products-query.dto';
import { CategoryService } from '../services/category.service';
import { ProductService } from '../services/product.service';
import { ProviderMappingService } from '../services/provider-mapping.service';
import { VariantService } from '../services/variant.service';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('products.manage')
export class ProductAdminController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
    private readonly variantService: VariantService,
    private readonly mappingService: ProviderMappingService,
  ) {}

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoryService.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.updateCategory(id, dto);
  }

  @Post('categories/:id/disable')
  disableCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.disableCategory(id);
  }

  @Post('categories/:id/restore')
  restoreCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.restoreCategory(id);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.deleteCategory(id);
  }

  @Get('categories')
  listCategories() {
    return this.categoryService.listAllCategories();
  }

  @Get()
  listProducts(@Query() query: ListAdminProductsQueryDto) {
    return this.productService.listAdminProducts(query.statusFilter ?? 'all');
  }

  @Post()
  createProduct(@Body() dto: CreateProductDto) {
    return this.productService.createProduct(dto);
  }

  @Patch(':id')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.updateProduct(id, dto);
  }

  @Post(':id/disable')
  disableProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.disableProduct(id);
  }

  @Post(':id/restore')
  restoreProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.restoreProduct(id);
  }

  @Post(':productId/variants')
  createVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.variantService.createVariant(productId, dto);
  }

  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variantService.updateVariant(variantId, dto);
  }

  @Post('variants/:variantId/disable')
  disableVariant(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.variantService.disableVariant(variantId);
  }

  @Post('variants/:variantId/restore')
  restoreVariant(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.variantService.restoreVariant(variantId);
  }

  @Delete('variants/:variantId')
  deleteVariant(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.variantService.deleteVariant(variantId);
  }

  @Post('variants/:variantId/provider-mappings')
  createProviderMapping(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: CreateProviderMappingDto,
  ) {
    return this.mappingService.createMapping(variantId, dto);
  }

  @Post('provider-mappings/:mappingId/disable')
  disableProviderMapping(@Param('mappingId', ParseUUIDPipe) mappingId: string) {
    return this.mappingService.disableMapping(mappingId);
  }

  @Post('provider-mappings/:mappingId/enable')
  enableProviderMapping(@Param('mappingId', ParseUUIDPipe) mappingId: string) {
    return this.mappingService.enableMapping(mappingId);
  }

  @Patch('provider-mappings/:mappingId')
  updateProviderMapping(
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: UpdateProviderMappingDto,
  ) {
    return this.mappingService.updateMapping(mappingId, dto);
  }

  @Get('variants/:variantId/provider-mappings')
  listProviderMappings(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.mappingService.listMappingsByVariant(variantId);
  }

  @Delete(':id')
  deleteProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.deleteProduct(id);
  }
}
