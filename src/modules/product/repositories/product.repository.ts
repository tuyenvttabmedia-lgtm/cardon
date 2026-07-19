import { Injectable } from '@nestjs/common';
import { CatalogProductStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  ACTIVE_PRODUCT_WHERE,
  ACTIVE_VARIANT_WHERE,
} from '../entities/product.constants';

const PUBLIC_PRODUCT_INCLUDE = {
  category: true,
  variants: {
    where: ACTIVE_VARIANT_WHERE,
    orderBy: { faceValue: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

const ADMIN_PRODUCT_INCLUDE = {
  category: true,
  variants: {
    orderBy: { faceValue: 'asc' as const },
    include: {
      providerMappings: {
        include: {
          provider: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ priority: 'asc' as const }, { providerCost: 'asc' as const }],
      },
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({ data });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({ where: { id }, data });
  }

  findById(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findUnique({ where: { slug } });
  }

  findActiveById(id: string) {
    return this.prisma.product.findFirst({
      where: { id, ...ACTIVE_PRODUCT_WHERE },
      include: PUBLIC_PRODUCT_INCLUDE,
    });
  }

  findManyActive() {
    return this.prisma.product.findMany({
      where: ACTIVE_PRODUCT_WHERE,
      include: PUBLIC_PRODUCT_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findManyAdmin(statusFilter: 'active' | 'inactive' | 'all' = 'all') {
    const where: Prisma.ProductWhereInput =
      statusFilter === 'active'
        ? ACTIVE_PRODUCT_WHERE
        : statusFilter === 'inactive'
          ? {
              OR: [
                { status: CatalogProductStatus.INACTIVE },
                { deletedAt: { not: null } },
              ],
            }
          : {};

    return this.prisma.product.findMany({
      where,
      include: ADMIN_PRODUCT_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  restore(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: {
        status: CatalogProductStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  softDelete(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: {
        status: CatalogProductStatus.INACTIVE,
        deletedAt: new Date(),
      },
    });
  }

  async hardDelete(id: string) {
    await this.prisma.$transaction([
      this.prisma.providerProductMapping.deleteMany({
        where: { productVariant: { productId: id } },
      }),
      this.prisma.productVariant.deleteMany({ where: { productId: id } }),
      this.prisma.product.delete({ where: { id } }),
    ]);
  }

  syncHomeServiceForCategory(categoryId: string, homeService: import('@prisma/client').HomeServiceType) {
    return this.prisma.product.updateMany({
      where: { categoryId, deletedAt: null },
      data: { homeService },
    });
  }

  syncHomeServiceFromCategory(productId: string) {
    return this.prisma.$executeRaw`
      UPDATE products p
      SET home_service = c.home_service, updated_at = NOW()
      FROM product_categories c
      WHERE p.id = ${productId}::uuid AND p.category_id = c.id
    `;
  }

  syncAllMismatchedHomeServices() {
    return this.prisma.$executeRaw`
      UPDATE products p
      SET home_service = c.home_service, updated_at = NOW()
      FROM product_categories c
      WHERE p.category_id = c.id AND p.home_service IS DISTINCT FROM c.home_service
    `;
  }
}
