import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { QueueMonitorService } from './queue-monitor.service';
import { QueueExportQueryDto } from '../dto/queue-monitor.dto';

@Injectable()
export class QueueMonitorExportService {
  constructor(private readonly monitorService: QueueMonitorService) {}

  async exportCsv(queue: string, query: QueueExportQueryDto) {
    const data = await this.gatherExportData(queue, query);
    const lines = [data.headers.join(',')];
    for (const row of data.rows) {
      lines.push(row.map((c) => this.csvEscape(String(c ?? ''))).join(','));
    }
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      filename: `queue-${queue}-${query.type ?? 'jobs'}-${Date.now()}.csv`,
    };
  }

  async exportExcel(queue: string, query: QueueExportQueryDto) {
    const data = await this.gatherExportData(queue, query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Queue Export');
    sheet.addRow(data.headers);
    for (const row of data.rows) {
      sheet.addRow(row);
    }
    sheet.getRow(1).font = { bold: true };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `queue-${queue}-${query.type ?? 'jobs'}-${Date.now()}.xlsx`,
    };
  }

  async exportJson(queue: string, query: QueueExportQueryDto) {
    const payload = await this.gatherExportPayload(queue, query);
    return {
      buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
      filename: `queue-${queue}-${query.type ?? 'jobs'}-${Date.now()}.json`,
    };
  }

  private async gatherExportPayload(queue: string, query: QueueExportQueryDto) {
    const type = query.type ?? 'jobs';
    if (type === 'statistics') {
      return this.monitorService.getStatistics(queue);
    }
    if (type === 'history') {
      return this.monitorService.getHistory(queue, {
        range: query.range,
        date_from: query.date_from,
        date_to: query.date_to,
      });
    }
    const status = type === 'failed' ? 'failed' : query.status ?? 'waiting';
    const result = await this.monitorService.listJobs(queue, {
      page: 1,
      limit: 500,
      status,
      sort: 'newest',
    });
    return result;
  }

  private async gatherExportData(queue: string, query: QueueExportQueryDto) {
    const type = query.type ?? 'jobs';
    if (type === 'statistics') {
      const stats = await this.monitorService.getStatistics(queue);
      return {
        headers: ['Metric', 'Value'],
        rows: [
          ['Queue', stats.displayName],
          ['Completed Today', stats.completedToday],
          ['Failed Today', stats.failedToday],
          ['Jobs/min', stats.jobsPerMinute],
          ['Jobs/hour', stats.jobsPerHour],
          ['Avg Duration (ms)', stats.avgProcessingTimeMs ?? ''],
          ['P95 Duration (ms)', stats.p95ProcessingTimeMs ?? ''],
          ['Success Rate %', stats.successRate],
          ['Failure Rate %', stats.failureRate],
          ['Retries', stats.retries],
        ],
      };
    }
    if (type === 'history') {
      const history = await this.monitorService.getHistory(queue, {
        range: query.range,
        date_from: query.date_from,
        date_to: query.date_to,
      });
      return {
        headers: ['Bucket', 'Completed', 'Failed', 'Retry', 'Waiting'],
        rows: history.buckets.map((b) => [
          b.label,
          b.completed,
          b.failed,
          b.retry,
          b.waiting,
        ]),
      };
    }
    const status = type === 'failed' ? 'failed' : query.status ?? 'waiting';
    const result = await this.monitorService.listJobs(queue, {
      page: 1,
      limit: 500,
      status,
      sort: 'newest',
    });
    return {
      headers: [
        'Job ID',
        'Name',
        'Status',
        'Attempts',
        'Created',
        'Started',
        'Finished',
        'Duration ms',
        'Correlation ID',
        'Request ID',
      ],
      rows: result.items.map((j) => [
        j.id,
        j.name,
        j.status,
        j.attempts,
        j.createdAt ?? '',
        j.startedAt ?? '',
        j.finishedAt ?? '',
        j.durationMs ?? '',
        j.correlationId ?? '',
        j.requestId ?? '',
      ]),
    };
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
