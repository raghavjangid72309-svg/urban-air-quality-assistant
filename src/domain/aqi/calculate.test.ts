import { describe, expect, it } from 'vitest';
import { hourlyTimes } from '../../test-utils/fixtures';
import { categoryFor, computeAqi, computeHourlyAqi, subIndex } from './calculate';
import { AQI_STANDARDS, isAqiStandardId, type PollutantRule } from './standards';

const US = AQI_STANDARDS.us;
const IN = AQI_STANDARDS.in;

function rule(standard: typeof US, pollutant: keyof typeof US.rules): PollutantRule {
  const found = standard.rules[pollutant];
  if (!found) throw new Error(`No rule for ${pollutant}`);
  return found;
}

/** Sub-index for a raw µg/m³ concentration under a standard's rule. */
const index = (standard: typeof US, pollutant: keyof typeof US.rules, microgramsPerM3: number) => {
  const r = rule(standard, pollutant);
  return subIndex(r.convert(microgramsPerM3), r.breakpoints);
};

const constant = (value: number, hours = 24) => Array.from({ length: hours }, () => value);

describe('subIndex', () => {
  const pm25 = rule(US, 'pm2_5').breakpoints;

  it.each([
    [0, 0],
    [9.0, 50],
    [9.1, 51],
    [12.0, 56],
    [35.4, 100],
    [35.5, 101],
    [55.4, 150],
    [125.5, 201],
    [325.4, 500],
  ])('US PM2.5 %d µg/m³ gives %d', (concentration, expected) => {
    expect(subIndex(concentration, pm25)).toBe(expected);
  });

  it('caps values above the table at its top index', () => {
    expect(subIndex(900, pm25)).toBe(500);
  });

  it('snaps values in a gap between segments to the next segment', () => {
    expect(subIndex(9.05, pm25)).toBe(51);
  });

  it('rejects negative and non-finite values', () => {
    expect(subIndex(-1, pm25)).toBeNull();
    expect(subIndex(Number.NaN, pm25)).toBeNull();
  });

  it('returns null for an empty table', () => {
    expect(subIndex(10, [])).toBeNull();
  });
});

describe('US EPA conversions', () => {
  it('truncates PM2.5 before the lookup', () => {
    expect(index(US, 'pm2_5', 9.09)).toBe(50);
  });

  it('converts ozone to ppm (8-hour)', () => {
    // 100 µg/m³ ≈ 0.0509 ppm, truncated to 0.050 → 46.
    expect(index(US, 'o3', 100)).toBe(46);
  });

  it('caps 8-hour ozone at 300', () => {
    expect(index(US, 'o3', 2000)).toBe(300);
  });

  it('converts carbon monoxide to ppm', () => {
    // 1145 µg/m³ ≈ 0.999 ppm, truncated to 0.9 → 10.
    expect(index(US, 'co', 1145)).toBe(10);
  });

  it('converts nitrogen dioxide to ppb', () => {
    expect(index(US, 'no2', 100)).toBe(50); // 53.1 ppb
    expect(index(US, 'no2', 102)).toBe(51); // 54.2 ppb
  });

  it('converts sulphur dioxide to ppb', () => {
    expect(index(US, 'so2', 91)).toBe(49); // 34.7 ppb → 34
  });
});

describe('India NAQI breakpoints', () => {
  it.each([
    [30, 50],
    [45, 75],
    [61, 103],
    [250, 400],
    [300, 438],
    [500, 500],
  ])('PM2.5 %d µg/m³ gives %d', (concentration, expected) => {
    expect(index(IN, 'pm2_5', concentration)).toBe(expected);
  });

  it('uses mg/m³ for carbon monoxide', () => {
    expect(index(IN, 'co', 1500)).toBe(75);
  });

  it('covers ammonia', () => {
    expect(index(IN, 'nh3', 300)).toBe(75);
  });
});

describe('categoryFor', () => {
  it.each([
    [50, 'Good'],
    [51, 'Moderate'],
    [101, 'Unhealthy for sensitive groups'],
    [151, 'Unhealthy'],
    [201, 'Very unhealthy'],
    [301, 'Hazardous'],
    [999, 'Hazardous'],
  ])('US %d is %s', (aqi, label) => {
    expect(categoryFor(US, aqi).label).toBe(label);
  });

  it.each([
    [100, 'Satisfactory', 2],
    [101, 'Moderate', 3],
    [200, 'Moderate', 3],
    [201, 'Poor', 4],
    [400, 'Very poor', 5],
    [401, 'Severe', 6],
  ])('India %d is %s (level %d)', (aqi, label, level) => {
    expect(categoryFor(IN, aqi)).toMatchObject({ label, level });
  });

  it('throws for a standard without categories', () => {
    expect(() => categoryFor({ ...US, categories: [] }, 10)).toThrow();
  });
});

describe('computeAqi', () => {
  it('takes the highest sub-index and names the dominant pollutant', () => {
    const result = computeAqi({ pm2_5: constant(20), pm10: constant(40) }, 23, US);
    expect(result).toMatchObject({ standard: 'us', value: 71, dominant: 'pm2_5' });
    expect(result?.category.label).toBe('Moderate');
    expect(result?.subIndices.map((s) => s.pollutant)).toEqual(['pm2_5', 'pm10']);
    expect(result?.subIndices[0]).toMatchObject({ concentration: 20, averagingHours: 24 });
  });

  it('accepts a single pollutant on the US scale', () => {
    expect(computeAqi({ o3: constant(100, 8) }, 7, US)?.value).toBe(46);
  });

  it('needs three pollutants including a particulate on the India scale', () => {
    expect(computeAqi({ pm2_5: constant(20), pm10: constant(40) }, 23, IN)).toBeNull();
    expect(computeAqi({ o3: constant(20), no2: constant(20), so2: constant(20) }, 23, IN)).toBeNull();
    expect(computeAqi({ pm2_5: constant(45), pm10: constant(40), no2: constant(20) }, 23, IN)).toMatchObject({
      value: 75,
      dominant: 'pm2_5',
    });
  });

  it('ignores pollutants the standard does not cover', () => {
    const result = computeAqi({ pm2_5: constant(5), nh3: constant(5000) }, 23, US);
    expect(result?.subIndices.map((s) => s.pollutant)).toEqual(['pm2_5']);
  });

  it('returns null without enough data', () => {
    expect(computeAqi({ pm2_5: constant(20, 6) }, 5, US)).toBeNull();
    expect(computeAqi({}, 0, US)).toBeNull();
  });

  it('skips negative averages instead of failing', () => {
    expect(computeAqi({ pm2_5: constant(-5), pm10: constant(40) }, 23, US)?.dominant).toBe('pm10');
  });
});

describe('computeHourlyAqi', () => {
  it('returns one entry per hour and null until enough history exists', () => {
    const times = hourlyTimes('2026-11-25T00:00', 30);
    const hourly = computeHourlyAqi({ pm2_5: constant(20, 30) }, times, US);
    expect(hourly).toHaveLength(30);
    expect(hourly[14]).toEqual({ time: times[14], value: null, level: null });
    expect(hourly[15]).toEqual({ time: times[15], value: 71, level: 2 });
  });
});

describe('isAqiStandardId', () => {
  it('accepts only known standards', () => {
    expect(isAqiStandardId('us')).toBe(true);
    expect(isAqiStandardId('in')).toBe(true);
    expect(isAqiStandardId('eu')).toBe(false);
    expect(isAqiStandardId(undefined)).toBe(false);
  });
});
