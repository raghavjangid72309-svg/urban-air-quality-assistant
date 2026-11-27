import { svg } from './dom';

/** Line icons on a 24 × 24 grid, drawn with the current text colour. */
const PATHS = {
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  mask: 'M4 9c3-2 13-2 16 0v4c0 3-4 6-8 6s-8-3-8-6Z M4 10H2 M20 10h2 M8 12h8 M8 15h8',
  window: 'M4 4h16v16H4Z M12 4v16 M4 12h16',
  check: 'M5 12.5l4 4L19 7',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M12 7v5l3 2',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5Z',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  return svg('svg', { class: className, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('path', { d: PATHS[name] }),
  ]);
}
