import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AgentMemberStatus } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentPlatformRole } from '../../agent-platform/entities/agent-platform.constants';
import { AgentOrganizationService } from '../services/agent-organization.service';

@Controller('agents/me')
@UseGuards(JwtAuthGuard)
export class AgentOrganizationController {
  constructor(private readonly orgService: AgentOrganizationService) {}

  @Get('organization')
  getOrganization(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.getOrganization(user.id);
  }

  @Get('users')
  listUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.orgService.listUsers(user.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Post('users')
  createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { email: string; role: AgentPlatformRole; expiresInDays?: number },
  ) {
    return this.orgService.inviteUser(user.id, body);
  }

  @Put('users/:id')
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: { role?: AgentPlatformRole; status?: AgentMemberStatus; displayName?: string },
  ) {
    return this.orgService.updateUser(user.id, id, body);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.deleteUser(user.id, id);
  }

  @Post('users/:id/invite')
  resendInvite(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.resendInvite(user.id, id);
  }

  @Post('users/:id/reset-password')
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgService.resetPassword(user.id, id);
  }

  @Post('users/invites/:inviteId/cancel')
  cancelInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.orgService.cancelInvite(user.id, inviteId);
  }

  @Get('login-history')
  loginHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orgService.listLoginHistory(user.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('activity')
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orgService.listOrganizationActivity(user.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.listSessions(user.id);
  }

  @Post('sessions/:id/revoke')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orgService.revokeSession(user.id, id);
  }

  @Post('sessions/revoke-others')
  revokeOthers(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.revokeOtherSessions(user.id);
  }

  @Get('permissions/matrix')
  permissionMatrix(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.getPermissionMatrix(user.id);
  }
}

@Controller('auth')
export class AgentInvitePublicController {
  constructor(private readonly orgService: AgentOrganizationService) {}

  @Post('accept-agent-invite')
  acceptInvite(@Body() body: { token: string; password: string; fullName?: string }) {
    return this.orgService.acceptInvite(body);
  }
}
