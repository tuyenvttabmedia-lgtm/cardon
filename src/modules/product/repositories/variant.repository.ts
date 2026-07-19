import { Injectable } from '@nestjs/common';
import { Prisma, ProductVariantStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_VARIANT_WHERE } from '../entities/product.constants';

@Injectable()
export class VariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductVariantCreateInput) {
    return this.prisma.productVariant.create({ data });
  }

  update(id: string, data: Prisma.ProductVariantUpdateInput) {
    return this.prisma.productVariant.update({ where: { id }, data });
  }

  findById(id: string) {
    return this.prisma.productVariant.findUnique({
      where: { id },
      include: { product: true },
    });
  }

  findBySku(sku: string) {
    return this.prisma.productVariant.findUnique({ where: { sku } });
  }

  findActiveById(id: string) {
    return this.prisma.productVariant.findFirst({
      where: { id, ...ACTIVE_VARIANT_WHERE },
      include: { product: true },
    });
  }

  findByProductId(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { faceValue: 'asc' },
    });
  }

  softDelete(id: string) {
    return this.prisma.productVariant.update({
      where: { id },
      data: {
        status: ProductVariantStatus.INACTIVE,
        deletedAt: new Date(),
      },
    });
  }

  restore(id: string) {
    return this.prisma.productVariant.update({
      where: { id },
      data: {
        status: ProductVariantStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  async hardDelete(id: string) {
    await this.prisma.$transaction([
      this.prisma.providerProductMapping.deleteMany({ where: { productVariantId: id } }),
      this.prisma.productVariant.delete({ where: { id } }),
    ]);
  }
}
