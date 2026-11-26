import { POLLUTANTS, type PollutantId } from '../pollutants';
import { microgramsToMilligrams, microgramsToPpb, microgramsToPpm, truncate } from '../units';

export type AqiStandardId = 'us' | 'in';

/** Shared 1–6 severity scale so advice and colours work the same for every standard. */
export type AqiLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface AqiCategory {
  readonly level: AqiLevel;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/** One linear segment: [concentration low, concentration high, index low, index high]. */
export type Breakpoint = readonly [cLow: number, cHigh: number, iLow: number, iHigh: number];

export interface PollutantRule {
  /** Hours the concentration is averaged over before the lookup. */
  readonly averagingHours: number;
  /** Unit the breakpoints are expressed in. */
  readonly unit: string;
  /** Converts an averaged µg/m³ value into the breakpoint unit (with any truncation). */
  readonly convert: (microgramsPerM3: number) => number;
  readonly breakpoints: readonly Breakpoint[];
}

export interface AqiStandard {
  readonly id: AqiStandardId;
  readonly name: string;
  readonly shortName: string;
  readonly authority: string;
  readonly categories: readonly AqiCategory[];
  readonly rules: Readonly<Partial<Record<PollutantId, PollutantRule>>>;
  /** Fewest pollutants with valid data needed to publish an index. */
  readonly minPollutants: number;
  /** Whether PM2.5 or PM10 must be among them. */
  readonly requiresParticulate: boolean;
}

const molecularWeight = (id: PollutantId): number => {
  const weight = POLLUTANTS[id].molecularWeight;
  if (weight === undefined) throw new Error(`No molecular weight for ${id}`);
  return weight;
};

/**
 * US EPA AQI, including the PM2.5 and PM10 breakpoints revised in May 2024.
 * Concentrations are truncated to the precision EPA specifies.
 * Simplifications: NO₂ and SO₂ use 1-hour values throughout, and 8-hour
 * ozone is capped at 300 (EPA switches to 1-hour ozone above that).
 */
const US_EPA: AqiStandard = {
  id: 'us',
  name: 'US EPA Air Quality Index',
  shortName: 'US AQI',
  authority: 'US Environmental Protection Agency',
  categories: [
    { level: 1, label: 'Good', min: 0, max: 50 },
    { level: 2, label: 'Moderate', min: 51, max: 100 },
    { level: 3, label: 'Unhealthy for sensitive groups', min: 101, max: 150 },
    { level: 4, label: 'Unhealthy', min: 151, max: 200 },
    { level: 5, label: 'Very unhealthy', min: 201, max: 300 },
    { level: 6, label: 'Hazardous', min: 301, max: 500 },
  ],
  rules: {
    pm2_5: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: (c) => truncate(c, 1),
      breakpoints: [
        [0, 9.0, 0, 50],
        [9.1, 35.4, 51, 100],
        [35.5, 55.4, 101, 150],
        [55.5, 125.4, 151, 200],
        [125.5, 225.4, 201, 300],
        [225.5, 325.4, 301, 500],
      ],
    },
    pm10: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: (c) => truncate(c, 0),
      breakpoints: [
        [0, 54, 0, 50],
        [55, 154, 51, 100],
        [155, 254, 101, 150],
        [255, 354, 151, 200],
        [355, 424, 201, 300],
        [425, 604, 301, 500],
      ],
    },
    o3: {
      averagingHours: 8,
      unit: 'ppm',
      convert: (c) => truncate(microgramsToPpm(c, molecularWeight('o3')), 3),
      breakpoints: [
        [0, 0.054, 0, 50],
        [0.055, 0.07, 51, 100],
        [0.071, 0.085, 101, 150],
        [0.086, 0.105, 151, 200],
        [0.106, 0.2, 201, 300],
      ],
    },
    co: {
      averagingHours: 8,
      unit: 'ppm',
      convert: (c) => truncate(microgramsToPpm(c, molecularWeight('co')), 1),
      breakpoints: [
        [0, 4.4, 0, 50],
        [4.5, 9.4, 51, 100],
        [9.5, 12.4, 101, 150],
        [12.5, 15.4, 151, 200],
        [15.5, 30.4, 201, 300],
        [30.5, 50.4, 301, 500],
      ],
    },
    so2: {
      averagingHours: 1,
      unit: 'ppb',
      convert: (c) => truncate(microgramsToPpb(c, molecularWeight('so2')), 0),
      breakpoints: [
        [0, 35, 0, 50],
        [36, 75, 51, 100],
        [76, 185, 101, 150],
        [186, 304, 151, 200],
        [305, 604, 201, 300],
        [605, 1004, 301, 500],
      ],
    },
    no2: {
      averagingHours: 1,
      unit: 'ppb',
      convert: (c) => truncate(microgramsToPpb(c, molecularWeight('no2')), 0),
      breakpoints: [
        [0, 53, 0, 50],
        [54, 100, 51, 100],
        [101, 360, 101, 150],
        [361, 649, 151, 200],
        [650, 1249, 201, 300],
        [1250, 2049, 301, 500],
      ],
    },
  },
  minPollutants: 1,
  requiresParticulate: false,
};

const identity = (c: number): number => c;

/**
 * India National AQI (CPCB, 2014). Breakpoints are continuous. CPCB leaves the
 * top of the "Severe" band open; here it is given the same width as the
 * "Very poor" band so the index tops out at 500.
 */
const INDIA_NAQI: AqiStandard = {
  id: 'in',
  name: 'India National Air Quality Index',
  shortName: 'India AQI',
  authority: 'Central Pollution Control Board (CPCB)',
  categories: [
    { level: 1, label: 'Good', min: 0, max: 50 },
    { level: 2, label: 'Satisfactory', min: 51, max: 100 },
    { level: 3, label: 'Moderate', min: 101, max: 200 },
    { level: 4, label: 'Poor', min: 201, max: 300 },
    { level: 5, label: 'Very poor', min: 301, max: 400 },
    { level: 6, label: 'Severe', min: 401, max: 500 },
  ],
  rules: {
    pm10: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: identity,
      breakpoints: [
        [0, 50, 0, 50],
        [50, 100, 50, 100],
        [100, 250, 100, 200],
        [250, 350, 200, 300],
        [350, 430, 300, 400],
        [430, 510, 400, 500],
      ],
    },
    pm2_5: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: identity,
      breakpoints: [
        [0, 30, 0, 50],
        [30, 60, 50, 100],
        [60, 90, 100, 200],
        [90, 120, 200, 300],
        [120, 250, 300, 400],
        [250, 380, 400, 500],
      ],
    },
    no2: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: identity,
      breakpoints: [
        [0, 40, 0, 50],
        [40, 80, 50, 100],
        [80, 180, 100, 200],
        [180, 280, 200, 300],
        [280, 400, 300, 400],
        [400, 520, 400, 500],
      ],
    },
    o3: {
      averagingHours: 8,
      unit: 'µg/m³',
      convert: identity,
      breakpoints: [
        [0, 50, 0, 50],
        [50, 100, 50, 100],
        [100, 168, 100, 200],
        [168, 208, 200, 300],
        [208, 748, 300, 400],
        [748, 1288, 400, 500],
      ],
    },
    co: {
      averagingHours: 8,
      unit: 'mg/m³',
      convert: microgramsToMilligrams,
      breakpoints: [
        [0, 1, 0, 50],
        [1, 2, 50, 100],
        [2, 10, 100, 200],
        [10, 17, 200, 300],
        [17, 34, 300, 400],
        [34, 51, 400, 500],
      ],
    },
    so2: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: identity,
      breakpoints: [
        [0, 40, 0, 50],
        [40, 80, 50, 100],
        [80, 380, 100, 200],
        [380, 800, 200, 300],
        [800, 1600, 300, 400],
        [1600, 2400, 400, 500],
      ],
    },
    nh3: {
      averagingHours: 24,
      unit: 'µg/m³',
      convert: identity,
      breakpoints: [
        [0, 200, 0, 50],
        [200, 400, 50, 100],
        [400, 800, 100, 200],
        [800, 1200, 200, 300],
        [1200, 1800, 300, 400],
        [1800, 2400, 400, 500],
      ],
    },
  },
  minPollutants: 3,
  requiresParticulate: true,
};

export const AQI_STANDARDS: Readonly<Record<AqiStandardId, AqiStandard>> = {
  us: US_EPA,
  in: INDIA_NAQI,
};

export function isAqiStandardId(value: unknown): value is AqiStandardId {
  return value === 'us' || value === 'in';
}
