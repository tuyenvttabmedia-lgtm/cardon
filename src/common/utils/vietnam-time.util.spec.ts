import {
  shiftVietnamDate,
  vietnamCalendarDate,
  vietnamDayBounds,
  vietnamDayEndInclusive,
} from './vietnam-time.util';

describe('vietnam time', () => {
  it('reads the Vietnam calendar date just after local midnight', () => {
    const instant = new Date('2026-10-07T17:30:00Z');
    expect(vietnamCalendarDate(instant)).toBe('2026-10-08');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-10-07');
  });

  it('keeps a Vietnam day inside the bounds and the next morning out', () => {
    const range = vietnamDayBounds('2026-10-07');
    expect(new Date('2026-10-07T00:10:00+07:00') >= range.start).toBe(true);
    expect(new Date('2026-10-07T23:50:00+07:00') < range.endExclusive).toBe(true);
    expect(new Date('2026-10-08T00:46:00+07:00') < range.endExclusive).toBe(false);
    expect(new Date('2026-10-06T23:50:00+07:00') >= range.start).toBe(false);
    expect(vietnamDayEndInclusive('2026-10-07') < range.endExclusive).toBe(true);
  });

  it('shifts calendar days without using the process timezone', () => {
    expect(shiftVietnamDate('2026-10-08', -1)).toBe('2026-10-07');
    expect(shiftVietnamDate('2026-10-01', -1)).toBe('2026-09-30');
  });
});
