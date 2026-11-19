import { utcMinute } from './utc-minute';

describe('utcMinute', () => {
  it('writes an instant to the minute, in UTC, and nothing for a missing or bad one', () => {
    expect(utcMinute('2026-01-01T00:00:59.999Z')).toBe('2026-01-01 00:00 UTC');
    expect(utcMinute('2026-03-04T05:06:07+02:00')).toBe('2026-03-04 03:06 UTC');
    expect(utcMinute(undefined)).toBe('');
    expect(utcMinute(null)).toBe('');
    expect(utcMinute('not a date')).toBe('');
  });
});
