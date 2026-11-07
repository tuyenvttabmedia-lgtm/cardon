import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProviderRepository } from '../provider/repositories/provider.repository';

/** Ensures the Airalo provider row exists. It is not an eSale adapter. */
@Injectable()
export class EsimAiraloProviderBootstrap implements OnModuleInit {
  private readonly logger = new Logger(EsimAiraloProviderBootstrap.name);

  constructor(private readonly providers: ProviderRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.providers.ensureAiraloProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Airalo provider row was not created: ${message}`);
    }
  }
}
