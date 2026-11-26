export interface CacheOptions {
  /** Time to live in milliseconds. */
  readonly ttlMs: number;
  /** Oldest entries are evicted beyond this size. */
  readonly maxEntries: number;
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

/**
 * Small TTL + LRU cache that also de-duplicates concurrent loads of the same
 * key, so switching back and forth between cities never re-downloads data.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inFlight = new Map<string, Promise<V>>();
  private readonly now: () => number;

  constructor(private readonly options: CacheOptions) {
    this.now = options.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Returns a cached value, joins a pending load, or starts a new one. Failures are not cached. */
  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}
