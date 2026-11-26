import { trailingMean } from '../averaging';
import { POLLUTANT_IDS, type PollutantId, type PollutantSeries } from '../pollutants';
import type { AqiCategory, AqiLevel, AqiStandard, AqiStandardId, Breakpoint } from './standards';

export interface SubIndex {
  readonly pollutant: PollutantId;
  /** Averaged concentration in µg/m³. */
  readonly concentration: number;
  readonly averagingHours: number;
  readonly index: number;
}

export interface AqiResult {
  readonly standard: AqiStandardId;
  readonly value: number;
  readonly category: AqiCategory;
  /** Pollutant with the highest sub-index. */
  readonly dominant: PollutantId;
  /** Sorted from highest to lowest sub-index. */
  readonly subIndices: readonly SubIndex[];
}

export interface HourlyAqi {
  /** Local time at the location, `YYYY-MM-DDTHH:mm`. */
  readonly time: string;
  readonly value: number | null;
  readonly level: AqiLevel | null;
}

/**
 * Linear interpolation inside the breakpoint segment that holds `value`:
 * I = (Ihi − Ilo) / (Chi − Clo) × (C − Clo) + Ilo, rounded to an integer.
 * Values above the table are capped at its top index.
 */
export function subIndex(value: number, breakpoints: readonly Breakpoint[]): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (value <= cHigh) {
      // Values that fall in a gap between truncated segments snap to the next segment.
      const c = Math.max(value, cLow);
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
    }
  }
  const top = breakpoints.at(-1);
  return top ? top[3] : null;
}

export function categoryFor(standard: AqiStandard, aqi: number): AqiCategory {
  const match = standard.categories.find((category) => aqi <= category.max);
  const fallback = standard.categories.at(-1);
  if (!fallback) throw new Error(`Standard ${standard.id} has no categories`);
  return match ?? fallback;
}

/** Computes the AQI for one hour of the series, or `null` if data is insufficient. */
export function computeAqi(series: PollutantSeries, index: number, standard: AqiStandard): AqiResult | null {
  const subIndices: SubIndex[] = [];

  for (const pollutant of POLLUTANT_IDS) {
    const rule = standard.rules[pollutant];
    const values = series[pollutant];
    if (!rule || !values) continue;

    const concentration = trailingMean(values, index, rule.averagingHours);
    if (concentration === null) continue;

    const value = subIndex(rule.convert(concentration), rule.breakpoints);
    if (value === null) continue;

    subIndices.push({ pollutant, concentration, averagingHours: rule.averagingHours, index: value });
  }

  if (subIndices.length < standard.minPollutants) return null;
  if (standard.requiresParticulate && !subIndices.some((s) => s.pollutant === 'pm2_5' || s.pollutant === 'pm10')) {
    return null;
  }

  subIndices.sort((a, b) => b.index - a.index);
  const [top] = subIndices;
  if (!top) return null;

  return {
    standard: standard.id,
    value: top.index,
    category: categoryFor(standard, top.index),
    dominant: top.pollutant,
    subIndices,
  };
}

/** Computes the AQI for every hour in `times`. */
export function computeHourlyAqi(
  series: PollutantSeries,
  times: readonly string[],
  standard: AqiStandard,
): HourlyAqi[] {
  return times.map((time, index) => {
    const result = computeAqi(series, index, standard);
    return { time, value: result?.value ?? null, level: result?.category.level ?? null };
  });
}
