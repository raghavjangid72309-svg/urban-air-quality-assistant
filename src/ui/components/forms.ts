import type { Place } from '../../api/openMeteo';
import { ACTIVITIES, ACTIVITY_LABELS, GROUP_LABELS, SENSITIVITY_GROUPS, type HealthProfile } from '../../domain/profile';
import { el } from '../dom';

/** Search results as buttons; the index ties a click back to the place. */
export function placeResults(places: readonly Place[]): HTMLLIElement[] {
  return places.map((place, index) => {
    const region = [place.admin1, place.country].filter(Boolean).join(', ');
    return el('li', {}, [
      el('button', { type: 'button', class: 'result', 'data-place-index': index }, [
        el('span', { class: 'result-name' }, [place.name]),
        region && el('span', { class: 'result-region' }, [region]),
      ]),
    ]);
  });
}

/** Checkboxes and the activity select for the "About you" form. */
export function profileFields(profile: HealthProfile): HTMLElement[] {
  const groups = el('fieldset', { class: 'groups' }, [
    el('legend', {}, ['Does any of this apply to you or someone with you?']),
    ...SENSITIVITY_GROUPS.map((group) =>
      el('label', { class: 'check' }, [
        el('input', { type: 'checkbox', name: 'group', value: group, checked: profile.groups.includes(group) }),
        el('span', {}, [GROUP_LABELS[group]]),
      ]),
    ),
  ]);

  const activity = el('div', { class: 'field' }, [
    el('label', { for: 'activity' }, ['Plans for today']),
    el(
      'select',
      { id: 'activity', name: 'activity' },
      ACTIVITIES.map((value) =>
        el('option', { value, selected: value === profile.activity }, [ACTIVITY_LABELS[value]]),
      ),
    ),
  ]);

  return [groups, activity];
}
