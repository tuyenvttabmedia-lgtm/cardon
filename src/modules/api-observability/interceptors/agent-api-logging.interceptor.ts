import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Response } from 'express';
import {
  AGENT_API_CONTEXT_KEY,
  AgentApiRequest,
} from '../../agent-api/guards/agent-api-auth.guard';
import { AGENT_API_HEADERS } from '../../agent-api/entities/agent-api.constants';
import { AgentApiRequestLogService } from '../services/agent-api-request-log.service';

@Injectable()
export class AgentApiLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logService: AgentApiRequestLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<AgentApiRequest>();
    const response = http.getResponse<Response>();
    const ctx = request[AGENT_API_CONTEXT_KEY];

    return next.handle().pipe(
      tap((body) => {
        if (!ctx) return;
        const responseBody = body as Record<string, unknown>;
        this.logService.recordRequest({
          agentId: ctx.agent.id,
          requestId: ctx.requestId,
          apiKey: request.headers[AGENT_API_HEADERS.API_KEY] as string | undefined,
          sourceIp: this.clientIp(request),
          endpoint: request.originalUrl.split('?')[0],
          method: request.method,
          httpStatus: response.statusCode || 200,
          latencyMs: Date.now() - started,
          userAgent: request.headers['user-agent'] as string | undefined,
          correlationId: request.headers['x-correlation-id'] as string | undefined,
          requestHeaders: this.headerRecord(request),
          requestBody: request.body,
          responseBody: body,
          responseHeaders: {},
          partnerOrderId:
            (responseBody?.request_id as string | undefined) ??
            (request.body as { request_id?: string })?.request_id,
          orderId: (responseBody?.order_id as string | undefined) ?? null,
          provider: 'esale',
          errorCode: (responseBody?.error as { code?: string } | undefined)?.code,
          errorMessage: (responseBody?.error as { message?: string } | undefined)?.message,
        });
      }),
      catchError((err) => {
        if (ctx) {
          const status = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
          this.logService.recordRequest({
            agentId: ctx.agent.id,
            requestId: ctx.requestId,
            apiKey: request.headers[AGENT_API_HEADERS.API_KEY] as string | undefined,
            sourceIp: this.clientIp(request),
            endpoint: request.originalUrl.split('?')[0],
            method: request.method,
            httpStatus: status,
            latencyMs: Date.now() - started,
            userAgent: request.headers['user-agent'] as string | undefined,
            requestHeaders: this.headerRecord(request),
            requestBody: request.body,
            responseBody: { message: err?.message ?? 'Error' },
            responseHeaders: {},
            errorCode: err?.response?.code ?? err?.code,
            errorMessage: err?.message,
          });
        }
        return throwError(() => err);
      }),
    );
  }

  private clientIp(request: AgentApiRequest): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return request.ip ?? null;
  }

  private headerRecord(request: AgentApiRequest): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(request.headers)) {
      if (typeof v === 'string') out[k] = v;
      else if (Array.isArray(v)) out[k] = v[0] ?? '';
    }
    return out;
  }
}
