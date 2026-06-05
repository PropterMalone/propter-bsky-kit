import { describe, expect, it } from 'vitest';
import { graphemeLength, truncateToLimit } from './grapheme.js';

describe('graphemeLength', () => {
	it('counts ASCII characters', () => {
		expect(graphemeLength('hello')).toBe(5);
	});

	it('counts empty string as 0', () => {
		expect(graphemeLength('')).toBe(0);
	});

	it('counts emoji as single graphemes', () => {
		expect(graphemeLength('👋')).toBe(1);
		expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1); // family emoji = 1 grapheme
	});

	it('counts flag emoji as single graphemes', () => {
		expect(graphemeLength('🇺🇸')).toBe(1);
	});

	it('counts mixed ASCII and emoji', () => {
		expect(graphemeLength('hi 👋')).toBe(4);
	});

	it('counts combining characters correctly', () => {
		// é as e + combining acute accent = 1 grapheme
		expect(graphemeLength('e\u0301')).toBe(1);
	});
});

describe('truncateToLimit', () => {
	it('returns text unchanged when within limit', () => {
		expect(truncateToLimit('hello', 10)).toBe('hello');
	});

	it('returns text unchanged when exactly at limit', () => {
		expect(truncateToLimit('hello', 5)).toBe('hello');
	});

	it('truncates and adds ellipsis when over limit', () => {
		const result = truncateToLimit('hello world', 6);
		expect(graphemeLength(result)).toBe(6);
		expect(result).toBe('hello…');
	});

	it('handles emoji truncation correctly', () => {
		const result = truncateToLimit('hi 👋 there', 4);
		expect(result).toBe('hi …');
		expect(graphemeLength(result)).toBe(4);
	});

	it('uses 300 as default limit', () => {
		const short = 'a'.repeat(300);
		expect(truncateToLimit(short)).toBe(short);

		const long = 'a'.repeat(301);
		const result = truncateToLimit(long);
		expect(graphemeLength(result)).toBe(300);
		expect(result.endsWith('…')).toBe(true);
	});
});
