/**
 * Share of hours in an averaging window that must have data. CPCB asks for
 * 16 of 24 hours; applying the same two-thirds rule to 8-hour windows gives 6.
 */
export const MIN_COVERAGE = 2 / 3;

/**
 * Mean of the `window` values ending at `endIndex` (inclusive), skipping gaps.
 * Returns `null` when too few hours have data to give a fair average.
 */
export function trailingMean(
  series: readonly (number | null)[],
  endIndex: number,
  window: number,
): number | null {
  if (!Number.isInteger(window) || window < 1) {
    throw new RangeError(`window must be a positive integer, got ${window}`);
  }
  if (endIndex < 0 || endIndex >= series.length) return null;

  const start = Math.max(0, endIndex - window + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= endIndex; i += 1) {
    const value = series[i];
    if (typeof value === 'number' && Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }

  const required = Math.ceil(window * MIN_COVERAGE);
  return count >= required ? sum / count : null;
}
