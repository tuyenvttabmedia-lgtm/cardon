import { Injectable } from '@nestjs/common';
import { VariantRepository } from '../../product/repositories/variant.repository';
import type { FactContext, FactRef } from '../entities/fact-context.types';

@Injectable()
export class FactContextService {
  constructor(private readonly variantRepository: VariantRepository) {}

  async buildFactContext(variantIds: string[]): Promise<FactContext> {
    const uniqueIds = [...new Set(variantIds)].slice(0, 20);
    const refs: FactRef[] = [];

    for (let i = 0; i < uniqueIds.length; i += 1) {
      const variantId = uniqueIds[i];
      const row = await this.variantRepository.findById(variantId);
      if (!row?.product) continue;

      refs.push({
        refId: `fact-${i + 1}`,
        type: 'product_variant',
        sourceId: row.id,
        snapshot: {
          productName: row.product.name,
          variantName: row.name,
          faceValueVnd: row.faceValue.toString(),
          sellPriceVnd: row.sellPrice.toString(),
          sku: row.sku,
          status: row.status,
        },
      });
    }

    return { refs, source: 'BACKEND' };
  }
}
