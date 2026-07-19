import { Global, Module } from '@nestjs/common';
import { SettingsRepository } from './repositories/settings.repository';
import { SettingsEncryptionService } from './services/settings-encryption.service';
import { SettingsStoreService } from './services/settings-store.service';

@Global()
@Module({
  providers: [SettingsRepository, SettingsEncryptionService, SettingsStoreService],
  exports: [SettingsStoreService, SettingsEncryptionService, SettingsRepository],
})
export class SettingsModule {}
