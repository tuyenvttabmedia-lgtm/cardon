import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { NotificationModule } from '../notification/notification.module';
import { SettingsModule } from '../settings/settings.module';
import { ConfigurationCenterController } from './controllers/configuration-center.controller';
import { ConfigurationCenterService } from './services/configuration-center.service';

@Module({
  imports: [AdminModule, SettingsModule, NotificationModule],
  controllers: [ConfigurationCenterController],
  providers: [ConfigurationCenterService],
  exports: [ConfigurationCenterService],
})
export class ConfigurationCenterModule {}
