import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemAuditAction } from '@prisma/client';
import { from, Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditOptions } from '../decorators/audit.decorator';
import {
  AUDIT_EXCLUDED_PATH_PREFIXES,
  AUDIT_METADATA_KEY,
} from '../entities/audit-log.constants';
import { CorrelationRequest } from '../middleware/correlation-id.middleware';
import { AuditLogService } from '../services/audit-log.service';
import { AuditSnapshotService } from '../services/audit-snapshot.service';
import {
  computeJsonDiff,
  prepareAuditPayload,
  resolveEnableDisableAction,
} from '../utils/audit-diff.util';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
    private readonly snapshotService: AuditSnapshotService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions | undefined>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditOptions) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<
      CorrelationRequest & { user?: AuthenticatedUser; body?: Record<string, unknown> }
    >();
    const method = request.method?.toUpperCase();

    if (method === 'GET' || this.isExcludedPath(request.path ?? request.url ?? '')) {
      return next.handle();
    }

    const params = (request.params ?? {}) as Record<string, string>;
    const snapshotPromise = auditOptions.snapshot
      ? this.snapshotService.capture(auditOptions.snapshot, params)
      : Promise.resolve({ data: {} as Record<string, unknown> });

    return from(snapshotPromise).pipe(
      switchMap((beforeSnapshot) =>
        next.handle().pipe(
          tap((result) => {
            this.recordAudit(
              auditOptions,
              request,
              beforeSnapshot,
              this.snapshotService.normalizeAfterState(result),
            );
          }),
        ),
      ),
    );
  }

  private isExcludedPath(path: string): boolean {
    const normalized = path.replace(/^\/api\/v\d+/, '');
    return AUDIT_EXCLUDED_PATH_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    );
  }

  private recordAudit(
    options: AuditOptions,
    request: CorrelationRequest & { user?: AuthenticatedUser; body?: Record<string, unknown> },
    beforeSnapshot: { data: Record<string, unknown>; resourceId?: string; resourceName?: string },
    afterState: Record<string, unknown>,
  ): void {
    const user = request.user;
    if (!user) {
      return;
    }

    const { oldValue, newValue, fieldName } = prepareAuditPayload(
      beforeSnapshot.data,
      afterState,
    );

    if (!fieldName) {
      return;
    }

    const diff = computeJsonDiff(beforeSnapshot.data, afterState);

    let action: SystemAuditAction = options.action;
    if (options.detectEnableDisable) {
      const enableDisable = resolveEnableDisableAction(
        diff.fields,
        diff.oldValue,
        diff.newValue,
      );
      if (enableDisable) {
        action = enableDisable;
      }
    }

    const params = (request.params ?? {}) as Record<string, string>;
    const resourceId =
      options.resourceIdParam && params[options.resourceIdParam]
        ? params[options.resourceIdParam]
        : beforeSnapshot.resourceId ?? null;

    const reasonField = options.reasonField ?? 'reason';
    const reason =
      typeof request.body?.[reasonField] === 'string'
        ? (request.body[reasonField] as string)
        : null;

    this.auditLogService.create({
      resource: options.resource,
      resourceId,
      resourceName: options.resourceName ?? beforeSnapshot.resourceName ?? null,
      action,
      fieldName,
      oldValue,
      newValue,
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role,
      ipAddress: this.resolveIp(request),
      userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
      sessionId: (request.headers['x-session-id'] as string | undefined) ?? null,
      correlationId: request.correlationId ?? null,
      reason,
    });
  }

  private resolveIp(request: CorrelationRequest): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return request.ip ?? request.socket?.remoteAddress ?? null;
  }
}
