import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentPlatformRole } from '../../agent-platform/entities/agent-platform.constants';
import {
  buildSignaturePayload,
  signPartnerRequest,
} from '../../agent-api/entities/agent-api-signature';
import { AGENT_API_HEADERS, AGENT_API_PREFIX } from '../../agent-api/entities/agent-api.constants';
import { maskApiPayload, maskHeaders } from '../utils/api-log-mask.util';

export interface ApiTestRequest {
  method: 'GET' | 'POST';
  path: string;
  apiKey: string;
  secretKey: string;
  requestId: string;
  body?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}

@Injectable()
export class AgentApiTestService {
  constructor(private readonly config: ConfigService) {}

  assertCanTest(role: AgentPlatformRole) {
    if (role === 'READONLY') {
      throw new ForbiddenException('Readonly không được dùng Test API');
    }
  }

  async execute(role: AgentPlatformRole, input: ApiTestRequest) {
    this.assertCanTest(role);

    const baseUrl = this.resolveApiBaseUrl();
    const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
    const fullPath = path.startsWith(`/${AGENT_API_PREFIX}`) ? path : `/${AGENT_API_PREFIX}${path}`;
    const rawBody =
      input.method === 'POST' && input.body ? JSON.stringify(input.body) : '';
    const signPath = fullPath.replace(/^\//, '');
    const payload = buildSignaturePayload(input.method, signPath, input.requestId, rawBody);
    const signature = signPartnerRequest(input.secretKey, payload);

    const headers: Record<string, string> = {
      [AGENT_API_HEADERS.API_KEY]: input.apiKey,
      [AGENT_API_HEADERS.REQUEST_ID]: input.requestId,
      [AGENT_API_HEADERS.SIGNATURE]: signature,
      ...(input.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...input.extraHeaders,
    };

    const started = Date.now();
    const url = `${baseUrl}${fullPath}`;
    const res = await fetch(url, {
      method: input.method,
      headers,
      body: input.method === 'POST' ? rawBody : undefined,
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep text
    }

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    const curl = this.buildCurl(input.method, url, headers, rawBody);

    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      request: {
        method: input.method,
        url,
        headers: maskHeaders(headers),
        body: maskApiPayload(input.body ?? null),
      },
      response: {
        headers: responseHeaders,
        body: maskApiPayload(body),
      },
      curl,
    };
  }

  private resolveApiBaseUrl(): string {
    const port = this.config.get<number>('app.port') ?? 3000;
    const prefix = this.config.get<string>('app.apiPrefix') ?? 'api/v1';
    return `http://127.0.0.1:${port}/${prefix}`;
  }

  private buildCurl(method: string, url: string, headers: Record<string, string>, body: string) {
    const headerParts = Object.entries(headers)
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(' \\\n  ');
    if (method === 'GET') {
      return `curl "${url}" \\\n  ${headerParts}`;
    }
    const escaped = body.replace(/'/g, "'\\''");
    return `curl -X POST "${url}" \\\n  ${headerParts} \\\n  -d '${escaped}'`;
  }
}
