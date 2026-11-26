import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../domain/profile';
import { buildAirView } from '../state/airView';
import { axeViolations } from '../test-utils/a11y';
import { DELHI, makeAirData, NOW_MS } from '../test-utils/fixtures';
import { forecastChart } from './chart';
import { renderAdvice } from './components/advicePanel';
import { chatMessage, suggestionButtons } from './components/chat';
import { renderForecast } from './components/forecastPanel';
import { placeResults, profileFields } from './components/forms';
import { renderSky, type SkyProps } from './components/sky';
import { el } from './dom';

const VIEW = buildAirView(makeAirData({ pm2_5: 100 }), 'us', NOW_MS);
const sky = (props: Partial<SkyProps>) =>
  renderSky({ status: 'ready', place: DELHI, view: VIEW, profile: DEFAULT_PROFILE, error: null, ...props });
const mount = (nodes: Node[]) => {
  const root = el('main');
  root.append(...nodes);
  document.body.replaceChildren(root);
  return root;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('renderSky', () => {
  it('invites a search before a place is chosen', () => {
    const content = sky({ place: null, view: null, status: 'idle' });
    expect(content.level).toBe(0);
    expect(mount(content.nodes).textContent).toMatch(/See the air where you are/);
  });

  it('shows loading and error states with a retry button', () => {
    expect(mount(sky({ status: 'loading', view: null }).nodes).textContent).toMatch(/Loading air quality/);
    const root = mount(sky({ status: 'error', view: null, error: 'Offline.' }).nodes);
    expect(root.textContent).toMatch(/Offline\./);
    expect(root.querySelector('[data-action="retry"]')).not.toBeNull();
    expect(mount(sky({ status: 'error', view: null }).nodes).textContent).toMatch(/could not be loaded/);
  });

  it('explains when no index can be calculated', () => {
    expect(mount(sky({ view: { ...VIEW, current: null } }).nodes).textContent).toMatch(/not enough recent data/);
  });

  it('shows the reading, its category, advice and pollutants', () => {
    const content = sky({});
    expect(content.level).toBe(4);
    const root = mount(content.nodes);
    expect(root.querySelector('.reading-value')?.textContent).toBe('182');
    expect(root.querySelector('.reading-category')?.textContent).toBe('Unhealthy');
    expect(root.querySelector('.sky-region')?.textContent).toBe('National Capital Territory of Delhi, India');
    expect(root.querySelectorAll('.pollutant')).toHaveLength(6);
    expect(root.querySelector('.is-dominant dt')?.textContent).toMatch(/PM2\.5 main pollutant/);
  });

  it('omits the region line when the label is just the name', () => {
    const root = mount(sky({ place: { id: 0, name: 'Your location', latitude: 1, longitude: 1 } }).nodes);
    expect(root.querySelector('.sky-region')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    mount(sky({}).nodes);
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
  it('draws one bar per known hour and highlights the best window', () => {
    const chart = forecastChart(VIEW.forecast, VIEW.standard, null, 'summary', VIEW.today);
    expect(chart.querySelectorAll('.chart-bar')).toHaveLength(48);
    expect(chart.querySelector('.chart-best')).toBeNull();

    const best = { start: VIEW.forecast[2]?.time ?? '', end: '2099-01-01T00:00', peak: 1, average: 1, level: 1 as const };
    const highlighted = forecastChart(VIEW.forecast, VIEW.standard, best, 'summary', VIEW.today);
    expect(highlighted.querySelector('.chart-best')).not.toBeNull();
  });

  it('labels days without crowding the first one', () => {
    const chart = forecastChart(VIEW.forecast, VIEW.standard, null, 'summary', VIEW.today);
    const days = [...chart.querySelectorAll('.chart-day')].map((n) => n.textContent);
    expect(days).toEqual(['Tomorrow', 'Saturday']);
  });
});

describe('renderAdvice', () => {
  it('shows an empty state without a reading', () => {
    expect(mount(renderAdvice(null, DEFAULT_PROFILE)).textContent).toMatch(/appears here/);
  });

  it('shows risk, quick facts and actions', () => {
    const root = mount(renderAdvice(VIEW, DEFAULT_PROFILE));
    expect(root.querySelector('.risk')?.textContent).toBe('High risk for most people.');
    expect(root.querySelectorAll('.quick-facts dd')).toHaveLength(3);
    expect(root.querySelectorAll('.actions li').length).toBeGreaterThan(0);
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
