import { Global, Module } from '@nestjs/common';
import { PermissionCacheService } from './permission-cache.service';
import { RbacService } from './rbac.service';

@Global()
@Module({
  providers: [PermissionCacheService, RbacService],
  exports: [PermissionCacheService, RbacService],
})
export class RbacModule {}
