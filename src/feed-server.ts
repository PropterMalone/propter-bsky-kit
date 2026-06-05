// pattern: Imperative Shell

import { type Server, createServer } from 'node:http';
import type { FeedHandler } from './types.js';

export interface FeedServerConfig {
	port: number;
	hostname: string;
	serviceDid: string;
	botName: string;
	faqHtml?: string;
	feedHandler?: FeedHandler;
}

/** Create an HTTP server for Bluesky feed generator + optional FAQ page. */
export function createFeedServer(config: FeedServerConfig): Server {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);

		if (url.pathname === '/xrpc/app.bsky.feed.getFeedSkeleton' && config.feedHandler) {
			try {
				const result = config.feedHandler(url.searchParams);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(result));
			} catch (err) {
				console.error('Feed error:', err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({ error: 'InternalServerError', message: 'feed generation failed' }),
				);
			}
			return;
		}

		if (url.pathname === '/xrpc/app.bsky.feed.describeFeedGenerator' && config.feedHandler) {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					did: config.serviceDid,
					feeds: config.feedHandler.listFeeds(),
				}),
			);
			return;
		}

		if (url.pathname === '/.well-known/did.json') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					'@context': ['https://www.w3.org/ns/did/v1'],
					id: `did:web:${config.hostname}`,
					service: [
						{
							id: '#bsky_fg',
							type: 'BskyFeedGenerator',
							serviceEndpoint: `https://${config.hostname}`,
						},
					],
				}),
			);
			return;
		}

		if (url.pathname === '/faq' && config.faqHtml) {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(config.faqHtml);
			return;
		}

		if (url.pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(`${config.botName} feed generator`);
			return;
		}

		res.writeHead(404);
		res.end('not found');
	});

	server.listen(config.port, () => {
		console.log(`${config.botName} feed generator listening on port ${config.port}`);
	});

	return server;
}
