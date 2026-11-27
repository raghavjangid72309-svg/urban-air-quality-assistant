import { describe, expect, it, vi } from 'vitest';
import html from '../index.html?raw';
import { ApiError } from './api/http';
import type { AirQualityData, OpenMeteoClient, Place } from './api/openMeteo';
import { MY_LOCATION_ID, startApp, TYPING_DELAY_MS, type AppDependencies } from './app';
import { STORAGE_KEY } from './state/preferences';
import { axeViolations } from './test-utils/a11y';
import { DELHI, fakeClient, flush, makeAirData, memoryStorage, NOW_MS } from './test-utils/fixtures';

const POLLUTED = makeAirData({ pm2_5: 100 });

/** Replaces the test document with the real page shell from index.html. */
function loadShell(): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
}

function setup(overrides: Partial<AppDependencies> = {}) {
  loadShell();
  let time = NOW_MS;
  const deps = {
    client: fakeClient({ getAirQuality: vi.fn(() => Promise.resolve(POLLUTED)) }),
    storage: memoryStorage(),
    geolocation: null,
    now: () => time,
    locale: 'en-US',
    timeZone: 'America/New_York',
    ...overrides,
  } satisfies AppDependencies;
  const app = startApp(document, deps);
  return { app, deps, advance: (ms: number) => (time += ms) };
}

function $<T extends Element = HTMLElement>(selector: string, type?: new () => T): T {
  const node = document.querySelector(selector);
  if (!node || !(node instanceof (type ?? HTMLElement))) throw new Error(`Missing ${selector}`);
  return node as T;
}

function submit(formSelector: string, inputSelector: string, value: string): void {
  $(inputSelector, HTMLInputElement).value = value;
  $(formSelector).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const savedPrefs = (storage: Storage | null): unknown => JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');

describe('first visit', () => {
  it('renders the shell with empty states and defaults', async () => {
    setup();
    expect($('#now-title').textContent).toBe('See the air where you are');
    expect($('#now').dataset.level).toBe('0');
    expect($('input[value="us"]', HTMLInputElement).checked).toBe(true);
    expect(document.querySelectorAll('#profile-form input[type="checkbox"]')).toHaveLength(6);
    expect(document.querySelectorAll('#suggestions button')).toHaveLength(4);
    expect(document.querySelectorAll('#chat-log .message')).toHaveLength(1);
    expect(await axeViolations(document, true)).toEqual([]);
  });

  it('defaults to the India scale for Indian users', () => {
    setup({ locale: 'en-IN' });
    expect($('input[value="in"]', HTMLInputElement).checked).toBe(true);
  });
});

describe('searching', () => {
  it('lists matching places', async () => {
    setup();
    submit('#search-form', '#city', 'Delhi');
    await flush();
    expect($('#results').hidden).toBe(false);
    expect(document.querySelectorAll('#results button')).toHaveLength(1);
    expect($('#search-status').textContent).toBe('1 place found. Choose one from the list.');
  });

  it('pluralises the result count', async () => {
    const other: Place = { ...DELHI, id: 2, name: 'Delhi Cantonment' };
    const { app } = setup({ client: fakeClient({ searchPlaces: () => Promise.resolve([DELHI, other]) }) });
    await app.search('Delhi');
    expect($('#search-status').textContent).toBe('2 places found. Choose one from the list.');
  });

  it('asks for a usable query', async () => {
    const searchPlaces = vi.fn<OpenMeteoClient['searchPlaces']>();
    setup({ client: fakeClient({ searchPlaces }) });
    submit('#search-form', '#city', '?');
    await flush();
    expect($('#city').getAttribute('aria-invalid')).toBe('true');
    expect($('#search-status').classList.contains('is-error')).toBe(true);
    expect(document.activeElement).toBe($('#city'));
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    const { app } = setup({ client: fakeClient({ searchPlaces: () => Promise.resolve([]) }) });
    await app.search('Atlantis');
    expect($('#results').hidden).toBe(true);
    expect($('#search-status').textContent).toMatch(/No places match “Atlantis”/);
  });

  it('explains failures', async () => {
    const { app } = setup({
      client: fakeClient({ searchPlaces: () => Promise.reject(new ApiError('network', 'offline')) }),
    });
    await app.search('Delhi');
    expect($('#search-status').textContent).toMatch(/Check your internet connection/);
    expect($('#search-status').classList.contains('is-error')).toBe(true);
  });

  it('ignores responses to searches that were replaced', async () => {
    const slow = deferred<Place[]>();
    const searchPlaces = vi
      .fn<OpenMeteoClient['searchPlaces']>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce([{ ...DELHI, name: 'Mumbai' }]);
    const { app } = setup({ client: fakeClient({ searchPlaces }) });

    const first = app.search('Delhi');
    await app.search('Mumbai');
    slow.resolve([DELHI]);
    await first;
    expect($('#results').textContent).toMatch(/Mumbai/);
    expect($('#results').textContent).not.toMatch(/^Delhi/);
  });
});

describe('choosing a place', () => {
  it('loads and shows the air quality, then moves focus to it', async () => {
    const { deps } = setup();
    submit('#search-form', '#city', 'Delhi');
    await flush();
    $('#results button').click();
    await flush();

    expect($('#now').dataset.level).toBe('4');
    expect(document.documentElement.dataset.level).toBe('4');
    expect(document.querySelectorAll('#pollutants-body .pollutant')).toHaveLength(6);
    expect($('.reading-value').textContent).toBe('182');
    expect($('.reading-category').textContent).toBe('Unhealthy');
    expect($('#search-status').textContent).toBe('Showing Delhi: 182 on the US scale, unhealthy.');
    expect(document.activeElement).toBe($('#now-title'));
    expect($('#results').hidden).toBe(true);
    expect(document.querySelectorAll('#forecast-body tbody tr')).toHaveLength(48);
    expect(savedPrefs(deps.storage)).toMatchObject({ lastPlace: { name: 'Delhi' } });
    expect(await axeViolations(document, true)).toEqual([]);
  });

  it('shows an error with a working retry button', async () => {
    const getAirQuality = vi
      .fn<OpenMeteoClient['getAirQuality']>()
      .mockRejectedValueOnce(new ApiError('http', 'down', 500))
      .mockResolvedValueOnce(POLLUTED);
    const { app } = setup({ client: fakeClient({ getAirQuality }) });

    await app.selectPlace(DELHI);
    expect(app.getState().status).toBe('error');
    expect($('#now-body').textContent).toMatch(/having trouble/);

    $('[data-action="retry"]').click();
    await flush();
    expect($('.reading-value').textContent).toBe('182');
    expect(document.activeElement).toBe($('#now-title'));
  });

  it('reports when the index cannot be calculated', async () => {
    const { app } = setup({
      client: fakeClient({ getAirQuality: () => Promise.resolve(makeAirData({ pm2_5: null, pm10: null })) }),
    });
    updateRadio('in');
    await app.selectPlace(DELHI);
    expect($('#search-status').textContent).toBe('Showing Delhi.');
    expect($('#now-body').textContent).toMatch(/not enough recent data/);
  });

  it('ignores a slow response for a place that is no longer selected', async () => {
    const slow = deferred<AirQualityData>();
    const getAirQuality = vi
      .fn<OpenMeteoClient['getAirQuality']>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(POLLUTED);
    const { app } = setup({ client: fakeClient({ getAirQuality }) });

    const first = app.selectPlace({ ...DELHI, id: 1, name: 'Agra' });
    await app.selectPlace(DELHI);
    slow.resolve(makeAirData());
    await first;
    expect($('#now-title').textContent).toBe('Delhi');
    expect($('.reading-value').textContent).toBe('182');
  });

  it('renders place names as text, never as markup', async () => {
    const hostile: Place = { ...DELHI, name: '<img src=x onerror=alert(1)>' };
    const { app } = setup({ client: fakeClient({ searchPlaces: () => Promise.resolve([hostile]) }) });
    await app.search('Delhi');
    await app.selectPlace(hostile);
    expect(document.querySelector('img')).toBeNull();
    expect($('#now-title').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('restores the last place on the next visit', async () => {
    const getAirQuality = vi.fn(() => Promise.resolve(POLLUTED));
    setup({
      client: fakeClient({ getAirQuality }),
      storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify({ standard: 'in', lastPlace: DELHI }) }),
    });
    await flush();
    expect(getAirQuality).toHaveBeenCalledWith(DELHI.latitude, DELHI.longitude);
    expect($('.reading-scale').textContent).toBe('India AQI');
  });
});

function updateRadio(value: 'us' | 'in'): void {
  const radio = $(`input[name="standard"][value="${value}"]`, HTMLInputElement);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('preferences', () => {
  it('switches the AQI scale and remembers it', async () => {
    const { app, deps } = setup();
    await app.selectPlace(DELHI);
    updateRadio('in');
    expect($('.reading-scale').textContent).toBe('India AQI');
    expect($('.reading-category').textContent).toBe('Poor');
    expect(savedPrefs(deps.storage)).toMatchObject({ standard: 'in' });
  });

  it('tailors advice to the profile', async () => {
    const { app, deps } = setup();
    await app.selectPlace(DELHI);
    const asthma = $('input[value="respiratory"]', HTMLInputElement);
    asthma.checked = true;
    asthma.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('.risk').textContent).toBe('Very high risk for you, given what you told us.');
    expect(savedPrefs(deps.storage)).toMatchObject({ profile: { groups: ['respiratory'], activity: 'general' } });

    const activity = $('#activity', HTMLSelectElement);
    activity.value = 'exercise';
    activity.dispatchEvent(new Event('change', { bubbles: true }));
    expect(savedPrefs(deps.storage)).toMatchObject({ profile: { activity: 'exercise' } });
  });

  it('never submits the profile form', () => {
    setup();
    const event = new Event('submit', { cancelable: true });
    $('#profile-form').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('assistant', () => {
  it('answers typed questions and clears the box', async () => {
    const { app } = setup();
    await app.selectPlace(DELHI);
    submit('#chat-form', '#question', 'Do I need a mask?');
    const messages = document.querySelectorAll('#chat-log .message');
    expect(messages).toHaveLength(3);
    expect(messages[1]?.textContent).toBe('You asked:Do I need a mask?');
    expect(messages[2]?.textContent).toMatch(/good idea if you'll be outside for a long time/);
    expect($('#question', HTMLInputElement).value).toBe('');
  });

  it('ignores empty questions', () => {
    setup();
    submit('#chat-form', '#question', '   ');
    expect(document.querySelectorAll('#chat-log .message')).toHaveLength(1);
  });

  it('answers suggested questions', async () => {
    const { app } = setup();
    await app.selectPlace(DELHI);
    $('#suggestions button').click();
    expect($('#chat-log').lastElementChild?.textContent).toMatch(/Right now in Delhi the US AQI is 182/);
  });

  it('keeps the conversation to a bounded length', () => {
    const { app } = setup();
    for (let i = 0; i < 40; i += 1) app.askQuestion('hello');
    expect(document.querySelectorAll('#chat-log .message').length).toBeLessThanOrEqual(60);
  });
});

describe('location', () => {
  function geolocation(outcome: { coords?: { latitude: number; longitude: number }; code?: number }): Geolocation {
    return {
      getCurrentPosition: (success, error) => {
        if (outcome.coords) success({ coords: outcome.coords } as GeolocationPosition);
        else error?.({ code: outcome.code ?? 2 } as GeolocationPositionError);
      },
      watchPosition: () => 0,
      clearWatch: () => undefined,
    };
  }

  it('uses rounded coordinates from the browser', async () => {
    const getAirQuality = vi.fn(() => Promise.resolve(POLLUTED));
    const { app } = setup({
      client: fakeClient({ getAirQuality }),
      geolocation: geolocation({ coords: { latitude: 28.613_94, longitude: 77.209_02 } }),
    });
    $('#locate').click();
    await flush();
    expect(getAirQuality).toHaveBeenCalledWith(28.61, 77.21);
    expect(app.getState().place?.id).toBe(MY_LOCATION_ID);
    expect($('#now-title').textContent).toBe('Your location');

    app.askQuestion('How is the air?');
    expect($('#chat-log').lastElementChild?.textContent).toMatch(/Right now in your area/);
  });

  it.each([
    [1, /blocked/],
    [2, /could not be found/],
  ])('explains geolocation error %d', (code, message) => {
    setup({ geolocation: geolocation({ code }) });
    $('#locate').click();
    expect($('#search-status').textContent).toMatch(message);
  });

  it('explains when location is unavailable', () => {
    setup();
    $('#locate').click();
    expect($('#search-status').textContent).toMatch(/not available in this browser/);
  });

  it('ignores repeat clicks while locating', () => {
    const getCurrentPosition = vi.fn();
    setup({ geolocation: { getCurrentPosition, watchPosition: () => 0, clearWatch: () => undefined } });
    $('#locate').click();
    $('#locate').click();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe('reveal animation', () => {
  it('plays when a new reading arrives, not when only the profile changes', async () => {
    const { app } = setup();
    await app.selectPlace(DELHI);
    expect($('#now').classList.contains('is-revealing')).toBe(true);
    expect($('#forecast-body').classList.contains('is-revealing')).toBe(true);
    expect($('#pollutants-body').classList.contains('is-revealing')).toBe(true);

    const heart = $('input[value="heart"]', HTMLInputElement);
    heart.checked = true;
    heart.dispatchEvent(new Event('change', { bubbles: true }));
    expect($('#now').classList.contains('is-revealing')).toBe(false);
    expect($('#forecast-body').classList.contains('is-revealing')).toBe(false);

    updateRadio('in');
    expect($('#now').classList.contains('is-revealing')).toBe(true);
  });

  it('shows a loading state while data is on its way', async () => {
    const pending = deferred<AirQualityData>();
    const { app } = setup({ client: fakeClient({ getAirQuality: () => pending.promise }) });
    const loading = app.selectPlace(DELHI);
    expect($('#now').getAttribute('aria-busy')).toBe('true');
    pending.resolve(POLLUTED);
    await loading;
    expect($('#now').getAttribute('aria-busy')).toBe('false');
  });

  it('counts the number from the previous reading when the scale changes', async () => {
    const frames: FrameRequestCallback[] = [];
    const win = window as unknown as Record<string, unknown>;
    const original = { matchMedia: win.matchMedia, raf: win.requestAnimationFrame };
    win.matchMedia = () => ({ matches: false });
    win.requestAnimationFrame = (callback: FrameRequestCallback) => frames.push(callback);
    try {
      const { app } = setup();
      await app.selectPlace(DELHI);
      expect($('.reading-value').textContent).toBe('0');
      for (const frame of frames.splice(0)) frame(0);
      for (const frame of frames.splice(0)) frame(5000);
      expect($('.reading-value').textContent).toBe('182');

      updateRadio('in');
      expect($('.reading-value').textContent).toBe('182');
      expect($('.reading .visually-hidden').textContent).toBe('233');
    } finally {
      win.matchMedia = original.matchMedia;
      win.requestAnimationFrame = original.raf;
    }
  });
});

describe('pause control', () => {
  it('pauses looping animation and remembers the choice', () => {
    const { deps } = setup();
    const toggle = $('#motion-toggle', HTMLButtonElement);
    expect(toggle.textContent).toBe('Pause animation');

    toggle.click();
    expect(document.documentElement.classList.contains('motion-paused')).toBe(true);
    expect(toggle.textContent).toBe('Play animation');
    expect(savedPrefs(deps.storage)).toMatchObject({ motionPaused: true });

    toggle.click();
    expect(document.documentElement.classList.contains('motion-paused')).toBe(false);
    expect(toggle.textContent).toBe('Pause animation');
  });

  it('starts paused when the user paused it last time', () => {
    setup({ storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify({ motionPaused: true }) }) });
    expect(document.documentElement.classList.contains('motion-paused')).toBe(true);
    expect($('#motion-toggle').textContent).toBe('Play animation');
  });
});

describe('typing indicator', () => {
  function withMotion(run: () => void) {
    const win = window as unknown as Record<string, unknown>;
    const original = win.matchMedia;
    win.matchMedia = () => ({ matches: false });
    vi.useFakeTimers();
    try {
      run();
    } finally {
      vi.useRealTimers();
      win.matchMedia = original;
    }
  }

  it('shows typing dots before the answer when motion is allowed', () => {
    withMotion(() => {
      const { app } = setup();
      app.askQuestion('hello');
      expect(document.querySelector('#chat-log .message-typing')).not.toBeNull();
      expect($('#chat-log').lastElementChild?.textContent).toBe('');

      vi.advanceTimersByTime(TYPING_DELAY_MS);
      expect(document.querySelector('#chat-log .message-typing')).toBeNull();
      expect($('#chat-log').lastElementChild?.textContent).toMatch(/^AirWise:Hello!/);
    });
  });

  it('answers straight away when animation is paused', () => {
    withMotion(() => {
      const { app } = setup({ storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify({ motionPaused: true }) }) });
      app.askQuestion('hello');
      expect(document.querySelector('#chat-log .message-typing')).toBeNull();
      expect($('#chat-log').lastElementChild?.textContent).toMatch(/^AirWise:Hello!/);
    });
  });
});

describe('refreshIfStale', () => {
  it('refetches only after 30 minutes', async () => {
    const getAirQuality = vi.fn(() => Promise.resolve(POLLUTED));
    const { app, advance } = setup({ client: fakeClient({ getAirQuality }) });

    await app.refreshIfStale();
    expect(getAirQuality).not.toHaveBeenCalled();

    await app.selectPlace(DELHI);
    advance(10 * 60 * 1000);
    await app.refreshIfStale();
    expect(getAirQuality).toHaveBeenCalledTimes(1);

    advance(25 * 60 * 1000);
    await app.refreshIfStale();
    expect(getAirQuality).toHaveBeenCalledTimes(2);
  });
});
