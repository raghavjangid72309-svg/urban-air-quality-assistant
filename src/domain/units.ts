/** Molar volume of an ideal gas at 25 °C and 1 atm, in litres per mole. */
const MOLAR_VOLUME_LITRES = 24.45;

/** Converts a gas concentration from µg/m³ to parts per billion (25 °C, 1 atm). */
export function microgramsToPpb(microgramsPerM3: number, molecularWeight: number): number {
  return (microgramsPerM3 * MOLAR_VOLUME_LITRES) / molecularWeight;
}

/** Converts a gas concentration from µg/m³ to parts per million (25 °C, 1 atm). */
export function microgramsToPpm(microgramsPerM3: number, molecularWeight: number): number {
  return microgramsToPpb(microgramsPerM3, molecularWeight) / 1000;
}

/** Converts µg/m³ to mg/m³. */
export function microgramsToMilligrams(microgramsPerM3: number): number {
  return microgramsPerM3 / 1000;
}

/**
 * Truncates (not rounds) to a number of decimals, as the US EPA requires
 * before looking up AQI breakpoints. The small epsilon absorbs binary
 * floating-point error, e.g. 0.07 * 1000 = 70.00000000000001.
 */
export function truncate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor + 1e-9) / factor;
}
