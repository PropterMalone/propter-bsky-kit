// pattern: Imperative Shell

import { type Server, createServer } from 'node:http';
import type { FeedHandler, FeedInfo } from './types.js';

export interface FeedTenant {
	/** URL path segment: "skeetwolf", "ysa", "autogolpe", "3cb" */
	name: string;
	/** rkey routing prefix: "skeetwolf", "diplo", "autogolpe", "3cb" */
	rkeyPrefix: string;
	/** HTML served at /{name}/faq */
	faqHtml?: string;
	/** Additional HTML pages served at /{name}/{pageName} */
	pages?: Record<string, string>;
	/** Feed handler from createFeedHandler(). Omit for FAQ-only tenants. */
	feedHandler?: FeedHandler;
}

export interface FeedHubConfig {
	port: number;
	/** Hostname for did:web document */
	hostname: string;
	tenants: FeedTenant[];
}

/** Match an rkey to the tenant whose rkeyPrefix it starts with. */
export function findTenantByRkey(tenants: FeedTenant[], rkey: string): FeedTenant | undefined {
	return tenants.find((t) => t.feedHandler && rkey.startsWith(`${t.rkeyPrefix}-`));
}

function validateConfig(config: FeedHubConfig): void {
	if (config.tenants.length === 0) {
		throw new Error('feed hub requires at least one tenant');
	}

	const names = new Set<string>();
	const prefixes = new Set<string>();

	for (const tenant of config.tenants) {
		if (names.has(tenant.name)) {
			throw new Error(`duplicate tenant name: ${tenant.name}`);
		}
		names.add(tenant.name);

		if (prefixes.has(tenant.rkeyPrefix)) {
			throw new Error(`duplicate tenant rkeyPrefix: ${tenant.rkeyPrefix}`);
		}
		prefixes.add(tenant.rkeyPrefix);
	}
}

/** Create a multi-tenant feed hub HTTP server. */
export function createFeedHub(config: FeedHubConfig): Server {
	validateConfig(config);

	const tenantsByName = new Map<string, FeedTenant>();
	for (const tenant of config.tenants) {
		tenantsByName.set(tenant.name, tenant);
	}

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);

		if (url.pathname === '/xrpc/app.bsky.feed.getFeedSkeleton') {
			const feedUri = url.searchParams.get('feed');
			if (!feedUri) {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ feed: [] }));
				return;
			}

			const rkey = feedUri.split('/').pop() ?? '';
			const tenant = findTenantByRkey(config.tenants, rkey);

			if (!tenant?.feedHandler) {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ feed: [] }));
				return;
			}

			try {
				const result = tenant.feedHandler(url.searchParams);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(result));
			} catch (err) {
				console.error(`Feed error (${tenant.name}):`, err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						error: 'InternalServerError',
						message: 'feed generation failed',
					}),
				);
			}
			return;
		}

		if (url.pathname === '/xrpc/app.bsky.feed.describeFeedGenerator') {
			const feeds: FeedInfo[] = [];
			for (const tenant of config.tenants) {
				if (tenant.feedHandler) {
					feeds.push(...tenant.feedHandler.listFeeds());
				}
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					did: `did:web:${config.hostname}`,
					feeds,
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

		if (url.pathname === '/faq') {
			const links: string[] = [];
			for (const t of config.tenants) {
				if (t.faqHtml) links.push(`<li><a href="/${t.name}/faq">${t.name} FAQ</a></li>`);
				if (t.pages) {
					for (const page of Object.keys(t.pages)) {
						links.push(`<li><a href="/${t.name}/${page}">${t.name} ${page}</a></li>`);
					}
				}
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(`<h1>Feed Hub Pages</h1>\n<ul>\n${links.join('\n')}\n</ul>`);
			return;
		}

		// /{tenantName}/{pageName} — serves faqHtml for "faq", pages[pageName] otherwise
		const pageMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)$/);
		if (pageMatch?.[1] && pageMatch[2]) {
			const tenant = tenantsByName.get(pageMatch[1]);
			if (tenant) {
				const pageName = pageMatch[2];
				const html = pageName === 'faq' ? tenant.faqHtml : tenant.pages?.[pageName];
				if (html) {
					res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
					res.end(html);
					return;
				}
			}
			res.writeHead(404);
			res.end('not found');
			return;
		}

		if (url.pathname === '/') {
			const names = config.tenants.map((t) => t.name).join(', ');
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(`feed hub: ${names}`);
			return;
		}

		res.writeHead(404);
		res.end('not found');
	});

	// Attach cleanup to server.close()
	const originalClose = server.close.bind(server);
	server.close = (callback?: (err?: Error) => void) => {
		for (const tenant of config.tenants) {
			tenant.feedHandler?.close?.();
		}
		return originalClose(callback);
	};

	server.listen(config.port, () => {
		const names = config.tenants.map((t) => t.name).join(', ');
		console.log(`feed hub listening on port ${config.port}: ${names}`);
	});

	return server;
}
