import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
  it('merges updates and notifies listeners with the previous state', () => {
    const store = createStore({ count: 0, label: 'a' });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ count: 1 });
    store.setState((s) => ({ count: s.count + 1 }));

    expect(store.getState()).toEqual({ count: 2, label: 'a' });
    expect(listener).toHaveBeenLastCalledWith({ count: 2, label: 'a' }, { count: 1, label: 'a' });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore({ value: 1 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setState({ value: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
