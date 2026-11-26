/** The parts of `window` that animation needs, so tests can supply their own. */
export type MotionWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> & {
  matchMedia?: Window['matchMedia'];
};

/** True when the user asked for less motion, or when motion cannot be detected (e.g. no matchMedia). */
export function prefersReducedMotion(win: Partial<MotionWindow>): boolean {
  return typeof win.matchMedia !== 'function' || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Counts a number up (or down) in `node` over `durationMs`. Jumps straight to
 * the final value when motion is reduced. Returns a function that stops the
 * animation and shows the final value.
 */
export function animateNumber(
  node: HTMLElement,
  from: number,
  to: number,
  win: Partial<MotionWindow>,
  durationMs = 900,
): () => void {
  const finish = () => {
    node.textContent = String(to);
  };
  const { requestAnimationFrame: request, cancelAnimationFrame: cancel } = win;
  if (from === to || prefersReducedMotion(win) || !request || !cancel) {
    finish();
    return finish;
  }

  let start: number | null = null;
  let frame = 0;
  const step = (time: number) => {
    start ??= time;
    const progress = Math.min(1, (time - start) / durationMs);
    node.textContent = String(Math.round(from + (to - from) * easeOutCubic(progress)));
    if (progress < 1) frame = request(step);
  };

  node.textContent = String(from);
  frame = request(step);
  return () => {
    cancel(frame);
    finish();
  };
}
