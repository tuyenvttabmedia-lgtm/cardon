import { Injectable } from '@nestjs/common';
import {
  AgentApiLogEntry,
  AgentApiLogType,
} from '../entities/agent-security.constants';
import { AgentApiRequestLogService } from '../../api-observability/services/agent-api-request-log.service';

interface RateWindow {
  minuteCount: number;
  minuteReset: number;
  dayCount: number;
  dayReset: number;
  history429: Array<{ at: string; count: number }>;
}

@Injectable()
export class AgentApiTelemetryService {
  private readonly rateWindows = new Map<string, RateWindow>();

  constructor(private readonly requestLogService: AgentApiRequestLogService) {}

  checkRateLimit(agentId: string, limitPerMinute: number): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const minuteMs = 60_000;
    const dayMs = 86_400_000;
    let window = this.rateWindows.get(agentId);

    if (!window || window.minuteReset <= now) {
      window = {
        minuteCount: 0,
        minuteReset: now + minuteMs,
        dayCount: window && window.dayReset > now ? window.dayCount : 0,
        dayReset: window && window.dayReset > now ? window.dayReset : now + dayMs,
        history429: window?.history429 ?? [],
      };
    }

    if (window.dayReset <= now) {
      window.dayCount = 0;
      window.dayReset = now + dayMs;
    }

    if (window.minuteCount >= limitPerMinute) {
      window.history429.unshift({ at: new Date().toISOString(), count: window.minuteCount });
      window.history429 = window.history429.slice(0, 50);
      this.rateWindows.set(agentId, window);
      return { allowed: false, remaining: 0, resetAt: window.minuteReset };
    }

    window.minuteCount += 1;
    window.dayCount += 1;
    this.rateWindows.set(agentId, window);

    return {
      allowed: true,
      remaining: Math.max(0, limitPerMinute - window.minuteCount),
      resetAt: window.minuteReset,
    };
  }

  getUsage(agentId: string, limitPerMinute: number) {
    const now = Date.now();
    const window = this.rateWindows.get(agentId);
    const minuteCount = window && window.minuteReset > now ? window.minuteCount : 0;
    const dayCount = window && window.dayReset > now ? window.dayCount : 0;
    return {
      requestsPerMinute: limitPerMinute,
      requestsPerDay: limitPerMinute * 60 * 24,
      currentMinute: minuteCount,
      currentDay: dayCount,
      remainingMinute: Math.max(0, limitPerMinute - minuteCount),
      remainingDay: Math.max(0, limitPerMinute * 60 * 24 - dayCount),
      burst: Math.min(limitPerMinute, 20),
      history429: window?.history429 ?? [],
      resetAt: window?.minuteReset ?? now + 60_000,
    };
  }

  recordApiLog(
    agentId: string,
    entry: Omit<AgentApiLogEntry, 'id' | 'at'> & { at?: string },
  ) {
    const logType = entry.type;
    const httpStatus =
      logType === 'AUTH_429'
        ? 429
        : logType === 'AUTH_403' || logType === 'FORBIDDEN'
          ? 403
          : logType === 'BLOCKED_IP'
            ? 403
            : logType === 'INVALID_SIGNATURE' || logType === 'INVALID_KEY' || logType === 'EXPIRED_KEY'
              ? 401
              : 200;

    this.requestLogService.recordAuthEvent({
      agentId,
      logType,
      httpStatus,
      endpoint: entry.path ?? '/api/partner/v1',
      method: entry.method ?? 'GET',
      sourceIp: entry.ip,
      errorMessage: entry.message,
    });
  }

  async listApiLogs(agentId: string, type?: AgentApiLogType, search?: string, take = 50) {
    const result = await this.requestLogService.listForAgent(agentId, {
      page: 1,
      limit: take,
      logType: type,
      search,
    });
    return { items: result.items, total: result.total };
  }
}
