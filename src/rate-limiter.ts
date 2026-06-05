// pattern: Functional Core

import type { RateLimiter } from './types.js';

export interface RateLimiterConfig {
	windowMs: number;
	maxPerWindow: number;
}

/** Sliding-window rate limiter. Waits when the window is full. */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
	const timestamps: number[] = [];

	return {
		async acquire(): Promise<void> {
			const now = Date.now();
			// Prune expired timestamps
			while (timestamps.length > 0 && timestamps[0]! < now - config.windowMs) {
				timestamps.shift();
			}
			if (timestamps.length >= config.maxPerWindow) {
				const waitMs = timestamps[0]! + config.windowMs - now + 100;
				await new Promise((r) => setTimeout(r, waitMs));
			}
			timestamps.push(Date.now());
		},
	};
}

/** No-op rate limiter — never blocks. Use when rate limiting is not needed. */
export function createNoopRateLimiter(): RateLimiter {
	return {
		async acquire() {},
	};
}
