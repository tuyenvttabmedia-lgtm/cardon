import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  impersonatedBy?: string;
  impersonationSessionId?: string;
  impersonationReadOnly?: boolean;
}
