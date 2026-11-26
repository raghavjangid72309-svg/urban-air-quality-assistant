import { describe, expect, it } from 'vitest';
import {
  addDays,
  addHours,
  currentLocalHour,
  formatClock,
  formatDay,
  formatWhen,
  isLocalIso,
  localDate,
  localHour,
} from './time';

describe('local time helpers', () => {
  it('validates local ISO strings', () => {
    expect(isLocalIso('2026-11-26T20:00')).toBe(true);
    expect(isLocalIso('2026-11-26T20:00Z')).toBe(false);
    expect(isLocalIso(42)).toBe(false);
  });

  it('reads parts of a local time', () => {
    expect(localHour('2026-11-26T20:00')).toBe(20);
    expect(localDate('2026-11-26T20:00')).toBe('2026-11-26');
    expect(formatClock('2026-11-26T07:00')).toBe('07:00');
  });

  it('adds hours and days across month and year ends', () => {
    expect(addHours('2026-11-30T23:00', 1)).toBe('2026-12-01T00:00');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('works out the current hour at a location from its UTC offset', () => {
    expect(currentLocalHour(Date.UTC(2026, 10, 26, 15, 10), 19_800)).toBe('2026-11-26T20:00');
    expect(currentLocalHour(Date.UTC(2026, 10, 26, 2, 0), -18_000)).toBe('2026-11-25T21:00');
  });

  it('names days relative to today', () => {
    const today = '2026-11-26';
    expect(formatDay('2026-11-26', today)).toBe('today');
    expect(formatDay('2026-11-27', today)).toBe('tomorrow');
    expect(formatDay('2026-11-25', today)).toBe('yesterday');
    expect(formatDay('2026-11-28', today)).toBe('Saturday');
    expect(formatWhen('2026-11-27T06:00', today)).toBe('06:00 tomorrow');
  });

  it('throws on malformed times', () => {
    expect(() => localHour('yesterday')).toThrow(RangeError);
  });
});
