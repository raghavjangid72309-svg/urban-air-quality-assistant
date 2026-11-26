import { describe, expect, it, vi } from 'vitest';
import { animateNumber, prefersReducedMotion, type MotionWindow } from './motion';

/** A window whose animation frames run only when `tick` is called. */
function fakeWindow(reduced = false) {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const win: MotionWindow = {
    matchMedia: ((query: string) => ({ matches: reduced, media: query })) as unknown as Window['matchMedia'],
    requestAnimationFrame: (callback) => {
      callbacks.set(nextId, callback);
      return nextId++;
    },
    cancelAnimationFrame: (id) => {
      callbacks.delete(id);
    },
  };
  const tick = (time: number) => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(time);
  };
  return { win, tick, pending: () => callbacks.size };
}

describe('prefersReducedMotion', () => {
  it('follows the media query', () => {
    expect(prefersReducedMotion(fakeWindow(true).win)).toBe(true);
    expect(prefersReducedMotion(fakeWindow(false).win)).toBe(false);
  });

  it('assumes reduced motion when it cannot tell', () => {
    expect(prefersReducedMotion({})).toBe(true);
  });
});

describe('animateNumber', () => {
  it('counts up with easing and lands on the final value', () => {
    const { win, tick, pending } = fakeWindow();
    const node = document.createElement('span');
    animateNumber(node, 0, 200, win, 1000);
    expect(node.textContent).toBe('0');

    tick(0);
    expect(node.textContent).toBe('0');
    tick(500);
    // Ease-out: past the halfway value at half time.
    expect(Number(node.textContent)).toBeGreaterThan(100);
    tick(1000);
    expect(node.textContent).toBe('200');
    expect(pending()).toBe(0);
  });

  it('counts down too', () => {
    const { win, tick } = fakeWindow();
    const node = document.createElement('span');
    animateNumber(node, 300, 120, win, 100);
    tick(0);
    tick(100);
    expect(node.textContent).toBe('120');
  });

  it('can be stopped early and still shows the final value', () => {
    const { win, tick, pending } = fakeWindow();
    const node = document.createElement('span');
    const stop = animateNumber(node, 0, 80, win, 1000);
    tick(0);
    stop();
    expect(node.textContent).toBe('80');
    expect(pending()).toBe(0);
  });

  it('jumps straight to the value when motion is reduced, unavailable or unnecessary', () => {
    const request = vi.fn();
    const node = document.createElement('span');

    animateNumber(node, 0, 42, { ...fakeWindow(true).win, requestAnimationFrame: request }, 1000);
    expect(node.textContent).toBe('42');

    animateNumber(node, 0, 43, {}, 1000);
    expect(node.textContent).toBe('43');

    animateNumber(node, 44, 44, { ...fakeWindow(false).win, requestAnimationFrame: request }, 1000);
    expect(node.textContent).toBe('44');
    expect(request).not.toHaveBeenCalled();
  });
});
