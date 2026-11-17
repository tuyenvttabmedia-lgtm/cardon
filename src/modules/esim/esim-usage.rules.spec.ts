import {
  maskEsimIccid,
  normalizeEsimUsageStatus,
  parseAiraloUsageBody,
  readEsimTopupTrace,
} from './esim-usage.rules';

describe('esim-usage.rules', () => {
  it('masks ICCID for customer display', () => {
    expect(maskEsimIccid('89852351026043094042')).toBe('8985••••4042');
    expect(maskEsimIccid('short')).toBeNull();
  });

  it('parses Airalo usage with remaining percent and expiry badge', () => {
    const snap = parseAiraloUsageBody(
      {
        data: {
          remaining: 473,
          total: 500,
          expired_at: '2099-11-20 11:37:00',
          is_unlimited: false,
          status: 'ACTIVE',
        },
      },
      new Date('2099-11-17T12:00:00Z'),
    );
    expect(snap?.remainingMb).toBe(473);
    expect(snap?.usedMb).toBe(27);
    expect(snap?.remainingPercent).toBe(95);
    expect(snap?.usedPercent).toBe(5);
    expect(snap?.expiringSoon).toBe(true);
    expect(snap?.statusLabelVi).toMatch(/Hết hạn trong/);
  });

  it('hides quota numbers for unlimited packages', () => {
    const snap = parseAiraloUsageBody({
      data: {
        remaining: 0,
        total: 0,
        expired_at: '2099-01-01 00:00:00',
        is_unlimited: true,
        status: 'ACTIVE',
      },
    });
    expect(snap?.isUnlimited).toBe(true);
    expect(snap?.remainingMb).toBeNull();
    expect(snap?.remainingPercent).toBeNull();
  });

  it('reads top-up clientTrace', () => {
    expect(normalizeEsimUsageStatus('active')).toBe('ACTIVE');
    expect(
      readEsimTopupTrace({
        esimLane: 'topup',
        parentOrderId: '11111111-1111-1111-1111-111111111111',
        iccid: '89852351026043094042',
        packageId: 'asialink-topup-1gb',
      }),
    ).toEqual({
      esimLane: 'topup',
      parentOrderId: '11111111-1111-1111-1111-111111111111',
      iccid: '89852351026043094042',
      packageId: 'asialink-topup-1gb',
    });
    expect(readEsimTopupTrace({ esimLane: 'sim' })).toBeNull();
  });
});
