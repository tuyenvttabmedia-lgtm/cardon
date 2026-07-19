import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { CorrelationRequest } from '../../audit-log/middleware/correlation-id.middleware';
import { ACTIVITY_EXCLUDED_PATH_PREFIXES } from '../../activity-event/interfaces/activity-event.interface';

@Injectable()
export class ActivityExportInterceptor implements NestInterceptor {
  constructor(private readonly dispatcher: ActivityEventDispatcher) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      CorrelationRequest & { user?: AuthenticatedUser; method?: string; path?: string; url?: string }
    >();

    const method = request.method?.toUpperCase();
    const path = request.path ?? request.url ?? '';

    if (method !== 'GET' || this.isExcluded(path)) {
      return next.handle();
    }

    const isCsv = path.includes('/export/csv');
    const isExcel = path.includes('/export/excel');
    if (!isCsv && !isExcel) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const user = request.user;
        this.dispatcher.dispatch({
          eventType: isCsv
            ? SystemActivityEventType.EXPORT_CSV
            : SystemActivityEventType.EXPORT_EXCEL,
          eventCategory: SystemActivityEventCategory.EXPORT,
          severity: SystemActivitySeverity.INFO,
          source: SystemActivitySource.ADMIN,
          resource: 'export',
          resourceDisplay: path,
          title: isCsv ? 'Export CSV' : 'Export Excel',
          description: `Exported data from ${path}`,
          performedBy: user?.id ?? null,
          performedEmail: user?.email ?? null,
          performedRole: user?.role ?? null,
          ipAddress: this.resolveIp(request),
          userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
          correlationId: request.correlationId ?? null,
          metadata: { path },
        });
      }),
    );
  }

  private isExcluded(path: string): boolean {
    const normalized = path.replace(/^\/api\/v\d+/, '');
    return ACTIVITY_EXCLUDED_PATH_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    );
  }

  private resolveIp(request: CorrelationRequest): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return request.ip ?? request.socket?.remoteAddress ?? null;
  }
}
