import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from './cache';

function createCache(maxEntries = 3) {
  let time = 0;
  const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries, now: () => time });
  return { cache, advance: (ms: number) => (time += ms) };
}

describe('TtlCache', () => {
  it('returns values until they expire', () => {
    const { cache, advance } = createCache();
    cache.set('a', 'apple');
    advance(999);
    expect(cache.get('a')).toBe('apple');
    advance(1);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry', () => {
    const { cache } = createCache(2);
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.get('a');
    cache.set('c', 'cherry');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('apple');
    expect(cache.get('c')).toBe('cherry');
  });

  it('shares one load between concurrent callers', async () => {
    const { cache } = createCache();
    const load = vi.fn(() => Promise.resolve('value'));
    const results = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
    expect(results).toEqual(['value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const { cache } = createCache();
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    await expect(cache.getOrLoad('k', load)).rejects.toThrow('offline');
    await expect(cache.getOrLoad('k', load)).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('can be cleared', () => {
    const { cache } = createCache();
    cache.set('a', 'apple');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('uses the system clock by default', () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 1 });
    cache.set('n', 1);
    expect(cache.get('n')).toBe(1);
  });
});
