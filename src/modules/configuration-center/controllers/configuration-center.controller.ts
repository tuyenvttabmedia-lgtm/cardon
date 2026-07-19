import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  ConfigurationExportQueryDto,
  ConfigurationImportDto,
  ConfigurationSearchQueryDto,
  ConfigurationTestTelegramDto,
} from '../dto/configuration-center.dto';
import { ConfigurationModuleId, ExportableModule } from '../entities/configuration-center.constants';
import { ConfigurationCenterService } from '../services/configuration-center.service';

@Controller('admin/configuration')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConfigurationCenterController {
  constructor(
    private readonly configurationService: ConfigurationCenterService,
  ) {}

  @Get('overview')
  @Permissions('configuration.read')
  overview() {
    return this.configurationService.getOverview();
  }

  @Get('search')
  @Permissions('configuration.read')
  search(@Query() query: ConfigurationSearchQueryDto) {
    return { items: this.configurationService.search(query.q ?? '') };
  }

  @Get('modules/:module/audit-meta')
  @Permissions('configuration.read')
  auditMeta(@Param('module') module: ConfigurationModuleId) {
    return this.configurationService.getModuleAuditMeta(module);
  }

  @Get('export/:module')
  @Permissions('configuration.manage')
  exportModule(
    @Param('module') module: ExportableModule,
    @Query('include_secrets') includeSecrets: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configurationService.exportModule(
      module,
      includeSecrets === 'true',
      user.role as UserRole,
    );
  }

  @Post('import/:module')
  @Permissions('configuration.manage')
  importModule(
    @Param('module') module: ExportableModule,
    @Body() dto: ConfigurationImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.configurationService.importModule(module, dto, user.id, user.role as UserRole);
  }

  @Post('test/megapay')
  @Permissions('configuration.manage')
  testMegapay() {
    return this.configurationService.testMegapay();
  }

  @Post('test/sepay')
  @Permissions('configuration.manage')
  testSepay() {
    return this.configurationService.testSepay();
  }

  @Post('test/telegram')
  @Permissions('configuration.manage')
  testTelegram(@Body() dto: ConfigurationTestTelegramDto) {
    return this.configurationService.testTelegram(dto);
  }

  @Post('test/webhook')
  @Permissions('configuration.manage')
  testWebhook() {
    return this.configurationService.testWebhook();
  }

  @Post('test/provider')
  @Permissions('configuration.manage')
  async testProvider() {
    return this.configurationService.testProvider();
  }
}
