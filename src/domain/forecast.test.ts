import { describe, expect, it } from 'vitest';
import { hoursFrom } from '../test-utils/fixtures';
import { findBestWindow, forecastTrend, summariseDays, summariseRange } from './forecast';

/** 24 hours from midnight; lowest values at 02:00 (night) and 13:00–14:00. */
const DAY = [
  60, 55, 20, 20, 50, 60, 80, 90, 100, 110, 120, 90, 70, 30, 32, 60, 80, 120, 150, 160, 150, 120, 90, 70,
];

describe('findBestWindow', () => {
  const hours = hoursFrom('2026-11-26T00:00', DAY);

  it('finds the cleanest daytime window', () => {
    expect(findBestWindow(hours)).toEqual({
      start: '2026-11-26T13:00',
      end: '2026-11-26T15:00',
      peak: 32,
      average: 31,
      level: 1,
    });
  });

  it('respects the allowed hours', () => {
    expect(findBestWindow(hours, { earliestHour: 0, latestHour: 24 })?.start).toBe('2026-11-26T02:00');
    expect(findBestWindow(hours, { earliestHour: 18, latestHour: 24 })?.start).toBe('2026-11-26T22:00');
  });

  it('supports other durations', () => {
    expect(findBestWindow(hours, { durationHours: 1 })?.start).toBe('2026-11-26T13:00');
  });

  it('prefers the earlier of equal windows', () => {
    const flat = hoursFrom('2026-11-26T00:00', Array.from({ length: 24 }, () => 40));
    expect(findBestWindow(flat)?.start).toBe('2026-11-26T06:00');
  });

  it('skips windows with missing data', () => {
    const gappy = hoursFrom('2026-11-26T12:00', [10, null, 50, 50]);
    expect(findBestWindow(gappy)?.start).toBe('2026-11-26T14:00');
  });

  it('returns null when no window fits', () => {
    expect(findBestWindow(hoursFrom('2026-11-26T23:00', [10, 10, 10]))).toBeNull();
    expect(findBestWindow([])).toBeNull();
  });
});

describe('summaries', () => {
  it('summarises a range, ignoring gaps', () => {
    const summary = summariseRange(hoursFrom('2026-11-26T00:00', [40, null, 10, 70]));
    expect(summary?.best).toMatchObject({ time: '2026-11-26T02:00', value: 10 });
    expect(summary?.worst).toMatchObject({ time: '2026-11-26T03:00', value: 70 });
    expect(summary?.average).toBe(40);
    expect(summariseRange(hoursFrom('2026-11-26T00:00', [null]))).toBeNull();
  });

  it('summarises each day separately', () => {
    const days = summariseDays(hoursFrom('2026-11-26T22:00', [10, 20, 90, 30, null]));
    expect(days.map((d) => [d.date, d.best.value, d.worst.value])).toEqual([
      ['2026-11-26', 10, 20],
      ['2026-11-27', 30, 90],
    ]);
  });
});

describe('forecastTrend', () => {
  const trend = (values: (number | null)[]) => forecastTrend(hoursFrom('2026-11-26T00:00', values));

  it('detects worsening, improving and stable air', () => {
    expect(trend([100, 120, 130, 140])).toBe('worsening');
    expect(trend([100, 80, 70, 60])).toBe('improving');
    expect(trend([100, 104, 96, 101])).toBe('stable');
  });

  it('uses a minimum threshold for clean air', () => {
    expect(trend([10, 14, 14])).toBe('stable');
  });

  it('needs a current value and something ahead', () => {
    expect(trend([null, 50, 60])).toBeNull();
    expect(trend([50, null])).toBeNull();
    expect(trend([])).toBeNull();
  });
});
