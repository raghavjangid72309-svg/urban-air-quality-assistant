/** "8.4 µg/m³" below 10, whole numbers above. */
export function formatConcentration(microgramsPerM3: number): string {
  const rounded = microgramsPerM3 < 10 ? microgramsPerM3.toFixed(1) : Math.round(microgramsPerM3).toString();
  return `${rounded} µg/m³`;
}
