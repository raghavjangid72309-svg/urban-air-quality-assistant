import type { PollutantId } from '../domain/pollutants';
import type { Activity, SensitivityGroup } from '../domain/profile';

export type Intent =
  | 'help'
  | 'thanks'
  | 'greeting'
  | 'aqi_info'
  | 'pollutant_info'
  | 'cause'
  | 'mask'
  | 'windows'
  | 'best_time'
  | 'activity'
  | 'forecast'
  | 'current'
  | 'health'
  | 'unknown';

export type When = 'now' | 'today' | 'tonight' | 'tomorrow';

export interface ParsedQuery {
  readonly intent: Intent;
  readonly activity: Activity | null;
  readonly when: When;
  readonly pollutant: PollutantId | null;
  readonly groups: readonly SensitivityGroup[];
}

export const MAX_QUESTION_LENGTH = 300;

const POLLUTANT_PATTERNS: readonly (readonly [PollutantId, RegExp])[] = [
  ['pm2_5', /\bpm ?2[.,]?5\b|\bfine (particles?|particulates?|dust)\b|\bparticulates?\b/],
  ['pm10', /\bpm ?10\b|\bcoarse particles?\b|\bdust\b/],
  ['o3', /\bo3\b|\bozone\b/],
  ['no2', /\bno2\b|\bnitrogen dioxide\b/],
  ['so2', /\bso2\b|\bsul(ph|f)ur dioxide\b/],
  ['co', /\bco\b|\bcarbon monoxide\b/],
  ['nh3', /\bnh3\b|\bammonia\b/],
];

const ACTIVITY_PATTERNS: readonly (readonly [Activity, RegExp])[] = [
  [
    'exercise',
    /\b(run|runs|running|jog|jogging|cycle|cycling|bike|biking|ride|workout|work out|exercis\w*|gym|sports?|football|soccer|cricket|tennis|hike|hiking|marathon|training|yoga)\b/,
  ],
  ['commute', /\b(commut\w*|drive|driving|travel\w*|bus|metro|train|go to work|going to work|office|school run)\b/],
  ['general', /\b(walk|walking|stroll|errands?|shopping|go out|going out|head out|outside|outdoors|park|picnic|play|playing)\b/],
];

const GROUP_PATTERNS: readonly (readonly [SensitivityGroup, RegExp])[] = [
  ['respiratory', /\b(asthma\w*|copd|lungs?|bronch\w*|inhaler|breathing (problems?|issues?|difficult\w*))\b/],
  ['heart', /\b(heart|cardiac|blood pressure|hypertension)\b/],
  ['child', /\b(kids?|child|children|baby|babies|toddlers?|infants?|son|daughter)\b/],
  ['older', /\b(elderly|seniors?|grandparents?|grandma|grandpa|grandmother|grandfather|old people|older (people|adults?))\b/],
  ['pregnant', /\b(pregnan\w*|expecting)\b/],
  ['outdoorWorker', /\b(outdoor work\w*|work(ing)? outside|construction|delivery (rider|driver|work\w*))\b/],
];

const WHEN_PATTERNS: readonly (readonly [When, RegExp])[] = [
  ['tomorrow', /\btomorrow\b/],
  ['tonight', /\b(tonight|this evening|evening|night)\b/],
  ['today', /\b(later|this afternoon|afternoon|this morning|later today|rest of (the )?day)\b/],
];

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

/** Lower-cases, folds Unicode (so "PM₂.₅" becomes "pm2.5"), drops punctuation and limits length. */
export function normalise(text: string): string {
  return text
    .slice(0, MAX_QUESTION_LENGTH)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}.\s]/gu, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(text: string, entities: Omit<ParsedQuery, 'intent'>): Intent {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return 'help';

  if (has(text, /\b(help|what can you do|what do you know|how does this work|how do i use)\b/)) return 'help';
  if (words.length <= 4 && has(text, /^(thanks|thank you|thank u|thx|ty|cheers|great|ok|okay|cool|nice)\b/)) return 'thanks';
  if (words.length <= 4 && has(text, /^(hi|hello|hey|hiya|namaste|yo|good (morning|afternoon|evening))\b/)) return 'greeting';

  const asksForLevel = has(text, /\b(level|levels|concentration|reading|how much|how high|right now|now|today|currently|current)\b/);
  const asksForMeaning = has(text, /\b(what is|whats|what are|what does|explain|define|definition|meaning|mean|tell me about)\b/);

  if (asksForMeaning && !asksForLevel && has(text, /\b(aqi|air quality index)\b/) && !entities.pollutant) return 'aqi_info';
  if (entities.pollutant && asksForMeaning && !asksForLevel) return 'pollutant_info';
  if (has(text, /\b(why|cause|causes|causing|caused|reason|reasons|sources?|coming from|comes from|where does)\b/)) return 'cause';
  if (has(text, /\b(masks?|n95|kn95|ffp2|respirators?)\b/)) return 'mask';
  if (has(text, /\b(windows?|ventilat\w*|air out|airing|purifiers?|air filters?)\b/)) return 'windows';
  if (
    has(text, /\b(best|cleanest|safest|ideal|good|right) (time|hours?|window)\b/) ||
    has(text, /\bwhen (should|can|could|is|will|would|do)\b/) ||
    has(text, /\b(what|which) (time|hours?)\b/)
  ) {
    return 'best_time';
  }
  if (
    entities.activity !== null ||
    has(text, /\b(should|can|could|may) (i|we|they|he|she|my)\b/) ||
    has(text, /\b(is it|its) (safe|ok|okay|fine|alright|good)\b/)
  ) {
    return 'activity';
  }
  if (
    entities.when !== 'now' ||
    has(text, /\b(forecast|will (it|the air)|going to|get better|improv\w*|get worse|worsen\w*|next (few )?(hours?|days?)|coming days|this week|predict\w*)\b/)
  ) {
    return 'forecast';
  }
  if (entities.pollutant || has(text, /\b(aqi|air|pollution|polluted|smog|haze|hazy|quality|how bad|how good|breathe|breathing)\b/)) {
    return 'current';
  }
  if (entities.groups.length > 0) return 'health';
  return 'unknown';
}

/** Turns a free-text question into an intent plus the entities it mentions. */
export function parseQuery(question: string): ParsedQuery {
  const text = normalise(question);
  const find = <T>(patterns: readonly (readonly [T, RegExp])[]): T | null =>
    patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;

  const entities = {
    activity: find(ACTIVITY_PATTERNS),
    when: find(WHEN_PATTERNS) ?? 'now',
    pollutant: find(POLLUTANT_PATTERNS),
    groups: GROUP_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([group]) => group),
  } satisfies Omit<ParsedQuery, 'intent'>;

  return { intent: classify(text, entities), ...entities };
}
