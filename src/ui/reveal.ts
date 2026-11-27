import { prefersReducedMotion, type MotionWindow } from './motion';

type RevealWindow = Partial<MotionWindow> & { IntersectionObserver?: typeof IntersectionObserver };

/**
 * Fades sections in as they scroll into view, once each. Without
 * IntersectionObserver, or when the user prefers reduced motion, everything is
 * shown straight away; content is never left hidden. Returns a cleanup function.
 */
export function revealOnScroll(targets: Iterable<Element>, win: RevealWindow): () => void {
  const elements = [...targets];
  const Observer = win.IntersectionObserver;
  if (!Observer || prefersReducedMotion(win)) {
    for (const target of elements) target.classList.add('in-view');
    return () => undefined;
  }

  const observer = new Observer(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
  );
  for (const target of elements) {
    target.classList.add('reveal');
    observer.observe(target);
  }
  return () => {
    observer.disconnect();
  };
}
