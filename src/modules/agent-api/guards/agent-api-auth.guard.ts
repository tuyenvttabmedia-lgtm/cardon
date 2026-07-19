import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AppHttpException } from '../../../common/exceptions/app-http.exception';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { AgentApiTelemetryService } from '../../agent-security-center/services/agent-api-telemetry.service';
import { AgentSecurityService } from '../../agent-security-center/services/agent-security.service';
import { AGENT_API_HEADERS, AGENT_API_PREFIX } from '../entities/agent-api.constants';
import { AgentApiAuthService } from '../services/agent-api-auth.service';
import { AgentApiContext } from '../entities/agent-api.mapper';

export const AGENT_API_CONTEXT_KEY = 'agentApiContext';

export type AgentApiRequest = Request & {
  [AGENT_API_CONTEXT_KEY]?: AgentApiContext;
  rawBody?: Buffer | string;
};

@Injectable()
export class AgentApiAuthGuard implements CanActivate {
  constructor(private readonly authService: AgentApiAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentApiRequest>();
    const apiKey = this.readHeader(request, AGENT_API_HEADERS.API_KEY);
    const signature = this.readHeader(request, AGENT_API_HEADERS.SIGNATURE);
    const requestId = this.readHeader(request, AGENT_API_HEADERS.REQUEST_ID);
    const clientIp = this.resolveClientIp(request);

    if (!requestId) {
      throw new AppHttpException(
        ErrorCode.MISSING_REQUEST_ID,
        'X-REQUEST-ID header is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const rawBody = this.resolveRawBody(request);
    const path = this.resolvePartnerPath(request);

    request[AGENT_API_CONTEXT_KEY] = await this.authService.authenticate({
      apiKey,
      signature,
      requestId,
      method: request.method,
      path,
      rawBody,
      clientIp,
    });

    return true;
  }

  private readHeader(request: Request, name: string): string {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  }

  private resolveClientIp(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return request.ip ?? null;
  }

  private resolveRawBody(request: AgentApiRequest): string {
    if (request.rawBody) {
      return Buffer.isBuffer(request.rawBody)
        ? request.rawBody.toString('utf8')
        : String(request.rawBody);
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      return '';
    }
    if (request.body && Object.keys(request.body).length > 0) {
      return JSON.stringify(request.body);
    }
    return '';
  }

  private resolvePartnerPath(request: Request): string {
    const url = request.originalUrl.split('?')[0];
    const idx = url.indexOf(`/${AGENT_API_PREFIX}`);
    if (idx >= 0) {
      return url.slice(idx + 1);
    }
    return `${AGENT_API_PREFIX}${request.path}`;
  }
}

@Injectable()
export class AgentApiRateLimitGuard implements CanActivate {
  constructor(
    private readonly telemetry: AgentApiTelemetryService,
    private readonly securityService: AgentSecurityService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AgentApiRequest>();
    const ctx = request[AGENT_API_CONTEXT_KEY];
    if (!ctx) {
      return true;
    }

    const limit = ctx.agent.rateLimit ?? 100;
    const result = this.telemetry.checkRateLimit(ctx.agent.id, limit);

    if (!result.allowed) {
      this.securityService.recordAuthFailure(ctx.agent.id, 'AUTH_429', {
        ip: null,
        path: request.path,
        method: request.method,
        message: 'Rate limit exceeded',
      });
      throw new AppHttpException(
        ErrorCode.RATE_LIMITED,
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

export function getAgentApiContext(request: AgentApiRequest): AgentApiContext {
  const ctx = request[AGENT_API_CONTEXT_KEY];
  if (!ctx) {
    throw new AppHttpException(
      ErrorCode.UNAUTHORIZED,
      'Agent context missing',
      HttpStatus.UNAUTHORIZED,
    );
  }
  return ctx;
}
