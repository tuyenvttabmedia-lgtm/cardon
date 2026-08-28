import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ContentAiConfigService } from '../config/content-ai-config.service';
import {
  TestContentAiConnectionDto,
  UpdateContentAiSettingsDto,
} from '../dto/content-ai-settings.dto';
import { AiProviderError } from '../providers/ai-provider.interface';
import { OpenAiCompatibleProvider } from '../providers/openai-compatible.provider';

/**
 * AI config is readable/writable even when CONTENT_AUTOMATION_ENABLED=false
 * so ops can configure before enabling the feature.
 */
@Controller('admin/settings/content-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class ContentAiSettingsController {
  constructor(
    private readonly contentAiConfig: ContentAiConfigService,
    private readonly aiProvider: OpenAiCompatibleProvider,
  ) {}

  @Get()
  getConfig() {
    return this.contentAiConfig.getAdminView();
  }

  @Put()
  updateConfig(@Body() dto: UpdateContentAiSettingsDto) {
    return this.contentAiConfig.updateFromAdmin(dto);
  }

  /**
   * Probe OpenAI-compatible API with saved config and/or unsaved form overrides.
   * Does not persist overrides.
   */
  @Post('test-connection')
  async testConnection(@Body() dto: TestContentAiConnectionDto) {
    const cfg = await this.contentAiConfig.resolveConfigForProbe(dto);
    if (!cfg) {
      throw new BadRequestException(
        'Chưa có API key — lưu key trước hoặc nhập key vào form rồi thử lại',
      );
    }

    try {
      const result = await this.aiProvider.probeConnection(cfg);
      return {
        ok: true as const,
        latencyMs: result.latencyMs,
        model: result.model,
        method: result.method,
        message: result.message,
      };
    } catch (err) {
      if (err instanceof AiProviderError) {
        return {
          ok: false as const,
          message: err.message,
          errorKind: err.kind,
        };
      }
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Connection test failed',
        errorKind: 'UNKNOWN',
      };
    }
  }
}
