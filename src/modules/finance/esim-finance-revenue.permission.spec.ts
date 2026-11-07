import { readFileSync } from 'fs';
import { join } from 'path';
import { FINANCE_PERMISSIONS, FINANCE_AUDIT_ACTIONS } from './entities/finance.constants';

describe('F1 finance eSIM revenue permissions', () => {
  it('wires finance.view endpoints and export audit without touching VAT services', () => {
    const controller = readFileSync(join(__dirname, 'controllers/finance.controller.ts'), 'utf8');
    const moduleSrc = readFileSync(join(__dirname, 'finance.module.ts'), 'utf8');
    const vat = readFileSync(join(__dirname, 'services/vat-daily.service.ts'), 'utf8');
    const profit = readFileSync(join(__dirname, 'services/profit.service.ts'), 'utf8');

    expect(FINANCE_PERMISSIONS.VIEW).toBe('finance.view');
    expect(FINANCE_AUDIT_ACTIONS.ESIM_REVENUE_EXPORTED).toBe('ESIM_REVENUE_EXPORTED');
    expect(controller).toContain("Get('esim/revenue')");
    expect(controller).toContain("Get('esim/revenue/export')");
    expect(controller).toContain("Post('esim/paypal/imports')");
    expect(controller).toContain("Get('esim/paypal/matches')");
    expect(controller).toContain('FINANCE_PERMISSIONS.VIEW');
    expect(controller).toContain('getFinanceRevenue');
    expect(controller).toContain('recordEsimRevenueExported');
    expect(moduleSrc).toContain('EsimModule');
    expect(vat).not.toContain('ESIM');
    expect(profit).not.toContain('esim');
  });
});
