import { Module, forwardRef } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { CmsRepository } from '../cms/repositories/cms.repository';
import { ProviderModule } from '../provider/provider.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditLogController } from './controllers/audit-log.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { AuditLogService } from './services/audit-log.service';
import { AuditSnapshotService } from './services/audit-snapshot.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    RbacModule,
    forwardRef(() => ProviderModule),
  ],
  controllers: [AuditLogController],
  providers: [
    AuditLogRepository,
    AuditLogService,
    AuditSnapshotService,
    CmsRepository,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
