import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoopRateLimiter, createRateLimiter } from './rate-limiter.js';

describe('createRateLimiter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows requests under the limit', async () => {
		const limiter = createRateLimiter({ windowMs: 10_000, maxPerWindow: 3 });
		await limiter.acquire();
		await limiter.acquire();
		await limiter.acquire();
		// All three should resolve immediately (no waiting)
	});

	it('delays when window is full', async () => {
		const limiter = createRateLimiter({ windowMs: 10_000, maxPerWindow: 1 });
		await limiter.acquire(); // First call at t=0

		// Second acquire should create a setTimeout
		const acquirePromise = limiter.acquire();
		// Advance past the window + 100ms buffer
		await vi.advanceTimersByTimeAsync(10_200);
		await acquirePromise;
	});

	it('prunes expired timestamps', async () => {
		const limiter = createRateLimiter({ windowMs: 1000, maxPerWindow: 1 });
		await limiter.acquire();

		// Advance past the window
		vi.advanceTimersByTime(1100);

		// This should succeed without delay because the old timestamp is expired
		await limiter.acquire();
	});
});

describe('createNoopRateLimiter', () => {
	it('never blocks', async () => {
		const limiter = createNoopRateLimiter();
		// Should all resolve immediately
		for (let i = 0; i < 100; i++) {
			await limiter.acquire();
		}
	});
});
