// pattern: Functional Core

import { graphemeLength } from './grapheme.js';

const BLUESKY_MAX_GRAPHEMES = 300;

/**
 * Split text into chunks that each fit within Bluesky's grapheme limit.
 * Split strategy (greedy packing):
 *   1. Split on \n\n (paragraph boundaries)
 *   2. If a paragraph exceeds limit, split on \n
 *   3. If a line exceeds limit, split on space boundaries
 *   4. Never split inside an @mention (@+non-whitespace is atomic)
 *   5. Hard-split single oversized tokens by grapheme (last resort)
 */
export function splitForPost(text: string, limit = BLUESKY_MAX_GRAPHEMES): [string, ...string[]] {
	if (graphemeLength(text) <= limit) return [text];

	const paragraphs = text.split('\n\n');
	const chunks: string[] = [];
	let current = '';

	for (const para of paragraphs) {
		const candidate = current ? `${current}\n\n${para}` : para;
		if (graphemeLength(candidate) <= limit) {
			current = candidate;
		} else if (!current) {
			for (const piece of splitParagraph(para, limit)) {
				chunks.push(piece);
			}
		} else {
			chunks.push(current);
			if (graphemeLength(para) <= limit) {
				current = para;
			} else {
				current = '';
				for (const piece of splitParagraph(para, limit)) {
					chunks.push(piece);
				}
			}
		}
	}
	if (current) chunks.push(current);

	return chunks as [string, ...string[]];
}

function splitParagraph(para: string, limit: number): string[] {
	const lines = para.split('\n');
	const chunks: string[] = [];
	let current = '';

	for (const line of lines) {
		const candidate = current ? `${current}\n${line}` : line;
		if (graphemeLength(candidate) <= limit) {
			current = candidate;
		} else if (!current) {
			for (const piece of splitLine(line, limit)) {
				chunks.push(piece);
			}
		} else {
			chunks.push(current);
			if (graphemeLength(line) <= limit) {
				current = line;
			} else {
				current = '';
				for (const piece of splitLine(line, limit)) {
					chunks.push(piece);
				}
			}
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

function splitLine(line: string, limit: number): string[] {
	const tokens = tokenize(line);
	const chunks: string[] = [];
	let current = '';

	for (const token of tokens) {
		const candidate = current ? `${current} ${token}` : token;
		if (graphemeLength(candidate) <= limit) {
			current = candidate;
		} else {
			if (current) chunks.push(current);
			if (graphemeLength(token) > limit) {
				const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
				let buf = '';
				for (const { segment } of segmenter.segment(token)) {
					if (graphemeLength(buf + segment) > limit) {
						chunks.push(buf);
						buf = segment;
					} else {
						buf += segment;
					}
				}
				current = buf;
			} else {
				current = token;
			}
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

/** Split text on spaces, but never break inside @mentions */
function tokenize(text: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	let current = '';

	while (i < text.length) {
		if (text[i] === '@') {
			let mention = '@';
			i++;
			while (i < text.length && !/\s/.test(text[i] ?? '')) {
				mention += text[i];
				i++;
			}
			current += mention;
		} else if (text[i] === ' ') {
			if (current) tokens.push(current);
			current = '';
			i++;
		} else {
			current += text[i];
			i++;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}
