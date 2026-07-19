import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, lastValueFrom } from 'rxjs';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const activation = super.canActivate(context);
      if (typeof activation === 'boolean') {
        return activation;
      }
      if (isObservable(activation)) {
        return await lastValueFrom(activation);
      }
      return await activation;
    } catch {
      return true;
    }
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: Error | null,
    user: TUser | false,
  ): TUser | undefined {
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}