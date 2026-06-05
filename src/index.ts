// Barrel export — everything re-exported from one place
export { graphemeLength, truncateToLimit } from './grapheme.js';
export { splitForPost } from './text-splitter.js';
export { createAgent, buildFacets, resolveHandle, extractRkey } from './agent.js';
export {
	postMessage,
	postMessageChain,
	replyToPost,
	replyToPostChain,
	postWithQuote,
	postWithQuoteChain,
	replyWithQuote,
	replyWithQuoteChain,
} from './posting.js';
export type { PostingOptions } from './posting.js';
export { pollMentions, searchMentions, pollAllMentions } from './mentions.js';
export type {
	PollMentionsOptions,
	SearchMentionsOptions,
	PollAllMentionsOptions,
} from './mentions.js';
export {
	createChatAgent,
	createBlueskyDmSender,
	createRelayDmSender,
	pollInboundDms,
	createConsoleDmSender,
	createConsoleRelayDmSender,
} from './dm.js';
export type { BlueskyDmSenderOptions } from './dm.js';
export {
	createThreadgate,
	createMentionThreadgate,
	deleteThreadgate,
	createPostgate,
	deletePostgate,
} from './gates.js';
export { getThreadReplies } from './thread-reader.js';
export type { GetThreadRepliesOptions } from './thread-reader.js';
export { createRateLimiter, createNoopRateLimiter } from './rate-limiter.js';
export type { RateLimiterConfig } from './rate-limiter.js';
export { retryFetch, withRetry } from './retry.js';
export { createFeedHandler } from './feed-handler.js';
export type { FeedHandlerConfig } from './feed-handler.js';
export { createFeedServer } from './feed-server.js';
export type { FeedServerConfig } from './feed-server.js';
export { createFeedHub, findTenantByRkey } from './feed-hub.js';
export type { FeedHubConfig, FeedTenant } from './feed-hub.js';
export { createLabelerClient } from './labeler-client.js';

// Re-export all types
export type {
	BotConfig,
	PostRef,
	DmResult,
	MentionNotification,
	InboundDm,
	DmSender,
	RelayDmSender,
	RateLimiter,
	ThreadReply,
	FeedSkeleton,
	FeedInfo,
	FeedHandler,
	LabelerClient,
} from './types.js';
