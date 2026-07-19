import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HomeServiceType } from '@prisma/client';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import { filterPublicCatalogByHomeService } from '../entities/catalog-availability';
import { assertCategoryHasHomeService } from '../entities/home-service';
import { mapAdminProduct, mapProduct } from '../entities/product.mapper';
import { CategoryRepository } from '../repositories/category.repository';
import { ProductRepository } from '../repositories/product.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { ProductUsageService } from './product-usage.service';

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly usage: ProductUsageService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  private async resolveCategoryHomeService(categoryId: string) {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return assertCategoryHasHomeService(category.homeService);
  }

  async createProduct(dto: CreateProductDto) {
    const homeService = await this.resolveCategoryHomeService(dto.categoryId);

    const existing = await this.productRepository.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException('Product slug already exists');
    }

    const product = await this.productRepository.create({
      slug: dto.slug,
      name: dto.name,
      description: dto.description,
      logoUrl: dto.logoUrl,
      bannerUrl: dto.bannerUrl,
      homeService,
      category: { connect: { id: dto.categoryId } },
    });

    return mapProduct({ ...product, variants: [] });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.productRepository.findById(id);
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    let homeService = product.homeService;
    if (dto.categoryId) {
      homeService = await this.resolveCategoryHomeService(dto.categoryId);
    }

    const updated = await this.productRepository.update(id, {
      name: dto.name,
      description: dto.description,
      logoUrl: dto.logoUrl,
      bannerUrl: dto.bannerUrl,
      homeService,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
    });

    return mapProduct({ ...updated, variants: [] });
  }

  async disableProduct(id: string) {
    const product = await this.productRepository.findById(id);
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.productRepository.softDelete(id);
    return mapProduct({ ...updated, variants: [] });
  }

  async restoreProduct(id: string) {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.productRepository.restore(id);
    return mapProduct({ ...updated, variants: [] });
  }

  async listActiveProducts() {
    const products = await this.productRepository.findManyActive();
    const dataEnabled = this.settingsStore.resolveSystemConfig().customerDataEnabled;
    return filterPublicCatalogByHomeService(products, dataEnabled).map((row) => mapProduct(row));
  }

  async listAdminProducts(statusFilter: 'active' | 'inactive' | 'all' = 'all') {
    const products = await this.productRepository.findManyAdmin(statusFilter);
    return products.map((row) => mapAdminProduct(row));
  }

  async getActiveProduct(id: string) {
    const product = await this.productRepository.findActiveById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const dataEnabled = this.settingsStore.resolveSystemConfig().customerDataEnabled;
    if (!dataEnabled && product.homeService === HomeServiceType.DATA) {
      throw new NotFoundException('Product not found');
    }
    return mapProduct(product);
  }

  async deleteProduct(id: string) {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (await this.usage.productHasUsage(id)) {
      throw new ConflictException('Product was used in orders — disable only');
    }
    await this.productRepository.hardDelete(id);
    return { deleted: true, id };
  }
}
