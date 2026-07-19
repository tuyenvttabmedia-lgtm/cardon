import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentGatewayCode } from '@prisma/client';
import { MegaPayProvider } from './megapay/megapay.provider';
import { SePayProvider } from './sepay/sepay.provider';
import { PaymentProviderInterface } from './payment-provider.interface';

@Injectable()
export class PaymentProviderRegistry {
  private providers!: Map<PaymentGatewayCode, PaymentProviderInterface>;

  constructor(
    megapayProvider: MegaPayProvider,
    sepayProvider: SePayProvider,
  ) {
    this.providers = new Map<PaymentGatewayCode, PaymentProviderInterface>([
      [PaymentGatewayCode.MEGAPAY, megapayProvider],
      [PaymentGatewayCode.SEPAY, sepayProvider],
    ]);
  }

  /** Test helper — inject mock providers without Nest DI. */
  static withProviders(
    ...providers: PaymentProviderInterface[]
  ): PaymentProviderRegistry {
    const registry = Object.create(
      PaymentProviderRegistry.prototype,
    ) as PaymentProviderRegistry;
    registry.providers = new Map(providers.map((p) => [p.gateway, p]));
    return registry;
  }

  get(gateway: PaymentGatewayCode): PaymentProviderInterface {
    const provider = this.providers.get(gateway);
    if (!provider) {
      throw new NotFoundException(`Payment provider not found: ${gateway}`);
    }
    return provider;
  }
}
