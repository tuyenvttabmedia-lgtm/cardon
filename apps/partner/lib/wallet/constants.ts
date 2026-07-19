export const PORTAL_LEDGER_TYPES = [
  'PURCHASE',
  'REFUND',
  'COMMISSION',
  'ADJUSTMENT',
  'SETTLEMENT',
  'DEPOSIT',
  'WITHDRAW',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT',
  'TRANSFER',
  'HOLD',
  'RELEASE',
] as const;

export function exportLedgerCsv(rows: Array<Record<string, unknown>>, filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','),
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export function exportLedgerExcel(rows: Array<Record<string, unknown>>, filename: string) {
  exportLedgerCsv(rows, filename.replace(/\.xlsx?$/, '.csv'));
}

export function exportLedgerPdf(rows: Array<Record<string, unknown>>, title: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const tableRows = rows
    .map(
      (r) =>
        `<tr>${Object.values(r)
          .map((v) => `<td style="border:1px solid #ccc;padding:4px">${String(v ?? '')}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  w.document.write(`
    <html><head><title>${title}</title></head><body>
    <h1>${title}</h1>
    <table style="border-collapse:collapse;font-size:12px">${tableRows}</table>
    </body></html>`);
  w.document.close();
  w.print();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
