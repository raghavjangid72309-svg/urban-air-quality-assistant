import { afterEach, describe, expect, it } from 'vitest';
import { AQI_STANDARDS } from '../domain/aqi/standards';
import { DEFAULT_PROFILE } from '../domain/profile';
import { buildAirView } from '../state/airView';
import { axeViolations } from '../test-utils/a11y';
import { DELHI, hoursFrom, makeAirData, NOW_MS } from '../test-utils/fixtures';
import { forecastChart, smoothPath } from './chart';
import { renderAdvice } from './components/advicePanel';
import { chatMessage, suggestionButtons, typingIndicator } from './components/chat';
import { renderForecast } from './components/forecastPanel';
import { placeResults, profileFields } from './components/forms';
import { arcPath, renderHero, type HeroProps } from './components/hero';
import { renderPollutants } from './components/pollutantsPanel';
import { el } from './dom';

const VIEW = buildAirView(makeAirData({ pm2_5: 100 }), 'us', NOW_MS); // US AQI 182, unhealthy
const hero = (props: Partial<HeroProps>) =>
  renderHero({
    status: 'ready',
    standard: AQI_STANDARDS.us,
    place: DELHI,
    view: VIEW,
    profile: DEFAULT_PROFILE,
    error: null,
    ...props,
  });
const mount = (nodes: Node[]) => {
  const root = el('main');
  root.append(...nodes);
  document.body.replaceChildren(root);
  return root;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('renderHero', () => {
  it('invites a search before a place is chosen, with an empty decorative gauge', () => {
    const content = hero({ place: null, view: null, status: 'idle' });
    expect(content.level).toBe(0);
    const root = mount(content.nodes);
    expect(root.querySelector('h2')?.textContent).toBe('See the air where you are');
    expect(root.querySelector('.gauge')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelectorAll('.gauge-band')).toHaveLength(6);
    expect(root.querySelector('.gauge-progress')).toBeNull();
  });

  it('shows a skeleton while loading', () => {
    const root = mount(hero({ status: 'loading', view: null }).nodes);
    expect(root.textContent).toMatch(/Loading air quality/);
    expect(root.querySelector('.skeleton-lines')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.hero-gauge.is-loading')).not.toBeNull();
  });

  it('shows errors with a retry button', () => {
    const root = mount(hero({ status: 'error', view: null, error: 'Offline.' }).nodes);
    expect(root.textContent).toMatch(/Offline\./);
    expect(root.querySelector('[data-action="retry"]')).not.toBeNull();
    expect(mount(hero({ status: 'error', view: null }).nodes).textContent).toMatch(/could not be loaded/);
  });

  it('explains when no index can be calculated', () => {
    expect(mount(hero({ view: { ...VIEW, current: null } }).nodes).textContent).toMatch(/not enough recent data/);
  });

  it('shows the reading on the gauge with its category and quick advice', () => {
    const content = hero({});
    expect(content.level).toBe(4);
    const root = mount(content.nodes);
    expect(root.querySelector('.live')?.textContent).toBe('Latest hourly estimate');
    expect(root.querySelector('.hero-region')?.textContent).toBe('National Capital Territory of Delhi, India');
    expect(root.querySelector('.reading-category')?.textContent).toBe('Unhealthy');
    expect(root.querySelector('.reading-verdict')?.textContent).toBe('Cut back on long or intense outdoor activity today.');
    expect(root.querySelector('.gauge-caption')?.textContent).toBe('Main pollutant PM2.5');
    expect([...root.querySelectorAll('.fact-value')].map((n) => n.textContent)).toEqual([
      'Keep it short and light',
      'Worth it for long periods',
      'Air out at the cleanest time',
    ]);
  });

  it('labels the gauge for assistive technology and sets its fill', () => {
    const root = mount(hero({}).nodes);
    const gauge = root.querySelector<SVGSVGElement>('.gauge');
    expect(gauge?.getAttribute('role')).toBe('img');
    expect(gauge?.getAttribute('aria-label')).toBe('US AQI 182 out of 500: Unhealthy');
    expect(gauge?.style.getPropertyValue('--pct')).toBe('36.40');
    expect(root.querySelector('.gauge-progress')?.getAttribute('pathLength')).toBe('100');
  });

  it('keeps a stable copy of the number for screen readers', () => {
    const root = mount(hero({}).nodes);
    expect(root.querySelector('.reading-value')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.reading .visually-hidden')?.textContent).toBe('182');
  });

  it('omits the region line when the label is just the name', () => {
    const root = mount(hero({ place: { id: 0, name: 'Your location', latitude: 1, longitude: 1 } }).nodes);
    expect(root.querySelector('.hero-region')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    mount(hero({}).nodes);
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('arcPath', () => {
  it('uses the large-arc flag only for sweeps over 180°', () => {
    expect(arcPath(135, 405)).toMatch(/^M[\d.]+ [\d.]+ A84 84 0 1 1 /);
    expect(arcPath(135, 200)).toMatch(/ A84 84 0 0 1 /);
  });
});

describe('renderPollutants', () => {
  it('shows an empty state without data', () => {
    expect(mount(renderPollutants(null)).textContent).toMatch(/appear here once you choose a place/);
  });

  it('renders a card per pollutant, coloured by its own sub-index', () => {
    const root = mount(renderPollutants(VIEW));
    const cards = [...root.querySelectorAll<HTMLElement>('.pollutant')];
    expect(cards).toHaveLength(6);

    const [main] = cards;
    expect(main?.className).toBe('pollutant level-4 is-dominant');
    expect(main?.querySelector('.badge')?.textContent).toBe('Main pollutant');
    expect(main?.querySelector('.pollutant-number')?.textContent).toBe('100');
    expect(main?.querySelector('.pollutant-unit')?.textContent).toBe('µg/m³');
    expect(main?.querySelector<HTMLElement>('.meter-fill')?.style.getPropertyValue('--pct')).toBe('36.40');
    expect(main?.querySelector('.pollutant-index')?.textContent).toBe('Index 182, 24-hour average');

    expect(cards.slice(1).every((card) => card.querySelector('.badge') === null)).toBe(true);
    expect(cards.at(-1)?.className).toBe('pollutant level-1');
  });

  it('has no accessibility violations', async () => {
    mount(renderPollutants(VIEW));
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('renderForecast', () => {
  it('shows an empty state without data', () => {
    expect(mount(renderForecast(null)).textContent).toMatch(/appears here once you choose a place/);
  });

  it('summarises, charts and tabulates 48 hours', () => {
    const root = mount(renderForecast(VIEW));
    expect(root.querySelector('.forecast-summary')?.textContent).toMatch(/^Cleanest stretch in the next 24 hours: 20:00–22:00 today/);
    expect(root.querySelector('svg[role="img"] title')?.textContent).toBe('Hourly US AQI forecast');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(48);
  });

  it('marks missing hours in the table', () => {
    const gappy = { ...VIEW, forecast: [{ time: VIEW.now, value: null, level: null }] };
    expect(mount(renderForecast(gappy)).querySelector('tbody td')?.textContent).toBe('No data');
  });

  it('has no accessibility violations', async () => {
    mount(renderForecast(VIEW));
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('forecastChart', () => {
  const chart = (hours = VIEW.forecast, best: Parameters<typeof forecastChart>[2] = null) =>
    forecastChart(hours, VIEW.standard, best, 'summary', VIEW.today);

  it('draws one smooth line with a band-coloured gradient and an area beneath', () => {
    const svg = chart();
    expect(svg.querySelectorAll('.chart-line')).toHaveLength(1);
    expect(svg.querySelector('.chart-line')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+ C/);
    expect(svg.querySelectorAll('.chart-area')).toHaveLength(1);
    // Axis tops out at 200, so four bands (two stops each) colour the line.
    expect(svg.querySelectorAll('.chart-stop')).toHaveLength(8);
    expect([...svg.querySelectorAll('.chart-axis[text-anchor="end"]')].map((n) => n.textContent)).toEqual([
      '50',
      '100',
      '150',
      '200',
    ]);
  });

  it('gives every hour a tooltip and marks the current hour', () => {
    const svg = chart();
    const hits = svg.querySelectorAll('.chart-hit');
    expect(hits).toHaveLength(48);
    expect(hits[0]?.querySelector('title')?.textContent).toBe('20:00 today: US AQI 182, Unhealthy');
    expect(svg.querySelector('.chart-now')).not.toBeNull();
  });

  it('highlights the best window only when there is one', () => {
    expect(chart().querySelector('.chart-best')).toBeNull();
    const best = { start: VIEW.forecast[2]?.time ?? '', end: '2099-01-01T00:00', peak: 1, average: 1, level: 1 as const };
    expect(chart(VIEW.forecast, best).querySelector('.chart-best')).not.toBeNull();
  });

  it('breaks the line at gaps and dots isolated hours', () => {
    const hours = hoursFrom(VIEW.now, [80, 90, null, 120, 130, null, 60]);
    const svg = chart(hours);
    expect(svg.querySelectorAll('.chart-line')).toHaveLength(2);
    expect(svg.querySelectorAll('.chart-point')).toHaveLength(1);
    expect(svg.querySelectorAll('.chart-hit title')[2]?.textContent).toMatch(/no data$/);
  });

  it('skips the now marker when the current hour has no data', () => {
    expect(chart(hoursFrom(VIEW.now, [null, 50, 60])).querySelector('.chart-now')).toBeNull();
  });

  it('labels days without crowding the first one', () => {
    const days = [...chart().querySelectorAll('.chart-day')].map((n) => n.textContent);
    expect(days).toEqual(['Tomorrow', 'Saturday']);
  });
});

describe('smoothPath', () => {
  it('handles empty and single-point input', () => {
    expect(smoothPath([], 0, 100)).toBe('');
    expect(smoothPath([[1, 2]], 0, 100)).toBe('M1 2');
  });

  it('keeps control points inside the plot', () => {
    const path = smoothPath(
      [
        [0, 90],
        [10, 0],
        [20, 90],
      ],
      0,
      100,
    );
    const ys = [...path.matchAll(/C([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)].flatMap((m) => [Number(m[2]), Number(m[4])]);
    expect(ys.every((value) => value >= 0 && value <= 100)).toBe(true);
  });
});

describe('renderAdvice', () => {
  it('shows an empty state without a reading', () => {
    expect(mount(renderAdvice(null, DEFAULT_PROFILE)).textContent).toMatch(/appears here/);
  });

  it('shows the risk and actions with icons', () => {
    const root = mount(renderAdvice(VIEW, DEFAULT_PROFILE));
    expect(root.querySelector('.risk')?.textContent).toBe('High risk for most people.');
    const items = root.querySelectorAll('.actions li');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('speaks to the person when they have shared sensitivities', () => {
    const root = mount(renderAdvice(VIEW, { groups: ['heart'], activity: 'general' }));
    expect(root.querySelector('.risk')?.textContent).toBe('Very high risk for you, given what you told us.');
  });
});

describe('chat and forms', () => {
  it('renders messages with a hidden speaker label and optional points', () => {
    const user = chatMessage('user', 'Hi');
    expect(user.className).toBe('message message-user');
    expect(user.textContent).toBe('You asked:Hi');
    const reply = chatMessage('assistant', { text: 'Hello', points: ['One', 'Two'] });
    expect(reply.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a purely visual typing indicator', () => {
    const typing = typingIndicator();
    expect(typing.getAttribute('aria-hidden')).toBe('true');
    expect(typing.querySelectorAll('.typing-dot')).toHaveLength(3);
  });

  it('renders suggestion buttons carrying their question', () => {
    const [button] = suggestionButtons(['Do I need a mask?']);
    expect(button?.dataset.question).toBe('Do I need a mask?');
  });

  it('renders place results with their region', () => {
    const items = placeResults([DELHI, { id: 9, name: 'Nowhere', latitude: 0, longitude: 0 }]);
    expect(items[0]?.textContent).toBe('DelhiNational Capital Territory of Delhi, India');
    expect(items[1]?.querySelector('.result-region')).toBeNull();
  });

  it('renders profile fields reflecting the saved profile', async () => {
    const form = el('form', { 'aria-label': 'About you' });
    form.append(...profileFields({ groups: ['child'], activity: 'exercise' }));
    document.body.replaceChildren(el('main', {}, [form]));
    expect(form.querySelectorAll('input:checked')).toHaveLength(1);
    expect(form.querySelector('select')?.value).toBe('exercise');
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
