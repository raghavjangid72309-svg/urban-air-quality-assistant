export interface ConcentrationParts {
  readonly value: string;
  readonly unit: string;
}

/** Number and unit separately, for layouts that size them differently. */
export function concentrationParts(microgramsPerM3: number): ConcentrationParts {
  const value = microgramsPerM3 < 10 ? microgramsPerM3.toFixed(1) : Math.round(microgramsPerM3).toString();
  return { value, unit: 'µg/m³' };
}

/** "8.4 µg/m³" below 10, whole numbers above. */
export function formatConcentration(microgramsPerM3: number): string {
  const { value, unit } = concentrationParts(microgramsPerM3);
  return `${value} ${unit}`;
}
