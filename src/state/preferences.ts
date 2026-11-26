import { parsePlace, type Place } from '../api/openMeteo';
import { isAqiStandardId, type AqiStandardId } from '../domain/aqi/standards';
import { DEFAULT_PROFILE, isActivity, SENSITIVITY_GROUPS, type HealthProfile } from '../domain/profile';

export interface Preferences {
  readonly standard: AqiStandardId;
  readonly profile: HealthProfile;
  readonly lastPlace: Place | null;
}

export const STORAGE_KEY = 'airwise:preferences:v1';

/** India's index for Indian locales or timezones, the US EPA index elsewhere. */
export function defaultStandard(locale?: string, timeZone?: string): AqiStandardId {
  if (locale && /-IN$/i.test(locale)) return 'in';
  if (timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta') return 'in';
  return 'us';
}

export function defaultPreferences(standard: AqiStandardId): Preferences {
  return { standard, profile: DEFAULT_PROFILE, lastPlace: null };
}

/** Rebuilds preferences from untrusted stored JSON, keeping only valid fields. */
export function parsePreferences(raw: unknown, fallback: Preferences): Preferences {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const record = raw as Record<string, unknown>;

  const standard = isAqiStandardId(record.standard) ? record.standard : fallback.standard;

  let profile = fallback.profile;
  if (typeof record.profile === 'object' && record.profile !== null) {
    const stored = record.profile as Record<string, unknown>;
    const storedGroups: unknown = stored.groups;
    // Filtering the known list keeps a canonical order and drops unknown or duplicate entries.
    const groups = Array.isArray(storedGroups)
      ? SENSITIVITY_GROUPS.filter((group) => storedGroups.includes(group))
      : fallback.profile.groups;
    const activity = isActivity(stored.activity) ? stored.activity : fallback.profile.activity;
    profile = { groups, activity };
  }

  const lastPlace = parsePlace(record.lastPlace) ?? fallback.lastPlace;
  return { standard, profile, lastPlace };
}

/** Reads preferences; storage can be missing or throw (private mode, disabled cookies). */
export function loadPreferences(storage: Pick<Storage, 'getItem'> | null, fallback: Preferences): Preferences {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return fallback;
    return parsePreferences(JSON.parse(text), fallback);
  } catch {
    return fallback;
  }
}

export function savePreferences(storage: Pick<Storage, 'setItem'> | null, preferences: Preferences): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
