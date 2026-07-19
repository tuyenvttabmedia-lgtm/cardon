import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  AgentWalletTabQueryDto,
  CreateAgentDepositOnBehalfDto,
  CreateAgentManualCreditDto,
  CreateAgentManualDebitDto,
  RejectAgentManualCreditDto,
} from '../dto/admin-agent-wallet.dto';
import { AdminAgentWalletService } from '../services/admin-agent-wallet.service';

@Controller('admin/agent-center/agents/:agentId/wallet-center')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAgentWalletController {
  constructor(private readonly wallet: AdminAgentWalletService) {}

  @Get('summary')
  @Permissions('users.read', 'ledger.view')
  summary(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.wallet.getWalletCenter(agentId);
  }

  @Get('ledger')
  @Permissions('users.read', 'ledger.view')
  ledger(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentWalletTabQueryDto,
  ) {
    return this.wallet.getLedger(agentId, query);
  }

  @Get('deposits')
  @Permissions('users.read', 'ledger.view')
  deposits(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentWalletTabQueryDto,
  ) {
    return this.wallet.getDeposits(agentId, query);
  }

  @Get('manual-operations')
  @Permissions('users.read', 'ledger.view')
  manualOperations(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query() query: AgentWalletTabQueryDto,
  ) {
    return this.wallet.getManualOperations(agentId, query);
  }

  @Post('manual-credit')
  @Permissions('users.read', 'agents.credit')
  manualCredit(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateAgentManualCreditDto,
  ) {
    return this.wallet.createManualCredit(agentId, dto, admin);
  }

  @Post('manual-credit/:creditId/approve')
  @Permissions('users.read', 'agents.manage')
  approveCredit(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('creditId', ParseUUIDPipe) creditId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.wallet.approveManualCredit(agentId, creditId, admin);
  }

  @Post('manual-credit/:creditId/reject')
  @Permissions('users.read', 'agents.manage')
  rejectCredit(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('creditId', ParseUUIDPipe) creditId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: RejectAgentManualCreditDto,
  ) {
    return this.wallet.rejectManualCredit(agentId, creditId, admin, dto.reason);
  }

  @Post('manual-debit')
  @Permissions('users.read', 'agents.credit')
  manualDebit(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateAgentManualDebitDto,
  ) {
    return this.wallet.createManualDebit(agentId, dto, admin);
  }

  @Post('deposit-on-behalf')
  @Permissions('users.read', 'agents.credit', 'finance.manage')
  depositOnBehalf(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateAgentDepositOnBehalfDto,
  ) {
    return this.wallet.createDepositOnBehalf(agentId, dto, admin);
  }
}
