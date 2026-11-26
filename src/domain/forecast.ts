import type { HourlyAqi } from './aqi/calculate';
import type { AqiLevel } from './aqi/standards';
import { addHours, localDate, localHour } from './time';

export interface TimeWindow {
  /** First hour of the window. */
  readonly start: string;
  /** Hour the window ends (exclusive). */
  readonly end: string;
  readonly peak: number;
  readonly average: number;
  readonly level: AqiLevel;
}

export interface WindowOptions {
  /** Length of the window in hours. Default 2. */
  readonly durationHours?: number;
  /** Earliest hour of day the window may start. Default 6. */
  readonly earliestHour?: number;
  /** Hour of day by which the window must end. Default 22. */
  readonly latestHour?: number;
}

export interface RangeSummary {
  readonly best: HourlyAqi & { readonly value: number };
  readonly worst: HourlyAqi & { readonly value: number };
  readonly average: number;
}

export interface DaySummary extends RangeSummary {
  readonly date: string;
}

export type Trend = 'improving' | 'worsening' | 'stable';

type KnownHour = HourlyAqi & { readonly value: number; readonly level: AqiLevel };

const isKnown = (hour: HourlyAqi): hour is KnownHour => hour.value !== null && hour.level !== null;

/**
 * Finds the consecutive block of daytime hours with the lowest average AQI,
 * e.g. the best time to exercise. Earlier windows win ties.
 */
export function findBestWindow(hours: readonly HourlyAqi[], options: WindowOptions = {}): TimeWindow | null {
  const { durationHours = 2, earliestHour = 6, latestHour = 22 } = options;
  let best: TimeWindow | null = null;

  for (let start = 0; start + durationHours <= hours.length; start += 1) {
    const block = hours.slice(start, start + durationHours);
    if (!block.every(isKnown)) continue;

    const first = block[0];
    const last = block.at(-1);
    if (!first || !last) continue;

    const startHour = localHour(first.time);
    const endHour = startHour + durationHours;
    if (startHour < earliestHour || endHour > latestHour) continue;

    const values = block.map((h) => h.value);
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (best && average >= best.average) continue;

    const peakHour = block.reduce((max, h) => (h.value > max.value ? h : max), first);
    best = {
      start: first.time,
      end: addHours(last.time, 1),
      peak: peakHour.value,
      average,
      level: peakHour.level,
    };
  }

  return best;
}

/** Best, worst and mean AQI across the hours that have data. */
export function summariseRange(hours: readonly HourlyAqi[]): RangeSummary | null {
  const known = hours.filter(isKnown);
  const [first] = known;
  if (!first) return null;

  let best = first;
  let worst = first;
  let sum = 0;
  for (const hour of known) {
    if (hour.value < best.value) best = hour;
    if (hour.value > worst.value) worst = hour;
    sum += hour.value;
  }
  return { best, worst, average: sum / known.length };
}

/** Per-day summaries in date order. */
export function summariseDays(hours: readonly HourlyAqi[]): DaySummary[] {
  const byDate = new Map<string, HourlyAqi[]>();
  for (const hour of hours) {
    const date = localDate(hour.time);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(hour);
    else byDate.set(date, [hour]);
  }

  const days: DaySummary[] = [];
  for (const [date, bucket] of byDate) {
    const summary = summariseRange(bucket);
    if (summary) days.push({ date, ...summary });
  }
  return days;
}

/**
 * Compares the mean of the next `span` hours with the current hour. Changes
 * smaller than 10% (or 5 index points) count as stable.
 */
export function forecastTrend(hours: readonly HourlyAqi[], span = 6): Trend | null {
  const [now, ...rest] = hours;
  const current = now?.value ?? null;
  if (current === null) return null;

  const ahead = rest.slice(0, span).flatMap((h) => (h.value === null ? [] : [h.value]));
  if (ahead.length === 0) return null;

  const mean = ahead.reduce((sum, v) => sum + v, 0) / ahead.length;
  const delta = mean - current;
  const threshold = Math.max(5, current * 0.1);
  if (delta > threshold) return 'worsening';
  if (delta < -threshold) return 'improving';
  return 'stable';
}
