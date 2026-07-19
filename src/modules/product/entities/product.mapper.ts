import { Decimal } from '@prisma/client/runtime/library';
import { HomeServiceType } from '@prisma/client';
import { decimalToString } from './product.mapper.shared';

export { decimalToString };

export function mapCategory(category: {
  id: string;
  slug: string;
  name: string;
  homeService: HomeServiceType;
  iconUrl?: string | null;
  parentId: string | null;
  sortOrder: number;
  status: string;
}) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    homeService: category.homeService,
    iconUrl: category.iconUrl ?? null,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    status: category.status,
  };
}

export function mapCategories(
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    homeService: HomeServiceType;
    iconUrl?: string | null;
    parentId: string | null;
    sortOrder: number;
    status: string;
  }>,
) {
  return categories.map((c) => mapCategory(c));
}

export function mapVariant(variant: {
  id: string;
  productId: string;
  sku: string;
  name: string;
  type: string;
  faceValue: Decimal;
  sellPrice: Decimal;
  status: string;
  metadata?: unknown;
}) {
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    name: variant.name,
    type: variant.type,
    faceValue: decimalToString(variant.faceValue),
    sellPrice: decimalToString(variant.sellPrice),
    status: variant.status,
    metadata:
      variant.metadata && typeof variant.metadata === 'object' && !Array.isArray(variant.metadata)
        ? (variant.metadata as Record<string, unknown>)
        : {},
  };
}

export function mapAdminVariant(variant: {
  id: string;
  productId: string;
  sku: string;
  name: string;
  type: string;
  faceValue: Decimal;
  sellPrice: Decimal;
  status: string;
  metadata?: unknown;
  providerMappings?: Array<{
    id: string;
    providerId: string;
    productVariantId: string;
    providerProductCode: string;
    providerCost: Decimal;
    priority: number;
    status: string;
    provider?: { id: string; code: string; name: string };
  }>;
}) {
  return {
    ...mapVariant(variant),
    providerMappings: variant.providerMappings?.map(mapProviderMapping),
  };
}

function mapProductCategory(category: {
  id: string;
  slug: string;
  name: string;
  homeService: HomeServiceType;
}) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    homeService: category.homeService,
  };
}

export function mapAdminProduct(product: {
  id: string;
  categoryId: string;
  homeService: HomeServiceType;
  slug: string;
  name: string;
  description: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  sortOrder?: number;
  status: string;
  createdAt?: Date | string;
  category?: { id: string; slug: string; name: string; homeService: HomeServiceType };
  variants?: Array<{
    id: string;
    productId: string;
    sku: string;
    name: string;
    type: string;
    faceValue: Decimal;
    sellPrice: Decimal;
    status: string;
    providerMappings?: Array<{
      id: string;
      providerId: string;
      productVariantId: string;
      providerProductCode: string;
      providerCost: Decimal;
      priority: number;
      status: string;
      provider?: { id: string; code: string; name: string };
    }>;
  }>;
}) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    slug: product.slug,
    name: product.name,
    description: product.description,
    logoUrl: product.logoUrl ?? null,
    bannerUrl: product.bannerUrl ?? null,
    sortOrder: product.sortOrder ?? 0,
    status: product.status,
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    homeService: product.homeService,
    category: product.category ? mapProductCategory(product.category) : undefined,
    variants: product.variants?.map(mapAdminVariant),
  };
}

export function mapProduct(product: {
  id: string;
  categoryId: string;
  homeService: HomeServiceType;
  slug: string;
  name: string;
  description: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  sortOrder?: number;
  status: string;
  createdAt?: Date | string;
  category?: { id: string; slug: string; name: string; homeService: HomeServiceType };
  variants?: Array<{
    id: string;
    productId: string;
    sku: string;
    name: string;
    type: string;
    faceValue: Decimal;
    sellPrice: Decimal;
    status: string;
  }>;
}) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    slug: product.slug,
    name: product.name,
    description: product.description,
    logoUrl: product.logoUrl ?? null,
    bannerUrl: product.bannerUrl ?? null,
    sortOrder: product.sortOrder ?? 0,
    status: product.status,
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    homeService: product.homeService,
    category: product.category ? mapProductCategory(product.category) : undefined,
    variants: product.variants?.map(mapVariant),
  };
}

export function mapProviderMapping(mapping: {
  id: string;
  providerId: string;
  productVariantId: string;
  providerProductCode: string;
  providerCost: Decimal;
  priority: number;
  status: string;
  availability?: string;
  provider?: { id: string; code: string; name: string };
}) {
  return {
    id: mapping.id,
    providerId: mapping.providerId,
    productVariantId: mapping.productVariantId,
    providerProductCode: mapping.providerProductCode,
    providerCost: decimalToString(mapping.providerCost),
    priority: mapping.priority,
    status: mapping.status,
    availability: mapping.availability ?? 'AVAILABLE',
    provider: mapping.provider
      ? {
          id: mapping.provider.id,
          code: mapping.provider.code,
          name: mapping.provider.name,
        }
      : undefined,
  };
}
