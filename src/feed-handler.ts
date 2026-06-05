// pattern: Imperative Shell

import type { FeedHandler, FeedInfo, FeedSkeleton } from './types.js';

export interface FeedHandlerConfig {
	publisherDid: string;
	/** rkey prefix for feed URIs (e.g. "skeetwolf", "diplo", "autogolpe") */
	rkeyPrefix: string;
	/** Query posts for a given feed key. Return ordered by indexedAt DESC. */
	getPosts: (
		feedKey: string,
		limit: number,
		cursor?: number,
	) => { uri: string; indexedAt: number }[];
	/** List all available feed keys (e.g. game IDs). */
	listFeedKeys: () => string[];
	/** Optional cleanup function (e.g. close database connection). */
	close?: () => void;
}

/**
 * Create a feed handler backed by a caller-provided query function.
 * PBK owns HTTP plumbing, pagination, and cursor logic.
 * The consumer owns the data model and query.
 *
 * Feed URI format: at://{did}/app.bsky.feed.generator/{rkeyPrefix}-{feedKey}
 */
export function createFeedHandler(config: FeedHandlerConfig): FeedHandler {
	const prefix = `${config.rkeyPrefix}-`;

	function extractFeedKey(feedUri: string): string | null {
		const rkey = feedUri.split('/').pop();
		if (!rkey?.startsWith(prefix)) return null;
		return rkey.slice(prefix.length);
	}

	const handler = ((params: URLSearchParams): FeedSkeleton => {
		const feedUri = params.get('feed');
		if (!feedUri) return { feed: [] };

		const feedKey = extractFeedKey(feedUri);
		if (!feedKey) return { feed: [] };

		const limit = Math.min(Number(params.get('limit')) || 30, 100);
		const cursorParam = params.get('cursor');
		const cursor = cursorParam ? Number(cursorParam) : undefined;

		const posts = config.getPosts(feedKey, limit, cursor);

		const feed = posts.map((p) => ({ post: p.uri }));
		const lastPost = posts[posts.length - 1];
		const nextCursor = lastPost ? String(lastPost.indexedAt) : undefined;

		return { feed, cursor: nextCursor };
	}) as FeedHandler;

	if (config.close) {
		handler.close = config.close;
	}

	handler.listFeeds = (): FeedInfo[] => {
		return config.listFeedKeys().map((key) => ({
			uri: `at://${config.publisherDid}/app.bsky.feed.generator/${prefix}${key}`,
		}));
	};

	return handler;
}
