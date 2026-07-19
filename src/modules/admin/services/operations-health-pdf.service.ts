import { Injectable } from '@nestjs/common';
import type { IntegrityReport } from '../../product/entities/integrity.types';
import type { OperationsDashboard } from '../entities/operations-health.types';

@Injectable()
export class OperationsHealthPdfService {
  buildPdf(report: IntegrityReport, operations: OperationsDashboard): Buffer {
    const lines: string[] = [
      'CardOn System Health Report',
      `Generated: ${report.runAt}`,
      `Production: ${operations.productionLabel}`,
      `Health Score: ${report.healthScore}%`,
      `Status: ${report.status.toUpperCase()}`,
      '',
      '--- Production Checklist ---',
      ...operations.checklist.map(
        (item) => `[${item.status.toUpperCase()}] ${item.label}${item.detail ? ` — ${item.detail}` : ''}`,
      ),
      '',
      '--- Payment Gateways ---',
      ...operations.payment.map(
        (g) => `${g.label}: ${g.enabled ? 'Enabled' : 'Disabled'}${g.configured ? '' : ' (not configured)'}`,
      ),
      '',
      '--- Providers ---',
      ...operations.providers.map(
        (p) =>
          `${p.name}: ${p.healthStatus} | Balance ${p.balance ?? 'N/A'} | API ${p.apiLatencyMs ?? 'N/A'} ms`,
      ),
      '',
      '--- Queue ---',
      `Waiting ${operations.queue.waiting} | Processing ${operations.queue.processing} | Completed ${operations.queue.completed} | Failed ${operations.queue.failed}`,
      `Redis: ${operations.queue.redisStatus}`,
      '',
      '--- Findings ---',
      ...report.findings
        .filter((f) => f.severity !== 'ok')
        .slice(0, 50)
        .map((f) => `[${f.severity.toUpperCase()}] ${f.entityLabel}: ${f.message}`),
    ];

    return this.encodePdf(lines);
  }

  private encodePdf(lines: string[]): Buffer {
    const sanitized = lines.map((line) =>
      line.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?').slice(0, 120),
    );
    const contentLines = ['BT', '/F1 10 Tf', '50 780 Td'];
    sanitized.forEach((line, index) => {
      if (index > 0) contentLines.push('0 -14 Td');
      contentLines.push(`(${this.escapePdf(line)}) Tj`);
    });
    contentLines.push('ET');
    const stream = contentLines.join('\n');
    const streamLength = Buffer.byteLength(stream, 'utf8');

    const objects = [
      '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
      '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj',
      `4 0 obj<< /Length ${streamLength} >>stream\n${stream}\nendstream endobj`,
      '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${obj}\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }

  private escapePdf(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
}
