import { describe, expect, it, vi } from 'vitest';
import { createFeedHandler } from './feed-handler.js';

function makeHandler(
	posts: Record<string, { uri: string; indexedAt: number }[]> = {},
	feedKeys: string[] = [],
) {
	return createFeedHandler({
		publisherDid: 'did:plc:testpub',
		rkeyPrefix: 'game',
		getPosts: (feedKey, limit, cursor) => {
			const all = posts[feedKey] ?? [];
			const filtered = cursor ? all.filter((p) => p.indexedAt < cursor) : all;
			return filtered.slice(0, limit);
		},
		listFeedKeys: () => feedKeys,
	});
}

describe('createFeedHandler', () => {
	it('returns empty feed for missing feed param', () => {
		const handler = makeHandler();
		const result = handler(new URLSearchParams());
		expect(result).toEqual({ feed: [] });
	});

	it('returns empty feed for unknown rkey prefix', () => {
		const handler = makeHandler();
		const result = handler(
			new URLSearchParams({ feed: 'at://did/app.bsky.feed.generator/other-abc' }),
		);
		expect(result).toEqual({ feed: [] });
	});

	it('returns posts for valid feed key', () => {
		const posts = {
			abc: [
				{ uri: 'at://did/post/1', indexedAt: 1000 },
				{ uri: 'at://did/post/2', indexedAt: 900 },
			],
		};
		const handler = makeHandler(posts);
		const result = handler(
			new URLSearchParams({ feed: 'at://did:plc:testpub/app.bsky.feed.generator/game-abc' }),
		);
		expect(result.feed).toEqual([{ post: 'at://did/post/1' }, { post: 'at://did/post/2' }]);
		expect(result.cursor).toBe('900');
	});

	it('respects limit parameter', () => {
		const posts = {
			abc: Array.from({ length: 50 }, (_, i) => ({
				uri: `at://did/post/${i}`,
				indexedAt: 1000 - i,
			})),
		};
		const handler = makeHandler(posts);
		const result = handler(
			new URLSearchParams({
				feed: 'at://did:plc:testpub/app.bsky.feed.generator/game-abc',
				limit: '5',
			}),
		);
		expect(result.feed).toHaveLength(5);
	});

	it('caps limit at 100', () => {
		const posts = {
			abc: Array.from({ length: 150 }, (_, i) => ({
				uri: `at://did/post/${i}`,
				indexedAt: 1000 - i,
			})),
		};
		const handler = makeHandler(posts);
		const result = handler(
			new URLSearchParams({
				feed: 'at://did:plc:testpub/app.bsky.feed.generator/game-abc',
				limit: '200',
			}),
		);
		expect(result.feed).toHaveLength(100);
	});

	it('passes cursor to getPosts', () => {
		const getPosts = vi.fn().mockReturnValue([]);
		const handler = createFeedHandler({
			publisherDid: 'did:plc:testpub',
			rkeyPrefix: 'game',
			getPosts,
			listFeedKeys: () => [],
		});
		handler(
			new URLSearchParams({
				feed: 'at://did:plc:testpub/app.bsky.feed.generator/game-abc',
				cursor: '500',
			}),
		);
		expect(getPosts).toHaveBeenCalledWith('abc', 30, 500);
	});

	it('listFeeds returns URIs for all feed keys', () => {
		const handler = makeHandler({}, ['game1', 'game2', 'game3']);
		const feeds = handler.listFeeds();
		expect(feeds).toEqual([
			{ uri: 'at://did:plc:testpub/app.bsky.feed.generator/game-game1' },
			{ uri: 'at://did:plc:testpub/app.bsky.feed.generator/game-game2' },
			{ uri: 'at://did:plc:testpub/app.bsky.feed.generator/game-game3' },
		]);
	});

	it('calls close when provided', () => {
		const close = vi.fn();
		const handler = createFeedHandler({
			publisherDid: 'did:plc:testpub',
			rkeyPrefix: 'game',
			getPosts: () => [],
			listFeedKeys: () => [],
			close,
		});
		handler.close?.();
		expect(close).toHaveBeenCalled();
	});

	it('close is undefined when not provided', () => {
		const handler = makeHandler();
		expect(handler.close).toBeUndefined();
	});
});
