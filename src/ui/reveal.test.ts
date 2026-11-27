import { describe, expect, it, vi } from 'vitest';
import { revealOnScroll } from './reveal';

type Callback = (entries: { target: Element; isIntersecting: boolean }[]) => void;

/** Minimal IntersectionObserver stand-in that lets a test trigger intersections. */
function fakeObserver() {
  const observed = new Set<Element>();
  let callback: Callback = () => undefined;
  const disconnect = vi.fn();
  class Observer {
    constructor(cb: Callback) {
      callback = cb;
    }
    observe(target: Element) {
      observed.add(target);
    }
    unobserve(target: Element) {
      observed.delete(target);
    }
    disconnect() {
      disconnect();
    }
  }
  return {
    Observer: Observer as unknown as typeof IntersectionObserver,
    observed,
    disconnect,
    fire: (entries: { target: Element; isIntersecting: boolean }[]) => {
      callback(entries);
    },
  };
}

const motionOk = { matches: false } as MediaQueryList;
const section = () => document.createElement('section');

describe('revealOnScroll', () => {
  it('shows everything at once without IntersectionObserver', () => {
    const targets = [section(), section()];
    revealOnScroll(targets, { matchMedia: () => motionOk });
    expect(targets.every((t) => t.classList.contains('in-view') && !t.classList.contains('reveal'))).toBe(true);
  });

  it('shows everything at once when motion is reduced', () => {
    const { Observer } = fakeObserver();
    const target = section();
    revealOnScroll([target], { IntersectionObserver: Observer, matchMedia: () => ({ matches: true }) as MediaQueryList });
    expect(target.classList.contains('in-view')).toBe(true);
  });

  it('reveals each section once as it scrolls into view', () => {
    const fake = fakeObserver();
    const [first, second] = [section(), section()];
    const cleanup = revealOnScroll([first, second], { IntersectionObserver: fake.Observer, matchMedia: () => motionOk });

    expect(first.classList.contains('reveal')).toBe(true);
    expect(first.classList.contains('in-view')).toBe(false);
    expect(fake.observed.size).toBe(2);

    fake.fire([
      { target: first, isIntersecting: true },
      { target: second, isIntersecting: false },
    ]);
    expect(first.classList.contains('in-view')).toBe(true);
    expect(second.classList.contains('in-view')).toBe(false);
    expect(fake.observed.has(first)).toBe(false);

    cleanup();
    expect(fake.disconnect).toHaveBeenCalled();
  });
});
