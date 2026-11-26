/** Pollutants reported by the Open-Meteo / CAMS air quality model. */
export const POLLUTANT_IDS = ['pm2_5', 'pm10', 'o3', 'no2', 'so2', 'co', 'nh3'] as const;

export type PollutantId = (typeof POLLUTANT_IDS)[number];

/** Hourly concentrations in µg/m³, aligned with a shared `times` array. Gaps are `null`. */
export type PollutantSeries = Partial<Record<PollutantId, readonly (number | null)[]>>;

export interface PollutantInfo {
  readonly id: PollutantId;
  /** Short label, e.g. "PM2.5". */
  readonly label: string;
  /** Spoken / full name, e.g. "fine particulate matter". */
  readonly name: string;
  readonly description: string;
  readonly sources: string;
  /** Grams per mole, used to convert µg/m³ to ppb for gases. */
  readonly molecularWeight?: number;
}

export const POLLUTANTS: Readonly<Record<PollutantId, PollutantInfo>> = {
  pm2_5: {
    id: 'pm2_5',
    label: 'PM2.5',
    name: 'fine particulate matter',
    description:
      'Particles 2.5 micrometres or smaller. They reach deep into the lungs and the bloodstream, and are the pollutant most strongly linked to heart and lung disease.',
    sources: 'vehicle exhaust, burning of wood, waste and crop residue, industry, and power plants',
  },
  pm10: {
    id: 'pm10',
    label: 'PM10',
    name: 'coarse particulate matter',
    description:
      'Particles 10 micrometres or smaller, such as dust and pollen. They irritate the nose, throat and airways.',
    sources: 'road and construction dust, unpaved surfaces, desert dust, and industry',
  },
  o3: {
    id: 'o3',
    label: 'O₃',
    name: 'ground-level ozone',
    description:
      'A gas formed when sunlight reacts with traffic and industrial emissions. It peaks on warm, sunny afternoons and can inflame the airways.',
    sources: 'sunlight acting on vehicle and industrial emissions',
    molecularWeight: 48.0,
  },
  no2: {
    id: 'no2',
    label: 'NO₂',
    name: 'nitrogen dioxide',
    description:
      'A gas mainly from burning fuel. Levels are highest near busy roads and can worsen asthma.',
    sources: 'road traffic, diesel engines, and power generation',
    molecularWeight: 46.0055,
  },
  so2: {
    id: 'so2',
    label: 'SO₂',
    name: 'sulphur dioxide',
    description: 'A gas from burning sulphur-containing fuels. Short exposures can make breathing harder.',
    sources: 'coal-fired power plants, refineries, shipping, and smelters',
    molecularWeight: 64.066,
  },
  co: {
    id: 'co',
    label: 'CO',
    name: 'carbon monoxide',
    description: 'A colourless gas from incomplete combustion. It reduces how much oxygen the blood can carry.',
    sources: 'vehicle exhaust, generators, and indoor or outdoor burning',
    molecularWeight: 28.01,
  },
  nh3: {
    id: 'nh3',
    label: 'NH₃',
    name: 'ammonia',
    description: 'A gas that helps form fine particles in the air.',
    sources: 'fertilisers, livestock, and waste',
    molecularWeight: 17.031,
  },
};
