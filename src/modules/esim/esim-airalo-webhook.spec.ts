import {
  readAiraloLowDataIccid,
  readAiraloRemainingData,
} from './esim-airalo-webhook.service';

describe('Airalo low-data webhook parsers', () => {
  it('reads ICCID from nested and flat payloads', () => {
    expect(readAiraloLowDataIccid({ iccid: '8901234567890123456' })).toBe('8901234567890123456');
    expect(
      readAiraloLowDataIccid({ data: { iccid: '8901234567890123456', remaining: 0.1 } }),
    ).toBe('8901234567890123456');
    expect(
      readAiraloLowDataIccid({ data: { sim: { iccid: '8901234567890123456' } } }),
    ).toBe('8901234567890123456');
    expect(readAiraloLowDataIccid({ iccid: 'short' })).toBeUndefined();
    expect(readAiraloLowDataIccid({ iccid: '89012345abcd0123456' })).toBeUndefined();
    expect(readAiraloLowDataIccid({})).toBeUndefined();
  });

  it('reads remaining data when present and rejects unsafe fragments', () => {
    expect(readAiraloRemainingData({ remaining: 0.25 })).toBe('0.25');
    expect(readAiraloRemainingData({ data: { remaining_data: '100 MB' } })).toBe('100 MB');
    expect(readAiraloRemainingData({ remaining: '<a href=evil>click</a>' })).toBeUndefined();
    expect(readAiraloRemainingData({ remaining: 'x'.repeat(25) })).toBeUndefined();
    expect(readAiraloRemainingData({})).toBeUndefined();
  });
});
