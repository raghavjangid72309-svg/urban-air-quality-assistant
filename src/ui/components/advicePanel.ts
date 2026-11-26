import {
  getAdvice,
  RISK_LABELS,
  type ExerciseGuidance,
  type MaskGuidance,
  type WindowGuidance,
} from '../../domain/advice';
import type { HealthProfile } from '../../domain/profile';
import type { AirView } from '../../state/airView';
import { el } from '../dom';

const EXERCISE_TEXT: Readonly<Record<ExerciseGuidance, string>> = {
  go: 'Go ahead',
  'take-it-easy': 'Fine, take it a little easier',
  reduce: 'Keep it short and light',
  avoid: 'Move it indoors',
  'stay-indoors': 'Stay indoors',
};

const MASK_TEXT: Readonly<Record<MaskGuidance, string>> = {
  'not-needed': 'Not needed',
  optional: 'Worth it for long periods outside',
  recommended: 'Wear an N95 or FFP2 outdoors',
};

const WINDOW_TEXT: Readonly<Record<WindowGuidance, string>> = {
  open: 'Open them up',
  limit: 'Air out briefly at the cleanest time',
  closed: 'Keep them shut',
};

/** Personal advice for the current reading. */
export function renderAdvice(view: AirView | null, profile: HealthProfile): Node[] {
  const current = view?.current;
  if (!current) {
    return [el('p', { class: 'empty' }, ['Advice for your day appears here once you choose a place.'])];
  }

  const advice = getAdvice(current.category.level, profile);
  const forWhom = profile.groups.length > 0 ? 'for you, given what you told us' : 'for most people';

  return [
    el('p', { class: `risk risk-${advice.risk}` }, [`${RISK_LABELS[advice.risk]} ${forWhom}.`]),
    el('dl', { class: 'quick-facts' }, [
      el('div', {}, [el('dt', {}, ['Outdoor exercise']), el('dd', {}, [EXERCISE_TEXT[advice.exercise]])]),
      el('div', {}, [el('dt', {}, ['Mask']), el('dd', {}, [MASK_TEXT[advice.mask]])]),
      el('div', {}, [el('dt', {}, ['Windows']), el('dd', {}, [WINDOW_TEXT[advice.windows]])]),
    ]),
    el('ul', { class: 'actions' }, advice.actions.map((action) => el('li', {}, [action]))),
  ];
}
