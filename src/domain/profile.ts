export const SENSITIVITY_GROUPS = ['respiratory', 'heart', 'child', 'older', 'pregnant', 'outdoorWorker'] as const;
export type SensitivityGroup = (typeof SENSITIVITY_GROUPS)[number];

export const ACTIVITIES = ['general', 'exercise', 'commute'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface HealthProfile {
  readonly groups: readonly SensitivityGroup[];
  readonly activity: Activity;
}

export const GROUP_LABELS: Readonly<Record<SensitivityGroup, string>> = {
  respiratory: 'Asthma, COPD or another lung condition',
  heart: 'Heart or circulation condition',
  child: 'Children (under 14)',
  older: 'Adults over 65',
  pregnant: 'Pregnancy',
  outdoorWorker: 'Working outdoors',
};

export const ACTIVITY_LABELS: Readonly<Record<Activity, string>> = {
  general: 'Errands and short walks',
  exercise: 'Running, cycling or sport',
  commute: 'Commuting in traffic',
};

export const DEFAULT_PROFILE: HealthProfile = { groups: [], activity: 'general' };

export function isSensitivityGroup(value: unknown): value is SensitivityGroup {
  return typeof value === 'string' && (SENSITIVITY_GROUPS as readonly string[]).includes(value);
}

export function isActivity(value: unknown): value is Activity {
  return typeof value === 'string' && (ACTIVITIES as readonly string[]).includes(value);
}
