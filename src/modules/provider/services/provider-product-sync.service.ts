import { Injectable, Logger } from '@nestjs/common';

import {

  ProviderProductAvailability,

  ProviderProductMappingStatus,

} from '@prisma/client';

import { Decimal } from '@prisma/client/runtime/library';

import { ProviderMappingRepository } from '../../product/repositories/provider-mapping.repository';

import { ProductSyncResult } from '../interfaces/provider.interface';

import { ProviderCostHistoryRepository } from '../repositories/provider-cost-history.repository';

import { ProviderRuntimeSettingsRepository } from '../repositories/provider-runtime-settings.repository';

import { ProviderRepository } from '../repositories/provider.repository';

import {

  buildEsaleProviderProductCode,

  EsaleCardCatalogItem,

} from '../adapters/esale/esale-card.adapter';



@Injectable()

export class ProviderProductSyncService {

  private readonly logger = new Logger(ProviderProductSyncService.name);



  constructor(

    private readonly providerRepository: ProviderRepository,

    private readonly mappingRepository: ProviderMappingRepository,

    private readonly costHistoryRepository: ProviderCostHistoryRepository,

    private readonly runtimeSettingsRepository: ProviderRuntimeSettingsRepository,

  ) {}



  async syncEsaleCardCatalog(

    providerCode: string,

    catalog: EsaleCardCatalogItem[],

  ): Promise<ProductSyncResult> {

    const provider = await this.providerRepository.findProviderByCode(providerCode);

    if (!provider) {

      throw new Error(`Provider not found: ${providerCode}`);

    }



    const inMaintenance = await this.runtimeSettingsRepository.isProviderInMaintenance(

      provider.id,

    );



    const existingMappings = await this.mappingRepository.findByProviderId(

      provider.id,

    );



    const catalogByCode = new Map(

      catalog.map((item) => [

        buildEsaleProviderProductCode(item.supplierCode, item.cardId),

        item,

      ]),

    );



    let updated = 0;

    let disabled = 0;

    const seenCodes = new Set<string>();



    for (const mapping of existingMappings) {

      const catalogItem = catalogByCode.get(mapping.providerProductCode);

      seenCodes.add(mapping.providerProductCode);



      if (!catalogItem) {

        if (mapping.status === ProviderProductMappingStatus.ACTIVE) {

          await this.mappingRepository.update(mapping.id, {

            status: ProviderProductMappingStatus.INACTIVE,

            availability: ProviderProductAvailability.OUT_OF_STOCK,

          });

          disabled += 1;

        } else if (mapping.availability !== ProviderProductAvailability.OUT_OF_STOCK) {

          await this.mappingRepository.update(mapping.id, {

            availability: ProviderProductAvailability.OUT_OF_STOCK,

          });

          updated += 1;

        }

        continue;

      }



      const nextCost = new Decimal(catalogItem.providerCost);

      const costChanged = !mapping.providerCost.equals(nextCost);

      const nextAvailability = inMaintenance

        ? ProviderProductAvailability.MAINTENANCE

        : ProviderProductAvailability.AVAILABLE;



      const patch: {

        providerCost?: Decimal;

        availability: ProviderProductAvailability;

      } = { availability: nextAvailability };



      if (costChanged) {

        await this.costHistoryRepository.recordChange({

          providerId: provider.id,

          variantId: mapping.productVariantId,

          oldCost: mapping.providerCost,

          newCost: nextCost,

        });

        patch.providerCost = nextCost;

        updated += 1;

      } else if (mapping.availability !== nextAvailability) {

        updated += 1;

      }



      if (costChanged || mapping.availability !== nextAvailability) {

        await this.mappingRepository.update(mapping.id, patch);

      }

    }



    const newItems = catalog.filter(

      (item) =>

        !seenCodes.has(

          buildEsaleProviderProductCode(item.supplierCode, item.cardId),

        ) &&

        !existingMappings.some(

          (m) =>

            m.providerProductCode ===

            buildEsaleProviderProductCode(item.supplierCode, item.cardId),

        ),

    );



    const newCount = newItems.length;



    this.logger.log(

      `eSale catalog sync provider=${providerCode} new=${newCount} updated=${updated} disabled=${disabled}`,

    );



    return {

      synced: catalog.length,

      newCount,

      updatedCount: updated,

      disabledCount: disabled,

      message: `Mới: ${newCount} · Cập nhật giá: ${updated} · Vô hiệu: ${disabled}`,

    };

  }

}


