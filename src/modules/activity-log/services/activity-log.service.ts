import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AppLoggerService } from '../../../logger/app-logger.service';
import { ActivityEventPayload } from '../../activity-event/interfaces/activity-event.interface';
import { ActivityLogQueryDto } from '../dto/activity-log.dto';
import { mapSystemActivityLog, mapSystemActivityLogList } from '../mapper/activity-log.mapper';
import { ActivityLogRepository } from '../repositories/activity-log.repository';

@Injectable()
export class ActivityLogService {
  constructor(
    private readonly repository: ActivityLogRepository,
    private readonly logger: AppLoggerService,
  ) {}

  create(data: ActivityEventPayload): void {
    void this.repository
      .create(data)
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to persist activity log: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
          ActivityLogService.name,
        );
      });
  }

  async findAll(query: ActivityLogQueryDto) {
    const result = await this.repository.findAll(query);
    return {
      items: mapSystemActivityLogList(result.items),
      total: result.total,
      page: result.page,
      limit: result.limit,
      stats: result.stats,
    };
  }

  async findOne(id: string) {
    const row = await this.repository.findById(id);
    if (!row) {
      throw new NotFoundException('Activity log not found');
    }
    return mapSystemActivityLog(row);
  }

  async exportCsv(query: ActivityLogQueryDto) {
    const rows = await this.repository.findAllForExport(query);
    const header = [
      'Date',
      'Severity',
      'Category',
      'Event',
      'Title',
      'User',
      'Source',
      'IP',
    ];
    const lines = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.createdAt.toISOString(),
          row.severity,
          row.eventCategory,
          row.eventType,
          this.csvEscape(row.title),
          this.csvEscape(row.performedEmail ?? ''),
          row.source,
          this.csvEscape(row.ipAddress ?? ''),
        ].join(','),
      ),
    ];
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      filename: `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  async exportExcel(query: ActivityLogQueryDto) {
    const rows = await this.repository.findAllForExport(query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Activity Logs');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 24 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Category', key: 'category', width: 14 },
      { header: 'Event', key: 'event', width: 18 },
      { header: 'Title', key: 'title', width: 32 },
      { header: 'User', key: 'user', width: 28 },
      { header: 'Source', key: 'source', width: 12 },
      { header: 'IP', key: 'ip', width: 16 },
    ];
    for (const row of rows) {
      sheet.addRow({
        date: row.createdAt.toISOString(),
        severity: row.severity,
        category: row.eventCategory,
        event: row.eventType,
        title: row.title,
        user: row.performedEmail ?? '',
        source: row.source,
        ip: row.ipAddress ?? '',
      });
    }
    sheet.getRow(1).font = { bold: true };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `activity-logs-${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
