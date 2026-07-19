import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AGENT_API_PREFIX } from '../entities/agent-api.constants';
import { BuyCardDto } from '../dto/agent-api.dto';
import {
  AgentApiAuthGuard,
  AgentApiRateLimitGuard,
  AgentApiRequest,
  getAgentApiContext,
} from '../guards/agent-api-auth.guard';
import { AgentApiLoggingInterceptor } from '../../api-observability/interceptors/agent-api-logging.interceptor';
import { PlatformMaintenanceGuard } from '../../maintenance-center/guards/platform-maintenance.guard';
import { MaintenanceModule } from '../../maintenance-center/decorators/maintenance-module.decorator';
import { AgentApiBuyService } from '../services/agent-api-buy.service';
import { AgentApiCatalogService } from '../services/agent-api-catalog.service';

@Controller(AGENT_API_PREFIX)
@SkipThrottle()
@UseGuards(AgentApiAuthGuard, AgentApiRateLimitGuard)
@UseInterceptors(AgentApiLoggingInterceptor)
export class AgentApiController {
  constructor(
    private readonly buyService: AgentApiBuyService,
    private readonly catalogService: AgentApiCatalogService,
  ) {}

  @Post('cards/buy')
  @UseGuards(PlatformMaintenanceGuard)
  @MaintenanceModule('partner_api')
  buyCard(@Req() request: AgentApiRequest, @Body() dto: BuyCardDto) {
    return this.buyService.buyCard(getAgentApiContext(request), dto);
  }

  @Get('balance')
  getBalance(@Req() request: AgentApiRequest) {
    return this.buyService.getBalance(getAgentApiContext(request).agent.id);
  }

  @Get('transactions/:request_id')
  getTransaction(
    @Req() request: AgentApiRequest,
    @Param('request_id') requestId: string,
  ) {
    return this.buyService.getTransaction(
      getAgentApiContext(request).agent.id,
      requestId,
    );
  }

  @Get('products')
  listProducts(@Req() request: AgentApiRequest) {
    return this.catalogService.listProducts(getAgentApiContext(request).agent.id);
  }

  @Get('providers')
  listProviders() {
    return this.catalogService.listProviders();
  }
}
