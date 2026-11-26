export type ApiErrorKind = 'network' | 'timeout' | 'aborted' | 'http' | 'parse' | 'invalid';

/** A failed request, classified so the UI can show a helpful message. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/** Merges the caller's signal with a timeout, cleaning up the timer afterwards. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);
  const onAbort = () => {
    controller.abort(signal?.reason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * GETs a JSON document. Credentials and referrer are never sent, and every
 * failure is normalised into an {@link ApiError}.
 */
export async function getJson(url: URL, options: RequestOptions = {}): Promise<unknown> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch.bind(globalThis) } = options;
  if (signal?.aborted) throw new ApiError('aborted', 'Request was cancelled');
  const request = withTimeout(signal, timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: request.signal,
      });
    } catch (error) {
      if (signal?.aborted) throw new ApiError('aborted', 'Request was cancelled', undefined, { cause: error });
      if (request.signal.aborted) throw new ApiError('timeout', 'The air quality service took too long to respond', undefined, { cause: error });
      throw new ApiError('network', 'Could not reach the air quality service', undefined, { cause: error });
    }

    if (!response.ok) {
      throw new ApiError('http', `The service responded with status ${response.status}`, response.status);
    }

    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new ApiError('parse', 'The service sent a response that could not be read', undefined, { cause: error });
    }
  } finally {
    request.dispose();
  }
}

/** Plain-language message for an error of any type. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':
        return 'Could not connect. Check your internet connection and try again.';
      case 'timeout':
        return 'The air quality service is slow to respond. Please try again in a moment.';
      case 'http':
        return error.status === 429
          ? 'Too many requests right now. Please wait a minute and try again.'
          : 'The air quality service is having trouble. Please try again later.';
      case 'aborted':
        return 'The request was cancelled.';
      case 'parse':
      case 'invalid':
        return 'The air quality data could not be read. Please try again later.';
    }
  }
  return 'Something went wrong. Please try again.';
}
