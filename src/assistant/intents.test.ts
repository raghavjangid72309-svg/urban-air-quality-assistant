import { describe, expect, it } from 'vitest';
import { MAX_QUESTION_LENGTH, normalise, parseQuery, type Intent } from './intents';

describe('normalise', () => {
  it('folds case, Unicode subscripts and punctuation', () => {
    expect(normalise('What’s the PM₂.₅ level?!')).toBe('whats the pm2.5 level');
    expect(normalise('Is it safe now.')).toBe('is it safe now');
  });

  it('limits length', () => {
    expect(normalise('a'.repeat(1000)).length).toBe(MAX_QUESTION_LENGTH);
  });
});

describe('parseQuery intents', () => {
  it.each<[string, Intent]>([
    ['', 'help'],
    ['What can you do?', 'help'],
    ['thanks!', 'thanks'],
    ['Hello', 'greeting'],
    ['Good morning', 'greeting'],
    ['What is AQI?', 'aqi_info'],
    ['What is PM2.5?', 'pollutant_info'],
    ['Tell me about ozone', 'pollutant_info'],
    ['What is the PM2.5 level now?', 'current'],
    ['Why is the air so bad today?', 'cause'],
    ['Where does the pollution come from?', 'cause'],
    ['Do I need a mask?', 'mask'],
    ['Should I wear an N95?', 'mask'],
    ['Should I open the windows?', 'windows'],
    ['Is it OK to run the air purifier?', 'windows'],
    ['When is the best time to go out tomorrow?', 'best_time'],
    ['What time should I walk the dog?', 'best_time'],
    ['Is it safe to go for a run?', 'activity'],
    ['Can my kids play outside?', 'activity'],
    ['Should I cycle to work this evening?', 'activity'],
    ['Will it get better tomorrow?', 'forecast'],
    ['Air quality tomorrow', 'forecast'],
    ['How is the air right now?', 'current'],
    ['good morning, how is the air quality today?', 'current'],
    ['I have asthma', 'health'],
    ['asdfgh', 'unknown'],
  ])('%j → %s', (question, intent) => {
    expect(parseQuery(question).intent).toBe(intent);
  });
});

describe('parseQuery entities', () => {
  it('extracts activity, time, pollutant and groups', () => {
    expect(parseQuery('Can my asthmatic son go cycling tomorrow?')).toEqual({
      intent: 'activity',
      activity: 'exercise',
      when: 'tomorrow',
      pollutant: null,
      groups: ['respiratory', 'child'],
    });
  });

  it.each([
    ['How much NO2 is there?', 'no2'],
    ['sulfur dioxide levels', 'so2'],
    ['what is the co level', 'co'],
    ['ammonia now', 'nh3'],
    ['pm 10 today', 'pm10'],
    ['O₃ now', 'o3'],
  ] as const)('%j mentions %s', (question, pollutant) => {
    expect(parseQuery(question).pollutant).toBe(pollutant);
  });

  it.each([
    ['Is it safe to drive to the office?', 'commute'],
    ['Can I go for a walk?', 'general'],
    ['Is the gym outside ok?', 'exercise'],
  ] as const)('%j is about %s', (question, activity) => {
    expect(parseQuery(question).activity).toBe(activity);
  });

  it.each([
    ['air later today', 'today'],
    ['air tonight', 'tonight'],
    ['air this evening', 'tonight'],
    ['air now', 'now'],
  ] as const)('%j refers to %s', (question, when) => {
    expect(parseQuery(question).when).toBe(when);
  });

  it('recognises every sensitivity group', () => {
    expect(
      parseQuery('my grandmother has heart disease, I am pregnant and I work outside on construction').groups,
    ).toEqual(['heart', 'older', 'pregnant', 'outdoorWorker']);
  });
});
