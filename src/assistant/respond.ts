import { getAdvice, GROUP_TIPS, windowsFor, type ExerciseGuidance } from '../domain/advice';
import { categoryFor, type AqiResult, type HourlyAqi } from '../domain/aqi/calculate';
import type { AqiStandard } from '../domain/aqi/standards';
import { findBestWindow, forecastTrend, summariseRange, type TimeWindow } from '../domain/forecast';
import { formatConcentration } from '../domain/format';
import { POLLUTANTS, type PollutantId } from '../domain/pollutants';
import { GROUP_LABELS, type Activity, type HealthProfile, type SensitivityGroup } from '../domain/profile';
import { addDays, formatClock, formatDay, formatWhen, localDate, localHour } from '../domain/time';
import type { AirView } from '../state/airView';
import { parseQuery, type ParsedQuery, type When } from './intents';

export interface AssistantContext {
  /** Display name of the selected place, or `null` before one is chosen. */
  readonly placeName: string | null;
  readonly view: AirView | null;
  readonly profile: HealthProfile;
}

export interface AssistantReply {
  readonly text: string;
  readonly points: readonly string[];
}

export const SAMPLE_QUESTIONS = [
  'How is the air right now?',
  'Is it safe to go for a run?',
  'When is the best time to go out tomorrow?',
  'Do I need a mask?',
  'Should I open the windows?',
  'Why is the air bad today?',
] as const;

const ACTIVITY_PHRASES: Readonly<Record<Activity, string>> = {
  general: 'head out',
  exercise: 'exercise outside',
  commute: 'commute',
};

/** How each period reads inside a sentence. */
const PERIODS: Readonly<Record<When, string>> = {
  now: 'in the next 24 hours',
  today: 'later today',
  tonight: 'tonight',
  tomorrow: 'tomorrow',
};

const MAX_POINTS = 4;

const reply = (text: string, points: readonly string[] = []): AssistantReply => ({ text, points });

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "India AQI 280, poor". */
function describeIndex(standard: AqiStandard, value: number): string {
  return `${standard.shortName} ${value}, ${categoryFor(standard, value).label.toLowerCase()}`;
}

/** "06:00–08:00 tomorrow (India AQI 280, poor)"; the day is left out when the sentence already names it. */
function describeWindow(view: AirView, window: TimeWindow, includeDay: boolean): string {
  const day = includeDay ? ` ${formatDay(localDate(window.start), view.today)}` : '';
  return `${formatClock(window.start)}–${formatClock(window.end)}${day} (${describeIndex(view.standard, Math.round(window.average))})`;
}

function mergeProfile(profile: HealthProfile, query: ParsedQuery): HealthProfile {
  const groups = [...new Set<SensitivityGroup>([...profile.groups, ...query.groups])];
  return { groups, activity: query.activity ?? profile.activity };
}

/** Forecast hours that fall in the period the question asks about. */
function hoursFor(when: When, view: AirView): readonly HourlyAqi[] {
  const tomorrow = addDays(view.today, 1);
  switch (when) {
    case 'now':
      return view.forecast.slice(0, 24);
    case 'today':
      return view.forecast.filter((h) => localDate(h.time) === view.today);
    case 'tonight':
      return view.forecast.filter((h) => localDate(h.time) === view.today && localHour(h.time) >= 18);
    case 'tomorrow':
      return view.forecast.filter((h) => localDate(h.time) === tomorrow);
  }
}

function bestWindowFor(when: When, view: AirView): TimeWindow | null {
  const hours = hoursFor(when, view);
  return when === 'tonight' ? findBestWindow(hours, { earliestHour: 18, latestHour: 24 }) : findBestWindow(hours);
}

function trendSentence(view: AirView): string | null {
  switch (forecastTrend(view.forecast)) {
    case 'improving':
      return 'It should improve over the next few hours.';
    case 'worsening':
      return 'It is expected to get worse over the next few hours.';
    case 'stable':
      return 'It should stay about the same for the next few hours.';
    case null:
      return null;
  }
}

function noData(placeName: string | null): AssistantReply {
  return placeName
    ? reply(`There isn't enough recent data to work out the AQI for ${placeName} right now. Please try again later.`)
    : reply('Choose a city or use your location first, and I will answer with live air quality data for that place.');
}

function nowVerdict(exercise: ExerciseGuidance, activity: Activity): string {
  const phrase = ACTIVITY_PHRASES[activity];
  switch (exercise) {
    case 'go':
      return `Yes, it's a good time to ${phrase}.`;
    case 'take-it-easy':
      return `Yes, you can ${phrase}, but take it a little easier.`;
    case 'reduce':
      return `You can ${phrase}, but keep it short and light.`;
    case 'avoid':
      return "I'd avoid it for now. If you can, move it indoors or wait for cleaner air.";
    case 'stay-indoors':
      return "No. It's best to stay indoors right now.";
  }
}

function laterVerdict(exercise: ExerciseGuidance, activity: Activity, when: When): string {
  const phrase = ACTIVITY_PHRASES[activity];
  const period = when === 'now' ? 'today' : PERIODS[when];
  switch (exercise) {
    case 'go':
      return `Yes, ${period} looks fine to ${phrase}.`;
    case 'take-it-easy':
      return `Yes, you can ${phrase} ${period}, but take it a little easier.`;
    case 'reduce':
      return `You can ${phrase} ${period}, but keep it short and light.`;
    case 'avoid':
      return `I'd keep it indoors ${period} if you can.`;
    case 'stay-indoors':
      return `No, plan to stay indoors ${period}.`;
  }
}

function answerCurrent(query: ParsedQuery, ctx: AssistantContext, view: AirView, current: AqiResult): AssistantReply {
  const place = ctx.placeName ?? 'your area';
  const advice = getAdvice(current.category.level, mergeProfile(ctx.profile, query));
  const trend = trendSentence(view);

  let detail = '';
  if (query.pollutant) {
    const sub = current.subIndices.find((s) => s.pollutant === query.pollutant);
    const info = POLLUTANTS[query.pollutant];
    detail = sub
      ? ` ${info.label} is ${formatConcentration(sub.concentration)} (${sub.averagingHours}-hour average), a sub-index of ${sub.index}.`
      : ` I don't have ${info.label} readings for this location.`;
  } else {
    const main = current.subIndices[0];
    if (main) {
      detail = ` The main pollutant is ${POLLUTANTS[main.pollutant].label} at ${formatConcentration(main.concentration)} (${main.averagingHours}-hour average).`;
    }
  }

  return reply(
    `Right now in ${place} the ${view.standard.shortName} is ${current.value}, which is "${current.category.label}".${detail}`,
    [advice.headline, ...(trend ? [trend] : [])],
  );
}

/** "Can I go for a run?", "Can my kids play outside tomorrow?" */
function answerActivity(query: ParsedQuery, ctx: AssistantContext, view: AirView): AssistantReply {
  const profile = mergeProfile(ctx.profile, query);

  if (query.when === 'now') {
    const { current } = view;
    if (!current) return noData(ctx.placeName);
    const advice = getAdvice(current.category.level, profile);
    const points = advice.actions.slice(0, MAX_POINTS - 1);
    const window = advice.exercise === 'go' ? null : bestWindowFor('now', view);
    if (window) points.unshift(`Cleanest time in the next 24 hours: ${describeWindow(view, window, true)}.`);
    return reply(
      `${nowVerdict(advice.exercise, profile.activity)} The ${view.standard.shortName} in ${ctx.placeName ?? 'your area'} is ${current.value} ("${current.category.label}").`,
      points,
    );
  }

  const window = bestWindowFor(query.when, view);
  if (!window) return reply(`I don't have enough forecast data for ${PERIODS[query.when]} yet.`);
  const advice = getAdvice(window.level, profile);
  return reply(
    `${laterVerdict(advice.exercise, profile.activity, query.when)} The cleanest time is ${describeWindow(view, window, false)}.`,
    advice.actions.slice(0, MAX_POINTS),
  );
}

/** "When is the best time to go out tomorrow?" */
function answerBestTime(query: ParsedQuery, ctx: AssistantContext, view: AirView): AssistantReply {
  const profile = mergeProfile(ctx.profile, query);
  const window = bestWindowFor(query.when, view);
  if (!window) return reply(`I don't have enough forecast data to pick a good time ${PERIODS[query.when]}.`);

  const advice = getAdvice(window.level, profile);
  const text = `The best time to ${ACTIVITY_PHRASES[profile.activity]} ${PERIODS[query.when]} is ${describeWindow(view, window, query.when === 'now')}.`;
  const points = advice.exercise === 'go' ? advice.actions : [advice.headline, ...advice.actions];
  return reply(text, points.slice(0, MAX_POINTS));
}

function answerForecast(query: ParsedQuery, ctx: AssistantContext, view: AirView): AssistantReply {
  const summary = summariseRange(hoursFor(query.when, view));
  if (!summary) return reply(`I don't have forecast data for ${PERIODS[query.when]} yet.`);

  const { standard, today } = view;
  const points = [
    `Cleanest around ${formatWhen(summary.best.time, today)} (${describeIndex(standard, summary.best.value)}).`,
    `Worst around ${formatWhen(summary.worst.time, today)} (${describeIndex(standard, summary.worst.value)}).`,
  ];
  const trend = query.when === 'now' ? trendSentence(view) : null;
  if (trend) points.push(trend);

  return reply(
    `${capitalise(PERIODS[query.when])} in ${ctx.placeName ?? 'your area'}, the ${standard.shortName} is expected to range from ${summary.best.value} to ${summary.worst.value}.`,
    points,
  );
}

function answerMask(query: ParsedQuery, ctx: AssistantContext, view: AirView, current: AqiResult): AssistantReply {
  const advice = getAdvice(current.category.level, mergeProfile(ctx.profile, query));
  const reading = `(${describeIndex(view.standard, current.value)})`;
  const fit = 'Choose a well-fitted N95, KN95 or FFP2 respirator; cloth and surgical masks do little against fine particles.';

  switch (advice.mask) {
    case 'recommended':
      return reply(`Yes, wear a mask outdoors right now ${reading}.`, [
        fit,
        'Make sure it seals around your nose and chin, and replace it when it gets damp or damaged.',
      ]);
    case 'optional':
      return reply(`It's a good idea if you'll be outside for a long time ${reading}.`, [fit]);
    case 'not-needed':
      return reply(`You don't need a mask for air pollution right now ${reading}.`);
  }
}

function answerWindows(view: AirView, current: AqiResult): AssistantReply {
  const reading = `(${describeIndex(view.standard, current.value)})`;
  const window = bestWindowFor('now', view);
  const windowPoint = window ? [`Cleanest time in the next 24 hours: ${describeWindow(view, window, true)}.`] : [];

  switch (windowsFor(current.category.level)) {
    case 'open':
      return reply(`Yes, it's a good time to open the windows and air out your home ${reading}.`);
    case 'limit':
      return reply(`Keep windows mostly closed ${reading}. Air out briefly when the air is cleanest.`, windowPoint);
    case 'closed':
      return reply(`Keep windows and doors closed right now ${reading}.`, [
        'Run an air purifier with a HEPA filter if you have one, and avoid indoor smoke such as incense or frying.',
        ...windowPoint,
      ]);
  }
}

function answerCause(ctx: AssistantContext, current: AqiResult): AssistantReply {
  const info = POLLUTANTS[current.dominant];
  return reply(
    `The AQI in ${ctx.placeName ?? 'your area'} is driven mainly by ${info.label} (${info.name}). Common sources are ${info.sources}.`,
    [
      'Calm winds and cool, still nights trap pollution near the ground; wind and rain usually clear it.',
      'These figures are model estimates for the area (Copernicus CAMS), not readings from a nearby station.',
    ],
  );
}

function answerPollutantInfo(pollutant: PollutantId, view: AirView | null): AssistantReply {
  const info = POLLUTANTS[pollutant];
  const sub = view?.current?.subIndices.find((s) => s.pollutant === pollutant);
  const points = [`Main sources: ${info.sources}.`];
  if (sub) points.push(`Here it is currently ${formatConcentration(sub.concentration)} (${sub.averagingHours}-hour average).`);
  return reply(`${info.label} is ${info.name}. ${info.description}`, points);
}

function answerAqiInfo(view: AirView | null, ctx: AssistantContext): AssistantReply {
  const sentences = ['The Air Quality Index (AQI) turns pollutant levels into one number from 0 to 500. Higher means more polluted.'];
  const standard = view?.standard;
  if (standard) sentences.push(`You are using the ${standard.name} from the ${standard.authority}.`);
  if (!ctx.placeName) sentences.push('Choose a city to see its current AQI.');
  const points = standard ? standard.categories.map((c) => `${c.min}–${c.max}: ${c.label}`) : [];
  return reply(sentences.join(' '), points);
}

function answerHealth(query: ParsedQuery, ctx: AssistantContext, view: AirView, current: AqiResult): AssistantReply {
  const profile = mergeProfile(ctx.profile, query);
  const groups = query.groups.length > 0 ? query.groups : profile.groups;
  const advice = getAdvice(current.category.level, profile);
  const who = groups.map((g) => GROUP_LABELS[g].toLowerCase()).join(', ');
  const tips = groups.map((g) => GROUP_TIPS[g]);
  return reply(
    `With ${who} in mind, the current air (${describeIndex(view.standard, current.value)}) means: ${advice.headline}`,
    [...new Set([...tips, ...advice.actions])].slice(0, MAX_POINTS),
  );
}

/** Produces a grounded, plain-text answer for a parsed question. */
export function respond(query: ParsedQuery, ctx: AssistantContext): AssistantReply {
  const { view } = ctx;

  switch (query.intent) {
    case 'help':
      return reply('I answer questions about the air where you are, using live data. You could ask:', SAMPLE_QUESTIONS);
    case 'greeting':
      return reply(
        `Hello! Ask me about the air quality, the best time to go outside, or whether you need a mask.${
          ctx.placeName ? ` I'm looking at ${ctx.placeName}.` : ''
        }`,
      );
    case 'thanks':
      return reply("You're welcome. Breathe easy!");
    case 'aqi_info':
      return answerAqiInfo(view, ctx);
    case 'pollutant_info':
      return answerPollutantInfo(query.pollutant ?? 'pm2_5', view);
    case 'unknown':
      return reply("Sorry, I didn't understand that. Here are some things you can ask:", SAMPLE_QUESTIONS.slice(0, 4));
    default:
      break;
  }

  if (!view) return noData(null);
  if (query.intent === 'best_time') return answerBestTime(query, ctx, view);
  if (query.intent === 'forecast') return answerForecast(query, ctx, view);
  if (query.intent === 'activity') return answerActivity(query, ctx, view);

  const { current } = view;
  if (!current) return noData(ctx.placeName);

  switch (query.intent) {
    case 'mask':
      return answerMask(query, ctx, view, current);
    case 'windows':
      return answerWindows(view, current);
    case 'cause':
      return answerCause(ctx, current);
    case 'health':
      return answerHealth(query, ctx, view, current);
    case 'current':
      return answerCurrent(query, ctx, view, current);
  }
}

/** Parses and answers a free-text question. */
export function ask(question: string, ctx: AssistantContext): AssistantReply {
  return respond(parseQuery(question), ctx);
}
