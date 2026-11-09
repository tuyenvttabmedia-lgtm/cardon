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
import { AbuseRateLimitService } from '../../common/abuse-rate-limit/abuse-rate-limit.service';
import {
  TURNSTILE_ACTION_AGENT_REGISTER,
  TURNSTILE_ACTION_REGISTER,
} from '../../common/turnstile/turnstile.constants';
import { TurnstileService } from '../../common/turnstile/turnstile.service';
import { extractClientIp } from '../../common/utils/request-client.util';
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
  AUTH_REGISTER_THROTTLE,
  AUTH_RESET_PASSWORD_THROTTLE,
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
    private readonly abuseRateLimit: AbuseRateLimitService,
    private readonly turnstile: TurnstileService,
  ) {}

  @Public()
  @Throttle({ default: AUTH_REGISTER_THROTTLE })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = extractClientIp(req);
    await this.turnstile.verifyOrThrow({
      token: dto.captchaToken,
      remoteIp: ip,
      expectedAction: TURNSTILE_ACTION_REGISTER,
    });
    await this.abuseRateLimit.consumeOrThrow({
      bucket: 'auth_register',
      ip,
      email: dto.email,
    });
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: AUTH_REGISTER_THROTTLE })
  @Post('agent-register')
  async agentRegister(@Body() dto: AgentRegisterDto, @Req() req: Request) {
    const ip = extractClientIp(req);
    await this.turnstile.verifyOrThrow({
      token: dto.captchaToken,
      remoteIp: ip,
      expectedAction: TURNSTILE_ACTION_AGENT_REGISTER,
    });
    await this.abuseRateLimit.consumeOrThrow({
      bucket: 'auth_agent_register',
      ip,
      email: dto.email,
    });
    return this.agentRegistrationService.registerPublic(dto);
  }

  @Public()
  @Throttle({ default: AUTH_REGISTER_THROTTLE })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: AUTH_FORGOT_PASSWORD_THROTTLE })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @Throttle({ default: AUTH_LOGIN_THROTTLE })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    await this.abuseRateLimit.consumeOrThrow({
      bucket: 'auth_login',
      ip: extractClientIp(req),
    });
    const result = await this.authService.login(dto, activityContextFromRequest(req));
    const permissions = await this.rbacService.getPermissionsForRole(result.user.role as never);
    return {
      ...result,
      user: { ...result.user, permissions },
    };
  }

  @Public()
  @Throttle({ default: AUTH_REFRESH_THROTTLE })
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refresh(dto.refreshToken);
    const permissions = await this.rbacService.getPermissionsForRole(result.user.role as never);
    return {
      ...result,
      user: { ...result.user, permissions },
    };
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
  @Throttle({ default: AUTH_RESET_PASSWORD_THROTTLE })
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
