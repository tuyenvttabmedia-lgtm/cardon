import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  impersonatedBy?: string;
  impersonationSessionId?: string;
  impersonationReadOnly?: boolean;
}
