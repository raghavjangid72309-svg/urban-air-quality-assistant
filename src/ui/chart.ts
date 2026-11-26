import type { HourlyAqi } from '../domain/aqi/calculate';
import type { AqiStandard } from '../domain/aqi/standards';
import type { TimeWindow } from '../domain/forecast';
import { formatClock, formatDay, localDate, localHour } from '../domain/time';
import { svg } from './dom';

const BAR = 9;
const GAP = 3;
const LEFT = 34;
const TOP = 12;
const PLOT_HEIGHT = 150;
const BOTTOM = 40;

let chartCount = 0;

/** Rounds the axis up to a category boundary so threshold lines are meaningful. */
function axisMax(standard: AqiStandard, values: readonly number[]): number {
  const peak = Math.max(100, ...values);
  const boundary = standard.categories.find((c) => c.max >= peak);
  return boundary?.max ?? 500;
}

/**
 * Hourly bar chart of the AQI forecast. It is exposed to assistive technology
 * as a single image with a text summary; the same figures are also offered as
 * a table next to it.
 */
export function forecastChart(
  hours: readonly HourlyAqi[],
  standard: AqiStandard,
  best: TimeWindow | null,
  summary: string,
  today: string,
): SVGSVGElement {
  chartCount += 1;
  const titleId = `chart-title-${chartCount}`;
  const descId = `chart-desc-${chartCount}`;

  const width = LEFT + hours.length * (BAR + GAP);
  const height = TOP + PLOT_HEIGHT + BOTTOM;
  const known = hours.flatMap((h) => (h.value === null ? [] : [h.value]));
  const max = axisMax(standard, known);
  const y = (value: number) => TOP + PLOT_HEIGHT - (Math.min(value, max) / max) * PLOT_HEIGHT;
  const x = (index: number) => LEFT + index * (BAR + GAP);

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    'aria-labelledby': `${titleId} ${descId}`,
  });
  root.append(
    svg('title', { id: titleId }, [`Hourly ${standard.shortName} forecast`]),
    svg('desc', { id: descId }, [summary]),
  );

  if (best) {
    const startIndex = hours.findIndex((h) => h.time === best.start);
    const endIndex = hours.findIndex((h) => h.time === best.end);
    if (startIndex >= 0) {
      const span = (endIndex > startIndex ? endIndex : hours.length) - startIndex;
      root.append(
        svg('rect', {
          class: 'chart-best',
          x: x(startIndex) - GAP / 2,
          y: TOP - 8,
          width: span * (BAR + GAP),
          height: PLOT_HEIGHT + 8,
          rx: 3,
        }),
        svg('text', { class: 'chart-best-label', x: x(startIndex), y: TOP - 1 }, ['Best']),
      );
    }
  }

  // Category boundaries as reference lines, e.g. 50, 100, 150.
  for (const category of standard.categories) {
    if (category.max >= max) break;
    const lineY = y(category.max);
    root.append(
      svg('line', { class: 'chart-grid', x1: LEFT, x2: width, y1: lineY, y2: lineY }),
      svg('text', { class: 'chart-axis', x: LEFT - 6, y: lineY + 3, 'text-anchor': 'end' }, [category.max]),
    );
  }

  // Label each new day, and the first bar too unless a new day starts within a few hours.
  const firstMidnight = hours.findIndex((h) => localHour(h.time) === 0);
  const labelFirstDay = firstMidnight < 0 || firstMidnight >= 6;

  hours.forEach((hour, index) => {
    if (hour.value !== null && hour.level !== null) {
      const top = y(hour.value);
      root.append(
        svg('rect', {
          class: `chart-bar level-${hour.level}`,
          x: x(index),
          y: top,
          width: BAR,
          height: Math.max(1, TOP + PLOT_HEIGHT - top),
          rx: 2,
        }),
      );
    }

    const hourOfDay = localHour(hour.time);
    if (hourOfDay % 6 === 0) {
      root.append(
        svg('line', { class: 'chart-tick', x1: x(index), x2: x(index), y1: TOP + PLOT_HEIGHT, y2: TOP + PLOT_HEIGHT + 5 }),
        svg('text', { class: 'chart-axis', x: x(index), y: TOP + PLOT_HEIGHT + 18 }, [formatClock(hour.time)]),
      );
    }
    if (hourOfDay === 0 || (index === 0 && labelFirstDay)) {
      const day = formatDay(localDate(hour.time), today);
      root.append(
        svg('text', { class: 'chart-day', x: x(index), y: TOP + PLOT_HEIGHT + 34 }, [
          day.charAt(0).toUpperCase() + day.slice(1),
        ]),
      );
    }
  });

  root.append(svg('line', { class: 'chart-baseline', x1: LEFT, x2: width, y1: TOP + PLOT_HEIGHT, y2: TOP + PLOT_HEIGHT }));
  return root;
}
