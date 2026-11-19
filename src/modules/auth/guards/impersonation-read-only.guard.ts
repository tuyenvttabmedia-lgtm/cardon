import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Admin impersonation sessions are read-only: block every state-changing HTTP method on
 * agent portal controllers. Permission-level checks alone are not enough (many mutating
 * handlers use permissions without `.manage`). Must run after JwtAuthGuard.
 */
@Injectable()
export class ImpersonationReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method?: string; user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.impersonationSessionId && !user?.impersonatedBy) {
      return true;
    }

    const method = (request.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    throw new ForbiddenException('Không được phép khi đang impersonate (read-only)');
  }
}
