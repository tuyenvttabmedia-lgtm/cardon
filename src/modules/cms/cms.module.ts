import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { EmailTemplateModule } from '../email-template/email-template.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import { SettingsModule } from '../settings/settings.module';
import { CmsAdminController } from './controllers/cms-admin.controller';
import { CmsPublicController } from './controllers/cms-public.controller';
import { CmsRepository } from './repositories/cms.repository';
import { CmsMediaStorageService } from './services/cms-media-storage.service';
import { CmsMediaService } from './services/cms-media.service';
import { CmsService } from './services/cms.service';
import { EmailTemplateService } from '../email-template/services/email-template.service';

@Module({
  imports: [AuthModule, ConfigModule, SettingsModule, EmailTemplateModule, MaintenanceCenterModule],
  controllers: [CmsAdminController, CmsPublicController],
  providers: [
    CmsRepository,
    CmsService,
    CmsMediaStorageService,
    CmsMediaService,
  ],
  exports: [CmsService],
})
export class CmsModule {}
