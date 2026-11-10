import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T> {
    const request = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
    // HEAD must stay body-less (Airalo low-data webhook validation fails on Content-Length).
    if (String(request?.method || '').toUpperCase() === 'HEAD') {
      return next.handle();
    }
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data: (data ?? {}) as T,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
