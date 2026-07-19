import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { activityContextFromRequest } from '../activity-log/utils/activity-context.util';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AgentRegisterDto,
  ResendVerificationDto,
  VerifyEmailDto,
} from './dto/agent-register.dto';
import {
  AUTH_FORGOT_PASSWORD_THROTTLE,
  AUTH_LOGIN_THROTTLE,
  AUTH_REFRESH_THROTTLE,
} from './auth-throttle.constants';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { RbacService } from '../rbac/rbac.service';
import { AgentRegistrationService } from '../agent/services/agent-registration.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rbacService: RbacService,
    private readonly agentRegistrationService: AgentRegistrationService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('agent-register')
  agentRegister(@Body() dto: AgentRegisterDto) {
    return this.agentRegistrationService.registerPublic(dto);
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @Throttle({ default: AUTH_LOGIN_THROTTLE })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, activityContextFromRequest(req));
  }

  @Public()
  @Throttle({ default: AUTH_REFRESH_THROTTLE })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
    @Req() req: Request,
  ) {
    return this.authService.logout(
      user.id,
      dto.refreshToken,
      activityContextFromRequest(req),
      { email: user.email, role: user.role },
    );
  }

  @Public()
  @Throttle({ default: AUTH_FORGOT_PASSWORD_THROTTLE })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, req.ip);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getMe(user.id);
    const permissions = await this.rbacService.getPermissionsForRole(user.role);
    return { ...profile, permissions };
  }

  /** Internal RBAC probe — requires orders.read permission */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('orders.read')
  @Get('rbac-check')
  rbacCheck(@CurrentUser() user: AuthenticatedUser) {
    return { allowed: true, role: user.role };
  }
}
