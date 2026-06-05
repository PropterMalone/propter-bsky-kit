# propter-bsky-kit

Shared infrastructure for building Bluesky bots. Extracted from four live game bots ([Skeetwolf](https://bsky.app/profile/skeetwolf.bsky.social), [YourStalwartAlly](https://bsky.app/profile/yourstalwartally.bsky.social), [Autogulp](https://bsky.app/profile/autogulp.bsky.social), [3CBlue](https://bsky.app/profile/3cblue.bsky.social)) and battle-tested in production.

Handles the annoying parts of the Bluesky bot lifecycle so you can focus on your bot's logic: posting with auto-splitting, mention polling, DM send/receive, feed generation, rate limiting, and more.

## Install

```bash
npm install github:PropterMalone/propter-bsky-kit
```

## Modules

All exports are available from the main entry point or as individual deep imports.

### Auth & Agent

```ts
import { createAgent, buildFacets, resolveHandle, extractRkey } from 'propter-bsky-kit';

const agent = await createAgent({
  identifier: 'mybot.bsky.social',
  password: process.env.BSKY_PASSWORD,
});
```

`createAgent` authenticates and returns an `AtpAgent`. `buildFacets` detects @mentions and links in text (resolving handles to DIDs). `resolveHandle` and `extractRkey` are small utilities you'll reach for constantly.

### Posting

```ts
import { postMessage, replyToPost, postWithQuote } from 'propter-bsky-kit';

// Simple post — auto-splits into a self-reply chain if > 300 graphemes
const ref = await postMessage(agent, 'Hello from my bot!');

// Reply to a post
await replyToPost(agent, 'Nice move.', parentRef, rootRef);

// Quote post
await postWithQuote(agent, 'Look at this:', quotedRef);
```

Every posting function has a `*Chain` variant that returns all refs in the chain (e.g. `postMessageChain`). All accept optional `labels` (self-labels) and `rateLimiter`.

### Mentions

```ts
import { pollMentions, searchMentions, pollAllMentions } from 'propter-bsky-kit';

// Poll via listNotifications
const { notifications } = await pollMentions(agent);

// Search via searchPosts (catches mentions that notifications silently drop)
const mentions = await searchMentions(agent, 'mybot.bsky.social');

// Both at once, deduplicated by URI
const { notifications: all } = await pollAllMentions(agent, {
  botHandle: 'mybot.bsky.social',
});
```

`pollAllMentions` runs both in parallel and deduplicates. This matters because Bluesky's `listNotifications` has a known bug where it silently drops mentions for low-activity accounts.

### DMs

```ts
import { createChatAgent, createBlueskyDmSender, pollInboundDms } from 'propter-bsky-kit';

const chatAgent = createChatAgent(agent);
const dm = createBlueskyDmSender(chatAgent);

// Send a DM — returns 'sent', 'blocked', or 'error'
const result = await dm.sendDm(recipientDid, 'Your orders have been received.');

// Poll for new DMs
const { messages, latestMessageId } = await pollInboundDms(chatAgent, cursor);
```

`createRelayDmSender` adds bot-relayed group messaging (Bluesky has no native group DMs). Console variants (`createConsoleDmSender`, `createConsoleRelayDmSender`) print to stdout for local dev.

### Feed Generation

```ts
import { createFeedHandler } from 'propter-bsky-kit';

const handler = createFeedHandler({
  publisherDid: 'did:plc:abc123',
  rkeyPrefix: 'mygame',
  getPosts: (feedKey, limit, cursor) => {
    // Return posts from your DB, ordered by indexedAt DESC
    return db.prepare('SELECT uri, indexed_at as indexedAt FROM posts WHERE game_id = ? ORDER BY indexed_at DESC LIMIT ?')
      .all(feedKey, limit);
  },
  listFeedKeys: () => db.prepare('SELECT id FROM games').pluck().all(),
});
```

PBK owns pagination and cursor logic. You provide a query function. Feed URI format: `at://{did}/app.bsky.feed.generator/{rkeyPrefix}-{feedKey}`.

### Feed Hub (Multi-Tenant)

```ts
import { createFeedHub } from 'propter-bsky-kit/feed-hub';

const server = createFeedHub({
  port: 3010,
  hostname: 'feeds.example.com',
  tenants: [
    { name: 'mygame', rkeyPrefix: 'mygame', feedHandler: myHandler, faqHtml: '...' },
    { name: 'othergame', rkeyPrefix: 'other', faqHtml: '<h1>FAQ</h1>...' },
  ],
});
```

Serves `did.json`, `describeFeedGenerator`, `getFeedSkeleton`, and per-tenant FAQ pages from a single HTTP server. Useful when you're running multiple bots and don't want to burn a port per feed.

### Rate Limiting

```ts
import { createRateLimiter } from 'propter-bsky-kit';

const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
await postMessage(agent, 'Rate-limited post', { rateLimiter: limiter });
```

Sliding window. Most posting and polling functions accept an optional `rateLimiter`. `createNoopRateLimiter()` for tests.

### Text Utilities

```ts
import { graphemeLength, truncateToLimit, splitForPost } from 'propter-bsky-kit';

graphemeLength('Hello 👋');        // 7 (not 8)
truncateToLimit('Long text...', 10); // truncated to 10 graphemes + '…'
splitForPost(longText);            // string[] — chunks ≤ 300 graphemes, never splits mid-@mention
```

Bluesky's 300-character limit is measured in graphemes (via `Intl.Segmenter`), not JS string length. These handle that correctly.

### Other Modules

- **`gates`** — Create/delete threadgates and postgates (control who can reply, disable quote-posts)
- **`thread-reader`** — `getThreadReplies()` with recursive fetch to handle Bluesky's ~depth-10 truncation
- **`retry`** — `retryFetch()` for transient network errors (ECONNRESET, ETIMEDOUT, fetch failures)
- **`labeler-client`** — HTTP client for [propter-labeler](https://github.com/PropterMalone/propter-labeler), a standalone ATProto labeler service for tagging game posts

## Architecture

Follows a Functional Core / Imperative Shell pattern:

- **Functional core** (pure, fully tested): grapheme counting, text splitting, rate limiter
- **Imperative shell** (I/O): agent auth, posting, DMs, feed serving — tested via the consuming bots

Single dependency: `@atproto/api`.

## Related Projects

- **[propter-labeler](https://github.com/PropterMalone/propter-labeler)** — Standalone ATProto labeler. Auto-labels replies in watched game threads via Jetstream. Bots register threads via HTTP API.
- **[feed-hub](https://github.com/PropterMalone/feed-hub)** — Reference multi-tenant feed server deployment using PBK's `createFeedHub`. If you want to run your own, reach out and I can help with setup.

## License

MIT
