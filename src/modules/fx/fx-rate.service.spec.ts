import { FxRateStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { FxRateService } from './fx-rate.service';

describe('FxRateService', () => {
  function harness() {
    const source = {
      code: 'MANUAL_USD_VND',
      status: 'APPROVED',
      baseCurrency: 'USD',
      quoteCurrency: 'VND',
      maxStalenessSeconds: null as number | null,
    };
    const rates: Array<Record<string, unknown>> = [];
    let seq = 0;
    const used = new Set<string>();
    function present(row: Record<string, unknown>) {
      return {
        ...row,
        source: { ...source },
        _count: { orders: used.has(String(row.id)) ? 1 : 0 },
      };
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      fxRateSource: {
        upsert: jest.fn(async ({ create }: { create: typeof source }) => {
          if (source.maxStalenessSeconds == null) source.maxStalenessSeconds = create.maxStalenessSeconds;
          return source;
        }),
        update: jest.fn(async ({ data }: { data: { maxStalenessSeconds: number } }) => {
          source.maxStalenessSeconds = data.maxStalenessSeconds;
          return source;
        }),
      },
      fxRate: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `fx-${++seq}`,
            createdAt: new Date('2026-11-06T12:00:00.000Z'),
            effectiveTo: null,
            publishedById: null,
            ...data,
          };
          rates.push(row);
          return present(row);
        }),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const found = rates.find((row) => matches(row, where)) ?? null;
          return found ? present(found) : null;
        }),
        findFirstOrThrow: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const found = rates.find((row) => matches(row, where));
          if (!found) throw new Error('missing');
          return present(found);
        }),
        findMany: jest.fn(async () => rates.map((row) => present(row))),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rates.find((item) => item.id === where.id);
          if (!row) throw new Error('missing');
          Object.assign(row, data);
          return present(row);
        }),
      },
      order: {
        count: jest.fn(async ({ where }: { where: { fxRateId: string } }) => (used.has(where.fxRateId) ? 1 : 0)),
      },
    };
    const prisma = {
      fxRate: tx.fxRate,
      order: tx.order,
      user: { findMany: async () => [] },
      $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    };
    return { service: new FxRateService(prisma as never), rates, source, used };
  }

  function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    if (where.id && row.id !== where.id) return false;
    if (where.sourceCode && row.sourceCode !== where.sourceCode) return false;
    if (where.status && row.status !== where.status) return false;
    if (Array.isArray(where.OR)) {
      const open = where.OR.some((clause: { effectiveTo: null | { gt: Date } }) => {
        if (clause.effectiveTo === null) return row.effectiveTo == null;
        return row.effectiveTo instanceof Date && row.effectiveTo.getTime() > clause.effectiveTo.gt.getTime();
      });
      if (!open) return false;
    }
    return true;
  }

  it('creates a draft and publishes the first rate', async () => {
    const { service, rates, source } = harness();
    const draft = await service.createDraft({
      rate: '25000',
      observedAt: '2026-11-06T11:00:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    expect(draft.status).toBe('DRAFT');
    expect(rates).toHaveLength(1);
    const published = await service.publish(draft.id, 'admin-1');
    expect(published.status).toBe('EFFECTIVE');
    expect(published.bandResult).toBe('WITHIN_BAND');
    expect(published.publishedById).toBe('admin-1');
    expect(source.maxStalenessSeconds).toBe(86_400);
    expect(rates.filter((row) => row.status === FxRateStatus.EFFECTIVE)).toHaveLength(1);
  });

  it('rejects an invalid rate before insert', async () => {
    const { service, rates } = harness();
    await expect(
      service.createDraft({ rate: '0', observedAt: '2026-11-06T11:00:00.000Z', maxStalenessSeconds: 60 }),
    ).rejects.toThrow('INVALID_RATE');
    expect(rates).toHaveLength(0);
  });

  it('publishes a 2% move and holds a larger move for approval', async () => {
    const { service } = harness();
    const first = await service.createDraft({
      rate: '25000',
      observedAt: '2026-11-06T11:00:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    await service.publish(first.id, 'admin-1');
    const inside = await service.createDraft({
      rate: '25500',
      observedAt: '2026-11-06T11:30:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    const published = await service.publish(inside.id, 'admin-1');
    expect(published.status).toBe('EFFECTIVE');
    expect(published.bandResult).toBe('WITHIN_BAND');

    const outside = await service.createDraft({
      rate: '27000',
      observedAt: '2026-11-06T11:40:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    const held = await service.publish(outside.id, 'admin-1');
    expect(held.status).toBe('PENDING_REVIEW');
    const listed = await service.list();
    expect(listed.rates.filter((row) => row.status === 'EFFECTIVE')).toHaveLength(1);
    expect(listed.current?.id).toBe(inside.id);

    const approved = await service.approve(outside.id, 'admin-2');
    expect(approved.status).toBe('EFFECTIVE');
    expect(approved.bandResult).toBe('OVER_BAND');
    const after = await service.list();
    expect(after.rates.filter((row) => row.status === 'EFFECTIVE')).toHaveLength(1);
    expect(after.current?.id).toBe(outside.id);
  });

  it('refuses to edit a rate that an order already used, and refuses to edit published history', async () => {
    const { service, used } = harness();
    const draft = await service.createDraft({
      rate: '25000',
      observedAt: '2026-11-06T11:00:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    used.add(draft.id);
    await expect(service.rejectEdit(draft.id)).rejects.toThrow('already used');
    const fresh = await service.createDraft({
      rate: '25100',
      observedAt: '2026-11-06T11:05:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    await service.publish(fresh.id, 'admin-1');
    await expect(service.rejectEdit(fresh.id)).rejects.toThrow('cannot be edited');
  });

  it('rejects a rate over the band without changing the entered number or the live rate', async () => {
    const { service, rates } = harness();
    const first = await service.createDraft({
      rate: '25000',
      observedAt: '2026-11-06T11:00:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    await service.publish(first.id, 'admin-1');
    const outside = await service.createDraft({
      rate: '27000',
      observedAt: '2026-11-06T11:10:00.000Z',
      maxStalenessSeconds: 86_400,
    });
    const held = await service.publish(outside.id, 'admin-1');
    expect(held.status).toBe('PENDING_REVIEW');
    const rejected = await service.reject(outside.id, 'admin-2');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rate).toBe('27000');
    expect(rates.find((row) => row.id === first.id)?.status).toBe(FxRateStatus.EFFECTIVE);
    const stored = rates.find((row) => row.id === outside.id)?.rate as { toString(): string };
    expect(stored.toString()).toBe('27000');
  });
});
