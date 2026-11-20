import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, lastValueFrom } from 'rxjs';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Guest-or-user routes: missing Authorization → guest (undefined user).
 * Present but invalid/expired Bearer → 401 so the web client can refresh.
 * Previously a catch-all treated bad tokens as guest, which broke checkout
 * (`guestEmail is required`) after the 15m access token expired.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();
    const authorization = req.headers?.authorization?.trim() ?? '';
    const hasBearer = /^Bearer\s+\S+/i.test(authorization);

    try {
      const activation = super.canActivate(context);
      if (typeof activation === 'boolean') {
        return activation;
      }
      if (isObservable(activation)) {
        return await lastValueFrom(activation);
      }
      return await activation;
    } catch (error) {
      if (hasBearer) {
        throw error instanceof UnauthorizedException
          ? error
          : new UnauthorizedException('Invalid or expired access token');
      }
      return true;
    }
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: Error | null,
    user: TUser | false,
    _info: unknown,
    context: ExecutionContext,
  ): TUser | undefined {
    const req = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();
    const authorization = req.headers?.authorization?.trim() ?? '';
    const hasBearer = /^Bearer\s+\S+/i.test(authorization);

    if (err || !user) {
      if (hasBearer) {
        throw err instanceof UnauthorizedException
          ? err
          : new UnauthorizedException('Invalid or expired access token');
      }
      return undefined;
    }
    return user;
  }
}
