// pattern: Imperative Shell

import type { AtpAgent } from '@atproto/api';
import type { DmResult, DmSender, InboundDm, RateLimiter, RelayDmSender } from './types.js';

/**
 * Create a chat-proxied agent for DM operations.
 * All chat requests need the Atproto-Proxy header pointing to the chat service.
 */
export function createChatAgent(agent: AtpAgent): AtpAgent {
	return agent.withProxy('bsky_chat', 'did:web:api.bsky.chat') as AtpAgent;
}

export interface BlueskyDmSenderOptions {
	/** Optional rate limiter for DM sending (e.g. 1 per 2s) */
	rateLimiter?: RateLimiter;
}

/** Create a DM sender using chat.bsky.convo API. Caches convo IDs. */
export function createBlueskyDmSender(
	chatAgent: AtpAgent,
	options?: BlueskyDmSenderOptions,
): DmSender {
	const convoCache = new Map<string, string>();

	async function getOrCreateConvo(recipientDid: string): Promise<string> {
		const cached = convoCache.get(recipientDid);
		if (cached) return cached;

		const response = await chatAgent.chat.bsky.convo.getConvoForMembers({
			members: [recipientDid],
		});
		const convoId = response.data.convo.id;
		convoCache.set(recipientDid, convoId);
		return convoId;
	}

	return {
		async sendDm(recipientDid: string, text: string): Promise<DmResult> {
			try {
				if (options?.rateLimiter) await options.rateLimiter.acquire();
				const convoId = await getOrCreateConvo(recipientDid);
				await chatAgent.chat.bsky.convo.sendMessage({
					convoId,
					message: { text },
				});
				return 'sent';
			} catch (err) {
				const message = (err as Error).message ?? String(err);
				// Bluesky returns 400 with specific messages when recipient has blocked DMs
				if (message.includes('block') || message.includes('could not send')) {
					console.error(`DM to ${recipientDid} blocked: ${message}`);
					return 'blocked';
				}
				console.error(`DM to ${recipientDid} failed: ${message}`);
				return 'error';
			}
		},
	};
}

/** Create a DM sender with relay group support (bot-relayed group messaging). */
export function createRelayDmSender(
	chatAgent: AtpAgent,
	options?: BlueskyDmSenderOptions,
): RelayDmSender {
	const baseSender = createBlueskyDmSender(chatAgent, options);
	const relayGroups = new Map<string, string[]>();

	return {
		...baseSender,
		createRelayGroup(groupId: string, memberDids: string[]): void {
			relayGroups.set(groupId, memberDids);
		},
		async sendToRelayGroup(groupId: string, text: string): Promise<void> {
			const members = relayGroups.get(groupId);
			if (!members) {
				console.error(`relay group ${groupId} not found`);
				return;
			}
			await Promise.all(members.map((did) => baseSender.sendDm(did, text)));
		},
	};
}

/**
 * Poll for new DMs across all conversations.
 * Returns messages newer than the given cursor (message ID).
 */
export async function pollInboundDms(
	chatAgent: AtpAgent,
	sinceMessageId?: string,
): Promise<{ messages: InboundDm[]; latestMessageId: string | undefined }> {
	const botDid = chatAgent.session?.did;
	if (!botDid) throw new Error('chat agent not authenticated');

	const { data: convoList } = await chatAgent.chat.bsky.convo.listConvos({ limit: 50 });

	const allMessages: InboundDm[] = [];
	let latestId = sinceMessageId;

	for (const convo of convoList.convos) {
		if (convo.unreadCount === 0) continue;

		const { data: msgData } = await chatAgent.chat.bsky.convo.getMessages({
			convoId: convo.id,
			limit: 20,
		});

		for (const msg of msgData.messages) {
			const sender = msg.sender as { did: string };
			const msgId = msg.id as string;

			if (sender.did === botDid) continue;
			// Message IDs are TIDs (base32 timestamps) — lexicographic order is correct
			if (sinceMessageId && msgId <= sinceMessageId) continue;
			if (msg.$type !== 'chat.bsky.convo.defs#messageView') continue;

			allMessages.push({
				senderDid: sender.did,
				convoId: convo.id,
				messageId: msgId,
				text: (msg as { text?: string }).text ?? '',
				sentAt: msg.sentAt as string,
			});

			if (!latestId || msgId > latestId) {
				latestId = msgId;
			}
		}

		await chatAgent.chat.bsky.convo.updateRead({ convoId: convo.id });
	}

	return { messages: allMessages, latestMessageId: latestId };
}

/** Console-based DM sender for local development. */
export function createConsoleDmSender(): DmSender {
	return {
		async sendDm(recipientDid, text) {
			console.log(`[DM → ${recipientDid}] ${text}`);
			return 'sent';
		},
	};
}

/** Console-based relay DM sender for local development. */
export function createConsoleRelayDmSender(): RelayDmSender {
	const relayGroups = new Map<string, string[]>();

	return {
		async sendDm(recipientDid, text) {
			console.log(`[DM → ${recipientDid}] ${text}`);
			return 'sent';
		},
		createRelayGroup(groupId, memberDids) {
			relayGroups.set(groupId, memberDids);
			console.log(`[RELAY GROUP ${groupId}] created: ${memberDids.join(', ')}`);
		},
		async sendToRelayGroup(groupId, text) {
			const members = relayGroups.get(groupId) ?? [];
			for (const did of members) {
				console.log(`[RELAY ${groupId} → ${did}] ${text}`);
			}
		},
	};
}
