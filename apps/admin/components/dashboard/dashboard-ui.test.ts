import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { filterAlertActivity } from './DashboardActivitySection';
import {
  ordersBacklogHref,
  ordersCreatedPeriodHref,
  ordersPaidPeriodHref,
} from './dashboard-links';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('Operations Cockpit C2 — drill-down routes', () => {
  const period = {
    preset: 'today' as const,
    dateFrom: '2026-03-15',
    dateTo: '2026-03-15',
    timezone: 'Asia/Ho_Chi_Minh' as const,
  };

  it('uses verified Orders list query params (ex/attn/payment/from/to)', () => {
    expect(ordersPaidPeriodHref(period)).toBe(
      '/orders?preset=custom&from=2026-03-15&to=2026-03-15&payment=PAID',
    );
    expect(ordersCreatedPeriodHref(period)).toBe(
      '/orders?preset=custom&from=2026-03-15&to=2026-03-15',
    );
    expect(ordersBacklogHref('pending')).toBe('/orders?ex=pending');
    expect(ordersBacklogHref('processing')).toBe('/orders?ex=processing');
    expect(ordersBacklogHref('waitingRetry')).toBe('/orders?ex=attention');
    expect(ordersBacklogHref('needReview')).toBe(
      '/orders?ex=attention&attn=NEED_MANUAL_REVIEW',
    );
  });

  it('does not invent dateBasis=paidAt', () => {
    expect(ordersPaidPeriodHref(period)).not.toContain('dateBasis');
    expect(read('components/dashboard/dashboard-links.ts')).not.toContain('dateBasis');
  });
});

describe('Operations Cockpit C2 — health / labels / soft-fail', () => {
  it('never falls back health score with ?? 100', () => {
    const page = read('app/dashboard/page.tsx');
    const health = read('components/dashboard/DashboardHealthSection.tsx');
    const cockpit = read('components/dashboard/DashboardCockpit.tsx');
    expect(page + health + cockpit).not.toMatch(/\?\?\s*100/);
    expect(health).toContain('healthNotScanned');
    expect(health).not.toContain('Run Scan');
    expect(health).not.toContain('autofix');
  });

  it('loads health independently from dashboard metrics', () => {
    const cockpit = read('components/dashboard/DashboardCockpit.tsx');
    expect(cockpit).toContain('loadHealth');
    expect(cockpit).toContain('loadMetrics');
    expect(cockpit).toContain("begin('health')");
    expect(cockpit).toContain("begin('metrics')");
    // Soft-fail: health error must not clear business state
    expect(cockpit).toContain('setHealthError');
    expect(cockpit).not.toMatch(/Promise\.all\(\[\s*adminApi\.getDashboard/);
  });

  it('period change keeps snapshot sections and uses LatestRequestTracker', () => {
    const cockpit = read('components/dashboard/DashboardCockpit.tsx');
    expect(cockpit).toContain("mode: 'full' | 'period'");
    expect(cockpit).toContain('applyPeriodMetrics');
    expect(cockpit).toContain('LatestRequestTracker');
    expect(cockpit).not.toMatch(/applyPeriodMetrics[\s\S]{0,200}setBacklog/);
    expect(cockpit).not.toMatch(/applyPeriodMetrics[\s\S]{0,200}setAgents/);
  });

  it('labels payment attempts and system-wide provider errors', () => {
    const business = read('components/dashboard/DashboardBusinessSection.tsx');
    const pay = read('components/dashboard/DashboardPayProviderSection.tsx');
    expect(business).toContain('paymentSuccessHint');
    // VQA-2: hint only on StatCard — not duplicated under the grid.
    expect(business.match(/paymentSuccessHint/g)?.length).toBe(1);
    expect(business).not.toMatch(/<\/div>\s*<p className="text-xs text-slate-400">\{vi\.dashboard\.paymentSuccessHint\}<\/p>/);
    expect(pay).toContain('providerErrorsSystem');
    expect(pay).toContain('providerErrorsHint');
    expect(pay).not.toContain('pendingFulfillment');
  });

  it('C2.1: AdminShell hides role chip below sm (no overflow-x cover)', () => {
    const shell = read('components/layout/AdminShell.tsx');
    expect(shell).toContain('hidden shrink-0 rounded-md bg-slate-100');
    expect(shell).toContain('sm:inline');
    expect(shell).toContain('aria-label={roleLabel');
    expect(shell).not.toMatch(/overflow-x-hidden/);
  });

  it('C2.1: StatCard is a single Link surface when href is set', () => {
    const display = read('components/ui/Display.tsx');
    const statCard = display.slice(display.indexOf('export function StatCard'));
    expect(statCard).toContain('<Link href={href} className={shellClass}>');
    expect(statCard).not.toMatch(/<Link href=\{href\}[^>]*>\s*<Card/);
    expect(statCard).toContain('focus-visible:ring-2');
    expect(statCard).toContain('pointer-events-none');
  });

  it('order ops uses backlog fields, not legacy pendingFulfillment', () => {
    const ops = read('components/dashboard/DashboardOrderOpsSection.tsx');
    expect(ops).toContain('pendingDelivery');
    expect(ops).toContain('needManualReview');
    expect(ops).not.toContain('pendingFulfillment');
  });

  it('API client passes period query', () => {
    const api = read('services/api-client.ts');
    expect(api).toContain('getDashboard(period?:');
    expect(api).toContain('period=${encodeURIComponent(period)}');
  });
});

describe('filterAlertActivity', () => {
  it('keeps WARNING/ERROR/CRITICAL only', () => {
    const rows = filterAlertActivity([
      { id: '1', severity: 'INFO', title: 'a', createdAt: '2026-01-01' } as never,
      { id: '2', severity: 'WARNING', title: 'b', createdAt: '2026-01-01' } as never,
      { id: '3', severity: 'ERROR', title: 'c', createdAt: '2026-01-01' } as never,
      { id: '4', severity: 'SUCCESS', title: 'd', createdAt: '2026-01-01' } as never,
    ]);
    expect(rows.map((r) => r.id)).toEqual(['2', '3']);
  });
});
