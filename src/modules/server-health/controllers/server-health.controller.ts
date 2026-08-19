import { Controller, Get, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { ServerHealthService } from '../services/server-health.service';

@Controller('admin/monitoring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServerHealthController {
  constructor(private readonly serverHealthService: ServerHealthService) {}

  @Get('server-health')
  @Permissions('monitoring.server.read')
  getServerHealth() {
    return this.serverHealthService.getPack();
  }
}
