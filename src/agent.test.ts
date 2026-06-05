import { describe, expect, it } from 'vitest';
import { extractRkey } from './agent.js';

describe('extractRkey', () => {
	it('extracts rkey from valid AT URI', () => {
		expect(extractRkey('at://did:plc:abc123/app.bsky.feed.post/3k2abc')).toBe('3k2abc');
	});

	it('extracts rkey from threadgate URI', () => {
		expect(extractRkey('at://did:plc:abc123/app.bsky.feed.threadgate/3k2abc')).toBe('3k2abc');
	});

	it('throws on empty string', () => {
		expect(() => extractRkey('')).toThrow('invalid AT URI');
	});
});
