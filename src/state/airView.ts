import type { AirQualityData } from '../api/openMeteo';
import { computeAqi, computeHourlyAqi, type AqiResult, type HourlyAqi } from '../domain/aqi/calculate';
import { AQI_STANDARDS, type AqiStandard, type AqiStandardId } from '../domain/aqi/standards';
import { currentLocalHour, localDate } from '../domain/time';

export const FORECAST_HOURS = 48;

/** Everything the UI and assistant need about the air at one place, at one moment. */
export interface AirView {
  readonly standard: AqiStandard;
  /** Current local hour at the place, `YYYY-MM-DDTHH:00`. */
  readonly now: string;
  /** Local date at the place, `YYYY-MM-DD`. */
  readonly today: string;
  readonly current: AqiResult | null;
  /** Hourly AQI starting at the current hour. */
  readonly forecast: readonly HourlyAqi[];
}

/** Index of the current hour, or the closest earlier hour if it is missing. */
export function findNowIndex(times: readonly string[], now: string): number {
  const exact = times.indexOf(now);
  if (exact >= 0) return exact;
  let index = 0;
  times.forEach((time, i) => {
    if (time <= now) index = i;
  });
  return index;
}

export function buildAirView(data: AirQualityData, standardId: AqiStandardId, nowMs: number): AirView {
  const standard = AQI_STANDARDS[standardId];
  const nowIso = currentLocalHour(nowMs, data.utcOffsetSeconds);
  const index = findNowIndex(data.times, nowIso);
  const now = data.times[index] ?? nowIso;

  const hourly = computeHourlyAqi(data.series, data.times, standard);

  return {
    standard,
    now,
    today: localDate(now),
    current: computeAqi(data.series, index, standard),
    forecast: hourly.slice(index, index + FORECAST_HOURS),
  };
}
