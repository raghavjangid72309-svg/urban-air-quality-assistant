import { describe, expect, it } from 'vitest';
import { makeAirData, NOW_MS } from '../test-utils/fixtures';
import { buildAirView, FORECAST_HOURS, findNowIndex } from './airView';

describe('findNowIndex', () => {
  const times = ['2026-11-26T00:00', '2026-11-26T01:00', '2026-11-26T03:00'];

  it('finds the current hour, or the closest earlier one', () => {
    expect(findNowIndex(times, '2026-11-26T01:00')).toBe(1);
    expect(findNowIndex(times, '2026-11-26T02:00')).toBe(1);
    expect(findNowIndex(times, '2026-11-27T00:00')).toBe(2);
    expect(findNowIndex(times, '2026-11-25T00:00')).toBe(0);
  });
});

describe('buildAirView', () => {
  it('computes the current AQI at the local hour and a 48-hour forecast', () => {
    const view = buildAirView(makeAirData({ pm2_5: 100 }), 'us', NOW_MS);
    expect(view.now).toBe('2026-11-26T20:00');
    expect(view.today).toBe('2026-11-26');
    expect(view.standard.id).toBe('us');
    expect(view.current).toMatchObject({ value: 182, dominant: 'pm2_5' });
    expect(view.forecast).toHaveLength(FORECAST_HOURS);
    expect(view.forecast[0]).toEqual({ time: '2026-11-26T20:00', value: 182, level: 4 });
  });

  it('switches scale without refetching', () => {
    const view = buildAirView(makeAirData({ pm2_5: 100 }), 'in', NOW_MS);
    expect(view.current?.category.label).toBe('Poor');
  });
});
