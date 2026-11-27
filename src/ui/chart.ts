import { categoryFor, type HourlyAqi } from '../domain/aqi/calculate';
import type { AqiStandard } from '../domain/aqi/standards';
import type { TimeWindow } from '../domain/forecast';
import { formatClock, formatDay, formatWhen, localDate, localHour } from '../domain/time';
import { svg } from './dom';

const STEP = 12;
const LEFT = 36;
const RIGHT = 14;
const TOP = 22;
const PLOT_HEIGHT = 150;
const BOTTOM = 42;

let chartCount = 0;

type Point = readonly [x: number, y: number];

/** Rounds the axis up to a category boundary so threshold lines are meaningful. */
function axisMax(standard: AqiStandard, values: readonly number[]): number {
  const peak = Math.max(100, ...values);
  return standard.categories.find((c) => c.max >= peak)?.max ?? 500;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Smooth curve through the points (Catmull-Rom converted to cubic Béziers).
 * Control points are clamped to the plot so the curve never dips below zero.
 */
export function smoothPath(points: readonly Point[], minY: number, maxY: number): string {
  const [first] = points;
  if (!first) return '';
  const clampY = (y: number) => Math.min(maxY, Math.max(minY, y));
  let d = `M${fmt(first[0])} ${fmt(first[1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

/** Splits the series into runs of consecutive hours that have data. */
function runs(hours: readonly HourlyAqi[]): { index: number; value: number }[][] {
  const result: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  hours.forEach((hour, index) => {
    if (hour.value === null) {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push({ index, value: hour.value });
    }
  });
  if (current.length > 0) result.push(current);
  return result;
}

/**
 * Hourly AQI forecast as a smooth line whose colour follows the AQI bands, over
 * a soft area. It is exposed to assistive technology as one image with a text
 * summary; the same figures are offered as a table next to it. Each hour also
 * has a native tooltip for pointer users.
 */
export function forecastChart(
  hours: readonly HourlyAqi[],
  standard: AqiStandard,
  best: TimeWindow | null,
  summary: string,
  today: string,
): SVGSVGElement {
  chartCount += 1;
  const id = (name: string) => `chart-${name}-${chartCount}`;

  const width = LEFT + Math.max(1, hours.length - 1) * STEP + RIGHT;
  const height = TOP + PLOT_HEIGHT + BOTTOM;
  const base = TOP + PLOT_HEIGHT;
  const known = hours.flatMap((h) => (h.value === null ? [] : [h.value]));
  const max = axisMax(standard, known);
  const x = (index: number) => LEFT + index * STEP;
  const y = (value: number) => base - (Math.min(value, max) / max) * PLOT_HEIGHT;

  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    'aria-labelledby': `${id('title')} ${id('desc')}`,
  });
  root.append(
    svg('title', { id: id('title') }, [`Hourly ${standard.shortName} forecast`]),
    svg('desc', { id: id('desc') }, [summary]),
  );

  // The line's colour changes with its height: each AQI band gets its own colour.
  const lineStops = standard.categories
    .filter((c) => c.min < max)
    .flatMap((c) => [
      svg('stop', { class: `chart-stop level-${c.level}`, offset: (c.min / max).toFixed(4) }),
      svg('stop', { class: `chart-stop level-${c.level}`, offset: (Math.min(c.max, max) / max).toFixed(4) }),
    ]);
  root.append(
    svg('defs', {}, [
      svg('linearGradient', { id: id('line'), gradientUnits: 'userSpaceOnUse', x1: 0, y1: base, x2: 0, y2: TOP }, lineStops),
      svg('linearGradient', { id: id('area'), x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svg('stop', { class: 'chart-area-top', offset: 0 }),
        svg('stop', { class: 'chart-area-bottom', offset: 1 }),
      ]),
    ]),
  );

  // Category boundaries as reference lines, up to and including the top of the axis.
  for (const category of standard.categories) {
    if (category.max > max) break;
    const lineY = y(category.max);
    root.append(
      svg('line', { class: 'chart-grid', x1: LEFT, x2: width - RIGHT, y1: lineY, y2: lineY }),
      svg('text', { class: 'chart-axis', x: LEFT - 8, y: lineY + 3, 'text-anchor': 'end' }, [category.max]),
    );
  }

  if (best) {
    const startIndex = hours.findIndex((h) => h.time === best.start);
    const endIndex = hours.findIndex((h) => h.time === best.end);
    if (startIndex >= 0) {
      const last = endIndex > startIndex ? endIndex : hours.length - 1;
      root.append(
        svg('rect', {
          class: 'chart-best',
          x: x(startIndex) - STEP / 2,
          y: TOP - 10,
          width: (last - startIndex) * STEP + STEP,
          height: PLOT_HEIGHT + 10,
          rx: 6,
        }),
        svg('text', { class: 'chart-best-label', x: x(startIndex) - STEP / 2 + 4, y: TOP - 1 }, ['Best time']),
      );
    }
  }

  for (const run of runs(hours)) {
    const points: Point[] = run.map(({ index, value }) => [x(index), y(value)]);
    const [firstPoint] = points;
    const lastPoint = points.at(-1);
    if (!firstPoint || !lastPoint) continue;
    if (points.length === 1) {
      root.append(svg('circle', { class: 'chart-point', cx: firstPoint[0], cy: firstPoint[1], r: 3 }));
      continue;
    }
    const line = smoothPath(points, TOP, base);
    root.append(
      svg('path', {
        class: 'chart-area',
        d: `${line} L${fmt(lastPoint[0])} ${base} L${fmt(firstPoint[0])} ${base} Z`,
        fill: `url(#${id('area')})`,
      }),
      svg('path', { class: 'chart-line', d: line, stroke: `url(#${id('line')})`, pathLength: 1 }),
    );
  }

  // "Now" marker on the first hour.
  const nowValue = hours[0]?.value ?? null;
  if (nowValue !== null) {
    root.append(
      svg('circle', { class: 'chart-now-ring', cx: x(0), cy: y(nowValue), r: 9 }),
      svg('circle', { class: 'chart-now', cx: x(0), cy: y(nowValue), r: 4.5 }),
    );
  }

  // Axis labels.
  const firstMidnight = hours.findIndex((h) => localHour(h.time) === 0);
  const labelFirstDay = firstMidnight < 0 || firstMidnight >= 6;
  hours.forEach((hour, index) => {
    const hourOfDay = localHour(hour.time);
    if (hourOfDay % 6 === 0) {
      root.append(svg('text', { class: 'chart-axis', x: x(index), y: base + 18, 'text-anchor': 'middle' }, [formatClock(hour.time)]));
    }
    if (hourOfDay === 0 || (index === 0 && labelFirstDay)) {
      const day = formatDay(localDate(hour.time), today);
      root.append(
        svg('text', { class: 'chart-day', x: x(index), y: base + 34, 'text-anchor': index === 0 ? 'start' : 'middle' }, [
          day.charAt(0).toUpperCase() + day.slice(1),
        ]),
      );
    }
  });

  // Invisible column per hour: hover highlight and a native tooltip with the value.
  hours.forEach((hour, index) => {
    const label = hour.value === null ? 'no data' : `${standard.shortName} ${hour.value}, ${categoryFor(standard, hour.value).label}`;
    root.append(
      svg('rect', { class: 'chart-hit', x: x(index) - STEP / 2, y: TOP - 10, width: STEP, height: PLOT_HEIGHT + 10 }, [
        svg('title', {}, [`${formatWhen(hour.time, today)}: ${label}`]),
      ]),
    );
  });

  return root;
}
