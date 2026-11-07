import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProviderRepository } from '../provider/repositories/provider.repository';

/** Ensures the eSIM Go provider row exists. It is not an eSale adapter. */
@Injectable()
export class EsimGoProviderBootstrap implements OnModuleInit {
  private readonly logger = new Logger(EsimGoProviderBootstrap.name);

  constructor(private readonly providers: ProviderRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.providers.ensureEsimGoProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`eSIM Go provider row was not created: ${message}`);
    }
  }
}
