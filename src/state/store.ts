export type Listener<S> = (state: S, previous: S) => void;

export interface Store<S> {
  getState(): S;
  setState(update: Partial<S> | ((state: S) => Partial<S>)): void;
  subscribe(listener: Listener<S>): () => void;
}

/** Minimal observable store: immutable snapshots, synchronous notifications. */
export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<Listener<S>>();

  return {
    getState: () => state,
    setState(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
