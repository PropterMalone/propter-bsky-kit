// pattern: Imperative Shell

import type { AtpAgent } from '@atproto/api';
import { buildFacets } from './agent.js';
import { graphemeLength } from './grapheme.js';
import { splitForPost } from './text-splitter.js';
import type { PostRef, RateLimiter } from './types.js';

const BLUESKY_MAX_GRAPHEMES = 300;

export interface PostingOptions {
	labels?: string[];
	langs?: string[];
	rateLimiter?: RateLimiter;
}

function buildLabelsRecord(labels?: string[]): Record<string, unknown> {
	if (!labels?.length) return {};
	return {
		labels: {
			$type: 'com.atproto.label.defs#selfLabels',
			values: labels.map((val) => ({ val })),
		},
	};
}

async function doPost(
	agent: AtpAgent,
	record: Record<string, unknown>,
	options?: PostingOptions,
): Promise<PostRef> {
	const text = record.text as string | undefined;
	if (text) {
		const len = graphemeLength(text);
		if (len > BLUESKY_MAX_GRAPHEMES) {
			throw new Error(`post text exceeds 300 grapheme limit (${len} graphemes)`);
		}
	}
	if (options?.rateLimiter) await options.rateLimiter.acquire();
	record.langs = options?.langs ?? ['en'];
	const response = await agent.post(record);
	return { uri: response.uri, cid: response.cid };
}

/** Post a message. Returns the first post ref (convenience wrapper around postMessageChain). */
export async function postMessage(
	agent: AtpAgent,
	text: string,
	options?: PostingOptions,
): Promise<PostRef> {
	const [first] = await postMessageChain(agent, text, options);
	return first;
}

/** Post a message, auto-splitting into a self-reply chain if it exceeds 300 graphemes. */
export async function postMessageChain(
	agent: AtpAgent,
	text: string,
	options?: PostingOptions,
): Promise<[PostRef, ...PostRef[]]> {
	const [firstChunk, ...restChunks] = splitForPost(text);
	const labelsRecord = buildLabelsRecord(options?.labels);

	const { facets: firstFacets } = await buildFacets(agent, firstChunk);
	const firstRecord: Record<string, unknown> = { text: firstChunk, ...labelsRecord };
	if (firstFacets?.length) firstRecord.facets = firstFacets;
	const first = await doPost(agent, firstRecord, options);
	const refs: [PostRef, ...PostRef[]] = [first];

	let prev = first;
	for (const chunk of restChunks) {
		const { facets } = await buildFacets(agent, chunk);
		const record: Record<string, unknown> = {
			text: chunk,
			...labelsRecord,
			reply: {
				parent: { uri: prev.uri, cid: prev.cid },
				root: { uri: first.uri, cid: first.cid },
			},
		};
		if (facets?.length) record.facets = facets;
		prev = await doPost(agent, record, options);
		refs.push(prev);
	}

	return refs;
}

/** Reply to a post. Returns the first post ref. */
export async function replyToPost(
	agent: AtpAgent,
	text: string,
	parent: PostRef,
	root: PostRef,
	options?: PostingOptions,
): Promise<PostRef> {
	const [first] = await replyToPostChain(agent, text, parent, root, options);
	return first;
}

/** Reply to a post, auto-splitting into a chain if needed. */
export async function replyToPostChain(
	agent: AtpAgent,
	text: string,
	parent: PostRef,
	root: PostRef,
	options?: PostingOptions,
): Promise<[PostRef, ...PostRef[]]> {
	const [firstChunk, ...restChunks] = splitForPost(text);
	const labelsRecord = buildLabelsRecord(options?.labels);

	const { facets: firstFacets } = await buildFacets(agent, firstChunk);
	const firstRecord: Record<string, unknown> = {
		text: firstChunk,
		...labelsRecord,
		reply: {
			parent: { uri: parent.uri, cid: parent.cid },
			root: { uri: root.uri, cid: root.cid },
		},
	};
	if (firstFacets?.length) firstRecord.facets = firstFacets;
	const first = await doPost(agent, firstRecord, options);
	const refs: [PostRef, ...PostRef[]] = [first];

	let prev = first;
	for (const chunk of restChunks) {
		const { facets } = await buildFacets(agent, chunk);
		const record: Record<string, unknown> = {
			text: chunk,
			...labelsRecord,
			reply: {
				parent: { uri: prev.uri, cid: prev.cid },
				root: { uri: root.uri, cid: root.cid },
			},
		};
		if (facets?.length) record.facets = facets;
		prev = await doPost(agent, record, options);
		refs.push(prev);
	}

	return refs;
}

/** Post with a quote-embed. Returns the first post ref. */
export async function postWithQuote(
	agent: AtpAgent,
	text: string,
	quoted: PostRef,
	options?: PostingOptions,
): Promise<PostRef> {
	const [first] = await postWithQuoteChain(agent, text, quoted, options);
	return first;
}

/** Post with quote-embed, auto-splitting into chain. Only first post gets the embed. */
export async function postWithQuoteChain(
	agent: AtpAgent,
	text: string,
	quoted: PostRef,
	options?: PostingOptions,
): Promise<[PostRef, ...PostRef[]]> {
	const [firstChunk, ...restChunks] = splitForPost(text);
	const labelsRecord = buildLabelsRecord(options?.labels);

	const { facets: firstFacets } = await buildFacets(agent, firstChunk);
	const firstRecord: Record<string, unknown> = {
		text: firstChunk,
		...labelsRecord,
		embed: {
			$type: 'app.bsky.embed.record',
			record: { uri: quoted.uri, cid: quoted.cid },
		},
	};
	if (firstFacets?.length) firstRecord.facets = firstFacets;
	const first = await doPost(agent, firstRecord, options);
	const refs: [PostRef, ...PostRef[]] = [first];

	let prev = first;
	for (const chunk of restChunks) {
		const { facets } = await buildFacets(agent, chunk);
		const record: Record<string, unknown> = {
			text: chunk,
			...labelsRecord,
			reply: {
				parent: { uri: prev.uri, cid: prev.cid },
				root: { uri: first.uri, cid: first.cid },
			},
		};
		if (facets?.length) record.facets = facets;
		prev = await doPost(agent, record, options);
		refs.push(prev);
	}

	return refs;
}

/** Reply to a post with a quote-embed. Only first post gets the embed. */
export async function replyWithQuote(
	agent: AtpAgent,
	text: string,
	parent: PostRef,
	root: PostRef,
	quoted: PostRef,
	options?: PostingOptions,
): Promise<PostRef> {
	const [first] = await replyWithQuoteChain(agent, text, parent, root, quoted, options);
	return first;
}

/** Reply to a post with a quote-embed, auto-splitting into chain. Only first post gets the embed. */
export async function replyWithQuoteChain(
	agent: AtpAgent,
	text: string,
	parent: PostRef,
	root: PostRef,
	quoted: PostRef,
	options?: PostingOptions,
): Promise<[PostRef, ...PostRef[]]> {
	const [firstChunk, ...restChunks] = splitForPost(text);
	const labelsRecord = buildLabelsRecord(options?.labels);

	const { facets: firstFacets } = await buildFacets(agent, firstChunk);
	const firstRecord: Record<string, unknown> = {
		text: firstChunk,
		...labelsRecord,
		reply: {
			parent: { uri: parent.uri, cid: parent.cid },
			root: { uri: root.uri, cid: root.cid },
		},
		embed: {
			$type: 'app.bsky.embed.record',
			record: { uri: quoted.uri, cid: quoted.cid },
		},
	};
	if (firstFacets?.length) firstRecord.facets = firstFacets;
	const first = await doPost(agent, firstRecord, options);
	const refs: [PostRef, ...PostRef[]] = [first];

	let prev = first;
	for (const chunk of restChunks) {
		const { facets } = await buildFacets(agent, chunk);
		const record: Record<string, unknown> = {
			text: chunk,
			...labelsRecord,
			reply: {
				parent: { uri: prev.uri, cid: prev.cid },
				root: { uri: root.uri, cid: root.cid },
			},
		};
		if (facets?.length) record.facets = facets;
		prev = await doPost(agent, record, options);
		refs.push(prev);
	}

	return refs;
}
