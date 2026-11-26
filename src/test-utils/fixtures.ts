import type { AirQualityData, OpenMeteoClient, Place } from '../api/openMeteo';
import type { HourlyAqi } from '../domain/aqi/calculate';
import { categoryFor } from '../domain/aqi/calculate';
import { AQI_STANDARDS } from '../domain/aqi/standards';
import type { PollutantId } from '../domain/pollutants';
import { addHours } from '../domain/time';

/** 15:10 UTC on Thursday 26 November 2026, i.e. 20:40 in Delhi (UTC+5:30). */
export const NOW_MS = Date.UTC(2026, 10, 26, 15, 10);
export const IST_OFFSET = 19_800;
export const FIRST_HOUR = '2026-11-25T00:00';
export const HOURS = 96;

export const DELHI: Place = {
  id: 1273294,
  name: 'Delhi',
  latitude: 28.65195,
  longitude: 77.23149,
  admin1: 'National Capital Territory of Delhi',
  country: 'India',
  countryCode: 'IN',
};

export function hourlyTimes(start = FIRST_HOUR, count = HOURS): string[] {
  return Array.from({ length: count }, (_, i) => addHours(start, i));
}

type SeriesSpec = number | null | ((time: string, index: number) => number | null);

/** Synthetic air quality data; every pollutant defaults to a clean constant. */
export function makeAirData(spec: Partial<Record<PollutantId, SeriesSpec>> = {}): AirQualityData {
  const times = hourlyTimes();
  const defaults: Partial<Record<PollutantId, SeriesSpec>> = { pm2_5: 5, pm10: 20, o3: 50, no2: 20, so2: 10, co: 400 };
  const merged = { ...defaults, ...spec };
  const series: AirQualityData['series'] = {};
  for (const [id, value] of Object.entries(merged) as [PollutantId, SeriesSpec | undefined][]) {
    if (value === undefined) continue;
    series[id] = times.map((time, i) => (typeof value === 'function' ? value(time, i) : value));
  }
  return { latitude: 28.65, longitude: 77.23, timezone: 'Asia/Kolkata', utcOffsetSeconds: IST_OFFSET, times, series };
}

/** Builds HourlyAqi entries on the US scale from plain values. */
export function hoursFrom(start: string, values: readonly (number | null)[]): HourlyAqi[] {
  return values.map((value, i) => ({
    time: addHours(start, i),
    value,
    level: value === null ? null : categoryFor(AQI_STANDARDS.us, value).level,
  }));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

export function fakeClient(overrides: Partial<OpenMeteoClient> = {}): OpenMeteoClient {
  return {
    searchPlaces: () => Promise.resolve([DELHI]),
    getAirQuality: () => Promise.resolve(makeAirData()),
    ...overrides,
  };
}

/** Lets pending promise callbacks run. */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
