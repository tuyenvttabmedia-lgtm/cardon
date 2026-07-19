import {
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { IntegritySeverity } from '../entities/system-health.types';
import { SystemHealthService } from '../services/system-health.service';

@Controller('admin/system/health')
@UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SystemHealthController {
  constructor(private readonly healthService: SystemHealthService) {}

  @Get()
  @Permissions('settings.manage')
  async getHealth() {
    return this.healthService.getSummary();
  }

  @Get('status')
  @Permissions('settings.manage')
  getStatus() {
    return this.healthService.getScanState();
  }

  @Get('report')
  @Permissions('settings.manage')
  getReport(@Query('severity') severity?: IntegritySeverity) {
    const report = this.healthService.getLastReport();
    if (!report) {
      return {
        runAt: null,
        findings: [],
        domains: [],
        summary: { ok: 0, warning: 0, error: 0 },
        healthScore: 100,
        productionLabel: 'Production Ready',
        status: 'ok' as const,
      };
    }
    if (!severity || severity === 'ok') {
      return report;
    }
    return {
      ...report,
      findings: report.findings.filter((f) => f.severity === severity),
    };
  }

  @Post('run')
  @Permissions('settings.manage')
  runScan() {
    return this.healthService.startScanAsync(false);
  }

  @Post('autofix')
  @Permissions('settings.manage')
  autoFix() {
    return this.healthService.autoFix();
  }

  @Get('export/json')
  @Permissions('settings.manage')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="health-report.json"')
  exportJson(@Res() res: Response) {
    res.send(this.healthService.exportJson());
  }

  @Get('export/pdf')
  @Permissions('settings.manage')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="health-report.pdf"')
  exportPdf(@Res() res: Response) {
    res.send(this.healthService.exportPdf());
  }
}
