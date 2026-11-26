import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test-utils/fixtures';
import { ApiError, describeError, getJson, type FetchLike } from './http';

const url = new URL('https://example.test/data');

/** A fetch that never resolves until its signal aborts, like a stalled connection. */
const hangingFetch: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) reject(signal.reason as Error);
    signal?.addEventListener('abort', () => {
      reject(signal.reason as Error);
    });
  });

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected the request to fail');
}

describe('getJson', () => {
  it('returns parsed JSON and sends no credentials or referrer', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse({ ok: true })));
    await expect(getJson(url, { fetchImpl })).resolves.toEqual({ ok: true });

    const [input, init] = fetchImpl.mock.calls[0] ?? [];
    expect(input).toBe(url.toString());
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('reports HTTP errors with their status', async () => {
    const error = await failure(getJson(url, { fetchImpl: () => Promise.resolve(jsonResponse({}, 503)) }));
    expect(error).toMatchObject({ kind: 'http', status: 503 });
  });

  it('reports unreadable bodies', async () => {
    const fetchImpl = () => Promise.resolve(new Response('<html>', { status: 200 }));
    expect((await failure(getJson(url, { fetchImpl }))).kind).toBe('parse');
  });

  it('reports network failures', async () => {
    const fetchImpl = () => Promise.reject(new TypeError('Failed to fetch'));
    const error = await failure(getJson(url, { fetchImpl }));
    expect(error.kind).toBe('network');
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('times out slow requests', async () => {
    expect((await failure(getJson(url, { fetchImpl: hangingFetch, timeoutMs: 5 }))).kind).toBe('timeout');
  });

  it('distinguishes cancellation by the caller', async () => {
    const controller = new AbortController();
    const pending = getJson(url, { fetchImpl: hangingFetch, signal: controller.signal });
    controller.abort();
    expect((await failure(pending)).kind).toBe('aborted');

    const already = AbortSignal.abort();
    expect((await failure(getJson(url, { fetchImpl: hangingFetch, signal: already }))).kind).toBe('aborted');
  });
});

describe('describeError', () => {
  it.each([
    [new ApiError('network', ''), /internet connection/],
    [new ApiError('timeout', ''), /slow to respond/],
    [new ApiError('http', '', 429), /Too many requests/],
    [new ApiError('http', '', 500), /having trouble/],
    [new ApiError('aborted', ''), /cancelled/],
    [new ApiError('parse', ''), /could not be read/],
    [new ApiError('invalid', ''), /could not be read/],
    [new Error('boom'), /Something went wrong/],
  ])('explains %o in plain language', (error, message) => {
    expect(describeError(error)).toMatch(message);
  });
});
