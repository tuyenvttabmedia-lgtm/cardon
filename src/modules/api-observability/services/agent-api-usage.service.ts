import { Injectable } from '@nestjs/common';
import { AgentApiRequestLogRepository } from '../repositories/agent-api-request-log.repository';

@Injectable()
export class AgentApiUsageService {
  constructor(private readonly repository: AgentApiRequestLogRepository) {}

  async getUsage(agentId: string, period: 'today' | '7d' | '30d' = 'today') {
    const now = Date.now();
    const since =
      period === '30d'
        ? new Date(now - 30 * 86_400_000)
        : period === '7d'
          ? new Date(now - 7 * 86_400_000)
          : new Date(new Date().setHours(0, 0, 0, 0));

    const rows = await this.repository.statsSince(agentId, since);
    const total = rows.length;
    const success = rows.filter((r) => r.httpStatus >= 200 && r.httpStatus < 400).length;
    const failed = total - success;
    const latencies = rows.map((r) => r.latencyMs).filter((v): v is number => v != null);
    const avgLatency =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    const endpointCounts = new Map<string, number>();
    const errorCounts = new Map<string, number>();
    const productCounts = new Map<string, number>();

    for (const row of rows) {
      endpointCounts.set(row.endpoint, (endpointCounts.get(row.endpoint) ?? 0) + 1);
      if (row.errorCode) errorCounts.set(row.errorCode, (errorCounts.get(row.errorCode) ?? 0) + 1);
      const body = row.requestBody as { product_code?: string } | null;
      if (body?.product_code) {
        productCounts.set(body.product_code, (productCounts.get(body.product_code) ?? 0) + 1);
      }
    }

    const top = (map: Map<string, number>, n = 5) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({ key, count }));

    return {
      period,
      total,
      success,
      failed,
      successRate: total > 0 ? Math.round((success / total) * 10000) / 100 : 100,
      avgLatencyMs: avgLatency,
      topEndpoints: top(endpointCounts),
      topErrors: top(errorCounts),
      topProducts: top(productCounts),
      gatewayUsage: [{ gateway: 'partner_api', count: total }],
    };
  }
}
