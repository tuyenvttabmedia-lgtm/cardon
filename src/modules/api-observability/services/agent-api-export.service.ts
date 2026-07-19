import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationService } from '../../notification/services/notification.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { API_LOG_EXPORT_MAX_IMMEDIATE } from '../entities/api-observability.constants';
import { AgentApiRequestLogRepository } from '../repositories/agent-api-request-log.repository';

export interface ApiLogExportJob {
  id: string;
  agentId: string;
  userId: string;
  format: 'csv' | 'excel' | 'json';
  status: 'pending' | 'completed' | 'failed';
  rowCount?: number;
  data?: unknown;
  createdAt: string;
}

@Injectable()
export class AgentApiExportService {
  private readonly jobs = new Map<string, ApiLogExportJob>();

  constructor(
    private readonly repository: AgentApiRequestLogRepository,
    private readonly agentRepository: AgentRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async exportLogs(
    userId: string,
    agentId: string,
    format: 'csv' | 'excel' | 'json',
    filters: Record<string, unknown>,
  ) {
    const query = {
      agentId,
      skip: 0,
      take: API_LOG_EXPORT_MAX_IMMEDIATE + 1,
      search: filters.search as string | undefined,
      logType: filters.logType as string | undefined,
      httpStatus: filters.httpStatus as number | undefined,
      dateFrom: filters.dateFrom ? new Date(String(filters.dateFrom)) : undefined,
      dateTo: filters.dateTo ? new Date(String(filters.dateTo)) : undefined,
    };

    const total = await this.repository.count(query);
    if (total <= API_LOG_EXPORT_MAX_IMMEDIATE) {
      const rows = await this.repository.exportRows(query, API_LOG_EXPORT_MAX_IMMEDIATE);
      return {
        mode: 'immediate' as const,
        format,
        rowCount: rows.length,
        rows,
      };
    }

    const jobId = randomUUID();
    const job: ApiLogExportJob = {
      id: jobId,
      agentId,
      userId,
      format,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    void this.runBackgroundExport(jobId, query, format, userId);

    return { mode: 'background' as const, jobId, rowCount: total, status: 'pending' };
  }

  getJob(jobId: string, agentId: string): ApiLogExportJob {
    const job = this.jobs.get(jobId);
    if (!job || job.agentId !== agentId) throw new NotFoundException('Export job not found');
    return job;
  }

  private async runBackgroundExport(
    jobId: string,
    query: Parameters<AgentApiRequestLogRepository['exportRows']>[0],
    format: ApiLogExportJob['format'],
    userId: string,
  ) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    try {
      const rows = await this.repository.exportRows(query, 5000);
      job.status = 'completed';
      job.rowCount = rows.length;
      job.data = rows;
      const agent = await this.agentRepository.findByUserId(userId);
      if (agent?.userId) {
        await this.notificationService.notifyCustomerInApp({
          userId: agent.userId,
          type: 'API_EXPORT_READY',
          title: 'Xuất nhật ký API sẵn sàng',
          body: `File ${format.toUpperCase()} với ${rows.length} dòng đã sẵn sàng tải.`,
          metadata: { jobId, format },
          jobId: `api-export-${jobId}`,
        });
      }
    } catch {
      job.status = 'failed';
    }
  }
}
