import { Injectable } from '@nestjs/common';
import { ProductCategoryStatus, Prisma, HomeServiceType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_CATEGORY_WHERE } from '../entities/product.constants';

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ProductCategoryCreateInput) {
    return this.prisma.productCategory.create({ data });
  }

  update(id: string, data: Prisma.ProductCategoryUpdateInput) {
    return this.prisma.productCategory.update({ where: { id }, data });
  }

  findById(id: string) {
    return this.prisma.productCategory.findUnique({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.prisma.productCategory.findUnique({ where: { slug } });
  }

  findRootByHomeService(homeService: HomeServiceType) {
    return this.prisma.productCategory.findFirst({
      where: { homeService, parentId: null },
    });
  }

  findByNameAndParent(name: string, parentId: string | null) {
    return this.prisma.productCategory.findFirst({
      where: { name, parentId },
    });
  }

  findManyActive() {
    return this.prisma.productCategory.findMany({
      where: ACTIVE_CATEGORY_WHERE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  findManyAll() {
    return this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  disable(id: string) {
    return this.prisma.productCategory.update({
      where: { id },
      data: { status: ProductCategoryStatus.INACTIVE },
    });
  }

  hardDelete(id: string) {
    return this.prisma.productCategory.delete({ where: { id } });
  }

  restore(id: string) {
    return this.prisma.productCategory.update({
      where: { id },
      data: { status: ProductCategoryStatus.ACTIVE },
    });
  }
}
