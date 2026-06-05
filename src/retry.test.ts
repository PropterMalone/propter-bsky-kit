import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryFetch, withRetry } from './retry.js';

describe('retryFetch', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns result on success', async () => {
		const result = await retryFetch(async () => 42);
		expect(result).toBe(42);
	});

	it('retries on "fetch failed" errors', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			if (calls < 3) throw new Error('fetch failed');
			return 'ok';
		};

		const promise = retryFetch(fn);
		await vi.advanceTimersByTimeAsync(1000); // retry 1 delay
		await vi.advanceTimersByTimeAsync(2000); // retry 2 delay
		const result = await promise;

		expect(result).toBe('ok');
		expect(calls).toBe(3);
	});

	it('throws non-transient errors immediately', async () => {
		const fn = async () => {
			throw new Error('auth failed');
		};

		await expect(retryFetch(fn)).rejects.toThrow('auth failed');
	});

	it('throws after exhausting retries on transient errors', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			throw new Error('ECONNRESET');
		};

		const promise = retryFetch(fn, 1).catch((e: Error) => e);
		await vi.advanceTimersByTimeAsync(1100);
		const result = await promise;
		expect(result).toBeInstanceOf(Error);
		expect((result as Error).message).toBe('ECONNRESET');
		expect(calls).toBe(2);
	});

	it('respects custom retry count', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			throw new Error('fetch failed');
		};

		const promise = retryFetch(fn, 0);
		await expect(promise).rejects.toThrow('fetch failed');
		expect(calls).toBe(1); // No retries
	});

	it('recognizes SOCKET as retryable', async () => {
		let calls = 0;
		const fn = async () => {
			calls++;
			if (calls === 1) throw new Error('SOCKET hangup');
			return 'recovered';
		};

		const promise = retryFetch(fn);
		await vi.advanceTimersByTimeAsync(1000);
		const result = await promise;
		expect(result).toBe('recovered');
	});

	it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'])(
		'recognizes %s as retryable',
		async (errorType) => {
			let calls = 0;
			const fn = async () => {
				calls++;
				if (calls === 1) throw new Error(errorType);
				return 'recovered';
			};

			const promise = retryFetch(fn);
			await vi.advanceTimersByTimeAsync(1000);
			const result = await promise;
			expect(result).toBe('recovered');
		},
	);
});

describe('withRetry', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('wraps fetch and retries on transient errors', async () => {
		let calls = 0;
		const mockFetch = vi.fn<typeof globalThis.fetch>(async () => {
			calls++;
			if (calls === 1) throw new Error('fetch failed');
			return new Response('ok');
		});

		const retryingFetch = withRetry(mockFetch);
		const promise = retryingFetch('https://example.com');
		await vi.advanceTimersByTimeAsync(1000);
		const response = await promise;

		expect(await response.text()).toBe('ok');
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it('passes through input and init to underlying fetch', async () => {
		const mockFetch = vi.fn<typeof globalThis.fetch>(async () => new Response('ok'));
		const retryingFetch = withRetry(mockFetch);

		await retryingFetch('https://example.com/api', { method: 'POST', body: 'data' });

		expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', {
			method: 'POST',
			body: 'data',
		});
	});

	it('does not retry non-transient errors', async () => {
		const mockFetch = vi.fn<typeof globalThis.fetch>(async () => {
			throw new Error('401 Unauthorized');
		});

		const retryingFetch = withRetry(mockFetch);
		await expect(retryingFetch('https://example.com')).rejects.toThrow('401 Unauthorized');
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
