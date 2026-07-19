import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Provider,
  ProviderProductAvailability,
  ProviderProductMapping,
  ProviderStatus,
} from '@prisma/client';
import { ProviderMappingRepository } from '../../product/repositories/provider-mapping.repository';
import { ESaleProvider } from '../adapters/esale/esale.provider';
import { MockESaleProvider } from '../adapters/mock-esale.provider';
import { MockIMediaProvider } from '../adapters/mock-imedia.provider';
import { ProviderInterface } from '../interfaces/provider.interface';
import { ProviderRuntimeSettingsRepository } from '../repositories/provider-runtime-settings.repository';

export interface SelectedProvider {
  provider: Provider;
  mapping: ProviderProductMapping;
  adapter: ProviderInterface;
}

@Injectable()
export class ProviderRegistryService {
  private adapters!: Map<string, ProviderInterface>;

  constructor(
    private readonly mappingRepository: ProviderMappingRepository,
    private readonly runtimeSettingsRepository: ProviderRuntimeSettingsRepository,
    private readonly configService: ConfigService,
    esaleProvider: ESaleProvider,
    mockEsaleProvider: MockESaleProvider,
    imediaProvider: MockIMediaProvider,
  ) {
    const esale = this.resolveEsaleAdapter(esaleProvider, mockEsaleProvider);
    this.adapters = new Map<string, ProviderInterface>([
      [esale.code, esale],
      [imediaProvider.code, imediaProvider],
    ]);
  }

  /** Test helper — inject adapters without Nest DI. */
  static withAdapters(
    mappingRepository: ProviderMappingRepository,
    runtimeSettingsRepository: ProviderRuntimeSettingsRepository,
    ...adapters: ProviderInterface[]
  ): ProviderRegistryService {
    const registry = Object.create(
      ProviderRegistryService.prototype,
    ) as ProviderRegistryService;
    (registry as unknown as { mappingRepository: ProviderMappingRepository }).mappingRepository =
      mappingRepository;
    (
      registry as unknown as {
        runtimeSettingsRepository: ProviderRuntimeSettingsRepository;
      }
    ).runtimeSettingsRepository = runtimeSettingsRepository;
    registry.adapters = new Map(adapters.map((a) => [a.code, a]));
    return registry;
  }

  private resolveEsaleAdapter(
    esaleProvider: ESaleProvider,
    mockEsaleProvider: MockESaleProvider,
  ): ProviderInterface {
    const useMock =
      this.configService.get<boolean>('esale.useMock') === true ||
      this.configService.get<string>('app.env') === 'test' ||
      !esaleProvider.isConfigured();
    return useMock ? mockEsaleProvider : esaleProvider;
  }

  getAdapter(code: string): ProviderInterface {
    const adapter = this.adapters.get(code.toUpperCase());
    if (!adapter) {
      throw new NotFoundException(`Provider adapter not found: ${code}`);
    }
    return adapter;
  }

  /**
   * Select provider: active mapping → provider enabled → priority → lowest cost.
   */
  async selectForVariant(variantId: string): Promise<SelectedProvider> {
    const selections = await this.listForVariant(variantId);
    return selections[0];
  }

  /** All eligible providers for variant (priority order) — used for failover. */
  async listForVariant(variantId: string): Promise<SelectedProvider[]> {
    const mappings =
      await this.mappingRepository.findActiveByVariantId(variantId);

    const selections: SelectedProvider[] = [];

    for (const mapping of mappings) {
      const provider = mapping.provider;
      if (provider.status !== ProviderStatus.ACTIVE) {
        continue;
      }
      if (provider.deletedAt) {
        continue;
      }
      if (mapping.availability !== ProviderProductAvailability.AVAILABLE) {
        continue;
      }

      const inMaintenance = await this.runtimeSettingsRepository.isProviderInMaintenance(
        provider.id,
      );
      if (inMaintenance) {
        continue;
      }

      selections.push({
        provider,
        mapping,
        adapter: this.getAdapter(provider.code),
      });
    }

    if (selections.length === 0) {
      throw new NotFoundException(
        `No active provider mapping for variant ${variantId}`,
      );
    }

    return selections;
  }
}
