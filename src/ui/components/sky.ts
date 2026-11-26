import { placeLabel, type Place } from '../../api/openMeteo';
import { getAdvice } from '../../domain/advice';
import { formatConcentration } from '../../domain/format';
import { POLLUTANTS } from '../../domain/pollutants';
import type { HealthProfile } from '../../domain/profile';
import { formatClock } from '../../domain/time';
import type { AirView } from '../../state/airView';
import { el } from '../dom';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SkyProps {
  readonly status: LoadStatus;
  readonly place: Place | null;
  readonly view: AirView | null;
  readonly profile: HealthProfile;
  readonly error: string | null;
}

export interface SkyContent {
  /** 0 when there is no reading, otherwise the AQI level 1–6 that tints the band. */
  readonly level: number;
  readonly nodes: Node[];
}

export const SKY_HEADING_ID = 'now-title';

const heading = (text: string) => el('h2', { id: SKY_HEADING_ID, class: 'sky-place', tabindex: -1 }, [text]);

function placeDetail(place: Place): string | null {
  const label = placeLabel(place);
  return label === place.name ? null : label.slice(place.name.length + 2);
}

/** Content of the "sky" band: the current reading, tinted by its level. */
export function renderSky({ status, place, view, profile, error }: SkyProps): SkyContent {
  if (!place) {
    return {
      level: 0,
      nodes: [
        el('div', { class: 'sky-intro' }, [
          heading('See the air where you are'),
          el('p', { class: 'sky-lede' }, [
            'Search for a city or use your location to get live air quality, a 48-hour outlook and advice for your day.',
          ]),
        ]),
      ],
    };
  }

  const detail = placeDetail(place);
  const header = el('div', { class: 'sky-header' }, [heading(place.name), detail && el('p', { class: 'sky-region' }, [detail])]);

  if (status === 'loading') {
    return { level: 0, nodes: [header, el('p', { class: 'sky-lede' }, ['Loading air quality…'])] };
  }
  if (status === 'error') {
    const retry = el('button', { type: 'button', class: 'button', 'data-action': 'retry' }, ['Try again']);
    return { level: 0, nodes: [header, el('p', { class: 'sky-lede' }, [error ?? 'Air quality could not be loaded.']), retry] };
  }

  const current = view?.current;
  if (!view || !current) {
    return {
      level: 0,
      nodes: [header, el('p', { class: 'sky-lede' }, ['There is not enough recent data to calculate the AQI here. Try a nearby city.'])],
    };
  }

  const advice = getAdvice(current.category.level, profile);
  const reading = el('div', { class: 'sky-reading' }, [
    header,
    el('p', { class: 'reading' }, [
      el('span', { class: 'reading-value' }, [current.value]),
      ' ',
      el('span', { class: 'reading-scale' }, [view.standard.shortName]),
    ]),
    el('p', { class: 'reading-category' }, [current.category.label]),
    el('p', { class: 'reading-verdict' }, [advice.headline]),
    el('p', { class: 'sky-meta' }, [
      `Local time ${formatClock(view.now)}. Model estimate from the Copernicus Atmosphere Monitoring Service.`,
    ]),
  ]);

  const pollutants = el(
    'dl',
    { class: 'pollutants', 'aria-label': 'Pollutant levels' },
    current.subIndices.map((sub) =>
      el('div', { class: sub.pollutant === current.dominant ? 'pollutant is-dominant' : 'pollutant' }, [
        el('dt', {}, [
          el('abbr', { title: POLLUTANTS[sub.pollutant].name }, [POLLUTANTS[sub.pollutant].label]),
          sub.pollutant === current.dominant ? el('span', { class: 'pollutant-note' }, [' main pollutant']) : null,
        ]),
        el('dd', {}, [
          el('span', { class: 'pollutant-value' }, [formatConcentration(sub.concentration)]),
          el('span', { class: 'pollutant-index' }, [`index ${sub.index}, ${sub.averagingHours}-hour average`]),
        ]),
      ]),
    ),
  );

  return { level: current.category.level, nodes: [reading, pollutants] };
}
