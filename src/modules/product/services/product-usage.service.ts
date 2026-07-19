import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProductUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async variantHasUsage(variantId: string): Promise<boolean> {
    const orders = await this.prisma.orderItem.count({ where: { variantId } });
    return orders > 0;
  }

  async productHasUsage(productId: string): Promise<boolean> {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    for (const v of variants) {
      if (await this.variantHasUsage(v.id)) return true;
    }
    return false;
  }

  async categoryProductCount(categoryId: string): Promise<number> {
    return this.prisma.product.count({ where: { categoryId } });
  }

  async categoryHasUsage(categoryId: string): Promise<boolean> {
    const products = await this.prisma.product.findMany({
      where: { categoryId },
      select: { id: true },
    });
    for (const p of products) {
      if (await this.productHasUsage(p.id)) return true;
    }
    return false;
  }

  async agentHasTransactions(agentId: string): Promise<boolean> {
    const [orders, ledger] = await Promise.all([
      this.prisma.order.count({ where: { agentId } }),
      this.prisma.ledgerEntry.count({ where: { agentId } }),
    ]);
    return orders > 0 || ledger > 0;
  }
}
