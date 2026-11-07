import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('F1 finance eSIM UI wiring', () => {
  it('exposes /finance/esim in shell and page', () => {
    const shell = readFileSync(join(__dirname, '../components/finance/FinanceShell.tsx'), 'utf8');
    const page = readFileSync(join(__dirname, '../app/finance/esim/page.tsx'), 'utf8');
    const panel = readFileSync(
      join(__dirname, '../components/finance/FinanceEsimRevenuePanel.tsx'),
      'utf8',
    );
    const client = readFileSync(join(__dirname, '../services/api-client.ts'), 'utf8');
    expect(shell).toContain('/finance/esim');
    expect(page).toContain('FinanceEsimRevenuePanel');
    expect(panel).toContain('getEsimRevenue');
    expect(panel).toContain('exportEsimRevenue');
    expect(panel).toContain('UNAVAILABLE');
    expect(panel).toContain('ước tính');
    expect(client).toContain('/admin/finance/esim/revenue');
  });
});
