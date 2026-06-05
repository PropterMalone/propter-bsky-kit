import { type AddressInfo, type Server, createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeedHandler } from './feed-handler.js';
import {
	type FeedHubConfig,
	type FeedTenant,
	createFeedHub,
	findTenantByRkey,
} from './feed-hub.js';

function makeTenant(
	overrides: Partial<FeedTenant> & { name: string; rkeyPrefix: string },
): FeedTenant {
	return { ...overrides };
}

function makeHandlerTenant(
	name: string,
	rkeyPrefix: string,
	posts: Record<string, { uri: string; indexedAt: number }[]> = {},
	feedKeys: string[] = [],
): FeedTenant {
	return {
		name,
		rkeyPrefix,
		feedHandler: createFeedHandler({
			publisherDid: `did:plc:${name}`,
			rkeyPrefix,
			getPosts: (feedKey, limit, cursor) => {
				const all = posts[feedKey] ?? [];
				const filtered = cursor ? all.filter((p) => p.indexedAt < cursor) : all;
				return filtered.slice(0, limit);
			},
			listFeedKeys: () => feedKeys,
		}),
	};
}

describe('findTenantByRkey', () => {
	const tenants = [
		makeHandlerTenant('wolf', 'skeetwolf', {}, ['feed1']),
		makeHandlerTenant('ysa', 'diplo', {}, ['feed1']),
	];

	it('matches correct tenant by rkey prefix', () => {
		expect(findTenantByRkey(tenants, 'skeetwolf-feed1')?.name).toBe('wolf');
		expect(findTenantByRkey(tenants, 'diplo-feed1')?.name).toBe('ysa');
	});

	it('returns undefined for unknown prefix', () => {
		expect(findTenantByRkey(tenants, 'unknown-feed1')).toBeUndefined();
	});

	it('returns undefined for empty tenants', () => {
		expect(findTenantByRkey([], 'skeetwolf-feed1')).toBeUndefined();
	});

	it('skips FAQ-only tenants (no feedHandler)', () => {
		const mixed = [
			makeTenant({ name: 'faqonly', rkeyPrefix: 'faq' }),
			makeHandlerTenant('wolf', 'skeetwolf', {}, ['feed1']),
		];
		expect(findTenantByRkey(mixed, 'faq-something')).toBeUndefined();
	});
});

describe('config validation', () => {
	it('throws on empty tenants', () => {
		expect(() => createFeedHub({ port: 0, hostname: 'test.example', tenants: [] })).toThrow(
			'at least one tenant',
		);
	});

	it('throws on duplicate names', () => {
		expect(() =>
			createFeedHub({
				port: 0,
				hostname: 'test.example',
				tenants: [
					makeTenant({ name: 'wolf', rkeyPrefix: 'a' }),
					makeTenant({ name: 'wolf', rkeyPrefix: 'b' }),
				],
			}),
		).toThrow('duplicate tenant name: wolf');
	});

	it('throws on duplicate rkeyPrefixes', () => {
		expect(() =>
			createFeedHub({
				port: 0,
				hostname: 'test.example',
				tenants: [
					makeTenant({ name: 'a', rkeyPrefix: 'same' }),
					makeTenant({ name: 'b', rkeyPrefix: 'same' }),
				],
			}),
		).toThrow('duplicate tenant rkeyPrefix: same');
	});
});

describe('feed hub HTTP', () => {
	let server: Server;

	afterEach(
		() =>
			new Promise<void>((resolve) => {
				if (server?.listening) {
					server.close(() => resolve());
				} else {
					resolve();
				}
			}),
	);

	function startHub(config: Partial<FeedHubConfig> & { tenants: FeedTenant[] }): Promise<string> {
		return new Promise((resolve) => {
			server = createFeedHub({
				port: 0,
				hostname: 'hub.example',
				...config,
			});
			server.on('listening', () => {
				const port = (server.address() as AddressInfo).port;
				resolve(`http://localhost:${port}`);
			});
		});
	}

	it('routes getFeedSkeleton to correct tenant handler', async () => {
		const posts = { feed1: [{ uri: 'at://did/post/1', indexedAt: 1000 }] };
		const base = await startHub({
			tenants: [
				makeHandlerTenant('wolf', 'skeetwolf', posts, ['feed1']),
				makeHandlerTenant('ysa', 'diplo', {}, ['feed1']),
			],
		});

		const res = await fetch(
			`${base}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:plc:wolf/app.bsky.feed.generator/skeetwolf-feed1`,
		);
		const body = await res.json();
		expect(body.feed).toEqual([{ post: 'at://did/post/1' }]);
	});

	it('returns empty feed for unknown rkey prefix', async () => {
		const base = await startHub({
			tenants: [makeHandlerTenant('wolf', 'skeetwolf', {}, ['feed1'])],
		});

		const res = await fetch(
			`${base}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did/app.bsky.feed.generator/unknown-feed1`,
		);
		const body = await res.json();
		expect(body.feed).toEqual([]);
	});

	it('returns empty feed for FAQ-only tenant rkey', async () => {
		const base = await startHub({
			tenants: [makeTenant({ name: 'autogolpe', rkeyPrefix: 'autogolpe', faqHtml: '<p>faq</p>' })],
		});

		const res = await fetch(
			`${base}/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did/app.bsky.feed.generator/autogolpe-main`,
		);
		const body = await res.json();
		expect(body.feed).toEqual([]);
	});

	it('aggregates describeFeedGenerator from all handlers', async () => {
		const base = await startHub({
			tenants: [
				makeHandlerTenant('wolf', 'skeetwolf', {}, ['a', 'b']),
				makeHandlerTenant('ysa', 'diplo', {}, ['c']),
				makeTenant({ name: 'faqonly', rkeyPrefix: 'faq', faqHtml: '<p>hi</p>' }),
			],
		});

		const res = await fetch(`${base}/xrpc/app.bsky.feed.describeFeedGenerator`);
		const body = await res.json();
		expect(body.did).toBe('did:web:hub.example');
		expect(body.feeds).toHaveLength(3);
		expect(body.feeds.map((f: { uri: string }) => f.uri)).toEqual([
			'at://did:plc:wolf/app.bsky.feed.generator/skeetwolf-a',
			'at://did:plc:wolf/app.bsky.feed.generator/skeetwolf-b',
			'at://did:plc:ysa/app.bsky.feed.generator/diplo-c',
		]);
	});

	it('serves did.json with correct did:web', async () => {
		const base = await startHub({
			tenants: [makeTenant({ name: 'a', rkeyPrefix: 'a' })],
		});

		const res = await fetch(`${base}/.well-known/did.json`);
		const body = await res.json();
		expect(body.id).toBe('did:web:hub.example');
		expect(body.service[0].serviceEndpoint).toBe('https://hub.example');
	});

	it('serves tenant FAQ at /{name}/faq', async () => {
		const base = await startHub({
			tenants: [
				makeTenant({
					name: 'autogolpe',
					rkeyPrefix: 'autogolpe',
					faqHtml: '<h1>Autogolpe FAQ</h1>',
				}),
				makeTenant({ name: 'wolf', rkeyPrefix: 'skeetwolf', faqHtml: '<h1>Wolf FAQ</h1>' }),
			],
		});

		const res = await fetch(`${base}/autogolpe/faq`);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('<h1>Autogolpe FAQ</h1>');

		const res2 = await fetch(`${base}/wolf/faq`);
		expect(await res2.text()).toBe('<h1>Wolf FAQ</h1>');
	});

	it('returns 404 for unknown tenant FAQ', async () => {
		const base = await startHub({
			tenants: [makeTenant({ name: 'a', rkeyPrefix: 'a' })],
		});

		const res = await fetch(`${base}/unknown/faq`);
		expect(res.status).toBe(404);
	});

	it('serves FAQ index linking all tenants with faqHtml', async () => {
		const base = await startHub({
			tenants: [
				makeTenant({ name: 'autogolpe', rkeyPrefix: 'autogolpe', faqHtml: '<p>faq</p>' }),
				makeTenant({ name: 'wolf', rkeyPrefix: 'skeetwolf' }),
				makeTenant({ name: '3cb', rkeyPrefix: '3cb', faqHtml: '<p>3cb faq</p>' }),
			],
		});

		const res = await fetch(`${base}/faq`);
		const html = await res.text();
		expect(html).toContain('autogolpe');
		expect(html).toContain('3cb');
		expect(html).not.toContain('wolf'); // no faqHtml
	});

	it('serves health check at /', async () => {
		const base = await startHub({
			tenants: [
				makeTenant({ name: 'wolf', rkeyPrefix: 'skeetwolf' }),
				makeTenant({ name: 'ysa', rkeyPrefix: 'diplo' }),
			],
		});

		const res = await fetch(base);
		expect(await res.text()).toBe('feed hub: wolf, ysa');
	});

	it('returns 404 for unknown paths', async () => {
		const base = await startHub({
			tenants: [makeTenant({ name: 'a', rkeyPrefix: 'a' })],
		});

		const res = await fetch(`${base}/unknown`);
		expect(res.status).toBe(404);
	});

	it('calls close on all tenant handlers when server closes', async () => {
		const close1 = vi.fn();
		const close2 = vi.fn();

		const tenant1 = makeHandlerTenant('wolf', 'skeetwolf', {}, []);
		tenant1.feedHandler!.close = close1;

		const tenant2 = makeHandlerTenant('ysa', 'diplo', {}, []);
		tenant2.feedHandler!.close = close2;

		const base = await startHub({ tenants: [tenant1, tenant2] });

		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});

		expect(close1).toHaveBeenCalled();
		expect(close2).toHaveBeenCalled();
	});
});
