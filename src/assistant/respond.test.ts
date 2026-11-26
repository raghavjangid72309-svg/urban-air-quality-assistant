import { describe, expect, it } from 'vitest';
import { GROUP_TIPS } from '../domain/advice';
import { DEFAULT_PROFILE } from '../domain/profile';
import { buildAirView, type AirView } from '../state/airView';
import { hoursFrom, makeAirData, NOW_MS } from '../test-utils/fixtures';
import { ask, SAMPLE_QUESTIONS, type AssistantContext } from './respond';

const CLEAN = buildAirView(makeAirData(), 'us', NOW_MS); // US AQI 28, good
const POLLUTED = buildAirView(makeAirData({ pm2_5: 100 }), 'us', NOW_MS); // 182, unhealthy
const HAZARDOUS = buildAirView(makeAirData({ pm2_5: 300 }), 'us', NOW_MS); // 449, hazardous
const NO_DATA = buildAirView(makeAirData({ pm2_5: null, pm10: null }), 'in', NOW_MS);

const context = (view: AirView | null, overrides: Partial<AssistantContext> = {}): AssistantContext => ({
  placeName: 'Delhi',
  view,
  profile: DEFAULT_PROFILE,
  ...overrides,
});

describe('answers that need no data', () => {
  it('lists sample questions for help', () => {
    expect(ask('help', context(null)).points).toEqual(SAMPLE_QUESTIONS);
  });

  it('greets, mentioning the place when there is one', () => {
    expect(ask('hi', context(CLEAN)).text).toMatch(/I'm looking at Delhi/);
    expect(ask('hi', context(null, { placeName: null })).text).not.toMatch(/looking at/);
  });

  it('acknowledges thanks', () => {
    expect(ask('thank you', context(null)).text).toMatch(/welcome/);
  });

  it('offers suggestions when it does not understand', () => {
    const reply = ask('qwerty', context(CLEAN));
    expect(reply.text).toMatch(/didn't understand/);
    expect(reply.points).toHaveLength(4);
  });

  it('explains the AQI and the active scale', () => {
    expect(ask('what is aqi', context(null, { placeName: null })).text).toMatch(/Choose a city/);
    const reply = ask('what is aqi', context(CLEAN));
    expect(reply.text).toMatch(/US EPA Air Quality Index/);
    expect(reply.points).toHaveLength(6);
  });

  it('explains pollutants, with the local level when known', () => {
    const reply = ask('What is ozone?', context(CLEAN));
    expect(reply.text).toMatch(/^O₃ is ground-level ozone\./);
    expect(reply.points.join(' ')).toMatch(/Here it is currently 50 µg\/m³/);
    expect(ask('What is ozone?', context(null)).points).toHaveLength(1);
  });

  it('asks for a place before answering data questions', () => {
    expect(ask('How is the air?', context(null, { placeName: null })).text).toMatch(/Choose a city/);
  });
});

describe('current conditions', () => {
  it('reports the AQI, category and main pollutant', () => {
    const reply = ask('How is the air right now?', context(POLLUTED));
    expect(reply.text).toBe(
      'Right now in Delhi the US AQI is 182, which is "Unhealthy". The main pollutant is PM2.5 at 100 µg/m³ (24-hour average).',
    );
    expect(reply.points).toEqual([
      'Cut back on long or intense outdoor activity today.',
      'It should stay about the same for the next few hours.',
    ]);
  });

  it('reports a specific pollutant', () => {
    expect(ask('What is the ozone level now?', context(CLEAN)).text).toMatch(
      /O₃ is 50 µg\/m³ \(8-hour average\), a sub-index of 23\./,
    );
    expect(ask('ammonia level now', context(CLEAN)).text).toMatch(/I don't have NH₃ readings/);
  });

  it('describes the trend', () => {
    const worsening = { ...POLLUTED, forecast: hoursFrom(POLLUTED.now, [100, 150, 160, 170, 180, 190, 200]) };
    const improving = { ...POLLUTED, forecast: hoursFrom(POLLUTED.now, [200, 150, 140, 130, 120, 110, 100]) };
    expect(ask('how is the air', context(worsening)).points).toContain('It is expected to get worse over the next few hours.');
    expect(ask('how is the air', context(improving)).points).toContain('It should improve over the next few hours.');
  });

  it('says so when there is not enough data', () => {
    expect(ask('How is the air?', context(NO_DATA)).text).toMatch(/isn't enough recent data to work out the AQI for Delhi/);
    expect(ask('Can I go for a run?', context(NO_DATA)).text).toMatch(/isn't enough recent data/);
    expect(ask('When is the best time to go out?', context(NO_DATA)).text).toMatch(/enough forecast data/);
    expect(ask('Air quality tomorrow', context(NO_DATA)).text).toMatch(/don't have forecast data for tomorrow/);
    expect(ask('Can I go out tomorrow?', context(NO_DATA)).text).toMatch(/enough forecast data for tomorrow/);
  });
});

describe('activities', () => {
  it('says yes in clean air', () => {
    expect(ask('Is it safe to go for a run?', context(CLEAN)).text).toMatch(/^Yes, it's a good time to exercise outside\./);
  });

  it('suggests a cleaner time when the air is poor', () => {
    const reply = ask('Is it safe to go for a run?', context(POLLUTED));
    expect(reply.text).toBe(
      'You can exercise outside, but keep it short and light. The US AQI in Delhi is 182 ("Unhealthy").',
    );
    expect(reply.points[0]).toBe('Cleanest time in the next 24 hours: 20:00–22:00 today (US AQI 182, unhealthy).');
  });

  it('says no in hazardous air', () => {
    expect(ask('Can I go for a walk?', context(HAZARDOUS)).text).toMatch(/^No\. It's best to stay indoors right now\./);
  });

  it('uses the profile activity when the question names none', () => {
    const reply = ask('Should I go?', context(POLLUTED, { profile: { groups: [], activity: 'commute' } }));
    expect(reply.text).toMatch(/You can commute/);
  });

  it('answers for a later time with tips for the people mentioned', () => {
    const reply = ask('Can my asthmatic son play outside tomorrow?', context(POLLUTED));
    expect(reply.text).toBe("I'd keep it indoors tomorrow if you can. The cleanest time is 06:00–08:00 (US AQI 182, unhealthy).");
    expect(reply.points).toContain(GROUP_TIPS.respiratory);
    expect(reply.points).toContain(GROUP_TIPS.child);
  });

  it('gives a positive answer for a clean evening', () => {
    expect(ask('Can I go cycling tonight?', context(CLEAN)).text).toMatch(/^Yes, tonight looks fine to exercise outside\./);
  });
});

describe('best time', () => {
  it('names the window without repeating the day', () => {
    const reply = ask('When is the best time to go out tomorrow?', context(POLLUTED));
    expect(reply.text).toBe('The best time to head out tomorrow is 06:00–08:00 (US AQI 182, unhealthy).');
    expect(reply.text.match(/tomorrow/g)).toHaveLength(1);
    expect(reply.points[0]).toBe('Cut back on long or intense outdoor activity today.');
  });

  it('includes the day for the next 24 hours', () => {
    expect(ask('When is the best time for a run?', context(CLEAN)).text).toBe(
      'The best time to exercise outside in the next 24 hours is 20:00–22:00 today (US AQI 28, good).',
    );
  });

  it('looks only at the evening for tonight', () => {
    expect(ask('best time to go out tonight', context(CLEAN)).text).toMatch(/tonight is 20:00–22:00/);
  });

  it('handles later today', () => {
    expect(ask('best time to go out later', context(CLEAN)).text).toMatch(/later today is 20:00–22:00/);
  });
});

describe('forecast', () => {
  it('summarises the range for tomorrow', () => {
    const reply = ask('Will it get better tomorrow?', context(POLLUTED));
    expect(reply.text).toBe('Tomorrow in Delhi, the US AQI is expected to range from 182 to 182.');
    expect(reply.points[0]).toMatch(/^Cleanest around \d\d:00 tomorrow/);
  });

  it('adds the trend for the next 24 hours', () => {
    expect(ask('forecast', context(POLLUTED)).points).toHaveLength(3);
  });
});

describe('masks, windows, causes and health', () => {
  it('scales mask advice with the risk', () => {
    expect(ask('Do I need a mask?', context(CLEAN)).text).toMatch(/^You don't need a mask/);
    expect(ask('Do I need a mask?', context(POLLUTED)).text).toMatch(/good idea if you'll be outside for a long time/);
    expect(ask('Do I need a mask?', context(HAZARDOUS)).text).toMatch(/^Yes, wear a mask/);
  });

  it('scales window advice with the outdoor level', () => {
    expect(ask('Should I open the windows?', context(CLEAN)).text).toMatch(/^Yes, it's a good time to open the windows/);
    const limited = ask('Should I open the windows?', context(POLLUTED));
    expect(limited.text).toMatch(/^Keep windows mostly closed/);
    expect(limited.points[0]).toMatch(/^Cleanest time/);
    expect(ask('Should I open the windows?', context(HAZARDOUS)).text).toMatch(/^Keep windows and doors closed/);
  });

  it('explains what drives the AQI', () => {
    const reply = ask('Why is the air bad?', context(POLLUTED));
    expect(reply.text).toMatch(/driven mainly by PM2\.5 \(fine particulate matter\)/);
    expect(reply.points.join(' ')).toMatch(/model estimates/);
  });

  it('tailors health answers to the group mentioned', () => {
    const reply = ask('I have asthma', context(POLLUTED));
    expect(reply.text).toMatch(/^With asthma, copd or another lung condition in mind/);
    expect(reply.points[0]).toBe(GROUP_TIPS.respiratory);
  });

  it('uses "your area" when the place has no name', () => {
    expect(ask('how is the air', context(CLEAN, { placeName: null })).text).toMatch(/Right now in your area/);
  });
});
