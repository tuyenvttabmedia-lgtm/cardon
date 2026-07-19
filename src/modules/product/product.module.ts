import { Module, forwardRef } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { ProductAdminController } from './controllers/product-admin.controller';
import { ProductPublicController } from './controllers/product-public.controller';
import { CategoryRepository } from './repositories/category.repository';
import { PricingRepository } from './repositories/pricing.repository';
import { ProductRepository } from './repositories/product.repository';
import { ProviderMappingRepository } from './repositories/provider-mapping.repository';
import { VariantRepository } from './repositories/variant.repository';
import { CategoryService } from './services/category.service';
import { PricingService } from './services/pricing.service';
import { PricingResolutionService } from './services/pricing-resolution.service';
import { AgentMarginConfigService } from './services/agent-margin-config.service';
import { ProductService } from './services/product.service';
import { ProductUsageService } from './services/product-usage.service';
import { ProviderMappingService } from './services/provider-mapping.service';
import { VariantService } from './services/variant.service';
import { CategoryIntegrityService } from './services/category-integrity.service';
import { ProductIntegrityService } from './services/product-integrity.service';

@Module({
  imports: [forwardRef(() => AuthModule), SettingsModule, AuditLogModule],
  controllers: [ProductPublicController, ProductAdminController],
  providers: [
    CategoryRepository,
    ProductRepository,
    VariantRepository,
    ProviderMappingRepository,
    PricingRepository,
    CategoryService,
    ProductService,
    ProductUsageService,
    VariantService,
    ProviderMappingService,
    PricingService,
    PricingResolutionService,
    AgentMarginConfigService,
    ProductIntegrityService,
    CategoryIntegrityService,
  ],
  exports: [
    CategoryRepository,
    ProductRepository,
    VariantRepository,
    ProviderMappingRepository,
    PricingRepository,
    CategoryService,
    ProductService,
    ProductUsageService,
    VariantService,
    PricingService,
    PricingResolutionService,
    AgentMarginConfigService,
    ProviderMappingService,
    ProductIntegrityService,
    CategoryIntegrityService,
  ],
})
export class ProductModule {}
