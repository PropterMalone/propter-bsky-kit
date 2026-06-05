import { describe, expect, it } from 'vitest';
import { graphemeLength } from './grapheme.js';
import { splitForPost } from './text-splitter.js';

describe('splitForPost', () => {
	it('returns single chunk for short text', () => {
		const result = splitForPost('hello world');
		expect(result).toEqual(['hello world']);
	});

	it('returns single chunk for text exactly at limit', () => {
		const text = 'a'.repeat(300);
		const result = splitForPost(text);
		expect(result).toEqual([text]);
	});

	it('always returns at least one element (non-empty tuple)', () => {
		const result = splitForPost('');
		expect(result.length).toBeGreaterThanOrEqual(1);
	});

	it('splits on paragraph boundaries', () => {
		const para1 = 'a'.repeat(200);
		const para2 = 'b'.repeat(200);
		const text = `${para1}\n\n${para2}`;
		const result = splitForPost(text);
		expect(result).toEqual([para1, para2]);
	});

	it('packs multiple short paragraphs into one chunk', () => {
		const text = 'short para 1\n\nshort para 2\n\nshort para 3';
		const result = splitForPost(text);
		expect(result).toEqual([text]);
	});

	it('splits on line boundaries when a paragraph exceeds limit', () => {
		const line1 = 'a'.repeat(200);
		const line2 = 'b'.repeat(200);
		const text = `${line1}\n${line2}`;
		const result = splitForPost(text);
		expect(result).toEqual([line1, line2]);
	});

	it('splits on space boundaries when a line exceeds limit', () => {
		const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
		const result = splitForPost(words);
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(graphemeLength(chunk)).toBeLessThanOrEqual(300);
		}
	});

	it('does not split inside @mentions', () => {
		// @mention with long handle should stay together
		const mention = '@thisisaverylonghandle.bsky.social';
		const text = `${'word '.repeat(55)}${mention} end`;
		const result = splitForPost(text);
		// The mention should appear intact in one of the chunks
		const chunkWithMention = result.find((c) => c.includes(mention));
		expect(chunkWithMention).toBeDefined();
	});

	it('hard-splits a single oversized token by grapheme', () => {
		const bigWord = 'x'.repeat(600);
		const result = splitForPost(bigWord);
		expect(result.length).toBe(2);
		for (const chunk of result) {
			expect(graphemeLength(chunk)).toBeLessThanOrEqual(300);
		}
	});

	it('handles custom limit', () => {
		const text = 'hello world foo bar';
		const result = splitForPost(text, 10);
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(graphemeLength(chunk)).toBeLessThanOrEqual(10);
		}
	});

	it('handles emoji correctly when splitting', () => {
		const emoji = '👨‍👩‍👧‍👦'; // 1 grapheme, many bytes
		const text = Array.from({ length: 350 }, () => emoji).join(' ');
		const result = splitForPost(text);
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(graphemeLength(chunk)).toBeLessThanOrEqual(300);
		}
	});
});
