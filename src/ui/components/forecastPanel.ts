import { categoryFor } from '../../domain/aqi/calculate';
import { findBestWindow, forecastTrend, summariseRange } from '../../domain/forecast';
import { formatClock, formatDay, formatWhen, localDate } from '../../domain/time';
import type { AirView } from '../../state/airView';
import { forecastChart } from '../chart';
import { el } from '../dom';

const TREND_TEXT = {
  improving: 'Improving over the next few hours.',
  worsening: 'Getting worse over the next few hours.',
  stable: 'Holding steady over the next few hours.',
} as const;

/** Hourly outlook: a short summary, the chart, and the same data as a table. */
export function renderForecast(view: AirView | null): Node[] {
  if (!view || view.forecast.length === 0) {
    return [el('p', { class: 'empty' }, ['The hourly outlook appears here once you choose a place.'])];
  }

  const { standard, today, forecast } = view;
  const best = findBestWindow(forecast.slice(0, 24));
  const range = summariseRange(forecast);
  const trend = forecastTrend(forecast);

  const lines: string[] = [];
  if (best) {
    lines.push(
      `Cleanest stretch in the next 24 hours: ${formatClock(best.start)}–${formatClock(best.end)} ${formatDay(localDate(best.start), today)}, around ${standard.shortName} ${Math.round(best.average)}.`,
    );
  }
  if (range) {
    lines.push(
      `Over 48 hours it ranges from ${range.best.value} to ${range.worst.value}, worst around ${formatWhen(range.worst.time, today)}.`,
    );
  }
  if (trend) lines.push(TREND_TEXT[trend]);
  const summary = lines.join(' ');

  const rows = forecast.map((hour) =>
    el('tr', {}, [
      el('th', { scope: 'row' }, [formatWhen(hour.time, today)]),
      el('td', {}, [hour.value ?? 'No data']),
      el('td', {}, [hour.value === null ? '' : categoryFor(standard, hour.value).label]),
    ]),
  );

  return [
    el('p', { class: 'forecast-summary' }, [summary]),
    el('div', { class: 'chart-scroll', tabindex: 0, role: 'region', 'aria-label': 'Forecast chart, scrolls sideways' }, [
      forecastChart(forecast, standard, best, summary, today),
    ]),
    el('details', { class: 'forecast-table' }, [
      el('summary', {}, ['Show hourly figures']),
      el('div', { class: 'table-scroll' }, [
        el('table', {}, [
          el('caption', { class: 'visually-hidden' }, [`Hourly ${standard.shortName} forecast`]),
          el('thead', {}, [
            el('tr', {}, [
              el('th', { scope: 'col' }, ['Time']),
              el('th', { scope: 'col' }, [standard.shortName]),
              el('th', { scope: 'col' }, ['Category']),
            ]),
          ]),
          el('tbody', {}, rows),
        ]),
      ]),
    ]),
  ];
}
