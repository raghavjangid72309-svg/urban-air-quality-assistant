import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test-utils/fixtures';
import { ApiError, type FetchLike } from './http';
import {
  AIR_QUALITY_ENDPOINT,
  buildAirQualityUrl,
  buildGeocodingUrl,
  createOpenMeteoClient,
  GEOCODING_ENDPOINT,
  isValidCoordinate,
  parseAirQuality,
  parsePlace,
  parsePlaces,
  placeLabel,
  roundCoordinate,
  sanitizeQuery,
} from './openMeteo';

const GEO_RESULT = {
  id: 1273294,
  name: 'Delhi',
  latitude: 28.65195,
  longitude: 77.23149,
  country_code: 'in',
  admin1: 'National Capital Territory of Delhi',
  country: 'India',
  population: 11_034_555,
};

function airPayload(overrides: Record<string, unknown> = {}, hourly: Record<string, unknown> = {}) {
  return {
    latitude: 28.7,
    longitude: 77.2,
    utc_offset_seconds: 19_800,
    timezone: 'Asia/Kolkata',
    hourly: {
      time: ['2026-11-26T00:00', '2026-11-26T01:00'],
      pm2_5: [100.5, null],
      pm10: [120, 130],
      ozone: [20, 22],
      nitrogen_dioxide: [50, 55],
      sulphur_dioxide: [30, 31],
      carbon_monoxide: [1100, 1200],
      ammonia: [null, null],
      ...hourly,
    },
    ...overrides,
  };
}

describe('sanitizeQuery', () => {
  it('collapses whitespace and keeps letters from any script', () => {
    expect(sanitizeQuery('  New   York ')).toBe('New York');
    expect(sanitizeQuery('São Paulo')).toBe('São Paulo');
    expect(sanitizeQuery("O'Fallon")).toBe("O'Fallon");
    expect(sanitizeQuery('नई दिल्ली')).toBe('नई दिल्ली');
  });

  it('removes markup characters', () => {
    const cleaned = sanitizeQuery('<script>alert(1)</script>');
    expect(cleaned).not.toMatch(/[<>()/]/);
  });

  it('rejects input that is too short and limits length', () => {
    expect(sanitizeQuery('a')).toBeNull();
    expect(sanitizeQuery('!!!')).toBeNull();
    expect(sanitizeQuery('x'.repeat(200))).toHaveLength(80);
  });
});

describe('coordinates', () => {
  it('validates ranges', () => {
    expect(isValidCoordinate(28.6, 77.2)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, -181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
  });

  it('rounds to about 1 km', () => {
    expect(roundCoordinate(28.65195)).toBe(28.65);
    expect(roundCoordinate(-0.005)).toBe(-0);
  });
});

describe('URL builders', () => {
  it('requests a day of history and three days of forecast at rounded coordinates', () => {
    const url = buildAirQualityUrl(28.65195, 77.23149);
    expect(url.origin + url.pathname).toBe(AIR_QUALITY_ENDPOINT);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '28.65',
      longitude: '77.23',
      hourly: 'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ammonia',
      past_days: '1',
      forecast_days: '3',
      timezone: 'auto',
    });
  });

  it('refuses invalid coordinates', () => {
    expect(() => buildAirQualityUrl(100, 0)).toThrow(RangeError);
  });

  it('encodes the place name', () => {
    const url = buildGeocodingUrl('São Paulo');
    expect(url.origin + url.pathname).toBe(GEOCODING_ENDPOINT);
    expect(url.searchParams.get('name')).toBe('São Paulo');
    expect(url.searchParams.get('count')).toBe('8');
  });
});

describe('parsePlaces', () => {
  it('maps valid results', () => {
    expect(parsePlaces({ results: [GEO_RESULT] })).toEqual([
      {
        id: 1273294,
        name: 'Delhi',
        latitude: 28.65195,
        longitude: 77.23149,
        admin1: 'National Capital Territory of Delhi',
        country: 'India',
        countryCode: 'IN',
      },
    ]);
  });

  it('treats a missing results list as no matches', () => {
    expect(parsePlaces({ generationtime_ms: 0.1 })).toEqual([]);
  });

  it('drops invalid and duplicate entries', () => {
    const places = parsePlaces({
      results: [GEO_RESULT, GEO_RESULT, { ...GEO_RESULT, id: 2, latitude: 200 }, { id: 3 }, 'nonsense'],
    });
    expect(places).toHaveLength(1);
  });

  it('rejects malformed payloads', () => {
    expect(() => parsePlaces(null)).toThrow(ApiError);
    expect(() => parsePlaces({ results: 'x' })).toThrow(ApiError);
  });
});

describe('parsePlace', () => {
  it('accepts saved places and cleans text fields', () => {
    const place = parsePlace({ id: 0, name: `  ${'N'.repeat(150)} `, latitude: 1, longitude: 2, countryCode: 'gb' });
    expect(place?.name).toHaveLength(100);
    expect(place?.countryCode).toBe('GB');
  });

  it('rejects incomplete or invalid places', () => {
    expect(parsePlace({ id: 1, name: '   ', latitude: 1, longitude: 2 })).toBeNull();
    expect(parsePlace({ id: 1.5, name: 'X', latitude: 1, longitude: 2 })).toBeNull();
    expect(parsePlace({ id: 1, name: 'X', latitude: '1', longitude: 2 })).toBeNull();
    expect(parsePlace({ id: 1, name: 'X', latitude: 1, longitude: 2, countryCode: 'India' })?.countryCode).toBeUndefined();
    expect(parsePlace([])).toBeNull();
  });
});

describe('parseAirQuality', () => {
  it('maps Open-Meteo variables to pollutant ids and drops empty series', () => {
    const data = parseAirQuality(airPayload());
    expect(data.times).toEqual(['2026-11-26T00:00', '2026-11-26T01:00']);
    expect(data.utcOffsetSeconds).toBe(19_800);
    expect(Object.keys(data.series).sort()).toEqual(['co', 'no2', 'o3', 'pm10', 'pm2_5', 'so2']);
    expect(data.series.pm2_5).toEqual([100.5, null]);
  });

  it('omits series with the wrong length or invalid values', () => {
    const data = parseAirQuality(airPayload({}, { pm10: [1], ozone: [-5, 3], nitrogen_dioxide: ['1', 2] }));
    expect(data.series.pm10).toBeUndefined();
    expect(data.series.o3).toBeUndefined();
    expect(data.series.no2).toBeUndefined();
  });

  it('defaults the timezone label', () => {
    expect(parseAirQuality(airPayload({ timezone: undefined })).timezone).toBe('UTC');
  });

  it.each([
    ['not an object', 'oops'],
    ['bad coordinates', airPayload({ latitude: 999 })],
    ['bad offset', airPayload({ utc_offset_seconds: 1.5 })],
    ['missing hourly', airPayload({ hourly: null })],
    ['bad times', airPayload({}, { time: ['yesterday', 'today'] })],
    ['no times', airPayload({}, { time: [] })],
    [
      'no pollutants',
      airPayload({}, { pm2_5: [null, null], pm10: null, ozone: null, nitrogen_dioxide: null, sulphur_dioxide: null, carbon_monoxide: null }),
    ],
  ])('rejects %s', (_label, payload) => {
    expect(() => parseAirQuality(payload)).toThrow(ApiError);
  });
});

describe('createOpenMeteoClient', () => {
  it('caches place searches regardless of case and spacing', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse({ results: [GEO_RESULT] })));
    const client = createOpenMeteoClient({ fetchImpl });
    await client.searchPlaces('Delhi');
    const places = await client.searchPlaces('  delhi ');
    expect(places[0]?.name).toBe('Delhi');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not call the API for unusable queries', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(createOpenMeteoClient({ fetchImpl }).searchPlaces('?')).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches air quality per rounded location until it goes stale', async () => {
    let time = 0;
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(airPayload())));
    const client = createOpenMeteoClient({ fetchImpl, now: () => time });

    await client.getAirQuality(28.651, 77.231);
    await client.getAirQuality(28.649, 77.229);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    time += 16 * 60 * 1000;
    await client.getAirQuality(28.651, 77.231);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('surfaces invalid responses as errors', async () => {
    const client = createOpenMeteoClient({ fetchImpl: () => Promise.resolve(jsonResponse({ nope: true })) });
    await expect(client.getAirQuality(1, 1)).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('placeLabel', () => {
  it('joins the name, region and country without repeats', () => {
    expect(placeLabel({ id: 1, name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 0, longitude: 0 })).toBe(
      'Pune, Maharashtra, India',
    );
    expect(placeLabel({ id: 2, name: 'Singapore', country: 'Singapore', latitude: 0, longitude: 0 })).toBe('Singapore');
  });
});
