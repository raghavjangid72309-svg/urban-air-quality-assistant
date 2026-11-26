import { describe, expect, it } from 'vitest';
import { trailingMean } from './averaging';

describe('trailingMean', () => {
  it('averages the window ending at the index', () => {
    expect(trailingMean([1, 2, 3, 4], 3, 2)).toBe(3.5);
  });

  it('skips gaps but needs two thirds of the window', () => {
    expect(trailingMean([1, null, 3], 2, 3)).toBe(2);
    expect(trailingMean([null, null, 3], 2, 3)).toBeNull();
  });

  it('treats non-finite numbers as gaps', () => {
    expect(trailingMean([Number.NaN, 4, 4], 2, 3)).toBe(4);
  });

  it('uses what is available at the start of the series', () => {
    expect(trailingMean([5, 5], 1, 3)).toBe(5);
    expect(trailingMean([5], 0, 3)).toBeNull();
  });

  it('returns null outside the series', () => {
    expect(trailingMean([1, 2], 2, 1)).toBeNull();
    expect(trailingMean([1, 2], -1, 1)).toBeNull();
  });

  it('rejects invalid windows', () => {
    expect(() => trailingMean([1], 0, 0)).toThrow(RangeError);
    expect(() => trailingMean([1], 0, 1.5)).toThrow(RangeError);
  });
});
