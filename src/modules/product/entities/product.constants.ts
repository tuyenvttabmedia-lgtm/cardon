import {
  CatalogProductStatus,
  Prisma,
  ProductCategoryStatus,
  ProductVariantStatus,
  ProductVariantType,
  ProviderProductMappingStatus,
} from '@prisma/client';

export const ACTIVE_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  status: CatalogProductStatus.ACTIVE,
  deletedAt: null,
};

export const ACTIVE_VARIANT_WHERE: Prisma.ProductVariantWhereInput = {
  status: ProductVariantStatus.ACTIVE,
  deletedAt: null,
};

export const ACTIVE_CATEGORY_WHERE: Prisma.ProductCategoryWhereInput = {
  status: ProductCategoryStatus.ACTIVE,
};

export { ProductVariantType, ProductVariantStatus, CatalogProductStatus, ProviderProductMappingStatus };
