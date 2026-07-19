import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { WebhookExportQueryDto } from '../dto/webhook-monitor.dto';
import { WebhookMonitorService } from './webhook-monitor.service';

@Injectable()
export class WebhookMonitorExportService {
  constructor(private readonly monitorService: WebhookMonitorService) {}

  async exportCsv(query: WebhookExportQueryDto) {
    const { data, headers, rows } = await this.buildRows(query);
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(row.map((c) => this.csvEscape(String(c ?? ''))).join(','));
    }
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      filename: `webhooks-${data.kind}-${Date.now()}.csv`,
    };
  }

  async exportExcel(query: WebhookExportQueryDto) {
    const { headers, rows } = await this.buildRows(query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Webhooks');
    sheet.addRow(headers);
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      filename: `webhooks-${Date.now()}.xlsx`,
    };
  }

  async exportJson(query: WebhookExportQueryDto) {
    const { data } = await this.buildRows(query);
    return {
      buffer: Buffer.from(JSON.stringify(data.payload, null, 2), 'utf8'),
      filename: `webhooks-${Date.now()}.json`,
    };
  }

  private async buildRows(query: WebhookExportQueryDto) {
    const payload = await this.monitorService.exportData(query);
    if (payload.kind === 'statistics') {
      const s = payload.data as Record<string, unknown>;
      return {
        data: { kind: payload.kind, payload: s },
        headers: ['Metric', 'Value'],
        rows: Object.entries(s).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, v]),
      };
    }
    if (payload.kind === 'history') {
      const h = payload.data as { buckets: Array<Record<string, unknown>> };
      return {
        data: { kind: payload.kind, payload: h },
        headers: ['Label', 'Success', 'Failed', 'Retry'],
        rows: h.buckets.map((b) => [b.label, b.success, b.failed, b.retry]),
      };
    }
    const items = payload.data as Array<Record<string, unknown>>;
    return {
      data: { kind: payload.kind, payload: items },
      headers: ['ID', 'Time', 'Source', 'Status', 'HTTP', 'Payment Ref', 'Order', 'Payment'],
      rows: items.map((i) => [
        i.id,
        i.createdAt,
        i.displayName,
        i.status,
        i.httpCode,
        i.paymentReference,
        i.orderId,
        i.paymentId,
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
