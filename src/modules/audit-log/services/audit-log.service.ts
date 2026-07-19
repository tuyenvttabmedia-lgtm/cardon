import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AppLoggerService } from '../../../logger/app-logger.service';
import { AuditLogQueryDto, CreateSystemAuditLogDto } from '../dto/audit-log.dto';
import { mapSystemAuditLog, mapSystemAuditLogList } from '../mapper/audit-log.mapper';
import { AuditLogRepository } from '../repositories/audit-log.repository';

@Injectable()
export class AuditLogService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly logger: AppLoggerService,
  ) {}

  create(data: CreateSystemAuditLogDto): void {
    void this.repository
      .create(data)
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to persist system audit log: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
          AuditLogService.name,
        );
      });
  }

  async findAll(query: AuditLogQueryDto) {
    const result = await this.repository.findAll(query);
    return {
      items: mapSystemAuditLogList(result.items),
      total: result.total,
      page: result.page,
      limit: result.limit,
      stats: result.stats,
    };
  }

  async findOne(id: string) {
    const row = await this.repository.findById(id);
    if (!row) {
      throw new NotFoundException('Audit log not found');
    }
    return mapSystemAuditLog(row);
  }

  async exportCsv(query: AuditLogQueryDto): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.repository.findAllForExport(query);
    const header = [
      'Date',
      'User',
      'Role',
      'Resource',
      'Action',
      'Field',
      'IP',
      'Reason',
      'Old Value',
      'New Value',
    ];

    const lines = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.createdAt.toISOString(),
          this.csvEscape(row.performedEmail),
          row.performedRole,
          row.resource,
          row.action,
          this.csvEscape(row.fieldName ?? ''),
          this.csvEscape(row.ipAddress ?? ''),
          this.csvEscape(row.reason ?? ''),
          this.csvEscape(JSON.stringify(row.oldValue ?? '')),
          this.csvEscape(JSON.stringify(row.newValue ?? '')),
        ].join(','),
      ),
    ];

    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return { buffer: Buffer.from(lines.join('\n'), 'utf8'), filename };
  }

  async exportExcel(query: AuditLogQueryDto): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.repository.findAllForExport(query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit Logs');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 24 },
      { header: 'User', key: 'user', width: 28 },
      { header: 'Role', key: 'role', width: 14 },
      { header: 'Resource', key: 'resource', width: 18 },
      { header: 'Action', key: 'action', width: 12 },
      { header: 'Field', key: 'field', width: 20 },
      { header: 'IP', key: 'ip', width: 16 },
      { header: 'Reason', key: 'reason', width: 24 },
      { header: 'Old Value', key: 'oldValue', width: 40 },
      { header: 'New Value', key: 'newValue', width: 40 },
    ];

    for (const row of rows) {
      sheet.addRow({
        date: row.createdAt.toISOString(),
        user: row.performedEmail,
        role: row.performedRole,
        resource: row.resource,
        action: row.action,
        field: row.fieldName ?? '',
        ip: row.ipAddress ?? '',
        reason: row.reason ?? '',
        oldValue: JSON.stringify(row.oldValue ?? ''),
        newValue: JSON.stringify(row.newValue ?? ''),
      });
    }

    sheet.getRow(1).font = { bold: true };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer, filename };
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
