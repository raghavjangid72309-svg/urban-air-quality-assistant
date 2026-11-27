import { describeError } from './api/http';
import { roundCoordinate, sanitizeQuery, type AirQualityData, type OpenMeteoClient, type Place } from './api/openMeteo';
import { MAX_QUESTION_LENGTH } from './assistant/intents';
import { ask, SAMPLE_QUESTIONS, type AssistantContext } from './assistant/respond';
import { AQI_STANDARDS, isAqiStandardId } from './domain/aqi/standards';
import { isActivity, isSensitivityGroup, type HealthProfile } from './domain/profile';
import { buildAirView, type AirView } from './state/airView';
import {
  defaultPreferences,
  defaultStandard,
  loadPreferences,
  savePreferences,
  type Preferences,
} from './state/preferences';
import { createStore } from './state/store';
import { renderAdvice } from './ui/components/advicePanel';
import { chatMessage, suggestionButtons, typingIndicator } from './ui/components/chat';
import { renderForecast } from './ui/components/forecastPanel';
import { placeResults, profileFields } from './ui/components/forms';
import { HERO_HEADING_ID, renderHero, type LoadStatus } from './ui/components/hero';
import { renderPollutants } from './ui/components/pollutantsPanel';
import { byId } from './ui/dom';
import { animateNumber, prefersReducedMotion } from './ui/motion';
import { revealOnScroll } from './ui/reveal';

export interface AppState {
  readonly prefs: Preferences;
  readonly place: Place | null;
  readonly data: AirQualityData | null;
  readonly fetchedAt: number | null;
  readonly status: LoadStatus;
  readonly error: string | null;
}

export interface AppDependencies {
  readonly client: OpenMeteoClient;
  readonly storage: Storage | null;
  readonly geolocation: Geolocation | null;
  readonly now?: () => number;
  readonly locale?: string;
  readonly timeZone?: string;
}

export interface App {
  getState(): AppState;
  search(query: string): Promise<void>;
  selectPlace(place: Place, options?: { focus?: boolean }): Promise<void>;
  locate(): void;
  askQuestion(question: string): void;
  refreshIfStale(): Promise<void>;
}

/** Id given to the place created from the browser's location. */
export const MY_LOCATION_ID = 0;
const STALE_AFTER_MS = 30 * 60 * 1000;
const MAX_MESSAGES = 60;
/** How long the typing indicator shows before an answer, when motion is allowed. */
export const TYPING_DELAY_MS = 650;
const PERMISSION_DENIED = 1;

/** Wires the static page shell in `index.html` to state, data and rendering. */
export function startApp(doc: Document, deps: AppDependencies): App {
  const now = deps.now ?? Date.now;
  const fallback = defaultPreferences(defaultStandard(deps.locale, deps.timeZone));
  const store = createStore<AppState>({
    prefs: loadPreferences(deps.storage, fallback),
    place: null,
    data: null,
    fetchedAt: null,
    status: 'idle',
    error: null,
  });

  const ui = {
    searchForm: byId(doc, 'search-form', HTMLFormElement),
    cityInput: byId(doc, 'city', HTMLInputElement),
    locateButton: byId(doc, 'locate', HTMLButtonElement),
    searchStatus: byId(doc, 'search-status', HTMLElement),
    results: byId(doc, 'results', HTMLUListElement),
    hero: byId(doc, 'now', HTMLElement),
    heroBody: byId(doc, 'now-body', HTMLElement),
    pollutantsBody: byId(doc, 'pollutants-body', HTMLElement),
    forecastBody: byId(doc, 'forecast-body', HTMLElement),
    adviceBody: byId(doc, 'advice-body', HTMLElement),
    chatLog: byId(doc, 'chat-log', HTMLElement),
    chatForm: byId(doc, 'chat-form', HTMLFormElement),
    question: byId(doc, 'question', HTMLInputElement),
    suggestions: byId(doc, 'suggestions', HTMLElement),
    profileForm: byId(doc, 'profile-form', HTMLFormElement),
    standardSwitch: byId(doc, 'standard-switch', HTMLFieldSetElement),
    motionToggle: byId(doc, 'motion-toggle', HTMLButtonElement),
  };

  let results: readonly Place[] = [];
  let searchToken = 0;
  let loadToken = 0;
  let locating = false;

  // Animation bookkeeping: reveal only when the reading itself changes.
  let revealedKey: string | null = null;
  let lastShown: { placeId: number; value: number } | null = null;
  let stopCounting: () => void = () => undefined;

  // The view only changes with the data, the scale or the hour, so it is memoised.
  let memo: { data: AirQualityData; standard: string; hour: number; view: AirView } | null = null;
  function viewFor(state: AppState): AirView | null {
    if (!state.data || state.status !== 'ready') return null;
    const hour = Math.floor(now() / 3_600_000);
    if (memo?.data !== state.data || memo.standard !== state.prefs.standard || memo.hour !== hour) {
      memo = { data: state.data, standard: state.prefs.standard, hour, view: buildAirView(state.data, state.prefs.standard, now()) };
    }
    return memo.view;
  }

  function setStatus(message: string, isError = false): void {
    ui.searchStatus.textContent = message;
    ui.searchStatus.classList.toggle('is-error', isError);
  }

  function clearResults(): void {
    results = [];
    ui.results.replaceChildren();
    ui.results.hidden = true;
  }

  function placeName(place: Place | null): string | null {
    if (!place) return null;
    return place.id === MY_LOCATION_ID ? 'your area' : place.name;
  }

  function render(state: AppState): void {
    const view = viewFor(state);
    const current = view?.current ?? null;
    const hero = renderHero({
      status: state.status,
      standard: AQI_STANDARDS[state.prefs.standard],
      place: state.place,
      view,
      profile: state.prefs.profile,
      error: state.error,
    });

    // A new place, scale or data set plays the reveal; other re-renders (such as
    // a profile change) swap content in place without motion.
    const key = current && state.place ? `${state.place.id}|${state.prefs.standard}|${state.fetchedAt ?? 0}` : null;
    const reveal = key !== null && key !== revealedKey;
    if (key !== null) revealedKey = key;
    for (const node of [ui.hero, ui.pollutantsBody, ui.forecastBody]) node.classList.toggle('is-revealing', reveal);

    stopCounting();
    // The level tints the whole page (background glow, accents), not just the card.
    doc.documentElement.dataset.level = String(hero.level);
    ui.hero.dataset.level = String(hero.level);
    ui.hero.setAttribute('aria-busy', String(state.status === 'loading'));
    ui.heroBody.replaceChildren(...hero.nodes);
    ui.pollutantsBody.replaceChildren(...renderPollutants(view));
    ui.forecastBody.replaceChildren(...renderForecast(view));
    ui.adviceBody.replaceChildren(...renderAdvice(view, state.prefs.profile));

    const valueNode = ui.heroBody.querySelector<HTMLElement>('.reading-value');
    if (valueNode && current && state.place) {
      // Count from the previous reading for the same place (e.g. a scale switch), otherwise from zero.
      const from = !reveal ? current.value : lastShown?.placeId === state.place.id ? lastShown.value : 0;
      stopCounting = animateNumber(valueNode, from, current.value, doc.defaultView ?? {});
      lastShown = { placeId: state.place.id, value: current.value };
    }
  }

  /** Reflects the pause preference on the page and on the toggle button. */
  function applyMotionPreference(paused: boolean): void {
    doc.documentElement.classList.toggle('motion-paused', paused);
    ui.motionToggle.textContent = paused ? 'Play animation' : 'Pause animation';
  }

  function updatePrefs(patch: Partial<Preferences>): void {
    store.setState((state) => ({ prefs: { ...state.prefs, ...patch } }));
  }

  async function search(query: string): Promise<void> {
    const clean = sanitizeQuery(query);
    if (!clean) {
      ui.cityInput.setAttribute('aria-invalid', 'true');
      setStatus('Enter at least two letters of a place name.', true);
      ui.cityInput.focus();
      return;
    }
    ui.cityInput.removeAttribute('aria-invalid');

    const token = ++searchToken;
    setStatus(`Searching for “${clean}”…`);
    try {
      const places = await deps.client.searchPlaces(clean);
      if (token !== searchToken) return;
      results = places;
      ui.results.replaceChildren(...placeResults(places));
      ui.results.hidden = places.length === 0;
      setStatus(
        places.length === 0
          ? `No places match “${clean}”. Check the spelling or try a larger city nearby.`
          : `${places.length} ${places.length === 1 ? 'place' : 'places'} found. Choose one from the list.`,
      );
    } catch (error) {
      if (token !== searchToken) return;
      clearResults();
      setStatus(describeError(error), true);
    }
  }

  async function selectPlace(place: Place, options: { focus?: boolean } = {}): Promise<void> {
    const token = ++loadToken;
    clearResults();
    setStatus(`Loading air quality for ${place.name}…`);
    updatePrefs({ lastPlace: place });
    store.setState({ place, data: null, fetchedAt: null, status: 'loading', error: null });

    try {
      const data = await deps.client.getAirQuality(place.latitude, place.longitude);
      if (token !== loadToken) return;
      store.setState({ data, fetchedAt: now(), status: 'ready' });
      const current = viewFor(store.getState())?.current;
      setStatus(
        current
          ? `Showing ${place.name}: ${current.value} on the ${current.standard === 'in' ? 'India' : 'US'} scale, ${current.category.label.toLowerCase()}.`
          : `Showing ${place.name}.`,
      );
    } catch (error) {
      if (token !== loadToken) return;
      const message = describeError(error);
      store.setState({ status: 'error', error: message });
      setStatus(message, true);
    }

    if (options.focus) doc.getElementById(HERO_HEADING_ID)?.focus();
  }

  function locate(): void {
    if (locating) return;
    if (!deps.geolocation) {
      setStatus('Location is not available in this browser. Search for a city instead.', true);
      return;
    }
    locating = true;
    setStatus('Finding your location…');
    deps.geolocation.getCurrentPosition(
      (position) => {
        locating = false;
        void selectPlace(
          {
            id: MY_LOCATION_ID,
            name: 'Your location',
            latitude: roundCoordinate(position.coords.latitude),
            longitude: roundCoordinate(position.coords.longitude),
          },
          { focus: true },
        );
      },
      (error) => {
        locating = false;
        setStatus(
          error.code === PERMISSION_DENIED
            ? 'Location access is blocked. Allow it in your browser settings, or search for a city instead.'
            : 'Your location could not be found. Search for a city instead.',
          true,
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  function askQuestion(raw: string): void {
    const question = raw.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) return;
    const state = store.getState();
    const context: AssistantContext = {
      placeName: placeName(state.place),
      view: viewFor(state),
      profile: state.prefs.profile,
    };
    // Answer from the state at the moment of asking, even if it is shown after a short pause.
    const reply = chatMessage('assistant', ask(question, context));
    const show = (node: Node) => {
      ui.chatLog.append(node);
      while (ui.chatLog.childElementCount > MAX_MESSAGES) ui.chatLog.firstElementChild?.remove();
      ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
    };

    show(chatMessage('user', question));
    const win = doc.defaultView;
    if (!win || prefersReducedMotion(win) || state.prefs.motionPaused) {
      show(reply);
      return;
    }
    const typing = typingIndicator();
    show(typing);
    win.setTimeout(() => {
      typing.replaceWith(reply);
      ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
    }, TYPING_DELAY_MS);
  }

  async function refreshIfStale(): Promise<void> {
    const { place, fetchedAt, status } = store.getState();
    if (!place || status === 'loading') return;
    if (fetchedAt !== null && now() - fetchedAt < STALE_AFTER_MS) return;
    await selectPlace(place);
  }

  function readProfile(): HealthProfile {
    const data = new FormData(ui.profileForm);
    const groups = data.getAll('group').filter(isSensitivityGroup);
    const activity = data.get('activity');
    return { groups, activity: isActivity(activity) ? activity : 'general' };
  }

  // Event wiring. Lists use delegation so re-rendering never leaks listeners.
  ui.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void search(ui.cityInput.value);
  });
  ui.results.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-place-index]');
    const place = results[Number(button?.dataset.placeIndex)];
    if (place) void selectPlace(place, { focus: true });
  });
  ui.locateButton.addEventListener('click', locate);
  ui.heroBody.addEventListener('click', (event) => {
    const { place } = store.getState();
    if (place && (event.target as Element).closest('[data-action="retry"]')) void selectPlace(place, { focus: true });
  });
  ui.standardSwitch.addEventListener('change', (event) => {
    const { value } = event.target as HTMLInputElement;
    if (isAqiStandardId(value)) updatePrefs({ standard: value });
  });
  ui.profileForm.addEventListener('change', () => {
    updatePrefs({ profile: readProfile() });
  });
  ui.motionToggle.addEventListener('click', () => {
    updatePrefs({ motionPaused: !store.getState().prefs.motionPaused });
  });
  ui.profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
  ui.chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    askQuestion(ui.question.value);
    ui.question.value = '';
  });
  ui.suggestions.addEventListener('click', (event) => {
    const question = (event.target as Element).closest<HTMLElement>('[data-question]')?.dataset.question;
    if (question) askQuestion(question);
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') void refreshIfStale();
  });

  // Initial render.
  const { prefs } = store.getState();
  for (const radio of ui.standardSwitch.querySelectorAll<HTMLInputElement>('input[name="standard"]')) {
    radio.checked = radio.value === prefs.standard;
  }
  ui.profileForm.replaceChildren(...profileFields(prefs.profile));
  applyMotionPreference(prefs.motionPaused);
  revealOnScroll(doc.querySelectorAll('[data-reveal]'), doc.defaultView ?? {});
  ui.suggestions.replaceChildren(...suggestionButtons(SAMPLE_QUESTIONS.slice(0, 4)));
  ui.chatLog.append(
    chatMessage('assistant', "Hi, I'm AirWise. Choose a place, then ask me things like whether it's a good time for a run."),
  );

  store.subscribe((state, previous) => {
    render(state);
    if (state.prefs !== previous.prefs) savePreferences(deps.storage, state.prefs);
    if (state.prefs.motionPaused !== previous.prefs.motionPaused) applyMotionPreference(state.prefs.motionPaused);
  });
  render(store.getState());
  if (prefs.lastPlace) void selectPlace(prefs.lastPlace);

  return { getState: () => store.getState(), search, selectPlace, locate, askQuestion, refreshIfStale };
}
