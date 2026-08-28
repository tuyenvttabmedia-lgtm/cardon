import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ContentAiConfigService } from '../config/content-ai-config.service';
import { UpdateContentAiSettingsDto } from '../dto/content-ai-settings.dto';

/**
 * AI config is readable/writable even when CONTENT_AUTOMATION_ENABLED=false
 * so ops can configure before enabling the feature.
 */
@Controller('admin/settings/content-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ContentAiSettingsController {
  constructor(private readonly contentAiConfig: ContentAiConfigService) {}

  @Get()
  getConfig() {
    return this.contentAiConfig.getAdminView();
  }

  @Put()
  updateConfig(@Body() dto: UpdateContentAiSettingsDto) {
    return this.contentAiConfig.updateFromAdmin(dto);
  }
}
