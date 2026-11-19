import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Impersonation JWTs are only valid while the DB session is open. Stop/end must revoke
    // the token immediately (not just at JWT expiry), and the claims must match the session.
    let impersonationReadOnly = payload.impersonationReadOnly;
    if (payload.impersonationSessionId || payload.impersonatedBy) {
      const session = payload.impersonationSessionId
        ? await this.prisma.agentImpersonationSession.findFirst({
            where: {
              id: payload.impersonationSessionId,
              targetUserId: user.id,
              adminUserId: payload.impersonatedBy,
              endedAt: null,
            },
          })
        : null;
      if (!session) {
        throw new UnauthorizedException('Impersonation session ended');
      }
      impersonationReadOnly = session.readOnly;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      impersonatedBy: payload.impersonatedBy,
      impersonationSessionId: payload.impersonationSessionId,
      impersonationReadOnly,
    };
  }
}
