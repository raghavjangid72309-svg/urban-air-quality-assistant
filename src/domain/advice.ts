import type { AqiLevel } from './aqi/standards';
import type { HealthProfile, SensitivityGroup } from './profile';

export const RISK_LEVELS = ['low', 'moderate', 'high', 'very_high', 'severe'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type ExerciseGuidance = 'go' | 'take-it-easy' | 'reduce' | 'avoid' | 'stay-indoors';
export type MaskGuidance = 'not-needed' | 'optional' | 'recommended';
export type WindowGuidance = 'open' | 'limit' | 'closed';

export interface Advice {
  readonly risk: RiskLevel;
  readonly headline: string;
  readonly actions: readonly string[];
  readonly exercise: ExerciseGuidance;
  readonly mask: MaskGuidance;
  readonly windows: WindowGuidance;
}

export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
  very_high: 'Very high risk',
  severe: 'Severe risk',
};

/**
 * Personal risk follows the US EPA's AQI health messaging: the general public
 * is first affected at level 3, sensitive groups one level earlier.
 */
const GENERAL_RISK_BY_LEVEL = [0, 0, 1, 2, 3, 4] as const;

export function personalRisk(level: AqiLevel, profile: HealthProfile): RiskLevel {
  const base = GENERAL_RISK_BY_LEVEL[level - 1] ?? 4;
  const sensitive = profile.groups.length > 0 && level >= 2 ? 1 : 0;
  return RISK_LEVELS[Math.min(base + sensitive, RISK_LEVELS.length - 1)] ?? 'severe';
}

const HEADLINES: Readonly<Record<RiskLevel, string>> = {
  low: 'Air quality is fine for you. Enjoy your time outside.',
  moderate: 'Air is acceptable, but keep long or intense outdoor efforts shorter.',
  high: 'Cut back on long or intense outdoor activity today.',
  very_high: 'Avoid long or intense outdoor activity and move it indoors.',
  severe: 'Stay indoors and avoid physical activity outside.',
};

const EXERCISE_HEADLINES: Partial<Record<RiskLevel, string>> = {
  low: 'Good conditions for a run, ride or game outside.',
  moderate: 'You can exercise outside. Take it a little easier and listen to your body.',
};

const BASE_ACTIONS: Readonly<Record<RiskLevel, readonly string[]>> = {
  low: ['A good time to open windows and air out your home.'],
  moderate: [
    'Take breaks if you notice coughing or shortness of breath.',
    'Fine to ventilate your home, but avoid airing out next to busy roads at rush hour.',
  ],
  high: [
    'Shorten outdoor workouts or swap them for lighter activity, and take more breaks.',
    'Keep windows closed during the worst hours and ventilate when the air is cleanest.',
    'Consider a well-fitted N95 or FFP2 respirator if you will be outside for long.',
  ],
  very_high: [
    'Move exercise indoors.',
    'Keep windows and doors closed, and run an air purifier with a HEPA filter if you have one.',
    'Wear a well-fitted N95 or FFP2 respirator outdoors.',
  ],
  severe: [
    'Stay indoors as much as possible and keep activity light.',
    'Keep windows and doors shut, and run a HEPA air purifier on high.',
    'If you must go out, wear a well-fitted N95 or FFP2 respirator and keep it short.',
    'Get medical help for chest pain, severe breathlessness or dizziness.',
  ],
};

export const GROUP_TIPS: Readonly<Record<SensitivityGroup, string>> = {
  respiratory: 'Carry your reliever inhaler and follow your asthma or COPD action plan.',
  heart: 'Watch for chest pain, palpitations, breathlessness or unusual tiredness, and call a doctor if they appear.',
  child: 'Choose indoor play. Children breathe more air for their size, so they take in more pollution.',
  older: 'Plan outings for the cleanest hours and avoid strenuous effort.',
  pregnant: 'Limit time outdoors in polluted air and avoid busy roads where you can.',
  outdoorWorker: 'Schedule heavy tasks for the cleanest hours, take breaks indoors, and ask your employer about respirators.',
};

const COMMUTE_TIP = 'Pick quieter streets away from heavy traffic, and set car ventilation to recirculate.';
const EXERCISE_TIP = 'Exercise in parks or away from main roads, and avoid rush hour.';

const EXERCISE_BY_RISK: Readonly<Record<RiskLevel, ExerciseGuidance>> = {
  low: 'go',
  moderate: 'take-it-easy',
  high: 'reduce',
  very_high: 'avoid',
  severe: 'stay-indoors',
};

function maskFor(risk: RiskLevel): MaskGuidance {
  if (risk === 'very_high' || risk === 'severe') return 'recommended';
  return risk === 'high' ? 'optional' : 'not-needed';
}

/** Ventilation depends on outdoor air only, not on who is asking. */
export function windowsFor(level: AqiLevel): WindowGuidance {
  if (level <= 2) return 'open';
  return level <= 4 ? 'limit' : 'closed';
}

/** Health advice for an AQI level, tailored to a person's sensitivities and plans. */
export function getAdvice(level: AqiLevel, profile: HealthProfile): Advice {
  const risk = personalRisk(level, profile);
  const [primary, ...rest] = BASE_ACTIONS[risk];

  // Most important general action first, then what is specific to this person.
  const personal: string[] = [];
  if (risk !== 'low') {
    for (const group of profile.groups) personal.push(GROUP_TIPS[group]);
    if (profile.activity === 'commute') personal.push(COMMUTE_TIP);
    if (profile.activity === 'exercise' && (risk === 'moderate' || risk === 'high')) personal.push(EXERCISE_TIP);
  }
  const actions = [...(primary ? [primary] : []), ...personal, ...rest];

  const headline = (profile.activity === 'exercise' ? EXERCISE_HEADLINES[risk] : undefined) ?? HEADLINES[risk];

  return {
    risk,
    headline,
    actions,
    exercise: EXERCISE_BY_RISK[risk],
    mask: maskFor(risk),
    windows: windowsFor(level),
  };
}
