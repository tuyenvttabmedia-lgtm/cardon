import {

  ConflictException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { ProviderProductMappingStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

import {

  CreateProviderMappingDto,

  UpdateProviderMappingDto,

} from '../dto/provider-mapping.dto';

import { mapProviderMapping } from '../entities/product.mapper';

import { ProviderMappingRepository } from '../repositories/provider-mapping.repository';

import { VariantRepository } from '../repositories/variant.repository';



@Injectable()

export class ProviderMappingService {

  constructor(

    private readonly mappingRepository: ProviderMappingRepository,

    private readonly variantRepository: VariantRepository,

    private readonly prisma: PrismaService,

  ) {}



  private async assertNoActiveConflict(

    providerId: string,

    variantId: string,

    providerProductCode: string,

    excludeId?: string,

  ) {

    const conflict = await this.prisma.providerProductMapping.findFirst({

      where: {

        providerId,

        productVariantId: variantId,

        providerProductCode,

        status: ProviderProductMappingStatus.ACTIVE,

        ...(excludeId ? { id: { not: excludeId } } : {}),

      },

    });

    if (conflict) {

      throw new ConflictException('Provider mapping already exists');

    }

  }



  async createMapping(variantId: string, dto: CreateProviderMappingDto) {

    const variant = await this.variantRepository.findById(variantId);

    if (!variant || variant.deletedAt) {

      throw new NotFoundException('Variant not found');

    }



    const provider = await this.prisma.provider.findFirst({

      where: { id: dto.providerId, deletedAt: null },

    });

    if (!provider) {

      throw new NotFoundException('Provider not found');

    }



    const inactive = await this.prisma.providerProductMapping.findFirst({

      where: {

        providerId: dto.providerId,

        productVariantId: variantId,

        providerProductCode: dto.providerProductCode,

        status: ProviderProductMappingStatus.INACTIVE,

      },

    });



    if (inactive) {

      await this.assertNoActiveConflict(

        dto.providerId,

        variantId,

        dto.providerProductCode,

        inactive.id,

      );

      const updated = await this.mappingRepository.update(inactive.id, {

        status: ProviderProductMappingStatus.ACTIVE,

        providerCost: dto.providerCost,

        priority: dto.priority ?? inactive.priority,

        providerProductCode: dto.providerProductCode,

      });

      return mapProviderMapping(updated);

    }



    await this.assertNoActiveConflict(

      dto.providerId,

      variantId,

      dto.providerProductCode,

    );



    const mapping = await this.mappingRepository.create({

      providerProductCode: dto.providerProductCode,

      providerCost: dto.providerCost,

      priority: dto.priority ?? 0,

      status: dto.status ?? ProviderProductMappingStatus.ACTIVE,

      provider: { connect: { id: dto.providerId } },

      productVariant: { connect: { id: variantId } },

    });



    return mapProviderMapping(mapping);

  }



  async updateMapping(mappingId: string, dto: UpdateProviderMappingDto) {

    const mapping = await this.mappingRepository.findById(mappingId);

    if (!mapping) {

      throw new NotFoundException('Provider mapping not found');

    }



    const nextCode = dto.providerProductCode ?? mapping.providerProductCode;

    const nextStatus = dto.status ?? mapping.status;



    if (nextStatus === ProviderProductMappingStatus.ACTIVE) {

      await this.assertNoActiveConflict(

        mapping.providerId,

        mapping.productVariantId,

        nextCode,

        mappingId,

      );

    }



    const updated = await this.mappingRepository.update(mappingId, {

      providerProductCode: dto.providerProductCode,

      providerCost: dto.providerCost,

      priority: dto.priority,

      status: dto.status,

    });



    return mapProviderMapping(updated);

  }



  async disableMapping(mappingId: string) {

    const mapping = await this.mappingRepository.findById(mappingId);

    if (!mapping) {

      throw new NotFoundException('Provider mapping not found');

    }



    const updated = await this.mappingRepository.update(mappingId, {

      status: ProviderProductMappingStatus.INACTIVE,

    });



    return mapProviderMapping(updated);

  }



  async enableMapping(mappingId: string) {

    const mapping = await this.mappingRepository.findById(mappingId);

    if (!mapping) {

      throw new NotFoundException('Provider mapping not found');

    }



    if (mapping.status === ProviderProductMappingStatus.ACTIVE) {

      return mapProviderMapping(mapping);

    }



    await this.assertNoActiveConflict(

      mapping.providerId,

      mapping.productVariantId,

      mapping.providerProductCode,

      mappingId,

    );



    const updated = await this.mappingRepository.update(mappingId, {

      status: ProviderProductMappingStatus.ACTIVE,

    });



    return mapProviderMapping(updated);

  }



  listMappingsByVariant(variantId: string) {

    return this.mappingRepository

      .findByVariantId(variantId)

      .then((rows) => rows.map(mapProviderMapping));

  }

}


