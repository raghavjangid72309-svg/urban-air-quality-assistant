import { describe, expect, it } from 'vitest';
import { getAdvice, GROUP_TIPS, personalRisk, windowsFor } from './advice';
import { DEFAULT_PROFILE, type HealthProfile } from './profile';

const sensitive: HealthProfile = { groups: ['respiratory'], activity: 'general' };

describe('personalRisk', () => {
  it.each([
    [1, 'low', 'low'],
    [2, 'low', 'moderate'],
    [3, 'moderate', 'high'],
    [4, 'high', 'very_high'],
    [5, 'very_high', 'severe'],
    [6, 'severe', 'severe'],
  ] as const)('level %d: %s for most people, %s for sensitive groups', (level, general, forSensitive) => {
    expect(personalRisk(level, DEFAULT_PROFILE)).toBe(general);
    expect(personalRisk(level, sensitive)).toBe(forSensitive);
  });
});

describe('getAdvice', () => {
  it('encourages outdoor activity in clean air', () => {
    const advice = getAdvice(1, { groups: ['child'], activity: 'exercise' });
    expect(advice).toMatchObject({ risk: 'low', exercise: 'go', mask: 'not-needed', windows: 'open' });
    expect(advice.headline).toMatch(/run, ride or game/);
    // Group tips are not needed when the air is clean.
    expect(advice.actions).not.toContain(GROUP_TIPS.child);
  });

  it('puts the main action first, then tips for the person', () => {
    const advice = getAdvice(4, { groups: ['respiratory', 'child'], activity: 'commute' });
    expect(advice).toMatchObject({ risk: 'very_high', exercise: 'avoid', mask: 'recommended', windows: 'limit' });
    expect(advice.actions[0]).toBe('Move exercise indoors.');
    expect(advice.actions[1]).toBe(GROUP_TIPS.respiratory);
    expect(advice.actions[2]).toBe(GROUP_TIPS.child);
    expect(advice.actions[3]).toMatch(/recirculate/);
  });

  it('adds route advice for exercise in moderate or high risk only', () => {
    expect(getAdvice(3, { groups: [], activity: 'exercise' }).actions.join(' ')).toMatch(/parks/);
    expect(getAdvice(5, { groups: [], activity: 'exercise' }).actions.join(' ')).not.toMatch(/parks/);
  });

  it('uses an exercise-specific headline only where it differs', () => {
    expect(getAdvice(3, { groups: [], activity: 'exercise' }).headline).toMatch(/You can exercise/);
    expect(getAdvice(6, { groups: [], activity: 'exercise' }).headline).toMatch(/Stay indoors/);
  });

  it('recommends a respirator at high levels and flags it as optional below', () => {
    expect(getAdvice(4, DEFAULT_PROFILE).mask).toBe('optional');
    expect(getAdvice(5, DEFAULT_PROFILE).mask).toBe('recommended');
    expect(getAdvice(6, DEFAULT_PROFILE).actions.at(-1)).toMatch(/medical help/);
  });
});

describe('windowsFor', () => {
  it.each([
    [1, 'open'],
    [2, 'open'],
    [3, 'limit'],
    [4, 'limit'],
    [5, 'closed'],
    [6, 'closed'],
  ] as const)('level %d: %s', (level, expected) => {
    expect(windowsFor(level)).toBe(expected);
  });
});
