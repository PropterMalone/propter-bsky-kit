// pattern: Functional Core

const TRANSIENT_ERROR_PATTERNS = [
	'fetch failed',
	'SOCKET',
	'ECONNRESET',
	'ECONNREFUSED',
	'ETIMEDOUT',
	'EPIPE',
	'UND_ERR_CONNECT_TIMEOUT',
];

function isTransientError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return TRANSIENT_ERROR_PATTERNS.some((pattern) => err.message.includes(pattern));
}

/** Retry an async operation on transient network errors. Throws immediately on other errors. */
export async function retryFetch<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (!isTransientError(err) || attempt >= retries) throw err;
			await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
		}
	}
}

/** Wrap the global fetch with transient error retry. Drop-in replacement for AtpAgent's fetch option. */
export function withRetry(
	fetchImpl: typeof globalThis.fetch = globalThis.fetch,
	retries = 2,
): typeof globalThis.fetch {
	return (input, init?) => retryFetch(() => fetchImpl(input, init), retries);
}
