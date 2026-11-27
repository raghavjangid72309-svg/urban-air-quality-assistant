import { categoryFor } from '../../domain/aqi/calculate';
import { concentrationParts } from '../../domain/format';
import { POLLUTANTS } from '../../domain/pollutants';
import type { AirView } from '../../state/airView';
import { el } from '../dom';

/**
 * One card per pollutant: its averaged concentration, its own sub-index and a
 * bar showing that sub-index on the 0–500 scale. The pollutant setting the AQI
 * is marked.
 */
export function renderPollutants(view: AirView | null): Node[] {
  const current = view?.current;
  if (!view || !current) {
    return [el('p', { class: 'empty' }, ['Pollutant levels appear here once you choose a place.'])];
  }

  const top = view.standard.categories.at(-1)?.max ?? 500;
  const cards = current.subIndices.map((sub) => {
    const info = POLLUTANTS[sub.pollutant];
    const level = categoryFor(view.standard, sub.index).level;
    const dominant = sub.pollutant === current.dominant;
    const { value, unit } = concentrationParts(sub.concentration);

    const fill = el('span', { class: 'meter-fill' });
    fill.style.setProperty('--pct', Math.min(100, (sub.index / top) * 100).toFixed(2));

    return el('li', { class: `pollutant level-${level}${dominant ? ' is-dominant' : ''}` }, [
      el('div', { class: 'pollutant-head' }, [
        el('h3', { class: 'pollutant-name' }, [el('abbr', { title: info.name }, [info.label])]),
        dominant && el('span', { class: 'badge' }, ['Main pollutant']),
      ]),
      el('p', { class: 'pollutant-value' }, [el('span', { class: 'pollutant-number' }, [value]), ' ', el('span', { class: 'pollutant-unit' }, [unit])]),
      el('span', { class: 'meter', 'aria-hidden': 'true' }, [fill]),
      el('p', { class: 'pollutant-index' }, [`Index ${sub.index}, ${sub.averagingHours}-hour average`]),
    ]);
  });

  return [el('ul', { class: 'pollutant-grid' }, cards)];
}
