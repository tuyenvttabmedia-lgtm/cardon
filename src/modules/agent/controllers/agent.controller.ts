import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  CreditAgentDto,
  RegisterAgentDto,
  RejectKycDto,
  RequestMoreInfoKycDto,
  SubmitKycDto,
} from '../dto/agent.dto';
import { AgentService } from '../services/agent.service';
import { AgentOnboardingService } from '../services/agent-onboarding.service';
import { AgentKycDocumentService } from '../services/agent-kyc-document.service';
import { AccountService } from '../../auth/services/account.service';
import { ChangePasswordDto } from '../../admin/dto/admin-operation.dto';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly onboardingService: AgentOnboardingService,
    private readonly kycDocumentService: AgentKycDocumentService,
    private readonly accountService: AccountService,
  ) {}

  @Get('me/onboarding-status')
  onboardingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.getOnboardingStatus(user.id);
  }

  @Post('me/change-password')
  @UseGuards(RolesGuard)
  @Roles(UserRole.AGENT)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.accountService.changePassword(user.id, dto);
  }

  @Post('register')
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterAgentDto) {
    return this.agentService.registerAgent(user.id, dto);
  }

  @Post('kyc')
  submitKyc(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.agentService.submitKyc(user.id, dto);
  }

  @Get('me/kyc')
  getMyKyc(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.getMyKyc(user.id);
  }

  @Post('me/kyc/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadKycDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('field') field: string,
  ) {
    return this.agentService.uploadKycDocument(user.id, field, file);
  }

  @Get('me/kyc/documents/file')
  async getKycDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Query('key') storageKey: string,
    @Res() res: Response,
  ) {
    if (!storageKey?.trim()) {
      res.status(400).json({ success: false, error: { message: 'key is required' } });
      return;
    }
    const { stream, mimeType, filename } = await this.agentService.openKycDocument(
      user.id,
      storageKey.trim(),
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    stream.pipe(res);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.getMyAgent(user.id);
  }

  @Get('me/ledger')
  getMyLedger(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.getMyLedger(user.id);
  }

  @Get('me/transactions')
  listMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.agentService.listMyTransactions(user.id, {
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 20,
    });
  }

  @Get('me/transactions/:requestId')
  getMyTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.agentService.getMyTransaction(user.id, requestId);
  }

  @Get('me/credentials')
  getMyCredentials(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.getMyCredentialsStatus(user.id);
  }
}

@Controller('admin/agents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AgentAdminController {
  constructor(private readonly agentService: AgentService) {}

  @Post(':id/kyc/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SUPER_ADMIN)
  @Permissions('agents.kyc.review')
  approveKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agentService.approveKyc(user.id, id, user.role);
  }

  @Post(':id/kyc/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SUPER_ADMIN)
  @Permissions('agents.kyc.review')
  rejectKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectKycDto,
  ) {
    return this.agentService.rejectKyc(user.id, id, user.role, dto.reason);
  }

  @Post(':id/kyc/request-more-info')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.SUPER_ADMIN)
  @Permissions('agents.kyc.review')
  requestMoreInfoKyc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestMoreInfoKycDto,
  ) {
    return this.agentService.requestMoreInfoKyc(user.id, id, user.role, dto);
  }

  @Post(':id/credit')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN)
  @Permissions('agents.credit')
  credit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Omit<CreditAgentDto, 'agentId'>,
  ) {
    return this.agentService.creditAgent(user.id, {
      agentId: id,
      amount: body.amount,
      note: body.note,
    });
  }

  @Get(':id/balance')
  @Permissions('ledger.view')
  balance(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentService.getAgentBalance(id);
  }

  @Get(':id/ledger')
  @Permissions('ledger.view')
  ledger(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentService.getAgentLedger(id);
  }
}
