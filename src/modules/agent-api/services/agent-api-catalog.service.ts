import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { ProviderRepository } from '../../provider/repositories/provider.repository';

@Injectable()
export class AgentApiCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRepository: ProviderRepository,
  ) {}

  async listProducts(agentId: string) {
    const rows = await this.prisma.agentProductPrice.findMany({
      where: { agentId, status: 'ACTIVE' },
      include: {
        variant: {
          select: {
            sku: true,
            name: true,
            status: true,
            sellPrice: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      items: rows.map((row) => ({
        product_code: row.variant.sku,
        name: row.variant.name,
        category: row.variant.product.name,
        face_value: row.variant.sellPrice.toFixed(2),
        agent_price: row.agentPrice.toFixed(2),
        status: row.status,
      })),
    };
  }

  async listProviders() {
    const providers = await this.providerRepository.listActiveProviders();
    return {
      items: providers.map((p) => ({
        code: p.code.toLowerCase(),
        name: p.name,
        status: p.status,
      })),
    };
  }
}
