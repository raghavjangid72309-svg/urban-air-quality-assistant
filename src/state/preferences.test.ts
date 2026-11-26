import { describe, expect, it } from 'vitest';
import { DELHI, memoryStorage } from '../test-utils/fixtures';
import {
  defaultPreferences,
  defaultStandard,
  loadPreferences,
  parsePreferences,
  savePreferences,
  STORAGE_KEY,
  type Preferences,
} from './preferences';

const fallback = defaultPreferences('us');

describe('defaultStandard', () => {
  it('chooses the India scale for Indian locales or timezones', () => {
    expect(defaultStandard('en-IN')).toBe('in');
    expect(defaultStandard('hi-in')).toBe('in');
    expect(defaultStandard('en-US', 'Asia/Kolkata')).toBe('in');
    expect(defaultStandard('en-GB', 'Asia/Calcutta')).toBe('in');
  });

  it('chooses the US EPA scale elsewhere', () => {
    expect(defaultStandard('en-US', 'America/New_York')).toBe('us');
    expect(defaultStandard()).toBe('us');
  });
});

describe('parsePreferences', () => {
  it('keeps valid fields', () => {
    const stored = { standard: 'in', profile: { groups: ['child', 'heart'], activity: 'exercise' }, lastPlace: DELHI };
    expect(parsePreferences(stored, fallback)).toEqual({
      standard: 'in',
      profile: { groups: ['heart', 'child'], activity: 'exercise' },
      lastPlace: DELHI,
    });
  });

  it('replaces invalid fields with the fallback', () => {
    const stored = { standard: 'xx', profile: { groups: 'child', activity: 'skydiving' }, lastPlace: { id: 'x' } };
    expect(parsePreferences(stored, fallback)).toEqual(fallback);
  });

  it('drops unknown and duplicate groups', () => {
    const parsed = parsePreferences({ profile: { groups: ['child', 'child', 'pirate', 42] } }, fallback);
    expect(parsed.profile.groups).toEqual(['child']);
  });

  it('ignores non-objects', () => {
    expect(parsePreferences('hello', fallback)).toBe(fallback);
    expect(parsePreferences(null, fallback)).toBe(fallback);
  });
});

describe('loadPreferences and savePreferences', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const prefs: Preferences = { standard: 'in', profile: { groups: ['older'], activity: 'commute' }, lastPlace: DELHI };
    expect(savePreferences(storage, prefs)).toBe(true);
    expect(loadPreferences(storage, fallback)).toEqual(prefs);
  });

  it('falls back when storage is missing, empty, corrupt or throws', () => {
    expect(loadPreferences(null, fallback)).toBe(fallback);
    expect(loadPreferences(memoryStorage(), fallback)).toBe(fallback);
    expect(loadPreferences(memoryStorage({ [STORAGE_KEY]: '{not json' }), fallback)).toBe(fallback);
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadPreferences(broken, fallback)).toBe(fallback);
  });

  it('reports failed writes instead of throwing', () => {
    expect(savePreferences(null, fallback)).toBe(false);
    const full = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(savePreferences(full, fallback)).toBe(false);
  });
});
