import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AgentModule } from '../agent/agent.module';
import { ProviderModule } from '../provider/provider.module';
import { SettingsModule } from '../settings/settings.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationModule } from '../notification/notification.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import { AccountController } from './controllers/account.controller';
import { AuditService } from './audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountService } from './services/account.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { PlatformMaintenanceGuard } from '../maintenance-center/guards/platform-maintenance.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.secret');
        if (!secret) {
          throw new Error('JWT_SECRET is required');
        }

        const accessExpiresIn =
          configService.get<string>('jwt.accessExpiresIn') ?? '15m';
        const match = /^(\d+)([smhd])$/.exec(accessExpiresIn.trim());
        let expiresIn = 900;
        if (match) {
          const amount = parseInt(match[1], 10);
          expiresIn =
            match[2] === 's'
              ? amount
              : match[2] === 'm'
                ? amount * 60
                : match[2] === 'h'
                  ? amount * 3600
                  : amount * 86400;
        }

        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
    RbacModule,
    forwardRef(() => NotificationModule),
    forwardRef(() => ProviderModule),
    forwardRef(() => MaintenanceCenterModule),
    forwardRef(() => AgentModule),
    SettingsModule,
  ],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    TokenService,
    AuditService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    PlatformMaintenanceGuard,
  ],
  exports: [AuthService, AccountService, AuditService, TokenService, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard, PermissionsGuard, PlatformMaintenanceGuard],
})
export class AuthModule {}
