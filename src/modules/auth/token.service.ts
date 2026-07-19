import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): { token: string; expiresIn: number } {
    const expiresInStr =
      this.configService.get<string>('jwt.accessExpiresIn') ?? '15m';
    const expiresIn = this.parseExpiresInSeconds(expiresInStr);
    const token = this.jwtService.sign(payload, { expiresIn });
    return { token, expiresIn };
  }

  generateRefreshTokenValue(): string {
    return randomBytes(48).toString('hex');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshTokenExpiryDate(): Date {
    const expiresInStr =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';
    return new Date(Date.now() + this.parseExpiresInSeconds(expiresInStr) * 1000);
  }

  buildJwtPayload(user: {
    id: string;
    email: string;
    role: UserRole;
  }): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private parseExpiresInSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      return 900;
    }

    const amount = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 3600;
      case 'd':
        return amount * 86400;
      default:
        return 900;
    }
  }
}
