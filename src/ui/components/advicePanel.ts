import { getAdvice, RISK_LABELS } from '../../domain/advice';
import type { HealthProfile } from '../../domain/profile';
import type { AirView } from '../../state/airView';
import { el } from '../dom';
import { icon } from '../icons';

/** Personal advice for the current reading: overall risk, then concrete actions. */
export function renderAdvice(view: AirView | null, profile: HealthProfile): Node[] {
  const current = view?.current;
  if (!current) {
    return [el('p', { class: 'empty' }, ['Advice for your day appears here once you choose a place.'])];
  }

  const advice = getAdvice(current.category.level, profile);
  const forWhom = profile.groups.length > 0 ? 'for you, given what you told us' : 'for most people';

  return [
    el('p', { class: `risk risk-${advice.risk}` }, [`${RISK_LABELS[advice.risk]} ${forWhom}.`]),
    el(
      'ul',
      { class: 'actions' },
      advice.actions.map((action) => el('li', {}, [el('span', { class: 'action-icon' }, [icon('check')]), action])),
    ),
  ];
}
