import type { PollutantId, PollutantSeries } from '../domain/pollutants';
import { isLocalIso } from '../domain/time';
import { TtlCache } from './cache';
import { ApiError, getJson, type FetchLike } from './http';

export const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

export interface Place {
  readonly id: number;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly admin1?: string;
  readonly country?: string;
  readonly countryCode?: string;
}

export interface AirQualityData {
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly utcOffsetSeconds: number;
  /** Local times (`YYYY-MM-DDTHH:mm`), one per hour, from yesterday to 3 days ahead. */
  readonly times: readonly string[];
  readonly series: PollutantSeries;
}

/** Open-Meteo variable name for each pollutant. */
const HOURLY_VARIABLES: Readonly<Record<PollutantId, string>> = {
  pm2_5: 'pm2_5',
  pm10: 'pm10',
  o3: 'ozone',
  no2: 'nitrogen_dioxide',
  so2: 'sulphur_dioxide',
  co: 'carbon_monoxide',
  nh3: 'ammonia',
};

const MAX_QUERY_LENGTH = 80;
const MAX_TEXT_LENGTH = 100;
const MAX_HOURS = 24 * 16;
const MAX_RESULTS = 8;
/** ~1 km precision: enough for a city-scale model, and avoids sending a precise home location. */
const COORDINATE_DECIMALS = 2;

/**
 * Cleans free text from the search box: removes symbols that cannot appear in
 * place names, collapses whitespace and limits length. Returns `null` if
 * nothing searchable is left.
 */
export function sanitizeQuery(raw: string): string | null {
  const cleaned = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s'.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function buildGeocodingUrl(query: string): URL {
  const url = new URL(GEOCODING_ENDPOINT);
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(MAX_RESULTS));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  return url;
}

export function buildAirQualityUrl(latitude: number, longitude: number): URL {
  if (!isValidCoordinate(latitude, longitude)) {
    throw new RangeError(`Invalid coordinates: ${latitude}, ${longitude}`);
  }
  const url = new URL(AIR_QUALITY_ENDPOINT);
  url.searchParams.set('latitude', roundCoordinate(latitude).toFixed(COORDINATE_DECIMALS));
  url.searchParams.set('longitude', roundCoordinate(longitude).toFixed(COORDINATE_DECIMALS));
  url.searchParams.set('hourly', Object.values(HOURLY_VARIABLES).join(','));
  // One past day gives complete 24-hour averages for the current hour.
  url.searchParams.set('past_days', '1');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'auto');
  return url;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, MAX_TEXT_LENGTH);
  return text.length > 0 ? text : undefined;
};

/** Validates one place, from the geocoding API or from saved preferences. */
export function parsePlace(value: unknown): Place | null {
  if (!isRecord(value)) return null;
  const { id, latitude, longitude } = value;
  const name = optionalText(value.name);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || name === undefined) return null;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !isValidCoordinate(latitude, longitude)) {
    return null;
  }

  const admin1 = optionalText(value.admin1);
  const country = optionalText(value.country);
  const rawCode = optionalText(value.countryCode ?? value.country_code);
  const countryCode = rawCode && /^[A-Za-z]{2}$/.test(rawCode) ? rawCode.toUpperCase() : undefined;

  return {
    id,
    name,
    latitude,
    longitude,
    ...(admin1 && { admin1 }),
    ...(country && { country }),
    ...(countryCode && { countryCode }),
  };
}

export function parsePlaces(payload: unknown): Place[] {
  if (!isRecord(payload)) throw new ApiError('invalid', 'Unexpected geocoding response');
  // Open-Meteo omits `results` entirely when nothing matches.
  if (payload.results === undefined) return [];
  if (!Array.isArray(payload.results)) throw new ApiError('invalid', 'Unexpected geocoding response');

  const seen = new Set<number>();
  const places: Place[] = [];
  for (const item of payload.results.slice(0, MAX_RESULTS)) {
    const place = parsePlace(item);
    if (place && !seen.has(place.id)) {
      seen.add(place.id);
      places.push(place);
    }
  }
  return places;
}

function parseNumberSeries(value: unknown, length: number): (number | null)[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const series: (number | null)[] = [];
  for (const item of value as unknown[]) {
    if (item === null) series.push(null);
    else if (typeof item === 'number' && Number.isFinite(item) && item >= 0) series.push(item);
    else return null;
  }
  return series;
}

export function parseAirQuality(payload: unknown): AirQualityData {
  const invalid = (detail: string) => new ApiError('invalid', `Unexpected air quality response: ${detail}`);
  if (!isRecord(payload)) throw invalid('not an object');

  const { latitude, longitude, timezone, utc_offset_seconds: utcOffsetSeconds, hourly } = payload;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !isValidCoordinate(latitude, longitude)) {
    throw invalid('coordinates');
  }
  if (typeof utcOffsetSeconds !== 'number' || !Number.isInteger(utcOffsetSeconds) || Math.abs(utcOffsetSeconds) > 14 * 3600) {
    throw invalid('UTC offset');
  }
  if (!isRecord(hourly) || !Array.isArray(hourly.time)) throw invalid('hourly data');

  const times = hourly.time as unknown[];
  if (times.length === 0 || times.length > MAX_HOURS || !times.every(isLocalIso)) throw invalid('times');

  const series: PollutantSeries = {};
  for (const [pollutant, variable] of Object.entries(HOURLY_VARIABLES) as [PollutantId, string][]) {
    const values = parseNumberSeries(hourly[variable], times.length);
    if (values?.some((v) => v !== null)) series[pollutant] = values;
  }
  if (Object.keys(series).length === 0) throw invalid('no pollutant data');

  return {
    latitude,
    longitude,
    timezone: optionalText(timezone) ?? 'UTC',
    utcOffsetSeconds,
    times,
    series,
  };
}

export interface OpenMeteoClient {
  searchPlaces(query: string): Promise<Place[]>;
  getAirQuality(latitude: number, longitude: number): Promise<AirQualityData>;
}

export interface ClientOptions {
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
}

/**
 * Open-Meteo client with response validation and caching. Geocoding results
 * rarely change, so they are kept for a day; the air quality model updates
 * hourly, so forecasts are kept for 15 minutes.
 */
export function createOpenMeteoClient(options: ClientOptions = {}): OpenMeteoClient {
  const { fetchImpl, now } = options;
  const requestOptions = fetchImpl ? { fetchImpl } : {};
  const places = new TtlCache<Place[]>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 50, ...(now && { now }) });
  const air = new TtlCache<AirQualityData>({ ttlMs: 15 * 60 * 1000, maxEntries: 20, ...(now && { now }) });

  return {
    searchPlaces(query) {
      const clean = sanitizeQuery(query);
      if (!clean) return Promise.resolve([]);
      const key = clean.toLocaleLowerCase('en');
      return places.getOrLoad(key, async () => parsePlaces(await getJson(buildGeocodingUrl(clean), requestOptions)));
    },
    getAirQuality(latitude, longitude) {
      const url = buildAirQualityUrl(latitude, longitude);
      const key = `${url.searchParams.get('latitude') ?? ''},${url.searchParams.get('longitude') ?? ''}`;
      return air.getOrLoad(key, async () => parseAirQuality(await getJson(url, requestOptions)));
    },
  };
}

/** "Pune, Maharashtra, India" without repeated parts. */
export function placeLabel(place: Place): string {
  const parts = [place.name, place.admin1, place.country].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(', ');
}
