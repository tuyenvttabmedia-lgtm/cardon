import { Injectable } from '@nestjs/common';
import {
  CatalogProductStatus,
  ProductVariantStatus,
  ProviderProductMappingStatus,
  ProviderStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  isVariantTypeAllowedForHomeService,
} from '../entities/home-service';
import type { AutoFixResult, IntegrityFinding } from '../entities/integrity.types';

let findingCounter = 0;

function nextId(prefix: string) {
  findingCounter += 1;
  return `${prefix}-${findingCounter}`;
}

@Injectable()
export class ProductIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async scan(): Promise<IntegrityFinding[]> {
    findingCounter = 0;
    const findings: IntegrityFinding[] = [];

    const [products, categories, variants, mappings] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        include: {
          category: true,
          variants: { where: { deletedAt: null }, include: { providerMappings: { include: { provider: true } } } },
        },
      }),
      this.prisma.productCategory.findMany(),
      this.prisma.productVariant.findMany({
        where: { deletedAt: null },
        include: { product: true, providerMappings: { include: { provider: true } } },
      }),
      this.prisma.providerProductMapping.findMany({ include: { provider: true, productVariant: { include: { product: true } } } }),
    ]);

    const categoryIds = new Set(categories.map((c) => c.id));
    const skuSeen = new Map<string, string>();
    const slugSeen = new Map<string, string>();

    for (const category of categories) {
      if (!category.homeService) {
        findings.push({
          id: nextId('cat'),
          domain: 'category',
          severity: 'error',
          entityType: 'Category',
          entityId: category.id,
          entityLabel: category.name,
          message: 'Thiếu homeService',
          autoFixable: true,
          fixAction: 'infer_home_service_from_slug',
        });
      }
    }

    for (const product of products) {
      const label = product.name;

      if (!categoryIds.has(product.categoryId)) {
        findings.push({
          id: nextId('prod'),
          domain: 'product',
          severity: 'error',
          entityType: 'Product',
          entityId: product.id,
          entityLabel: label,
          message: 'Không có Category hợp lệ',
          autoFixable: false,
        });
      }

      if (product.category && product.homeService !== product.category.homeService) {
        findings.push({
          id: nextId('prod'),
          domain: 'product',
          severity: 'error',
          entityType: 'Product',
          entityId: product.id,
          entityLabel: label,
          message: `homeService (${product.homeService}) ≠ Category (${product.category.homeService})`,
          autoFixable: true,
          fixAction: 'sync_product_home_service',
        });
      }

      if (!product.logoUrl?.trim()) {
        findings.push({
          id: nextId('prod'),
          domain: 'product',
          severity: 'warning',
          entityType: 'Product',
          entityId: product.id,
          entityLabel: label,
          message: 'Không có ảnh',
          autoFixable: false,
        });
      }

      const activeVariants = product.variants.filter((v) => v.status === ProductVariantStatus.ACTIVE);
      if (activeVariants.length === 0) {
        findings.push({
          id: nextId('prod'),
          domain: 'product',
          severity: product.status === CatalogProductStatus.ACTIVE ? 'warning' : 'ok',
          entityType: 'Product',
          entityId: product.id,
          entityLabel: label,
          message: 'Không có Variant ACTIVE',
          autoFixable: false,
        });
      }

      if (product.status !== CatalogProductStatus.ACTIVE && activeVariants.length > 0) {
        findings.push({
          id: nextId('prod'),
          domain: 'product',
          severity: 'warning',
          entityType: 'Product',
          entityId: product.id,
          entityLabel: label,
          message: 'Product INACTIVE nhưng có Variant ACTIVE',
          autoFixable: true,
          fixAction: 'disable_variants_for_inactive_product',
        });
      }

      const prevSlug = slugSeen.get(product.slug);
      if (prevSlug) {
        findings.push({
          id: nextId('prod'),
          domain: 'product',
          severity: 'error',
          entityType: 'Product',
          entityId: product.id,
          entityLabel: label,
          message: `Duplicate slug: ${product.slug}`,
          autoFixable: false,
        });
      } else {
        slugSeen.set(product.slug, product.id);
      }

      for (const variant of product.variants) {
        if (!isVariantTypeAllowedForHomeService(product.homeService, variant.type)) {
          findings.push({
            id: nextId('var'),
            domain: 'variant',
            severity: 'error',
            entityType: 'Variant',
            entityId: variant.id,
            entityLabel: `${label} / ${variant.name}`,
            message: `Variant type ${variant.type} sai cho homeService ${product.homeService}`,
            autoFixable: false,
          });
        }

        if (variant.status === ProductVariantStatus.ACTIVE) {
          const activeMappings = variant.providerMappings.filter(
            (m) => m.status === ProviderProductMappingStatus.ACTIVE,
          );
          if (activeMappings.length === 0) {
            findings.push({
              id: nextId('map'),
              domain: 'provider_mapping',
              severity: 'warning',
              entityType: 'Provider Mapping',
              entityId: variant.id,
              entityLabel: `${label} / ${variant.name}`,
              message: 'Chưa map NCC',
              autoFixable: false,
            });
          }

          for (const mapping of activeMappings) {
            if (mapping.provider.status !== ProviderStatus.ACTIVE) {
              findings.push({
                id: nextId('map'),
                domain: 'provider_mapping',
                severity: 'error',
                entityType: 'Provider Mapping',
                entityId: mapping.id,
                entityLabel: `${label} / ${variant.name}`,
                message: `Provider ${mapping.provider.name} disabled nhưng Mapping ACTIVE`,
                autoFixable: true,
                fixAction: 'disable_inactive_provider_mapping',
              });
            }

            if (mapping.providerCost.gt(variant.sellPrice)) {
              findings.push({
                id: nextId('map'),
                domain: 'provider_mapping',
                severity: 'error',
                entityType: 'Provider Mapping',
                entityId: mapping.id,
                entityLabel: `${label} / ${variant.name}`,
                message: 'Giá vốn > Giá bán',
                autoFixable: false,
              });
            }
          }
        }
      }
    }

    for (const variant of variants) {
      if (!variant.product || variant.product.deletedAt) {
        findings.push({
          id: nextId('var'),
          domain: 'variant',
          severity: 'error',
          entityType: 'Variant',
          entityId: variant.id,
          entityLabel: variant.sku,
          message: 'Variant không có Product',
          autoFixable: false,
        });
      }

      const prevSku = skuSeen.get(variant.sku);
      if (prevSku && prevSku !== variant.id) {
        findings.push({
          id: nextId('var'),
          domain: 'variant',
          severity: 'error',
          entityType: 'Variant',
          entityId: variant.id,
          entityLabel: variant.sku,
          message: `Duplicate SKU: ${variant.sku}`,
          autoFixable: false,
        });
      } else {
        skuSeen.set(variant.sku, variant.id);
      }
    }

    return findings;
  }

  async autoFix(findings: IntegrityFinding[]): Promise<AutoFixResult> {
    const result: AutoFixResult = { applied: 0, skipped: 0, actions: [] };

    for (const finding of findings.filter((f) => f.autoFixable && f.fixAction)) {
      try {
        switch (finding.fixAction) {
          case 'sync_product_home_service':
            if (finding.entityId) {
              await this.prisma.$executeRaw`
                UPDATE products p SET home_service = c.home_service, updated_at = NOW()
                FROM product_categories c WHERE p.id = ${finding.entityId}::uuid AND p.category_id = c.id
              `;
            }
            break;
          case 'infer_home_service_from_slug':
            if (finding.entityId) {
              const cat = await this.prisma.productCategory.findUnique({ where: { id: finding.entityId } });
              if (cat) {
                const { inferHomeServiceFromCategorySlug } = await import('../entities/home-service');
                const homeService = inferHomeServiceFromCategorySlug(cat.slug);
                await this.prisma.productCategory.update({
                  where: { id: cat.id },
                  data: { homeService },
                });
                await this.prisma.product.updateMany({
                  where: { categoryId: cat.id },
                  data: { homeService },
                });
              }
            }
            break;
          case 'disable_inactive_provider_mapping':
            if (finding.entityId) {
              await this.prisma.providerProductMapping.update({
                where: { id: finding.entityId },
                data: { status: ProviderProductMappingStatus.INACTIVE },
              });
            }
            break;
          case 'disable_variants_for_inactive_product':
            if (finding.entityId) {
              await this.prisma.productVariant.updateMany({
                where: { productId: finding.entityId, status: ProductVariantStatus.ACTIVE },
                data: { status: ProductVariantStatus.INACTIVE },
              });
            }
            break;
          default:
            result.skipped += 1;
            result.actions.push({
              findingId: finding.id,
              action: finding.fixAction ?? 'unknown',
              success: false,
              message: 'Unknown fix action',
            });
            continue;
        }
        result.applied += 1;
        result.actions.push({
          findingId: finding.id,
          action: finding.fixAction!,
          success: true,
        });
      } catch (error) {
        result.skipped += 1;
        result.actions.push({
          findingId: finding.id,
          action: finding.fixAction!,
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }
}
