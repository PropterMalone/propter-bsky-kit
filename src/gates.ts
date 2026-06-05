// pattern: Imperative Shell

import type { AtpAgent } from '@atproto/api';
import { extractRkey } from './agent.js';

function requireSession(agent: AtpAgent, caller: string): string {
	const did = agent.session?.did;
	if (!did) throw new Error(`${caller}: no active session`);
	return did;
}

/** Create a threadgate that blocks all replies (allow: []) */
export async function createThreadgate(agent: AtpAgent, postUri: string): Promise<void> {
	const did = requireSession(agent, 'createThreadgate');
	const rkey = extractRkey(postUri);
	await agent.api.com.atproto.repo.createRecord({
		repo: did,
		collection: 'app.bsky.feed.threadgate',
		rkey,
		record: {
			$type: 'app.bsky.feed.threadgate',
			post: postUri,
			allow: [],
			createdAt: new Date().toISOString(),
		},
	});
}

/** Create a threadgate that allows only mentioned users to reply */
export async function createMentionThreadgate(agent: AtpAgent, postUri: string): Promise<void> {
	const did = requireSession(agent, 'createMentionThreadgate');
	const rkey = extractRkey(postUri);
	await agent.api.com.atproto.repo.createRecord({
		repo: did,
		collection: 'app.bsky.feed.threadgate',
		rkey,
		record: {
			$type: 'app.bsky.feed.threadgate',
			post: postUri,
			allow: [{ $type: 'app.bsky.feed.threadgate#mentionRule' }],
			createdAt: new Date().toISOString(),
		},
	});
}

/** Delete a threadgate record */
export async function deleteThreadgate(agent: AtpAgent, postUri: string): Promise<void> {
	const did = requireSession(agent, 'deleteThreadgate');
	const rkey = extractRkey(postUri);
	await agent.api.com.atproto.repo.deleteRecord({
		repo: did,
		collection: 'app.bsky.feed.threadgate',
		rkey,
	});
}

/** Create a postgate that disables quote-posts */
export async function createPostgate(agent: AtpAgent, postUri: string): Promise<void> {
	const did = requireSession(agent, 'createPostgate');
	const rkey = extractRkey(postUri);
	await agent.api.com.atproto.repo.createRecord({
		repo: did,
		collection: 'app.bsky.feed.postgate',
		rkey,
		record: {
			$type: 'app.bsky.feed.postgate',
			post: postUri,
			embeddingRules: [{ $type: 'app.bsky.feed.postgate#disableRule' }],
			createdAt: new Date().toISOString(),
		},
	});
}

/** Delete a postgate record */
export async function deletePostgate(agent: AtpAgent, postUri: string): Promise<void> {
	const did = requireSession(agent, 'deletePostgate');
	const rkey = extractRkey(postUri);
	await agent.api.com.atproto.repo.deleteRecord({
		repo: did,
		collection: 'app.bsky.feed.postgate',
		rkey,
	});
}
