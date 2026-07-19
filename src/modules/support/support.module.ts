import { Module, forwardRef } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { SupportAccountController } from './controllers/support-account.controller';
import { SupportAdminController } from './controllers/support-admin.controller';
import { SupportRepository } from './repositories/support.repository';
import { SupportService } from './services/support.service';
import { SupportUploadService } from './services/support-upload.service';

@Module({
  imports: [forwardRef(() => NotificationModule)],
  controllers: [SupportAccountController, SupportAdminController],
  providers: [SupportRepository, SupportService, SupportUploadService],
  exports: [SupportService],
})
export class SupportModule {}
