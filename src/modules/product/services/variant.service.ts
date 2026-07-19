import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateVariantDto, UpdateVariantDto } from '../dto/variant.dto';
import {
  assertCategoryHasHomeService,
  assertVariantAllowedForHomeService,
} from '../entities/home-service';
import { mapVariant } from '../entities/product.mapper';
import { CategoryRepository } from '../repositories/category.repository';
import { ProductRepository } from '../repositories/product.repository';
import { VariantRepository } from '../repositories/variant.repository';
import { ProductUsageService } from './product-usage.service';

@Injectable()
export class VariantService {
  constructor(
    private readonly variantRepository: VariantRepository,
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly usage: ProductUsageService,
  ) {}

  private async assertVariantMatchesProductCategory(productId: string, variantType: CreateVariantDto['type']) {
    const product = await this.productRepository.findById(productId);
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    const category = await this.categoryRepository.findById(product.categoryId);
    const homeService = assertCategoryHasHomeService(category?.homeService ?? product.homeService);
    assertVariantAllowedForHomeService(homeService, variantType);
    return product;
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    await this.assertVariantMatchesProductCategory(productId, dto.type);

    const existing = await this.variantRepository.findBySku(dto.sku);
    if (existing) {
      throw new ConflictException('Variant SKU already exists');
    }

    const variant = await this.variantRepository.create({
      sku: dto.sku,
      name: dto.name,
      type: dto.type,
      faceValue: dto.faceValue,
      sellPrice: dto.sellPrice,
      metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      product: { connect: { id: productId } },
    });

    return mapVariant(variant);
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant || variant.deletedAt) {
      throw new NotFoundException('Variant not found');
    }

    if (dto.type) {
      await this.assertVariantMatchesProductCategory(variant.productId, dto.type);
    }

    const updated = await this.variantRepository.update(variantId, {
      name: dto.name,
      type: dto.type,
      faceValue: dto.faceValue,
      sellPrice: dto.sellPrice,
      ...(dto.metadata !== undefined
        ? { metadata: dto.metadata as Prisma.InputJsonValue }
        : {}),
    });

    return mapVariant(updated);
  }

  async disableVariant(variantId: string) {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant || variant.deletedAt) {
      throw new NotFoundException('Variant not found');
    }

    const updated = await this.variantRepository.softDelete(variantId);
    return mapVariant(updated);
  }

  async restoreVariant(variantId: string) {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const updated = await this.variantRepository.restore(variantId);
    return mapVariant(updated);
  }

  listVariantsByProduct(productId: string) {
    return this.variantRepository
      .findByProductId(productId)
      .then((rows) => rows.map(mapVariant));
  }

  async deleteVariant(variantId: string) {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    if (await this.usage.variantHasUsage(variantId)) {
      throw new ConflictException('Variant was used in orders — disable only');
    }
    await this.variantRepository.hardDelete(variantId);
    return { deleted: true, id: variantId };
  }
}
