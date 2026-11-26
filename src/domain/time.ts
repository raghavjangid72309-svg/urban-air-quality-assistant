/**
 * Open-Meteo returns times as local wall-clock strings (`YYYY-MM-DDTHH:mm`)
 * for the location's timezone. These helpers work on those strings directly,
 * using UTC arithmetic so the viewer's own timezone never leaks in.
 */
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function isLocalIso(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_ISO.test(value);
}

function toUtcMs(iso: string): number {
  const match = LOCAL_ISO.exec(iso);
  if (!match) throw new RangeError(`Invalid local time: ${iso}`);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/** Hour of day (0–23) of a local time string. */
export function localHour(iso: string): number {
  return new Date(toUtcMs(iso)).getUTCHours();
}

/** Date part (`YYYY-MM-DD`) of a local time string. */
export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

export function addHours(iso: string, hours: number): string {
  return fromUtcMs(toUtcMs(iso) + hours * 3_600_000);
}

export function addDays(date: string, days: number): string {
  return addHours(`${date}T00:00`, days * 24).slice(0, 10);
}

/** The current hour at a location, given its UTC offset, as `YYYY-MM-DDTHH:00`. */
export function currentLocalHour(nowMs: number, utcOffsetSeconds: number): string {
  return `${fromUtcMs(nowMs + utcOffsetSeconds * 1000).slice(0, 13)}:00`;
}

/** `14:00` style label. */
export function formatClock(iso: string): string {
  return iso.slice(11, 16);
}

/** "today", "tomorrow" or a weekday name, relative to `today` (`YYYY-MM-DD`). */
export function formatDay(date: string, today: string): string {
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date === addDays(today, -1)) return 'yesterday';
  return WEEKDAYS[new Date(toUtcMs(`${date}T00:00`)).getUTCDay()] ?? date;
}

/** "14:00 today", "06:00 tomorrow". */
export function formatWhen(iso: string, today: string): string {
  return `${formatClock(iso)} ${formatDay(localDate(iso), today)}`;
}
