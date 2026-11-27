import { placeLabel, type Place } from '../../api/openMeteo';
import { getAdvice, type ExerciseGuidance, type MaskGuidance, type WindowGuidance } from '../../domain/advice';
import type { AqiResult } from '../../domain/aqi/calculate';
import type { AqiStandard } from '../../domain/aqi/standards';
import { POLLUTANTS } from '../../domain/pollutants';
import type { HealthProfile } from '../../domain/profile';
import { formatClock } from '../../domain/time';
import type { AirView } from '../../state/airView';
import { el, svg } from '../dom';
import { icon, type IconName } from '../icons';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface HeroProps {
  readonly status: LoadStatus;
  /** Scale in use, so the empty gauge can show its bands before any data arrives. */
  readonly standard: AqiStandard;
  readonly place: Place | null;
  readonly view: AirView | null;
  readonly profile: HealthProfile;
  readonly error: string | null;
}

export interface HeroContent {
  /** 0 when there is no reading, otherwise the AQI level 1–6 that tints the page. */
  readonly level: number;
  readonly nodes: Node[];
}

export const HERO_HEADING_ID = 'now-title';

export const EXERCISE_TEXT: Readonly<Record<ExerciseGuidance, string>> = {
  go: 'Go ahead',
  'take-it-easy': 'Fine, take it easier',
  reduce: 'Keep it short and light',
  avoid: 'Move it indoors',
  'stay-indoors': 'Stay indoors',
};

export const MASK_TEXT: Readonly<Record<MaskGuidance, string>> = {
  'not-needed': 'Not needed',
  optional: 'Worth it for long periods',
  recommended: 'Wear an N95 or FFP2',
};

export const WINDOW_TEXT: Readonly<Record<WindowGuidance, string>> = {
  open: 'Open them up',
  limit: 'Air out at the cleanest time',
  closed: 'Keep them shut',
};

/* Gauge geometry: a 270° arc open at the bottom, on a 200 × 200 canvas. */
const CENTRE = 100;
const RADIUS = 84;
const START_ANGLE = 135;
const SWEEP = 270;
const BAND_GAP = 1.6;

function pointAt(angle: number): [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTRE + RADIUS * Math.cos(radians), CENTRE + RADIUS * Math.sin(radians)];
}

/** SVG arc path between two angles (degrees, clockwise from 3 o'clock). */
export function arcPath(from: number, to: number): string {
  const [x1, y1] = pointAt(from);
  const [x2, y2] = pointAt(to);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Circular AQI gauge: one coloured band per category (sized by its range), and
 * a progress arc plus knob that CSS sweeps round to the reading.
 */
export function aqiGauge(standard: AqiStandard, current: AqiResult | null): SVGSVGElement {
  const top = standard.categories.at(-1)?.max ?? 500;
  const span = top + 1;

  const bands = standard.categories.map((category, index, all) => {
    const from = START_ANGLE + (category.min / span) * SWEEP + (index === 0 ? 0 : BAND_GAP / 2);
    const to = START_ANGLE + ((category.max + 1) / span) * SWEEP - (index === all.length - 1 ? 0 : BAND_GAP / 2);
    return svg('path', { class: `gauge-band level-${category.level}`, d: arcPath(from, to) });
  });

  const fullArc = arcPath(START_ANGLE, START_ANGLE + SWEEP);
  const [knobX, knobY] = pointAt(START_ANGLE);

  const root = svg('svg', { class: 'gauge', viewBox: '0 0 200 200', focusable: 'false' }, [
    svg('path', { class: 'gauge-track', d: fullArc }),
    ...bands,
  ]);

  if (!current) {
    root.setAttribute('aria-hidden', 'true');
    return root;
  }

  const percent = Math.min(100, (current.value / top) * 100);
  root.style.setProperty('--pct', percent.toFixed(2));
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `${standard.shortName} ${current.value} out of ${top}: ${current.category.label}`);
  root.append(
    svg('path', { class: 'gauge-progress', d: fullArc, pathLength: 100 }),
    svg('g', { class: 'gauge-knob' }, [
      svg('circle', { class: 'gauge-knob-glow', cx: knobX.toFixed(2), cy: knobY.toFixed(2), r: 13 }),
      svg('circle', { class: 'gauge-knob-dot', cx: knobX.toFixed(2), cy: knobY.toFixed(2), r: 7 }),
    ]),
  );
  return root;
}

const heading = (text: string) => el('h2', { id: HERO_HEADING_ID, class: 'hero-place', tabindex: -1 }, [text]);

function placeDetail(place: Place): string | null {
  const label = placeLabel(place);
  return label === place.name ? null : label.slice(place.name.length + 2);
}

function head(place: Place, live: AqiResult | null): HTMLElement {
  const detail = placeDetail(place);
  return el('div', { class: 'hero-head' }, [
    live &&
      el('p', { class: 'live' }, [
        el('span', { class: 'live-dot', 'aria-hidden': 'true' }),
        'Latest hourly estimate',
      ]),
    heading(place.name),
    detail && el('p', { class: 'hero-region' }, [icon('pin'), detail]),
  ]);
}

function emptyGauge(standard: AqiStandard, state: 'idle' | 'loading'): HTMLElement {
  return el('div', { class: `hero-gauge is-${state}` }, [
    aqiGauge(standard, null),
    el('div', { class: 'gauge-centre', 'aria-hidden': 'true' }, [
      el('span', { class: 'gauge-placeholder' }, ['--']),
      el('span', { class: 'reading-scale' }, ['AQI']),
    ]),
  ]);
}

function fact(iconName: IconName, label: string, value: string): HTMLElement {
  return el('li', { class: 'fact' }, [
    el('span', { class: 'fact-icon' }, [icon(iconName)]),
    el('span', { class: 'fact-text' }, [el('span', { class: 'fact-label' }, [label]), el('span', { class: 'fact-value' }, [value])]),
  ]);
}

/** Content of the hero card for each loading state. */
export function renderHero({ status, standard, place, view, profile, error }: HeroProps): HeroContent {
  if (!place) {
    return {
      level: 0,
      nodes: [
        el('div', { class: 'hero-head' }, [
          heading('See the air where you are'),
          el('p', { class: 'hero-lede' }, [
            'Search for a city or use your location to get live air quality, a 48-hour outlook and advice for your day.',
          ]),
        ]),
        emptyGauge(standard, 'idle'),
      ],
    };
  }

  if (status === 'loading') {
    return {
      level: 0,
      nodes: [
        head(place, null),
        emptyGauge(standard, 'loading'),
        el('div', { class: 'hero-details' }, [
          el('p', { class: 'hero-lede' }, ['Loading air quality…']),
          el('div', { class: 'skeleton-lines', 'aria-hidden': 'true' }, [
            el('span', { class: 'skeleton' }),
            el('span', { class: 'skeleton' }),
            el('span', { class: 'skeleton' }),
          ]),
        ]),
      ],
    };
  }

  if (status === 'error') {
    return {
      level: 0,
      nodes: [
        head(place, null),
        el('div', { class: 'hero-details' }, [
          el('p', { class: 'hero-lede' }, [error ?? 'Air quality could not be loaded.']),
          el('button', { type: 'button', class: 'button', 'data-action': 'retry' }, ['Try again']),
        ]),
      ],
    };
  }

  const current = view?.current;
  if (!view || !current) {
    return {
      level: 0,
      nodes: [
        head(place, null),
        el('div', { class: 'hero-details' }, [
          el('p', { class: 'hero-lede' }, ['There is not enough recent data to calculate the AQI here. Try a nearby city.']),
        ]),
      ],
    };
  }

  const advice = getAdvice(current.category.level, profile);
  const main = POLLUTANTS[current.dominant];

  const gauge = el('div', { class: 'hero-gauge' }, [
    aqiGauge(view.standard, current),
    el('div', { class: 'gauge-centre reading' }, [
      // The visible number may count up; assistive technology reads the stable copy.
      el('span', { class: 'reading-value', 'aria-hidden': 'true' }, [current.value]),
      el('span', { class: 'visually-hidden' }, [current.value]),
      el('span', { class: 'reading-scale' }, [view.standard.shortName]),
    ]),
    el('p', { class: 'gauge-caption' }, ['Main pollutant ', el('abbr', { title: main.name }, [main.label])]),
  ]);

  const details = el('div', { class: 'hero-details' }, [
    el('p', { class: 'reading-category' }, [current.category.label]),
    el('p', { class: 'reading-verdict' }, [advice.headline]),
    el('ul', { class: 'facts', 'aria-label': 'Quick advice' }, [
      fact('activity', 'Outdoor exercise', EXERCISE_TEXT[advice.exercise]),
      fact('mask', 'Mask', MASK_TEXT[advice.mask]),
      fact('window', 'Windows', WINDOW_TEXT[advice.windows]),
    ]),
    el('p', { class: 'hero-meta' }, [
      icon('clock'),
      `Local time ${formatClock(view.now)}. Model estimate from the Copernicus Atmosphere Monitoring Service.`,
    ]),
  ]);

  return { level: current.category.level, nodes: [head(place, current), gauge, details] };
}
