// pattern: Functional Core

const BLUESKY_MAX_GRAPHEMES = 300;

/** Count graphemes in a string using Intl.Segmenter */
export function graphemeLength(text: string): number {
	const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
	let count = 0;
	for (const _ of segmenter.segment(text)) count++;
	return count;
}

/** Truncate text to a grapheme limit, appending … if truncated */
export function truncateToLimit(text: string, limit = BLUESKY_MAX_GRAPHEMES): string {
	const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
	const segments = [...segmenter.segment(text)];
	if (segments.length <= limit) return text;
	return `${segments
		.slice(0, limit - 1)
		.map((s) => s.segment)
		.join('')}…`;
}
