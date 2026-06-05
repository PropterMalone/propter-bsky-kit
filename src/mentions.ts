// pattern: Imperative Shell

import type { AtpAgent } from '@atproto/api';
import { retryFetch } from './retry.js';
import type { MentionNotification, RateLimiter } from './types.js';

export interface PollMentionsOptions {
	/** Max notification pages to fetch (default 5) */
	maxPages?: number;
	/** Mark notifications as seen after polling (default true) */
	markAsSeen?: boolean;
	/** Only return unread notifications (default true). Set false for caller-side dedup. */
	filterUnread?: boolean;
	/** Retry on transient socket errors (default false) */
	retryOnSocketError?: boolean;
	/** Optional rate limiter for API calls */
	rateLimiter?: RateLimiter;
}

/**
 * Poll for new mention/reply notifications.
 * Paginates through notifications, filtering for mentions and replies.
 */
export async function pollMentions(
	agent: AtpAgent,
	options?: PollMentionsOptions,
): Promise<{ notifications: MentionNotification[] }> {
	const maxPages = options?.maxPages ?? 5;
	const markAsSeen = options?.markAsSeen ?? true;
	const filterUnread = options?.filterUnread ?? true;
	const useRetry = options?.retryOnSocketError ?? false;
	const rateLimiter = options?.rateLimiter;

	const allMentions: MentionNotification[] = [];
	let pageCursor: string | undefined;

	for (let page = 0; page < maxPages; page++) {
		if (rateLimiter) await rateLimiter.acquire();
		const fetchFn = () => agent.listNotifications({ cursor: pageCursor, limit: 50 });
		const response = useRetry ? await retryFetch(fetchFn) : await fetchFn();
		const notifs = response.data.notifications;
		if (notifs.length === 0) break;

		const mentions = notifs
			.filter((n) => {
				if (n.reason !== 'mention' && n.reason !== 'reply') return false;
				if (filterUnread && n.isRead) return false;
				return true;
			})
			.map((n) => ({
				uri: n.uri,
				cid: n.cid,
				authorDid: n.author.did,
				authorHandle: n.author.handle,
				text: (n.record as { text?: string }).text ?? '',
				indexedAt: n.indexedAt,
			}));

		allMentions.push(...mentions);

		// If any notification on this page was already read, we've caught up
		if (filterUnread && notifs.some((n) => n.isRead)) break;

		pageCursor = response.data.cursor;
		if (!pageCursor) break;
	}

	if (markAsSeen && allMentions.length > 0) {
		await agent.updateSeenNotifications();
	}

	return { notifications: allMentions };
}

export interface SearchMentionsOptions {
	/** Timestamp to filter mentions after (ISO string) */
	since?: string;
	/** Retry on transient socket errors (default true) */
	retryOnSocketError?: boolean;
	/** Optional rate limiter for the API call */
	rateLimiter?: RateLimiter;
}

/**
 * Search for mentions via searchPosts API.
 * Supplements pollMentions — catches mentions that listNotifications silently drops.
 * Returns null on API error (distinguishable from empty array = no mentions).
 */
export async function searchMentions(
	agent: AtpAgent,
	botHandle: string,
	options?: SearchMentionsOptions,
): Promise<MentionNotification[] | null> {
	try {
		if (options?.rateLimiter) await options.rateLimiter.acquire();
		const doFetch = () =>
			agent.app.bsky.feed.searchPosts({
				q: botHandle,
				limit: 25,
				sort: 'latest',
			});
		const useRetry = options?.retryOnSocketError ?? true;
		const response = useRetry ? await retryFetch(doFetch) : await doFetch();

		const mentions: MentionNotification[] = [];
		for (const post of response.data.posts) {
			const text = (post.record as { text?: string }).text ?? '';
			if (post.author.did === agent.session?.did) continue;
			if (options?.since && post.indexedAt <= options.since) continue;

			mentions.push({
				uri: post.uri,
				cid: post.cid,
				authorDid: post.author.did,
				authorHandle: post.author.handle,
				text,
				indexedAt: post.indexedAt,
			});
		}
		return mentions;
	} catch (err) {
		console.error('searchMentions error:', err);
		return null;
	}
}

export interface PollAllMentionsOptions extends PollMentionsOptions {
	/** Bot handle for searchPosts (required for search leg) */
	botHandle: string;
	/** Timestamp for search filter */
	searchSince?: string;
}

/**
 * Poll mentions via both listNotifications and searchPosts, deduplicating by URI.
 * Catches mentions that listNotifications silently drops (documented Bluesky bug
 * for low-activity accounts).
 */
export async function pollAllMentions(
	agent: AtpAgent,
	options: PollAllMentionsOptions,
): Promise<{ notifications: MentionNotification[]; searchFailed: boolean }> {
	const [pollResult, searchResult] = await Promise.all([
		pollMentions(agent, options),
		searchMentions(agent, options.botHandle, {
			since: options.searchSince,
			retryOnSocketError: options.retryOnSocketError,
			rateLimiter: options.rateLimiter,
		}),
	]);

	const searchFailed = searchResult === null;
	const searchMentionsList = searchResult ?? [];

	// Dedup by URI — poll results take priority (they have more reliable cid)
	const seen = new Set(pollResult.notifications.map((n) => n.uri));
	const deduped = [...pollResult.notifications];
	for (const mention of searchMentionsList) {
		if (!seen.has(mention.uri)) {
			seen.add(mention.uri);
			deduped.push(mention);
		}
	}

	return { notifications: deduped, searchFailed };
}
