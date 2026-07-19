import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentPlatformRole } from '../../agent-platform/entities/agent-platform.constants';
import { AgentPlatformService } from '../../agent-platform/services/agent-platform.service';
import { WebhookDeliveryListQueryDto } from '../dto/webhook-delivery.dto';
import { WebhookDeliveryService } from '../services/webhook-delivery.service';

@Controller('agents/me/webhooks')
@UseGuards(JwtAuthGuard)
export class AgentWebhookDeliveryController {
  constructor(
    private readonly deliveryService: WebhookDeliveryService,
    private readonly platformService: AgentPlatformService,
  ) {}

  private async role(user: AuthenticatedUser): Promise<AgentPlatformRole> {
    const session = await this.platformService.getSession(user.id, user);
    return session.platformRole;
  }

  @Get('deliveries')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: WebhookDeliveryListQueryDto) {
    return this.deliveryService.listDeliveries(user.id, query);
  }

  @Get('deliveries/:id')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryService.getDelivery(id, user.id, await this.role(user));
  }

  @Post('deliveries/:id/retry')
  async retry(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryService.retryDelivery(id, user.id, await this.role(user));
  }

  @Post('deliveries/:id/cancel')
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryService.cancelDelivery(id, user.id, await this.role(user));
  }

  @Get('statistics')
  statistics(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveryService.getStatistics(user.id);
  }
}
