import { describe, expect, it } from 'vitest';
import { microgramsToMilligrams, microgramsToPpb, microgramsToPpm, truncate } from './units';

describe('unit conversion', () => {
  it('converts µg/m³ to ppb and ppm at 25 °C', () => {
    // 1 ppb of ozone (48 g/mol) is about 1.963 µg/m³.
    expect(microgramsToPpb(1.963, 48)).toBeCloseTo(1, 2);
    expect(microgramsToPpm(1963, 48)).toBeCloseTo(1, 2);
  });

  it('converts µg/m³ to mg/m³', () => {
    expect(microgramsToMilligrams(1500)).toBe(1.5);
  });
});

describe('truncate', () => {
  it.each([
    [12.08, 1, 12.0],
    [35.49, 1, 35.4],
    [0.0709, 3, 0.07],
    [54.9, 0, 54],
    // 0.07 * 1000 is 70.00000000000001 in floating point; it must not become 0.071.
    [0.07, 3, 0.07],
  ])('truncate(%d, %d) = %d', (value, decimals, expected) => {
    expect(truncate(value, decimals)).toBe(expected);
  });
});
