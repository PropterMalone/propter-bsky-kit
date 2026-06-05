// pattern: Imperative Shell

import { AtpAgent, RichText } from '@atproto/api';
import { withRetry } from './retry.js';
import type { BotConfig } from './types.js';

/** Create and authenticate an AT Protocol agent. Uses retry-wrapped fetch by default. */
export async function createAgent(config: BotConfig): Promise<AtpAgent> {
	const agent = new AtpAgent({
		service: config.service ?? 'https://bsky.social',
		fetch: withRetry(),
	});
	await agent.login({
		identifier: config.identifier,
		password: config.password,
	});
	return agent;
}

/** Detect @mention and link facets in text. Resolves handles → DIDs via the agent. */
export async function buildFacets(
	agent: AtpAgent,
	text: string,
): Promise<{ text: string; facets: RichText['facets'] }> {
	const rt = new RichText({ text });
	await rt.detectFacets(agent);
	return { text: rt.text, facets: rt.facets };
}

/** Resolve a Bluesky handle to a DID. Returns null if not found. */
export async function resolveHandle(agent: AtpAgent, handle: string): Promise<string | null> {
	try {
		const response = await agent.resolveHandle({ handle });
		return response.data.did;
	} catch {
		return null;
	}
}

/** Extract the rkey (record key) from an AT URI: at://did/collection/rkey */
export function extractRkey(uri: string): string {
	const rkey = uri.split('/').pop();
	if (!rkey) throw new Error(`extractRkey: invalid AT URI "${uri}"`);
	return rkey;
}
